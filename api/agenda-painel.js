// api/agenda-painel.js — Serverless function que alimenta o /agenda-painel
// Lê todos os agendamentos da planilha (via Apps Script) e devolve ordenados
// por dia e horário. Somente leitura — nenhuma escrita acontece aqui.
//
// Variável de ambiente (Vercel): AGENDA_SHEET_URL (mesma usada por api/agenda-lead.js)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const AGENDA_SHEET_URL = process.env.AGENDA_SHEET_URL;
  if (!AGENDA_SHEET_URL) {
    return res.status(500).json({ error: 'AGENDA_SHEET_URL não configurada' });
  }

  try {
    const sheetRes = await fetch(AGENDA_SHEET_URL);
    const sheetData = await sheetRes.json();
    const rows = (sheetData.data || []).map((r) => ({
      id: r['ID'] || '',
      date: r['Data'] || '',
      time: r['Horário'] || '',
      nome: r['Nome'] || '',
      whatsapp: r['WhatsApp'] ? String(r['WhatsApp']) : '',
      academia: r['Academia'] || '',
      interesse: r['Interesse'] || '',
      detalhes: r['Detalhes'] || '',
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
