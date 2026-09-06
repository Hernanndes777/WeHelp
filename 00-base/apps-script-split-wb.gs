/**
 * Code.gs COMPLETO da planilha "Split WB" — teste A/B das páginas do webinário.
 *
 * Guarda três coisas:
 *  - Eventos:  um registro por pageview e por clique no botão do grupo
 *  - Config:   os pesos do sorteio, editáveis pelo /painel-wb sem deploy
 *  - Grupos:   entradas reais no grupo, uma linha por variante/dia (manual)
 *
 * COMO INSTALAR
 * 1. Crie uma planilha nova chamada "Split WB"
 * 2. Crie três abas com estes nomes EXATOS: Eventos, Config, Grupos
 * 3. Linha 1 de cada aba:
 *    Eventos → Data | Variante | Evento | Campaign | Adset | Criativo | Source | Medium | Referral
 *    Config  → Variante | Peso | Ativa
 *    Grupos  → Data | Variante | Entradas
 * 4. Extensões → Apps Script, apague tudo e cole este arquivo inteiro
 * 5. Implantar → Nova implantação → App da Web
 *    - Executar como: Eu
 *    - Quem pode acessar: Qualquer pessoa
 * 6. Me passe a URL /exec — ela vira a env SHEETS_SPLIT_WB_URL na Vercel
 *
 * Este arquivo é COMPLETO de propósito. Em 2026-08-28 o doPost do rastreamento
 * antigo foi perdido porque o arquivo guardado aqui só tinha o doGet e acabou
 * colado por cima do Code.gs inteiro — o rastreamento ficou mudo com campanha
 * no ar. Nunca guarde pedaço de script aqui, só arquivo inteiro.
 *
 * ENDPOINTS
 *   POST { variante, evento, ... }        → grava um evento
 *   POST { acao:'pesos', pesos:[...] }    → salva os pesos (vem do painel)
 *   GET  ?modo=pesos                      → pesos ativos (o roteador consome)
 *   GET                                   → resumo por variante (o painel consome)
 *   GET  ?desde=2026-09-10                → resumo a partir da data
 */

const ABA_EVENTOS = 'Eventos';
const ABA_CONFIG  = 'Config';
const ABA_GRUPOS  = 'Grupos';

const TZ = 'America/Sao_Paulo';

// Linhas de teste não entram na conta.
const IGNORAR = ['check', 'teste', 'test-final', 'claude', 'sonda', 'verificacao'];

function _aba(nome) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não encontrada');
  return sh;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _ehTeste(txt) {
  const s = String(txt || '').toLowerCase();
  return IGNORAR.some(function (t) { return s.indexOf(t) !== -1; });
}

/* ─────────────────────────── ESCRITA ─────────────────────────── */

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);

    if (d.acao === 'pesos') return _salvarPesos(d.pesos);

    // Data como Date real, não string formatada: string em dd/MM/yyyy não é
    // parseável em JS e quebrava o filtro por data na versão anterior.
    _aba(ABA_EVENTOS).appendRow([
      new Date(),
      d.variante     || '',
      d.evento       || 'pageview',
      d.utm_campaign || '',
      d.utm_adset    || '',
      d.utm_content  || '',
      d.utm_source   || '',
      d.utm_medium   || '',
      d.referral     || ''
    ]);

    return _json({ status: 'ok' });
  } catch (err) {
    return _json({ status: 'erro', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function _salvarPesos(pesos) {
  if (!Array.isArray(pesos) || !pesos.length) {
    return _json({ status: 'erro', message: 'pesos vazio' });
  }
  const sh = _aba(ABA_CONFIG);
  const ultima = sh.getLastRow();
  if (ultima > 1) sh.getRange(2, 1, ultima - 1, 3).clearContent();

  const linhas = pesos.map(function (p) {
    return [String(p.variante || ''), Number(p.peso) || 0, p.ativa === false ? 'nao' : 'sim'];
  });
  sh.getRange(2, 1, linhas.length, 3).setValues(linhas);

  return _json({ status: 'ok', salvos: linhas.length });
}

/* ─────────────────────────── LEITURA ─────────────────────────── */

function _lerPesos() {
  const sh = _aba(ABA_CONFIG);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (l) { return String(l[0]).trim() !== ''; })
    .map(function (l) {
      return {
        variante: String(l[0]).trim(),
        peso: Number(l[1]) || 0,
        ativa: String(l[2]).trim().toLowerCase() !== 'nao'
      };
    });
}

function _lerEntradasGrupo(desde) {
  const sh = _aba(ABA_GRUPOS);
  const out = {};
  if (sh.getLastRow() < 2) return out;

  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (l) {
    const quando = l[0] instanceof Date ? l[0] : new Date(l[0]);
    if (desde && !(quando >= desde)) return;
    const v = String(l[1] || '').trim();
    if (!v) return;
    out[v] = (out[v] || 0) + (Number(l[2]) || 0);
  });
  return out;
}

function doGet(e) {
  const p = (e && e.parameter) || {};

  // O roteador só quer saber pra onde mandar — resposta mínima e rápida.
  if (p.modo === 'pesos') {
    return _json({ pesos: _lerPesos().filter(function (x) { return x.ativa && x.peso > 0; }) });
  }

  const desde = p.desde ? new Date(p.desde + 'T00:00:00-03:00') : null;
  const sh = _aba(ABA_EVENTOS);

  const porVariante = {};
  function slot(v) {
    if (!porVariante[v]) porVariante[v] = { variante: v, visitantes: 0, cliques: 0, entradas: 0 };
    return porVariante[v];
  }

  if (sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(function (l) {
      const quando = l[0] instanceof Date ? l[0] : new Date(l[0]);
      if (desde && !(quando >= desde)) return;

      const variante = String(l[1] || '').trim();
      if (!variante) return;
      if (_ehTeste(variante) || _ehTeste(l[3]) || _ehTeste(l[4])) return;

      const evento = String(l[2] || 'pageview').trim().toLowerCase();
      const s = slot(variante);
      if (evento === 'clique') s.cliques++;
      else s.visitantes++;
    });
  }

  const entradas = _lerEntradasGrupo(desde);
  Object.keys(entradas).forEach(function (v) { slot(v).entradas = entradas[v]; });

  const linhas = Object.keys(porVariante).map(function (v) {
    const s = porVariante[v];
    // Taxa de entrada é a métrica que decide o teste: de quem clicou no botão,
    // quantos realmente entraram no grupo. É o número que o funil nunca teve.
    s.taxa_clique  = s.visitantes ? +(s.cliques / s.visitantes * 100).toFixed(1) : 0;
    s.taxa_entrada = s.cliques ? +(s.entradas / s.cliques * 100).toFixed(1) : 0;
    return s;
  }).sort(function (a, b) { return b.visitantes - a.visitantes; });

  return _json({
    geradoEm: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'),
    desde: p.desde || null,
    variantes: linhas,
    pesos: _lerPesos(),
    totais: linhas.reduce(function (acc, s) {
      acc.visitantes += s.visitantes;
      acc.cliques += s.cliques;
      acc.entradas += s.entradas;
      return acc;
    }, { visitantes: 0, cliques: 0, entradas: 0 })
  });
}
