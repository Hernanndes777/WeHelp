/**
 * Apps Script para a planilha da "Agenda Comercial" (reuniões de follow-up
 * pós-feira, a partir de segunda-feira). Mesmo papel que o script da
 * agenda-cs/agenda-painel da Fitness Brasil 2026, só que numa planilha nova
 * e dedicada — NÃO reaproveita a planilha da feira.
 *
 * Colunas (criadas sozinhas na primeira chegada, sempre por NOME — reordenar
 * colunas na planilha não quebra nada):
 *   ID | Data | Horário | Nome | Email | Telefone | Empresa | Atendente |
 *   Criado em | Lead Encontrado | Lead ID
 *
 * doPost(e) — duas formas de payload, pelo mesmo endpoint:
 *   1) Criar agendamento (sem "action"):
 *      { date, time, nome, email, telefone, empresa, leadStatus, leadId }
 *      → valida capacidade (1 por horário, no máx. 4 por dia) protegido por
 *        lock (evita overbooking com requisições simultâneas) e grava a linha.
 *   2) Ação administrativa (com "action"), usada pelo /agenda-comercial-painel:
 *      { action: 'delete', id }
 *      { action: 'update', id, date, time }  → também revalida capacidade
 *      { action: 'assign', id, atendente }
 *
 * doGet(e):
 *   ?date=YYYY-MM-DD → { data: [linhas só daquele dia] }  (usado pra contar vagas)
 *   sem parâmetro     → { data: [todas as linhas] }        (usado pelo painel)
 *
 * Como instalar:
 * 1. Abra a planilha "Agenda Comercial Onboarding"
 *    (docs.google.com/spreadsheets/d/1r08z9kXCBSb8KdTgdz0jEb1eTbx3r2GZSAQ6aXErkhY)
 *    — é nela que os leads devem cair, não numa planilha nova.
 * 2. Extensões → Apps Script → apague o Code.gs e cole este arquivo inteiro.
 * 3. Implantar → Nova implantação → tipo "App da Web"
 *    - Executar como: Eu (sua conta)
 *    - Quem pode acessar: Qualquer pessoa
 * 4. Copie a URL "/exec" gerada → vira a env var AGENDA_COMERCIAL_SHEET_URL
 *    no projeto Vercel do wehelp (Settings → Environment Variables → Redeploy).
 */

const CAMPOS = ['ID', 'Data', 'Horário', 'Nome', 'Email', 'Telefone', 'Empresa', 'Atendente', 'Criado em', 'Lead Encontrado', 'Lead ID'];
const MAX_POR_DIA = 4;
const NOME_ABA = 'Agendamentos';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(NOME_ABA);
  if (!sheet) sheet = ss.insertSheet(NOME_ABA);

  const lastCol = sheet.getLastColumn();
  let headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (headers.length === 0 || headers.every((h) => String(h).trim() === '')) {
    sheet.getRange(1, 1, 1, CAMPOS.length).setValues([CAMPOS]);
    headers = CAMPOS.slice();
  }

  // Crítico: sem isto, o Sheets detecta "2026-09-01" e "12:00" como data/hora de
  // verdade e converte a célula sozinho — aí a comparação por string em
  // handleCreate_/handleAdminAction_ nunca bate com o valor enviado pelo POST e a
  // checagem de vaga ocupada nunca dispara (permite overbooking ilimitado, testado
  // e confirmado em 2026-08-27). Forçar texto plano nas colunas Data/Horário
  // garante que o que é gravado é exatamente o que é lido de volta.
  const dataCol = headers.indexOf('Data') + 1;
  const horaCol = headers.indexOf('Horário') + 1;
  const formatRows = 2000; // cobre bem além do volume esperado, sem varrer getMaxRows() a cada chamada
  if (dataCol > 0) sheet.getRange(2, dataCol, formatRows, 1).setNumberFormat('@');
  if (horaCol > 0) sheet.getRange(2, horaCol, formatRows, 1).setNumberFormat('@');

  return { sheet, headers };
}

