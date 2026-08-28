/**
 * doGet da planilha "Rastreamento Webinario" — leitura dos cliques no botão
 * do grupo do WhatsApp, já agregados por conjunto e por criativo.
 *
 * ATENÇÃO: este arquivo é um ACRÉSCIMO, não uma substituição.
 * O doPost que grava as linhas já existe no editor da planilha e está
 * funcionando — não mexa nele. Cole SÓ a função abaixo no final do Code.gs.
 *
 * Planilha: https://docs.google.com/spreadsheets/d/1v3wgX5CtY6WlpbLUG9gISKd2wtzoY9qRVYd72AAxjOc
 * Colunas (linha 1): Data | Conjunto | Criativo | Campaign | Source | Medium | Referral
 *
 * Como publicar sem quebrar o rastreamento que já roda:
 * 1. Extensões → Apps Script → cole esta função no fim do arquivo
 * 2. Implantar → Gerenciar implantações → ícone de lápis → Versão: "Nova versão" → Implantar
 *    (a URL /exec continua a MESMA, o doPost segue no ar durante a troca)
 *
 * Uso:
 *   GET .../exec                      → tudo
 *   GET .../exec?desde=2026-09-01     → só cliques a partir da data
 *
 * Por que existe: sem isso, saber qual conjunto está trazendo gente pro grupo
 * exige abrir a planilha e contar na mão. O ciclo WB07 foi analisado assim e
 * deu trabalho pra cruzar com os dados do Meta.
 */

// Linhas de teste não contam como clique real — foram geradas nos checks
// de saúde da página, não por gente de verdade.
const RASTREIO_IGNORAR = ['check', 'teste', 'test-final', 'claude'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();

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
    const [data, conjunto, criativo] = values[i];

    const assinatura = String(conjunto || '').toLowerCase() + ' ' + String(criativo || '').toLowerCase();
    if (RASTREIO_IGNORAR.some((t) => assinatura.indexOf(t) !== -1)) continue;

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

  const ranking = (obj) => Object.keys(obj)
    .map((nome) => ({ nome, cliques: obj[nome] }))
    .sort((a, b) => b.cliques - a.cliques);

  return _rastreioJson({
    total,
    periodo: {
      de: primeiro ? Utilities.formatDate(primeiro, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm') : null,
      ate: ultimo ? Utilities.formatDate(ultimo, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm') : null,
    },
    conjuntos: ranking(porConjunto),
    criativos: ranking(porCriativo),
  });
}

function _rastreioJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
