// api/agenda-comercial-lead.js — Serverless function para a página /agenda-comercial
// (reuniões comerciais de follow-up pós-feira, a partir de segunda-feira)
//
// GET  → calcula a janela de dias "abertos" pra agendar (rolling window que vai
//        abrindo mais dias conforme a capacidade dos dias já abertos vai enchendo)
//        e devolve, junto, quantos agendamentos já existem por dia/horário.
// POST { date, time, nome, email, telefone, empresa } → confirma o agendamento:
//   1. Busca o lead no DataCrazy por telefone (best-effort, só para referência do CS —
//      não cria lead novo e não marca nenhuma tag)
//   2. Grava na planilha (fonte de verdade — capacidade de 1/horário e 4/dia é
//      validada com lock dentro do próprio Apps Script)
//
// Regras de negócio (fixas, pedidas pelo time comercial):
//   - Segunda a sexta, começando na primeira segunda-feira após a feira
//   - Seg, Ter e Sex: reuniões só a partir das 12h
//   - Qua e Qui: reuniões a partir das 11h
//   - Sempre até as 15h (reunião de 1h, termina 16h)
//   - Máximo 4 reuniões por dia, 1 por horário
//
// Variáveis de ambiente (Vercel):
//   DC_TOKEN                     — chave de API do DataCrazy (mesma do /agenda-cs)
//   AGENDA_COMERCIAL_SHEET_URL   — URL /exec do Apps Script (planilha "Agenda Comercial Onboarding")

const DC_BASE = "https://api.datacrazy.io/v1/crm/api/crm";

