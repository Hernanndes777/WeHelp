/**
 * Code.gs COMPLETO da planilha "Performance WeHelp" — snapshot do board /performance.
 *
 * Modelo coletor→snapshot→UI (igual ao painel da Soufit). Duas responsabilidades:
 *
 *  1) CONTAR LEADS da semana, lendo DIRETO das 3 planilhas-fonte (fonte de verdade,
 *     não o DataCrazy — o REST do DataCrazy ignora filtros e superconta). Este
 *     script roda como o dono da conta, então abre as planilhas por ID e conta as
 *     linhas cuja DATA (como está escrita na planilha) cai na semana pedida.
 *       GET ?leads=1&de=YYYY-MM-DD&ate=YYYY-MM-DD  → contagem por fonte
 *
 *  2) GUARDAR o snapshot que o coletor (api/coletor-board.js, Vercel Cron) monta
 *     (leads + gasto Meta + gasto Google):
 *       POST { snapshot }   → grava
 *       GET                 → devolve o último snapshot (a página lê por api/board.js)
 *
 * Abas: Snapshot (1 linha, o JSON) e Historico (1 linha por coleta).
 *
 * COMO INSTALAR / ATUALIZAR
 * 1. Na planilha "Performance WeHelp": Extensoes -> Apps Script, apague tudo e cole
 *    este arquivo inteiro.
 * 2. Implantar -> Gerenciar implantações -> Editar (lápis) -> Versão: Nova versão
 *    -> Executar como: Eu | Quem pode acessar: Qualquer pessoa -> Implantar.
 *    (A URL /exec continua a mesma.)
 * 3. As 3 planilhas-fonte abaixo precisam estar acessíveis por ESTA conta
 *    (mesma que roda o script). Se alguma der erro, compartilhe com esta conta.
 *
 * Guarde SEMPRE o arquivo inteiro aqui, nunca um pedaço.
 */

const ABA_SNAPSHOT = 'Snapshot';
const ABA_HISTORICO = 'Historico';
const TZ = 'America/Sao_Paulo';

const CABECALHOS = {
  'Snapshot':  ['geradoEm', 'json'],
  'Historico': ['geradoEm', 'semana', 'leads_entraram', 'meta_gasto', 'google_gasto'],
};

/**
 * As 3 fontes de "leads que entraram". Conta 1 lead por linha cuja data (na coluna
 * indicada) esteja na semana. A data é lida COMO ESTÁ escrita (sem converter fuso),
 * que é como o time confere na planilha.
 *   tab: null = 1ª aba | 'ALL' = todas as abas | <número> = aba com aquele gid
 */
const FONTES_LEADS = [
  {
    chave: 'site', nome: 'Site',
    sheetId: '1FyJ9gtpXjfnZpQ_fCZnK2lpGk_VKz9SPvUzUiprSUDQ',
    tab: null, colunasData: ['received_at', 'Data_da_conversao'],
  },
  {
    chave: 'webinario', nome: 'Webinário',
    sheetId: '1YflrC2bt5sRTDxLeL_ksw4n6BioOAFOtiv_RBZYqgkY',
    // Só a semana atual/passada cai na janela, e nela só existem linhas do WB vigente,
    // então varrer todas as abas por received_at devolve as aplicações da semana.
    tab: 'ALL', colunasData: ['received_at', 'Data_da_conversao', 'Data'],
  },
  {
    chave: 'metaforms', nome: 'Meta Forms',
    sheetId: '17lery9jmdk26HOiPrhEOv41Rq_c0I4mMveEoP3rTZVM',
    tab: 'ALL', colunasData: ['created_time'],
  },
];

function _aba(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nome);
  if (sh) return sh;
  const cab = CABECALHOS[nome];
  if (!cab) throw new Error('Aba desconhecida: ' + nome);
  const abas = ss.getSheets();
  if (abas.length === 1 && abas[0].getLastRow() === 0) sh = abas[0].setName(nome);
  else sh = ss.insertSheet(nome);
  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────────────── contagem de leads (das planilhas) ───────────────────────── */

/** Extrai a data YYYY-MM-DD de um valor, sem converter fuso (usa a data como escrita). */
function _dia(v) {
  if (v === '' || v == null) return null;
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);        // ISO: 2026-09-10T...
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);          // BR: 10/09/2026
  if (m) return m[3] + '-' + m[2] + '-' + m[1];
  return null;
}

