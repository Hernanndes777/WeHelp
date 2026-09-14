// api/coletor-board.js — coletor do board /performance (modelo coletor→snapshot→UI).
//
// Roda pelo Vercel Cron (ver vercel.json). É a ÚNICA porta pras APIs: puxa tudo
// uma vez, monta o snapshot e grava na planilha "Performance WeHelp" (Apps Script).
// A página nunca fala com Meta/DataCrazy ao vivo — só lê o snapshot por api/board.js.
// Assim o custo de API é o mesmo com 1 ou 20 pessoas olhando, e a cota do Meta
// (tier dev = 60 chamadas/h) não estoura.
//
// Variáveis de ambiente (Vercel):
//   DC_TOKEN               — chave de API do DataCrazy (a mesma do /agenda-cs)   [obrigatória]
//   BOARD_SHEET_URL        — URL /exec do Apps Script "Performance WeHelp"        [obrigatória]
//   BOARD_TOKEN            — (opcional) mesmo TOKEN configurado no Apps Script
//   META_ADS_TOKEN         — token de sistema da WeHelp com ads_read              [liga o Meta]
//   GOOGLE_ADS_SHEET_URL   — URL /exec (ou JSON) da planilha do Google Ads Script [liga o Google]
//   CRON_SECRET            — (opcional) protege o disparo; Vercel manda no header Authorization
//
// Meta e Google são "ligáveis": sem o token/planilha, o coletor pula a fonte e
// grava o resto. Nada de derrubar a coleta inteira por uma fonte faltando.

const DC_BASE = 'https://api.datacrazy.io/v1/crm/api/crm';
const GRAPH = 'https://graph.facebook.com/v21.0';

// ── Funis do DataCrazy: "entraram" = todos os estágios; "contato" = contato humano.
//    Estágios de automação (Realizar contato, Mensagem 1/2/3, Novo lead, Sem contato)
//    ficam FORA de "contato" de propósito. Leads exige a tag "Site".
const TAG_SITE = '91ed2d79-6bf8-4744-8a9a-127850f7f00f';
const FUNIS = {
  webinario: {
    nome: 'Webinário',
    tags: null,
    todos: [
      'b6e015db-a2c9-4004-864c-1ede2f7e79ee', 'cff64878-e74a-4056-b240-7903901ea05f',
      '04b65c79-475c-446d-852d-a5411b428de5', '9c32d25a-a8ab-48af-a976-1219606d3163',
      '5536e0f5-d4df-44c8-ae5f-703ba71da807', '7ce3a813-ec3e-4257-a54f-c18efe417b9a',
      '45bf08ab-c486-4808-ac16-9b54acc1a01c', '37a049cc-2ec1-4e2c-aee9-c92c3a168c2f',
      'af6cfb9c-b259-4106-b16d-90b0e992cb1c',
    ],
    contato: [
      'cff64878-e74a-4056-b240-7903901ea05f', 'b6e015db-a2c9-4004-864c-1ede2f7e79ee',
      '04b65c79-475c-446d-852d-a5411b428de5', '37a049cc-2ec1-4e2c-aee9-c92c3a168c2f',
    ],
  },
  leads_site: {
    nome: 'Leads (Site)',
    tags: TAG_SITE,
    todos: [
      '8bf9b50d-56d2-4918-be4e-7e4116f90d5b', '8bb4e82d-81ec-4a15-98ac-3b2f68806e44',
      '2d533fd2-24ea-4d30-a0a6-e422247d46d0', '71e21791-5085-40ac-9805-8525cc316fb6',
      'bb5e8e09-c64a-41d4-8ab5-55bf7c278eab', 'eae3e803-bd49-4d4f-8b53-100dcf7fd47b',
      'e9ae521e-13c6-4a68-a0f8-ef7447c8d7dc', '53055a14-05d8-4e57-bae0-13e8f906e0f7',
    ],
    contato: [
      '8bb4e82d-81ec-4a15-98ac-3b2f68806e44', '8bf9b50d-56d2-4918-be4e-7e4116f90d5b',
      '2d533fd2-24ea-4d30-a0a6-e422247d46d0', '53055a14-05d8-4e57-bae0-13e8f906e0f7',
    ],
  },
  leads_forms: {
    nome: 'Leads Forms',
    tags: null,
    todos: [
      '842d2e20-9ac8-4ebb-b03a-3dad913aeefe', 'c46b8173-6bfb-4d8c-b14d-56607bb0bc2e',
      '6bd8728d-76b1-406f-8703-99837aada13e', '49ac1a55-f9c2-4c1e-a454-3bddb901f57a',
      '7001246e-7755-4c84-84bd-626e44f91504', '78ee01c5-dee4-46c5-ae70-2d7cecba6f3d',
      'e7bb6dc0-9246-4202-96dc-87234dcee14f',
    ],
    contato: [
      '842d2e20-9ac8-4ebb-b03a-3dad913aeefe', '7001246e-7755-4c84-84bd-626e44f91504',
      'c46b8173-6bfb-4d8c-b14d-56607bb0bc2e', 'e7bb6dc0-9246-4202-96dc-87234dcee14f',
    ],
  },
};

