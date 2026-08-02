/**
 * Apps Script (doPost) para a planilha "[WBN] Aplicação" — aba "Agendamentos WB 05".
 * Recebe o POST de api/lead-sessao-estrategica.js e escreve uma linha nova.
 *
 * Como instalar:
 * 1. Abra a planilha: https://docs.google.com/spreadsheets/d/1YflrC2bt5sRTDxLeL_ksw4n6BioOAFOtiv_RBZYqgkY
 * 2. Extensões → Apps Script
 * 3. Apague o conteúdo do Code.gs e cole este arquivo inteiro
 * 4. Implantar → Nova implantação → tipo "App da Web"
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL "/exec" gerada e me passe — ela vira a env var
 *    SHEETS_SESSAO_ESTRATEGICA_URL no projeto Vercel do wehelp.
 *
 * Por que ler o cabeçalho em vez de posição fixa de coluna:
 * o bug do Sheets do webinário (ver 00-base/padrao-captura-lead.md) foi causado
 * por um script que escrevia por posição enquanto o payload mudava de nome de
 * chave. Aqui a escrita é sempre pelo NOME da coluna (linha 1), então qualquer
 * chave que bater com o cabeçalho cai na coluna certa, e nenhuma trava se
 * faltar uma chave — só fica em branco.
 */

const SHEET_NAME = 'Agendamentos WB 05';

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: 'Aba "' + SHEET_NAME + '" não encontrada' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = JSON.parse(e.postData.contents);

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  const row = headers.map((header) => {
    const key = String(header).trim();
    return key && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '';
  });

  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