function _abasDaFonte(ss, tab) {
  if (tab === 'ALL') return ss.getSheets();
  if (tab == null) return [ss.getSheets()[0]];
  return ss.getSheets().filter(function (s) { return s.getSheetId() === Number(tab); });
}

/** Conta linhas de uma fonte cuja data cai em [de, ate] (YYYY-MM-DD, inclusive). */
function _contarFonte(fonte, de, ate) {
  const ss = SpreadsheetApp.openById(fonte.sheetId);
  const abas = _abasDaFonte(ss, fonte.tab);
  let n = 0;
  const detalhe = [];
  for (var a = 0; a < abas.length; a++) {
    const sh = abas[a];
    if (sh.getLastRow() < 2) continue;
    const vals = sh.getDataRange().getValues();
    const header = vals[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var col = -1;
    for (var c = 0; c < fonte.colunasData.length; c++) {
      const i = header.indexOf(fonte.colunasData[c].toLowerCase());
      if (i >= 0) { col = i; break; }
    }
    if (col < 0) continue; // aba sem a coluna de data (ex.: aba auxiliar) → ignora
    var nAba = 0;
    for (var r = 1; r < vals.length; r++) {
      const dia = _dia(vals[r][col]);
      if (dia && dia >= de && dia <= ate) { n++; nAba++; }
    }
    if (nAba > 0) detalhe.push(sh.getName() + '=' + nAba);
  }
  return { n: n, detalhe: detalhe };
}

/** Contagem da semana por fonte. contatados fica null (é dado de CRM — pendente). */
function _contarLeads(de, ate) {
  const funis = {};
  var total = 0;
  const debug = {};
  for (var i = 0; i < FONTES_LEADS.length; i++) {
    const f = FONTES_LEADS[i];
    try {
      const r = _contarFonte(f, de, ate);
      funis[f.chave] = { nome: f.nome, entraram: r.n, contatados: null };
      total += r.n;
      debug[f.chave] = r.detalhe.join(', ') || 'sem linhas na janela';
    } catch (err) {
      funis[f.chave] = { nome: f.nome, entraram: null, contatados: null, erro: String(err) };
      debug[f.chave] = 'ERRO: ' + String(err);
    }
  }
  return {
    periodo: { de: de, ate: ate },
    total_entraram: total,
    total_contatados: null,
    funis: funis,
    _debug: debug,
  };
}

/* ───────────────────────── ESCRITA (coletor grava snapshot) ───────────────────────── */

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    const esperado = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (esperado && String(d.token || '') !== esperado) {
      return _json({ status: 'erro', message: 'token invalido' });
    }
    const snap = d.snapshot || d.dados || null;
    if (!snap || typeof snap !== 'object') {
      return _json({ status: 'erro', message: 'snapshot ausente' });
    }
    const geradoEm = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
    _aba(ABA_SNAPSHOT).getRange(2, 1, 1, 2).setValues([[geradoEm, JSON.stringify(snap)]]);

    const sem = (snap.semanas && (snap.semanas.atual || snap.semanas.passada)) || {};
    const leads = sem.leads || {};
    const meta = sem.meta || {};
    const google = sem.google || {};
    _aba(ABA_HISTORICO).appendRow([
      geradoEm,
      (sem.periodo && sem.periodo.de) ? (sem.periodo.de + ' a ' + sem.periodo.ate) : '',
      Number(leads.total_entraram) || 0,
      Number(meta.total) || 0,
      Number(google.total) || 0,
    ]);
    return _json({ status: 'ok', geradoEm: geradoEm });
  } catch (err) {
    return _json({ status: 'erro', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── LEITURA ───────────────────────── */

function doGet(e) {
  const p = (e && e.parameter) || {};

  // Modo contagem de leads (o coletor chama isto por semana).
  if (p.leads === '1') {
    const de = String(p.de || '');
    const ate = String(p.ate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
      return _json({ erro: 'de/ate obrigatórios (YYYY-MM-DD)' });
    }
    return _json(_contarLeads(de, ate));
  }

  // Modo padrão: devolve o último snapshot (a página lê isto).
  const sh = _aba(ABA_SNAPSHOT);
  if (sh.getLastRow() < 2) return _json({ geradoEm: null, dados: null, aviso: 'coleta ainda nao rodou' });
  const linha = sh.getRange(2, 1, 1, 2).getValues()[0];
  var dados = null;
  try { dados = JSON.parse(linha[1]); } catch (err) { dados = null; }
  return _json({ geradoEm: linha[0] ? String(linha[0]) : null, dados: dados });
}
