/**
 * Apps Script (doPost) para a planilha "[VSL] Aplicação" — funil de VSL
 * (/vsl e /vsl-academia). Recebe o POST de api/lead-vsl.js e escreve uma linha.
 *
 * AUTO-INICIALIZÁVEL: no primeiro POST ele cria a aba (SHEET_NAME) e escreve o
 * cabeçalho sozinho. Não precisa digitar coluna nenhuma na mão.
 *
 * Como instalar:
 * 1. Abra a planilha alvo no Google Sheets.
 * 2. Extensões → Apps Script → apague o Code.gs e cole este arquivo inteiro.
 * 3. Implantar → Nova implantação → tipo "App da Web"
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 4. Autorize (Revisar permissões → sua conta → Avançado → Acessar projeto).
 * 5. Copie a URL "/exec" gerada — ela vira SHEETS_URL no api/lead-vsl.js.
 *
 * (Opcional) rode a função `setup` uma vez no editor pra já criar a aba com o
 * cabeçalho antes mesmo do primeiro lead.
 *
 * Escreve sempre pelo NOME da coluna, mesmo motivo do
 * apps-script-sessao-estrategica.gs: chave que bate com o cabeçalho cai na
 * coluna certa, e nada trava se faltar uma chave — só fica em branco.
 */

const SHEET_NAME = 'Aplicações VSL';

const HEADERS = [
  'received_at', 'Seu_Nome_Completo', 'E_mail_Profissional', 'WhatsApp',
  'Empresa', 'Segmento', 'Sistema_de_gestao',
  'Quantos_clientes_ativos_voce_tem_atualmente', 'Qual_e_o_seu_maior_desafio_hoje',
  'Id_da_pagina', 'UTM_Source', 'UTM_Medium', 'UTM_Campaign', 'UTM_Content',
  'UTM_Term', 'UTM_Id', 'fbclid', 'gclid', 'Referral_Source', 'URL',
  'IP_do_usuario', 'Dispositivo', 'Pais_do_usuario', 'Regiao_do_usuario',
  'Cidade_do_usuario', 'Data_da_conversao', 'Id_do_formulario',
  'Politicas_de_privacidade',
];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function setup() { getSheet_(); }

function doPost(e) {
  const sheet = getSheet_();
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
