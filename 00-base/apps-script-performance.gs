/**
 * Code.gs COMPLETO da planilha "Performance WeHelp" — snapshot do board /performance.
 *
 * É o "arquivo de snapshot" do modelo coletor→snapshot→UI (igual ao painel da
 * Soufit, só que aqui o storage é esta planilha em vez de um arquivo na VPS).
 *
 *   - O coletor (api/coletor-board.js, roda no Vercel Cron) faz POST com o
 *     snapshot pronto (leads do DataCrazy + gasto Meta + gasto Google).
 *   - A página /performance lê via GET (por trás do proxy api/board.js).
 *
 * Guarda duas abas:
 *   Snapshot  — uma linha só: o JSON inteiro do último snapshot + quando gerou
 *   Historico — uma linha por coleta, com os números-cabeça (pra tendência)
 *
 * COMO INSTALAR
 * 1. Crie a planilha "Performance WeHelp", Extensoes -> Apps Script, apague tudo
 *    e cole este arquivo inteiro.
 * 2. (Opcional) Projeto -> Propriedades do script -> adicione TOKEN = <um segredo>.
 *    Se definir, o coletor precisa mandar o mesmo token pra gravar.
 * 3. Implantar -> Nova implantacao -> App da Web
 *    - Executar como: Eu | Quem pode acessar: Qualquer pessoa
 * 4. Abra a URL /exec uma vez — as abas se criam sozinhas.
 * 5. Passe a URL /exec pro Claude configurar BOARD_SHEET_URL na Vercel.
 *
 * Guarde SEMPRE o arquivo inteiro aqui, nunca um pedaço (um doGet colado por cima
 * do Code.gs já apagou o doPost de outro script e deixou dado mudo com campanha no ar).
 */

const ABA_SNAPSHOT = 'Snapshot';
const ABA_HISTORICO = 'Historico';
const TZ = 'America/Sao_Paulo';

const CABECALHOS = {
  'Snapshot':  ['geradoEm', 'json'],
  'Historico': ['geradoEm', 'semana', 'leads_entraram', 'leads_contatados', 'meta_gasto', 'google_gasto'],
};

function _aba(nome) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nome);
  if (sh) return sh;

  const cab = CABECALHOS[nome];
  if (!cab) throw new Error('Aba desconhecida: ' + nome);

  const abas = ss.getSheets();
  if (abas.length === 1 && abas[0].getLastRow() === 0) {
    sh = abas[0].setName(nome);
  } else {
    sh = ss.insertSheet(nome);
  }
  sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─────────────────────────── ESCRITA (coletor grava) ─────────────────────────── */

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);

    // Token opcional: se a propriedade TOKEN existir, o POST tem que trazê-lo.
    const esperado = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (esperado && String(d.token || '') !== esperado) {
      return _json({ status: 'erro', message: 'token invalido' });
    }

    const snap = d.snapshot || d.dados || null;
    if (!snap || typeof snap !== 'object') {
      return _json({ status: 'erro', message: 'snapshot ausente' });
    }

    const geradoEm = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
    const sh = _aba(ABA_SNAPSHOT);
    // Uma linha só (linha 2): sempre sobrescreve o snapshot anterior.
    sh.getRange(2, 1, 1, 2).setValues([[geradoEm, JSON.stringify(snap)]]);

    // Histórico: uma linha por coleta, só os números-cabeça (barato e serve tendência).
    // Usa a "semana atual" do snapshot quando existir.
    const sem = (snap.semanas && (snap.semanas.atual || snap.semanas.passada)) || {};
    const leads = sem.leads || {};
    const meta = sem.meta || {};
    const google = sem.google || {};
    _aba(ABA_HISTORICO).appendRow([
      geradoEm,
      (sem.periodo && sem.periodo.de) ? (sem.periodo.de + ' a ' + sem.periodo.ate) : '',
      Number(leads.total_entraram) || 0,
      Number(leads.total_contatados) || 0,
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

/* ─────────────────────────── LEITURA (página lê) ─────────────────────────── */

function doGet(e) {
  const sh = _aba(ABA_SNAPSHOT);
  if (sh.getLastRow() < 2) {
    return _json({ geradoEm: null, dados: null, aviso: 'coleta ainda nao rodou' });
  }
  const linha = sh.getRange(2, 1, 1, 2).getValues()[0];
  let dados = null;
  try { dados = JSON.parse(linha[1]); } catch (err) { dados = null; }
  return _json({
    geradoEm: linha[0] ? String(linha[0]) : null,
    dados: dados,
  });
}
