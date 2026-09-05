/**
 * Apps Script (doPost) para a planilha de conversões da LP /diagnostico.
 * Recebe o POST de api/lead-diagnostico.js e escreve uma linha nova.
 *
 * Planilha: https://docs.google.com/spreadsheets/d/1FyJ9gtpXjfnZpQ_fCZnK2lpGk_VKz9SPvUzUiprSUDQ
 *
 * Como instalar:
 * 1. Abra a planilha acima.
 * 2. Extensões → Apps Script
 * 3. Apague o conteúdo do Code.gs e cole este arquivo inteiro
 * 4. Implantar → Nova implantação → tipo "App da Web"
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL "/exec" gerada e me passe — ela vira a env var
 *    SHEETS_DIAGNOSTICO_URL no projeto Vercel do wehelp.
 *
 * Como escreve os dados:
 * Sempre pela primeira aba da planilha (getSheets()[0]) — não depende de nome
 * de aba específico. Se a linha 1 estiver vazia, o script cria o cabeçalho
 * sozinho na primeira vez que um lead chegar, usando as chaves do payload
 * (nessa ordem: ver CAMPOS abaixo). Se já existir cabeçalho (por exemplo,
 * porque você editou a ordem/nomes das colunas manualmente), a escrita passa
 * a ser por NOME da coluna — qualquer chave que bater com o cabeçalho cai na
 * coluna certa, e nenhuma trava se faltar uma chave, só fica em branco.
 * Esse é o mesmo padrão usado em 00-base/apps-script-sessao-estrategica.gs,
 * criado depois de um bug real de escrita por posição fixa de coluna
 * (ver 00-base/padrao-captura-lead.md).
 *
 * Auto-extensão de colunas (2026-09-05): se o payload trouxer uma chave que
 * ainda não existe no cabeçalho (ex: campo novo adicionado no formulário),
 * o script cria a coluna sozinho no fim do cabeçalho, na hora — não precisa
 * mais editar a planilha manualmente toda vez que um campo novo entrar.
 */

// Ordem usada só na primeira escrita (quando a planilha ainda está vazia).
const CAMPOS = [
  'received_at', 'Nome_Completo', 'E_mail_Corporativo', 'WhatsApp',
  'Nome_da_Empresa', 'Segmento', 'Quantidade_de_Clientes',
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

  // Campo novo no payload sem coluna correspondente? Cria a coluna no fim
  // do cabeçalho agora, em vez de descartar o dado silenciosamente.
  const headerSet = {};
  headers.forEach((h) => { headerSet[String(h).trim()] = true; });
  const novasChaves = Object.keys(data).filter((k) => !headerSet[k]);
  if (novasChaves.length > 0) {
    sheet.getRange(1, headers.length + 1, 1, novasChaves.length).setValues([novasChaves]);
    headers = headers.concat(novasChaves);
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