// Contas Meta da WeHelp queryáveis no MCP hoje. V2 (562276649393347) entra aqui
// quando o Meta liberar. Sem filtro de nome: todas as campanhas da conta contam.
const CONTAS_META = [
  { id: '2222467497864426', nome: 'WEHELP V1' },
  { id: '3546690215570934', nome: 'WEHELP V3' },
];

// Prioridade pra contar 1 "resultado" por campanha sem somar aliases sobrepostos.
const META_LEAD_ACTIONS = [
  'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead',
  'leadgen.other', 'lead',
];

/* ────────────────────────────── datas (BRT, sem DST) ────────────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
// "Agora" em horário de Brasília: getters UTC passam a devolver a hora de parede BRT.
function agoraBRT() { return new Date(Date.now() - 3 * 3600 * 1000); }

// Semana domingo→sábado. offset 0 = semana atual (domingo→hoje); -1 = semana passada (domingo→sábado).
function semana(offset) {
  const hoje = agoraBRT();
  const dow = hoje.getUTCDay(); // 0 = domingo
  const domingoAtual = addDays(hoje, -dow);
  const domingo = addDays(domingoAtual, offset * 7);
  const de = ymd(domingo);
  const ate = offset === 0 ? ymd(hoje) : ymd(addDays(domingo, 6));
  return { de, ate };
}
// Bounds de createdAt (BRT) em ISO UTC: início do dia `de` e fim do dia `ate`.
const inicioUTC = (dia) => `${dia}T03:00:00.000Z`;
const fimUTC = (dia) => `${ymd(addDays(new Date(dia + 'T12:00:00Z'), 1))}T02:59:59.999Z`;

/* ────────────────────────────── DataCrazy ────────────────────────────── */
async function dcLeadCount(stages, tags, de, ate, token) {
  // Mesmos parâmetros do MCP do DataCrazy (proxy fino da api.datacrazy.io):
  // createdAtGreaterOrEqual/LessOrEqual, stages (csv), tags (id). Pagina por skip.
  let skip = 0, total = 0;
  const limit = 500;
  for (let p = 0; p < 20; p++) {
    const qs = new URLSearchParams({
      createdAtGreaterOrEqual: inicioUTC(de),
      createdAtLessOrEqual: fimUTC(ate),
      stages: stages.join(','),
      limit: String(limit),
      skip: String(skip),
    });
    if (tags) qs.set('tags', tags);
    const r = await fetch(`${DC_BASE}/leads?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`DataCrazy HTTP ${r.status}`);
    const j = await r.json();
    const arr = Array.isArray(j.data) ? j.data : [];
    total += arr.length;
    if (arr.length < limit) break;
    skip += limit;
  }
  return total;
}

async function leadsDaSemana(de, ate, token) {
  const funis = {};
  let totalEntraram = 0, totalContatados = 0;
  for (const [chave, f] of Object.entries(FUNIS)) {
    const entraram = await dcLeadCount(f.todos, f.tags, de, ate, token);
    const contatados = await dcLeadCount(f.contato, f.tags, de, ate, token);
    funis[chave] = { nome: f.nome, entraram, contatados };
    totalEntraram += entraram;
    totalContatados += contatados;
  }
  return { total_entraram: totalEntraram, total_contatados: totalContatados, funis };
}

/* ────────────────────────────── Meta ────────────────────────────── */
function metaLeads(actions) {
  for (const tipo of META_LEAD_ACTIONS) {
    const a = (actions || []).find((x) => String(x.action_type) === tipo);
    if (a) return Number(a.value) || 0;
  }
  return 0;
}

async function metaConta(conta, de, ate, token) {
  let url = `${GRAPH}/act_${conta.id}/insights?` + new URLSearchParams({
    level: 'campaign',
    fields: 'campaign_name,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: de, until: ate }),
    limit: '500',
    access_token: token,
  });
  const campanhas = [];
  let gasto = 0, impressoes = 0, cliques = 0, resultados = 0;
  while (url) {
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(`Meta: ${j.error.message || 'erro'}`);
    for (const x of j.data || []) {
      const g = Number(x.spend) || 0;
      if (g <= 0) continue; // só campanhas com veiculação na semana
      const res = metaLeads(x.actions);
      campanhas.push({
        nome: x.campaign_name || '(sem nome)',
        conta: conta.nome,
        gasto: g,
        impressoes: Number(x.impressions) || 0,
        cliques: Number(x.clicks) || 0,
        resultados: res,
      });
      gasto += g; impressoes += Number(x.impressions) || 0;
      cliques += Number(x.clicks) || 0; resultados += res;
    }
    url = (j.paging && j.paging.next) || null;
  }
  return {
    id: conta.id, nome: conta.nome,
    gasto: +gasto.toFixed(2), impressoes, cliques, resultados,
    campanhas,
  };
}

async function metaDaSemana(de, ate, token) {
  const contas = [];
  let gasto = 0, impressoes = 0, cliques = 0, resultados = 0;
  const campanhas = [];
  for (const c of CONTAS_META) {
    const r = await metaConta(c, de, ate, token);
    contas.push({ id: r.id, nome: r.nome, gasto: r.gasto, impressoes: r.impressoes, cliques: r.cliques, resultados: r.resultados });
    campanhas.push(...r.campanhas);
    gasto += r.gasto; impressoes += r.impressoes; cliques += r.cliques; resultados += r.resultados;
  }
  campanhas.sort((a, b) => b.gasto - a.gasto);
  return { total: +gasto.toFixed(2), impressoes, cliques, resultados, contas, campanhas };
}

/* ────────────────────────────── Google (planilha do Ads Script) ────────────────────────────── */
async function googleDaSemana(de, ate, url) {
  // A planilha (preenchida por um Google Ads Script) devolve linhas
  // { data:'YYYY-MM-DD', conta, campanha, gasto }. Somamos o período.
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}de=${de}&ate=${ate}`);
  const j = await r.json();
  const linhas = Array.isArray(j.data) ? j.data : (Array.isArray(j) ? j : []);
  const porCampanha = {};
  let total = 0;
  for (const l of linhas) {
    const dia = String(l.data || l.Data || '').slice(0, 10);
    if (dia && (dia < de || dia > ate)) continue;
    const nome = String(l.campanha || l.Campanha || l.campaign || '(sem nome)');
    const g = Number(l.gasto || l.Gasto || l.cost || 0) || 0;
    porCampanha[nome] = (porCampanha[nome] || 0) + g;
    total += g;
  }
  const campanhas = Object.entries(porCampanha)
    .map(([nome, gasto]) => ({ nome, gasto: +gasto.toFixed(2) }))
    .sort((a, b) => b.gasto - a.gasto);
  return { total: +total.toFixed(2), campanhas };
}

/* ────────────────────────────── coleta de uma semana ────────────────────────────── */
async function coletarSemana(offset, env) {
  const { de, ate } = semana(offset);
  const fontes = {};
  const out = { periodo: { de, ate } };

  // DataCrazy (obrigatória — é o núcleo do relatório)
  try {
    out.leads = await leadsDaSemana(de, ate, env.DC_TOKEN);
    fontes.datacrazy = 'ok';
  } catch (e) { fontes.datacrazy = String(e.message || e); out.leads = null; }

  // Meta (liga com META_ADS_TOKEN)
  if (env.META_ADS_TOKEN) {
    try { out.meta = await metaDaSemana(de, ate, env.META_ADS_TOKEN); fontes.meta = 'ok'; }
    catch (e) { fontes.meta = String(e.message || e); out.meta = null; }
  } else { fontes.meta = 'sem META_ADS_TOKEN'; out.meta = null; }

  // Google (liga com GOOGLE_ADS_SHEET_URL)
  if (env.GOOGLE_ADS_SHEET_URL) {
    try { out.google = await googleDaSemana(de, ate, env.GOOGLE_ADS_SHEET_URL); fontes.google = 'ok'; }
    catch (e) { fontes.google = String(e.message || e); out.google = null; }
  } else { fontes.google = 'sem GOOGLE_ADS_SHEET_URL'; out.google = null; }

  out.fontes = fontes;
  return out;
}

/* ────────────────────────────── handler ────────────────────────────── */
export default async function handler(req, res) {
  // Proteção do disparo: Vercel Cron manda Authorization: Bearer <CRON_SECRET>.
  // Também aceita ?key= pra disparo manual. Sem CRON_SECRET, roda livre (dev).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const key = (req.query && req.query.key) || '';
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return res.status(401).json({ error: 'não autorizado' });
    }
  }

  const env = {
    DC_TOKEN: process.env.DC_TOKEN,
    META_ADS_TOKEN: process.env.META_ADS_TOKEN,
    GOOGLE_ADS_SHEET_URL: process.env.GOOGLE_ADS_SHEET_URL,
  };
  const BOARD_SHEET_URL = process.env.BOARD_SHEET_URL;
  if (!env.DC_TOKEN || !BOARD_SHEET_URL) {
    return res.status(500).json({ error: 'DC_TOKEN ou BOARD_SHEET_URL não configurados' });
  }

  try {
    const [atual, passada] = await Promise.all([coletarSemana(0, env), coletarSemana(-1, env)]);
    const snapshot = {
      versao: 1,
      coletadoEm: new Date().toISOString(),
      semanas: { atual, passada },
    };

    const r = await fetch(BOARD_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: process.env.BOARD_TOKEN || '', snapshot }),
    });
    const gravou = await r.json().catch(() => ({}));

    return res.status(200).json({
      ok: gravou.status === 'ok',
      geradoEm: gravou.geradoEm || null,
      resumo: {
        atual: { leads: atual.leads && atual.leads.total_entraram, meta: atual.meta && atual.meta.total },
        passada: { leads: passada.leads && passada.leads.total_entraram, meta: passada.meta && passada.meta.total },
      },
      fontes: { atual: atual.fontes, passada: passada.fontes },
    });
  } catch (err) {
    return res.status(500).json({ error: 'falha na coleta', message: err.message });
  }
}
