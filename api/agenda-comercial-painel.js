// api/agenda-comercial-painel.js — Serverless function que alimenta o /agenda-comercial-painel
// Lê todos os agendamentos da planilha (via Apps Script) e devolve ordenados
// por dia e horário. Somente leitura — nenhuma escrita acontece aqui.
//
// Variável de ambiente (Vercel): AGENDA_COMERCIAL_SHEET_URL

// Mesma normalização de api/agenda-comercial-lead.js — o Apps Script devolve
// "Data"/"Horário" como objetos Date do Sheets serializados em JSON, não texto
// puro (ex: "2026-09-01T03:00:00.000Z" e "1899-12-30T18:06:xx.000Z" pra uma
// célula só-hora). Sem isso o painel cria uma aba "undefined" pra cada linha.
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
  if (minute >= 30) hour = (hour + 1) % 24;
  return `${String(hour).padStart(2, '0')}:00`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SHEET_URL = process.env.AGENDA_COMERCIAL_SHEET_URL;
  if (!SHEET_URL) {
    return res.status(500).json({ error: 'AGENDA_COMERCIAL_SHEET_URL não configurada' });
  }

  try {
    const sheetRes = await fetch(SHEET_URL);
    const sheetData = await sheetRes.json();
    const rows = (sheetData.data || []).map((r) => ({
      id: r['ID'] || '',
      date: normalizeDateStr(r['Data']),
      time: normalizeTimeStr(r['Horário']),
      nome: r['Nome'] || '',
      email: r['Email'] || '',
      telefone: r['Telefone'] ? String(r['Telefone']) : '',
      empresa: r['Empresa'] || '',
      leadStatus: r['Lead Encontrado'] || '',
      leadId: r['Lead ID'] || '',
      atendente: r['Atendente'] || '',
    }));

    rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    return res.status(200).json({ rows });
  } catch (err) {
    return res.status(502).json({ error: 'Falha ao ler agenda', message: err.message });
  }
}
