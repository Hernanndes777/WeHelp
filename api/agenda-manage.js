// api/agenda-manage.js — Ações administrativas do /agenda-painel: apagar,
// mudar data/horário ou atribuir atendente a um agendamento existente.
// Só mexe na planilha — não toca no DataCrazy (a tag já foi marcada na hora do agendamento).
//
// POST { action: 'delete', id }
// POST { action: 'update', id, date, time }
// POST { action: 'assign', id, atendente }  — atendente: '' | 'Eric' | 'Pietro'
//
// Variável de ambiente (Vercel): AGENDA_SHEET_URL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const AGENDA_SHEET_URL = process.env.AGENDA_SHEET_URL;
  if (!AGENDA_SHEET_URL) {
    return res.status(500).json({ error: 'AGENDA_SHEET_URL não configurada' });
  }

  const { action, id, date, time, atendente } = req.body || {};

  if (!action || !id) {
    return res.status(400).json({ error: 'action e id obrigatórios' });
  }
  if (!['delete', 'update', 'assign'].includes(action)) {
    return res.status(400).json({ error: 'action inválida' });
  }
  if (action === 'update' && (!date || !time)) {
    return res.status(400).json({ error: 'date e time obrigatórios para update' });
  }

  try {
    const sheetRes = await fetch(AGENDA_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, date, time, atendente }),
    });
    const data = await sheetRes.json();

    if (!data.success) {
      if (data.error === 'full') return res.status(409).json({ error: 'Horário lotado' });
      if (data.error === 'not_found') return res.status(404).json({ error: 'Agendamento não encontrado' });
      throw new Error(data.error || 'Falha ao atualizar planilha');
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Erro agenda-manage:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
