// api/agenda-comercial-painel.js — Serverless function que alimenta o /agenda-comercial-painel
// Lê todos os agendamentos da planilha (via Apps Script) e devolve ordenados
// por dia e horário. Somente leitura — nenhuma escrita acontece aqui.
//
// Variável de ambiente (Vercel): AGENDA_COMERCIAL_SHEET_URL

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
      date: r['Data'] || '',
      time: r['Horário'] || '',
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
