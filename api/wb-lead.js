// api/wb-lead.js — recebe o formulário da variante C e grava na aba "Leads"
// da planilha Split WB.
//
// Diferente do /api/wb-event, aqui a resposta importa: a página só libera o
// link do grupo depois de confirmar que o lead foi salvo. Se falhasse em
// silêncio, a pessoa entraria no grupo e o contato se perderia — que é
// justamente o problema que esta variante existe pra resolver.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SHEETS_URL = process.env.SHEETS_SPLIT_WB_URL;
  if (!SHEETS_URL) return res.status(500).json({ error: 'SHEETS_SPLIT_WB_URL ausente' });

  let d = req.body;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { d = null; }
  }
  if (!d || !d.nome || !d.whatsapp) {
    return res.status(400).json({ error: 'nome e whatsapp obrigatórios' });
  }

  const corta = (v, n) => String(v || '').trim().slice(0, n);

  try {
    // Timeout curto: a pessoa está esperando o link do grupo aparecer. Melhor
    // devolver erro rápido e deixar ela tentar de novo do que travar a tela.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);

    const r = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        acao: 'lead',
        variante:     corta(d.variante || 'C', 10),
        nome:         corta(d.nome, 120),
        email:        corta(d.email, 160),
        whatsapp:     corta(d.whatsapp, 30),
        alunos:       corta(d.alunos, 60),
        utm_campaign: corta(d.utm_campaign, 120),
        utm_adset:    corta(d.utm_adset, 120),
        utm_content:  corta(d.utm_content, 120),
        utm_source:   corta(d.utm_source, 80),
        utm_medium:   corta(d.utm_medium, 80),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    const texto = await r.text();
    let data;
    try { data = JSON.parse(texto); }
    catch { return res.status(502).json({ error: 'Resposta inválida da planilha' }); }

    if (data.status !== 'ok') {
      return res.status(502).json({ error: data.message || 'Falha ao gravar' });
    }
    return res.status(200).json({ success: true });
  } catch {
    return res.status(502).json({ error: 'Falha ao gravar o lead' });
  }
}
