// api/painel-wb.js — proxy do /painel-wb.
// GET  → resumo por variante (visitantes, cliques, entradas no grupo)
// POST → salva os pesos do sorteio na planilha
//
// O painel nunca fala com a planilha direto: a URL do Apps Script fica só aqui,
// no servidor. Mesmo padrão do api/painel-feira.js.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SHEETS_URL = process.env.SHEETS_SPLIT_WB_URL;
  if (!SHEETS_URL) return res.status(500).json({ error: 'SHEETS_SPLIT_WB_URL ausente' });

  if (req.method === 'GET') {
    const desde = typeof req.query.desde === 'string' ? req.query.desde : '';
    const url = desde ? `${SHEETS_URL}?desde=${encodeURIComponent(desde)}` : SHEETS_URL;
    try {
      const r = await fetch(url);
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); }
      catch {
        return res.status(502).json({ error: 'Apps Script sem doGet publicado — publique a nova versão do script' });
      }
      res.setHeader('Cache-Control', 's-maxage=25, stale-while-revalidate=300, stale-if-error=600');
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({ error: 'Falha ao consultar a planilha' });
    }
  }

  if (req.method === 'POST') {
    const b = req.body || {};

    // Dois tipos de escrita: os pesos do sorteio e as entradas nos grupos.
    let payload = null;
    if (Array.isArray(b.pesos) && b.pesos.length) {
      payload = { acao: 'pesos', pesos: b.pesos };
    } else if (b.grupos && b.grupos.data) {
      payload = {
        acao: 'grupos',
        data: String(b.grupos.data),
        A: Number(b.grupos.A) || 0,
        B: Number(b.grupos.B) || 0,
      };
    }
    if (!payload) {
      return res.status(400).json({ error: 'envie pesos[] ou grupos{data,A,B}' });
    }

    try {
      const r = await fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); }
      catch { return res.status(502).json({ error: 'Resposta inválida do Apps Script' }); }
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({ error: 'Falha ao salvar os pesos' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