// Normaliza Data/Horário pra string mesmo se a célula já tiver virado Date antes
// da correção de formato acima (linhas antigas, ou edição manual na planilha).
function normalizeRow_(obj) {
  if (obj['Data'] instanceof Date) {
    obj['Data'] = Utilities.formatDate(obj['Data'], 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  if (obj['Horário'] instanceof Date) {
    obj['Horário'] = Utilities.formatDate(obj['Horário'], 'America/Sao_Paulo', 'HH:mm');
  }
  return obj;
}

function readAllRows_() {
  const { sheet, headers } = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map((row, i) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx]; });
    obj.__rowNum = i + 2; // linha real na planilha, pra editar/apagar depois
    return normalizeRow_(obj);
  });
}

function doGet(e) {
  const date = e && e.parameter && e.parameter.date;
  let rows = readAllRows_();
  if (date) rows = rows.filter((r) => String(r['Data']) === date);
  return ContentService
    .createTextOutput(JSON.stringify({ data: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (body.action) {
      return handleAdminAction_(body);
    }
    return handleCreate_(body);
  } finally {
    lock.releaseLock();
  }
}

function handleCreate_(body) {
  const { date, time, nome, email, telefone, empresa, leadStatus, leadId } = body;
  const rows = readAllRows_();

  const rowsNoDia = rows.filter((r) => String(r['Data']) === date);
  const jaTemNesseHorario = rowsNoDia.some((r) => String(r['Horário']) === time);

  if (jaTemNesseHorario || rowsNoDia.length >= MAX_POR_DIA) {
    return jsonOut_({ success: false, error: 'full' });
  }

  const { sheet, headers } = getSheet_();
  const id = Utilities.getUuid();
  const linha = {
    'ID': id,
    'Data': date,
    'Horário': time,
    'Nome': nome || '',
    'Email': email || '',
    'Telefone': telefone || '',
    'Empresa': empresa || '',
    'Atendente': '',
    'Criado em': new Date().toISOString(),
    'Lead Encontrado': leadStatus || '',
    'Lead ID': leadId || '',
  };
  const row = headers.map((h) => linha[h] !== undefined ? linha[h] : '');
  sheet.appendRow(row);
  SpreadsheetApp.flush(); // garante que a próxima execução concorrente (após o lock soltar) já enxergue esta linha

  return jsonOut_({ success: true, id });
}

function handleAdminAction_(body) {
  const { action, id, date, time, atendente } = body;
  const { sheet, headers } = getSheet_();
  const rows = readAllRows_();
  const alvo = rows.find((r) => String(r['ID']) === String(id));

  if (!alvo) return jsonOut_({ success: false, error: 'not_found' });

  const colId = (nome) => headers.indexOf(nome) + 1;

  if (action === 'delete') {
    sheet.deleteRow(alvo.__rowNum);
    SpreadsheetApp.flush();
    return jsonOut_({ success: true });
  }

  if (action === 'update') {
    const outrasLinhas = rows.filter((r) => r.__rowNum !== alvo.__rowNum && String(r['Data']) === date);
    const ocupado = outrasLinhas.some((r) => String(r['Horário']) === time);
    if (ocupado || outrasLinhas.length >= MAX_POR_DIA) {
      return jsonOut_({ success: false, error: 'full' });
    }
    sheet.getRange(alvo.__rowNum, colId('Data')).setValue(date);
    sheet.getRange(alvo.__rowNum, colId('Horário')).setValue(time);
    SpreadsheetApp.flush();
    return jsonOut_({ success: true });
  }

  if (action === 'assign') {
    sheet.getRange(alvo.__rowNum, colId('Atendente')).setValue(atendente || '');
    SpreadsheetApp.flush();
    return jsonOut_({ success: true });
  }

  return jsonOut_({ success: false, error: 'invalid_action' });
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
