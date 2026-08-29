/**
 * Code.gs COMPLETO da planilha "Rastreamento Webinario".
 * Grava cada clique no botão do grupo do WhatsApp (doPost) e devolve os
 * cliques somados por conjunto e criativo (doGet).
 *
 * Planilha: https://docs.google.com/spreadsheets/d/1v3wgX5CtY6WlpbLUG9gISKd2wtzoY9qRVYd72AAxjOc
 * Colunas (linha 1): Data | Conjunto | Criativo | Campaign | Source | Medium | Referral
 *
 * SUBSTITUA o conteúdo inteiro do Code.gs por este arquivo — ele já contém as
 * duas funções. Em 2026-08-28 o doPost foi perdido porque a versão anterior
 * deste arquivo era só o doGet e acabou colada por cima do arquivo todo; o
 * rastreamento ficou mudo com campanha no ar. Por isso agora é arquivo completo.
 *
 * Publicar: Implantar → Gerenciar implantações → lápis → Versão: "Nova versão"
 * → Implantar. A URL /exec não muda.
 *
 * Uso do doGet:
 *   GET .../exec                    → tudo
 *   GET .../exec?desde=2026-08-29   → só a partir da data
 */

// Aba usada pelo ciclo atual. Deixe '' para usar a primeira aba (a mais à
// esquerda). Escrita e leitura usam SEMPRE a mesma aba — se divergirem, o
// doPost grava num lugar e o doGet lê de outro, que foi o que confundiu a
// leitura quando uma aba nova entrou na frente.
const ABA_RASTREIO = '';

// Linhas de teste não contam como clique real.
const RASTREIO_IGNORAR = ['check', 'teste', 'test-final', 'claude', 'sonda', 'verificacao'];

function _abaRastreio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return (ABA_RASTREIO && ss.getSheetByName(ABA_RASTREIO)) || ss.getSheets()[0];
}

function _rastreioJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);

    // Data gravada como Date de verdade, não string formatada: string em
    // dd/MM/yyyy não é parseável em JS e quebrava o filtro ?desde do doGet.
    _abaRastreio().appendRow([
      new Date(),
      d.utm_adset    || '',
      d.utm_content  || '',
      d.utm_campaign || '',
      d.utm_source   || '',
      d.utm_medium   || '',
      d.referral     || ''
    ]);

    return _rastreioJson({ status: 'ok' });
  } catch (err) {
    return _rastreioJson({ status: 'erro', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  const values = _abaRastreio().getDataRange().getValues();

  if (values.length < 2) {
    return _rastreioJson({ total: 0, conjuntos: [], criativos: [] });
  }

  const desde = p.desde ? new Date(p.desde + 'T00:00:00-03:00') : null;

  const porConjunto = {};
  const porCriativo = {};
  let total = 0;
  let primeiro = null;
  let ultimo = null;

  for (let i = 1; i < values.length; i++) {
    const data = values[i][0];
    const conjunto = values[i][1];
    const criativo = values[i][2];

    const assinatura = String(conjunto || '').toLowerCase() + ' ' + String(criativo || '').toLowerCase();
    if (RASTREIO_IGNORAR.some(function (t) { return assinatura.indexOf(t) !== -1; })) continue;

    const quando = data instanceof Date ? data : new Date(data);
    if (desde && !(quando >= desde)) continue;

    total++;
    if (!isNaN(quando.getTime())) {
      if (!primeiro || quando < primeiro) primeiro = quando;
      if (!ultimo || quando > ultimo) ultimo = quando;
    }

    const kc = String(conjunto || '(sem conjunto)').trim();
    const kr = String(criativo || '(sem criativo)').trim();
    porConjunto[kc] = (porConjunto[kc] || 0) + 1;
    porCriativo[kr] = (porCriativo[kr] || 0) + 1;
  }

  const ranking = function (obj) {
    return Object.keys(obj)
      .map(function (nome) { return { nome: nome, cliques: obj[nome] }; })
      .sort(function (a, b) { return b.cliques - a.cliques; });
  };

  return _rastreioJson({
    total: total,
    aba: _abaRastreio().getName(),
    periodo: {
      de: primeiro ? Utilities.formatDate(primeiro, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm') : null,
      ate: ultimo ? Utilities.formatDate(ultimo, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm') : null
    },
    conjuntos: ranking(porConjunto),
    criativos: ranking(porCriativo)
  });
}
