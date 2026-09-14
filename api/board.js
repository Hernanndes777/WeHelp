// api/board.js — leitura do snapshot do board /performance.
//
// A página nunca fala com a planilha direto: a URL do Apps Script fica só aqui,
// no servidor. Mesmo padrão do api/painel-wb.js e api/painel-feira.js.
// Quem GRAVA o snapshot é o api/coletor-board.js (Vercel Cron); aqui só lê.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const BOARD_SHEET_URL = process.env.BOARD_SHEET_URL;
  if (!BOARD_SHEET_URL) return res.status(500).json({ error: 'BOARD_SHEET_URL não configurada' });

  try {
    const r = await fetch(BOARD_SHEET_URL);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch {
      return res.status(502).json({ error: 'Apps Script sem doGet publicado — publique a nova versão do script' });
    }
    // Snapshot muda no máximo a cada ciclo do coletor; cache curto na borda.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600, stale-if-error=1800');
    return res.status(200).json(data);
  } catch {
    return res.status(502).json({ error: 'Falha ao consultar o snapshot' });
  }
}