const BASE_START = '2026-08-31'; // primeira segunda-feira após a Fitness Brasil 2026
const DAILY_CAP = 4;
const BUFFER_SLOTS = 4; // capacidade restante mínima antes de abrir mais um dia
const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DC_TOKEN = process.env.DC_TOKEN;
  const SHEET_URL = process.env.AGENDA_COMERCIAL_SHEET_URL;

  if (!SHEET_URL) {
    return res.status(500).json({ error: 'AGENDA_COMERCIAL_SHEET_URL não configurada' });
  }

  if (req.method === 'GET') {
    try {
      const rows = await fetchAllRows(SHEET_URL);
      const { bookedCountByDate, countsByDateTime } = summarize(rows);
      const openDates = computeOpenDates(bookedCountByDate).map((date) => {
        const slots = slotsForDate(date);
        return {
          date,
          label: WEEKDAY_LABELS[parseYmd(date).getUTCDay()],
          slots,
          cap: Math.min(DAILY_CAP, slots.length),
          booked: bookedCountByDate[date] || 0,
        };
      });
      return res.status(200).json({ openDates, counts: countsByDateTime });
    } catch (err) {
      return res.status(502).json({ error: 'Falha ao ler agenda', message: err.message });
    }
  }

  if (req.method === 'POST') {
    const { date, time, nome, email, telefone, empresa } = req.body || {};

    if (!date || !time || !nome || !email || !telefone || !empresa) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    const parsedDate = parseYmd(date);
    if (isNaN(parsedDate.getTime()) || !isBusinessDay(parsedDate) || date < todayStr()) {
      return res.status(400).json({ error: 'Data inválida' });
    }
    if (!slotsForDate(date).includes(time)) {
      return res.status(400).json({ error: 'Horário inválido para esse dia' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    try {
      // Busca lead existente no DataCrazy (só referência para o CS — não cria lead
      // novo, não marca tag). A checagem de capacidade real acontece no Apps Script,
      // protegida por lock, contra corrida entre requisições simultâneas.
      const phoneDigits = telefone.replace(/\D/g, '');
      const matchedLead = DC_TOKEN ? await findLeadByPhone(phoneDigits, DC_TOKEN) : null;
      const leadStatus = matchedLead ? 'encontrado' : 'não encontrado';
      const leadId = matchedLead ? matchedLead.id : '';

      const sheetRes = await fetch(SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, nome, email, telefone, empresa, leadStatus, leadId }),
      });
      const sheetData = await sheetRes.json();

      if (!sheetData.success) {
        if (sheetData.error === 'full') {
          return res.status(409).json({ error: 'Horário lotado' });
        }
        throw new Error(sheetData.error || 'Falha ao gravar na planilha');
      }

      return res.status(200).json({ success: true, leadStatus });
    } catch (err) {
      console.error('Erro agenda-comercial-lead:', err);
      return res.status(500).json({ error: 'Erro interno', message: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ---------- janela dinâmica de dias ----------

function slotsForDate(dateStr) {
  const dow = parseYmd(dateStr).getUTCDay();
  const startHour = [1, 2, 5].includes(dow) ? 12 : 11; // Seg, Ter, Sex só a partir das 12h
  const slots = [];
  for (let h = startHour; h <= 15; h++) slots.push(`${String(h).padStart(2, '0')}:00`);
  return slots;
}

function isBusinessDay(date) {
  const dow = date.getUTCDay();
  return dow >= 1 && dow <= 5;
}

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function todayStr() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

function nextBusinessDays(fromStr, n) {
  const out = [];
  let cursor = parseYmd(fromStr);
  while (out.length < n) {
    if (isBusinessDay(cursor)) out.push(ymd(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

function nextBusinessDayAfter(dateStr) {
  let cursor = addDays(parseYmd(dateStr), 1);
  while (!isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return ymd(cursor);
}

// Começa com a próxima semana útil (ou a partir de hoje, se já passou de BASE_START)
// e vai abrindo mais um dia útil por vez sempre que a capacidade restante nos dias
// já abertos cair abaixo de BUFFER_SLOTS — nunca fecha um dia que já abriu.
function computeOpenDates(bookedCountByDate) {
  const today = todayStr();
  const start = BASE_START > today ? BASE_START : nextBusinessDays(today, 1)[0];
  const dates = nextBusinessDays(start, 5);

  const remainingCapacity = () => dates.reduce((sum, d) => {
    const cap = Math.min(DAILY_CAP, slotsForDate(d).length);
    const booked = bookedCountByDate[d] || 0;
    return sum + Math.max(0, cap - booked);
  }, 0);

  let guard = 0;
  while (remainingCapacity() < BUFFER_SLOTS && guard < 40) {
    dates.push(nextBusinessDayAfter(dates[dates.length - 1]));
    guard++;
  }

  return dates;
}

// O Apps Script devolve as colunas "Data"/"Horário" como objetos Date do Sheets
// serializados em JSON (ex: "2026-09-01T03:00:00.000Z" em vez de "2026-09-01",
// e "1899-12-30T18:06:xx.000Z" pra uma célula só-hora tipo "15:00" — 1899-12-30
// é a data-âncora que o Sheets usa internamente pra valores de hora pura, e o
// :06 de drift vem de arredondamento de ponto flutuante do serial number).
// Sem normalizar isso, as chaves nunca batem com as datas "YYYY-MM-DD" limpas
// que o resto do código usa — contador de vagas sempre fica 0.
function normalizeDateStr(v) {
  if (typeof v !== 'string' || !v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(d);
}

function normalizeTimeStr(v) {
  if (typeof v !== 'string' || !v) return '';
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = fmt.formatToParts(d);
  let hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  if (minute >= 30) hour = (hour + 1) % 24; // arredonda pro slot cheio mais próximo
  return `${String(hour).padStart(2, '0')}:00`;
}

function summarize(rows) {
  const bookedCountByDate = {};
  const countsByDateTime = {};
  for (const r of rows) {
    const d = normalizeDateStr(r['Data']);
    const t = normalizeTimeStr(r['Horário']);
    if (!d || !t) continue;
    bookedCountByDate[d] = (bookedCountByDate[d] || 0) + 1;
    countsByDateTime[d] = countsByDateTime[d] || {};
    countsByDateTime[d][t] = (countsByDateTime[d][t] || 0) + 1;
  }
  return { bookedCountByDate, countsByDateTime };
}

async function fetchAllRows(sheetUrl) {
  const res = await fetch(sheetUrl);
  const data = await res.json();
  return data.data || [];
}

// ---------- DataCrazy (best-effort, só leitura) ----------

async function findLeadByPhone(phoneDigits, token) {
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const res = await fetch(`${DC_BASE}/leads?search=${encodeURIComponent(phoneDigits)}&limit=10`, { headers });
    const data = await res.json();

    const last8 = phoneDigits.slice(-8);
    const match = (data.data || []).find((lead) => {
      const leadPhone = (lead.phone || lead.rawPhone || '').replace(/\D/g, '');
      return leadPhone.slice(-8) === last8;
    });

    return match || null;
  } catch (err) {
    console.error('Falha ao buscar lead (não bloqueia o agendamento):', err);
    return null;
  }
}
