/**
 * Apps Script (doPost) para a planilha de conversões da LP /academias.
 * Recebe o POST de api/lead-academias.js e escreve uma linha nova.
 *
 * Planilha: https://docs.google.com/spreadsheets/d/12TbKg5pFfWAwXeySvHZ7ulMcVDhn-YrfHUl7IZWfHTY
 *
 * Como instalar:
 * 1. Abra a planilha acima.
 * 2. Extensões → Apps Script
 * 3. Apague o conteúdo do Code.gs e cole este arquivo inteiro
 * 4. Implantar → Nova implantação → tipo "App da Web"
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL "/exec" gerada e me passe — ela vira a env var
 *    SHEETS_ACADEMIAS_URL no projeto Vercel do wehelp.
 *
 * Como escreve os dados: mesmo padrão anti-bug do
 * 00-base/apps-script-diagnostico.gs — sempre pela primeira aba
 * (getSheets()[0]), escreve o cabeçalho sozinho na primeira chegada se a
 * planilha estiver vazia, senão escreve por NOME da coluna (nunca por
 * posição fixa).
 */

const CAMPOS = [
  'received_at', 'Nome_Completo', 'E_mail_Corporativo', 'WhatsApp',
  'Nome_da_Academia', 'Quantidade_de_Alunos_Ativos',
  'UTM_Source', 'UTM_Medium', 'UTM_Campaign', 'UTM_Content', 'UTM_Term', 'UTM_Id',
  'fbclid', 'gclid', 'IP_do_usuario', 'Dispositivo', 'Referral_Source',
  'Pais_do_usuario', 'Regiao_do_usuario', 'Cidade_do_usuario', 'URL',
];

function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const data = JSON.parse(e.postData.contents);

  const lastCol = sheet.getLastColumn();
  let headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  if (headers.length === 0 || headers.every((h) => String(h).trim() === '')) {
    sheet.getRange(1, 1, 1, CAMPOS.length).setValues([CAMPOS]);
    headers = CAMPOS;
  }

  const row = headers.map((header) => {
    const key = String(header).trim();
    return key && Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '';
  });

  sheet.appendRow(row);

  return ContentService
    .createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
