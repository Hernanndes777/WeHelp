// api/coletor-board.js — coletor do board /performance (modelo coletor→snapshot→UI).
//
// Roda pelo Vercel Cron (ver vercel.json). Monta o snapshot da semana e grava na
// planilha "Performance WeHelp" (Apps Script). A página só lê o snapshot (api/board.js).
//
// LEADS: contados DIRETO das 3 planilhas-fonte (Site, Webinário, Meta Forms) pelo
// próprio Apps Script (GET ?leads=1) — é a fonte de verdade. NÃO usa mais o DataCrazy
// pra isso (o REST dele ignora filtros e superconta).
// META: Graph insights por conta/campanha (liga com META_ADS_TOKEN).
// GOOGLE: planilha do Google Ads Script (liga com GOOGLE_ADS_SHEET_URL).
//
// Variáveis de ambiente (Vercel):
//   BOARD_SHEET_URL        — URL /exec do Apps Script "Performance WeHelp"   [obrigatória]
//   BOARD_TOKEN            — (opcional) mesmo TOKEN configurado no Apps Script
//   META_ADS_TOKEN         — token de sistema da WeHelp com ads_read          [liga o Meta]
//   GOOGLE_ADS_SHEET_URL   — URL (JSON) da planilha do Google Ads Script      [liga o Google]
//   CRON_SECRET            — (opcional) protege o disparo; o Vercel Cron manda sozinho

const GRAPH = 'https://graph.facebook.com/v21.0';

// Contas Meta da WeHelp queryáveis hoje. V2 (562276649393347) entra quando o Meta liberar.
const CONTAS_META = [
  { id: '2222467497864426', nome: 'WEHELP V1' },
  { id: '3546690215570934', nome: 'WEHELP V3' },
];
// Prioridade pra contar 1 "resultado" por campanha sem somar aliases sobrepostos.
const META_LEAD_ACTIONS = [
  'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead',
  'leadgen.other', 'lead',
];

/* ───────────────────────── datas (BRT, sem DST) ───────────────────────── */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
function agoraBRT() { return new Date(Date.now() - 3 * 3600 * 1000); }

// Semana domingo→sábado. offset 0 = atual (domingo→hoje); -1 = passada (domingo→sábado).
function semana(offset) {
  const hoje = agoraBRT();
  const domingo = addDays(addDays(hoje, -hoje.getUTCDay()), offset * 7);
  return { de: ymd(domingo), ate: offset === 0 ? ymd(hoje) : ymd(addDays(domingo, 6)) };
}

/* ───────────────────────── leads (via Apps Script → planilhas) ───────────────────────── */
async function leadsDaSemana(de, ate, boardUrl) {
  const sep = boardUrl.includes('?') ? '&' : '?';
  const r = await fetch(`${boardUrl}${sep}leads=1&de=${de}&ate=${ate}`, { redirect: 'follow' });
  const j = await r.json();
  if (j.erro) throw new Error(j.erro);
  return j; // { periodo, total_entraram, total_contatados, funis }
}

/* ───────────────────────── Meta ───────────────────────── */
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
      if (g <= 0) continue;
      const res = metaLeads(x.actions);
      campanhas.push({
        nome: x.campaign_name || '(sem nome)', conta: conta.nome,
        gasto: g, impressoes: Number(x.impressions) || 0, cliques: Number(x.clicks) || 0, resultados: res,
      });
      gasto += g; impressoes += Number(x.impressions) || 0; cliques += Number(x.clicks) || 0; resultados += res;
    }
    url = (j.paging && j.paging.next) || null;
  }
  return { id: conta.id, nome: conta.nome, gasto: +gasto.toFixed(2), impressoes, cliques, resultados, campanhas };
}

async function metaDaSemana(de, ate, token) {
  const contas = [];
  const campanhas = [];
  let gasto = 0, impressoes = 0, cliques = 0, resultados = 0;
  for (const c of CONTAS_META) {
    const r = await metaConta(c, de, ate, token);
    contas.push({ id: r.id, nome: r.nome, gasto: r.gasto, impressoes: r.impressoes, cliques: r.cliques, resultados: r.resultados });
    campanhas.push(...r.campanhas);
    gasto += r.gasto; impressoes += r.impressoes; cliques += r.cliques; resultados += r.resultados;
  }
  campanhas.sort((a, b) => b.gasto - a.gasto);
  return { total: +gasto.toFixed(2), impressoes, cliques, resultados, contas, campanhas };
}

/* ───────────────────────── Google (planilha do Ads Script) ───────────────────────── */
async function googleDaSemana(de, ate, url) {
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

/* ───────────────────────── coleta de uma semana ───────────────────────── */
async function coletarSemana(offset, env, boardUrl) {
  const { de, ate } = semana(offset);
  const fontes = {};
  const out = { periodo: { de, ate } };

  try { out.leads = await leadsDaSemana(de, ate, boardUrl); fontes.leads = 'ok'; }
  catch (e) { fontes.leads = String(e.message || e); out.leads = null; }

  if (env.META_ADS_TOKEN) {
    try { out.meta = await metaDaSemana(de, ate, env.META_ADS_TOKEN); fontes.meta = 'ok'; }
    catch (e) { fontes.meta = String(e.message || e); out.meta = null; }
  } else { fontes.meta = 'sem META_ADS_TOKEN'; out.meta = null; }

  if (env.GOOGLE_ADS_SHEET_URL) {
    try { out.google = await googleDaSemana(de, ate, env.GOOGLE_ADS_SHEET_URL); fontes.google = 'ok'; }
    catch (e) { fontes.google = String(e.message || e); out.google = null; }
  } else { fontes.google = 'sem GOOGLE_ADS_SHEET_URL'; out.google = null; }

  out.fontes = fontes;
  return out;
}

/* ───────────────────────── handler ───────────────────────── */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    const key = (req.query && req.query.key) || '';
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return res.status(401).json({ error: 'não autorizado' });
    }
  }

  const BOARD_SHEET_URL = process.env.BOARD_SHEET_URL;
  if (!BOARD_SHEET_URL) return res.status(500).json({ error: 'BOARD_SHEET_URL não configurada' });
  const env = {
    META_ADS_TOKEN: process.env.META_ADS_TOKEN,
    GOOGLE_ADS_SHEET_URL: process.env.GOOGLE_ADS_SHEET_URL,
  };

  try {
    const [atual, passada] = await Promise.all([
      coletarSemana(0, env, BOARD_SHEET_URL),
      coletarSemana(-1, env, BOARD_SHEET_URL),
    ]);
    const snapshot = { versao: 2, coletadoEm: new Date().toISOString(), semanas: { atual, passada } };

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
      leads_debug: { atual: atual.leads && atual.leads._debug, passada: passada.leads && passada.leads._debug },
    });
  } catch (err) {
    return res.status(500).json({ error: 'falha na coleta', message: err.message });
  }
}
