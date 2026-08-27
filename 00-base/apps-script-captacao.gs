/**
 * Apps Script (doPost) para a planilha "Leads FB Brasil".
 * Recebe o POST de api/lead-captacao.js — cadastro rápido de abordagem
 * no corredor da feira (página /captacao).
 *
 * Como instalar:
 * 1. Abra a planilha "Leads FB Brasil".
 * 2. Extensões → Apps Script
 * 3. Apague o conteúdo do Code.gs e cole este arquivo inteiro
 * 4. Implantar → Nova implantação → tipo "App da Web"
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL "/exec" gerada e me mande — ela vira a env var
 *    SHEETS_CAPTACAO_URL no projeto Vercel do wehelp.
 *
 * Mesmo padrão anti-bug dos outros scripts do 00-base: cria o cabeçalho
 * sozinho na primeira chegada e escreve por NOME de coluna, nunca por
 * posição fixa — reordenar/inserir colunas na planilha não quebra nada.
 */

const ABA_LEADS = 'Leads';

const CAMPOS = [
  'received_at', 'Nome_Completo', 'WhatsApp', 'Email',
  'Area_da_Empresa', 'Area_da_Empresa_Detalhe', 'Faixa_alunos',
  'UTM_Source', 'UTM_Medium', 'UTM_Campaign',
  'IP_do_usuario', 'Dispositivo', 'Referral_Source',
  'Pais_do_usuario', 'Regiao_do_usuario', 'Cidade_do_usuario', 'URL',
];

function doPost(e) {
  const data = JSON.parse(e.postData.contents);

  // Trava a execucao: sem isso, dois leads chegando ao mesmo tempo podem
  // ler o mesmo cabecalho e um appendRow sobrescrever o outro (achado no
  // teste de estresse — 1 em 10 requisicoes simultaneas sumiu sem erro).
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ABA_LEADS);
    if (!sheet) sheet = ss.insertSheet(ABA_LEADS);

    const lastCol = sheet.getLastColumn();
    let headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

    if (headers.length === 0 || headers.every((h) => String(h).trim() === '')) {
      sheet.getRange(1, 1, 1, CAMPOS.length).setValues([CAMPOS]);
      headers = CAMPOS.slice();
    }

    const row = headers.map((h) => {
      const key = String(h).trim();
      return data[key] !== undefined && data[key] !== null ? data[key] : '';
    });

    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
