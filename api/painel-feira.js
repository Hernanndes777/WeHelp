// api/painel-feira.js — proxy do painel /painel-feira.
// Chama o doGet do Apps Script da planilha da feira (mesma env do doPost:
// SHEETS_FITNESS_BRASIL_2026_URL) e devolve SO as contagens por aba.
// O painel nunca fala com a planilha direto — nenhum dado pessoal passa aqui.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const SHEETS_URL = process.env.SHEETS_FITNESS_BRASIL_2026_URL;
  if (!SHEETS_URL) return res.status(500).json({ error: 'SHEETS_FITNESS_BRASIL_2026_URL ausente' });

  try {
    const r = await fetch(SHEETS_URL); // GET -> doGet (segue o redirect do Apps Script)
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch (e) {
      // HTML de erro do Apps Script = doGet ainda nao publicado nessa versao
      return res.status(502).json({ error: 'Apps Script sem doGet publicado — publique a nova versao do script' });
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Falha ao consultar a planilha' });
  }
}
