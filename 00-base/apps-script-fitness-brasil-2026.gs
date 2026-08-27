/**
 * Apps Script (doPost) para a planilha "Leads Feira Fitness Brasil 2026".
 * Recebe o POST de api/lead-fitness-brasil-2026.js e escreve o lead na aba
 * certa conforme a origem:
 *
 *   - UTM_Medium = "tablet"  →  aba "Calculadora"  (kiosk /estande)
 *   - qualquer outra origem  →  aba "Site"         (LP /fitness-brasil-2026, QR do folder)
 *
 * Como instalar:
 * 1. Abra a planilha "Leads Feira Fitness Brasil 2026" (a que tem as abas
 *    "Site" e "Calculadora").
 * 2. Extensões → Apps Script
 * 3. Apague o conteúdo do Code.gs e cole este arquivo inteiro
 * 4. Implantar → Nova implantação → tipo "App da Web"
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 5. Copie a URL "/exec" gerada — ela vira a env var
 *    SHEETS_FITNESS_BRASIL_2026_URL no projeto Vercel do wehelp
 *    (Settings → Environment Variables → adicionar → Redeploy).
 *
 * Mesmo padrão anti-bug dos outros scripts do 00-base: cria o cabeçalho
 * sozinho na primeira chegada e escreve por NOME de coluna, nunca por
 * posição fixa — reordenar/inserir colunas na planilha não quebra nada.
 */

const ABA_CALCULADORA = 'Calculadora';
const ABA_SITE = 'Site';

const CAMPOS = [
  'received_at', 'Nome_Completo', 'WhatsApp', 'Nome_da_Academia',
  'Faixa_alunos',
  'Alunos_ativos', 'Mensalidade_media', 'Permanencia_media_meses',
  'Cancelamentos_mes', 'Perda_anual_calculada',
  'UTM_Source', 'UTM_Medium', 'UTM_Campaign', 'UTM_Content', 'UTM_Term', 'UTM_Id',
  'fbclid', 'gclid', 'IP_do_usuario', 'Dispositivo', 'Referral_Source',
  'Pais_do_usuario', 'Regiao_do_usuario', 'Cidade_do_usuario', 'URL',
];

function doPost(e) {
  const data = JSON.parse(e.postData.contents);

  // roteia pela origem: tablet do estande vs LP/QR
  const abaNome = String(data.UTM_Medium || '').toLowerCase() === 'tablet'
    ? ABA_CALCULADORA
    : ABA_SITE;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(abaNome);
  if (!sheet) sheet = ss.insertSheet(abaNome); // se a aba sumir, recria em vez de perder lead

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

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, aba: abaNome }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * doGet — alimenta o painel /painel-feira com CONTAGENS apenas (sem dados
 * pessoais): total e leads de hoje por aba + horario do ultimo lead.
 * Depois de colar esta versao, publicar NOVA VERSAO na MESMA implantacao
 * (Implantar > Gerenciar implantacoes > editar > Versao: Nova versao) —
 * assim a URL /exec nao muda.
 */
function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = { geradoEm: new Date().toISOString(), abas: {} };
  [ABA_CALCULADORA, ABA_SITE].forEach(function (nome) {
    const sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) {
      out.abas[nome] = { total: 0, hoje: 0, ultimo: null };
      return;
    }
    const total = sh.getLastRow() - 1;
    const vals = sh.getRange(2, 1, total, 1).getValues();
    const hojeStr = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    let hoje = 0;
    let ultimo = null;
    vals.forEach(function (v) {
      const raw = v[0];
      const d = raw instanceof Date ? raw : new Date(String(raw));
      if (isNaN(d.getTime())) return;
      if (Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd') === hojeStr) hoje++;
      if (!ultimo || d > ultimo) ultimo = d;
    });
    out.abas[nome] = { total: total, hoje: hoje, ultimo: ultimo ? ultimo.toISOString() : null };
  });
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
