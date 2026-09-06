// api/wb-event.js — recebe os eventos das páginas do teste A/B e repassa pro
// Apps Script da planilha "Split WB".
//
// As páginas mandam via navigator.sendBeacon pra este endpoint em vez de falar
// direto com o Apps Script: assim a URL do script fica só no servidor (env), o
// beacon é same-origin (nada de CORS) e trocar a planilha não exige mexer em
// nenhuma LP.
//
// Responde 204 na hora e só depois repassa — o beacon dispara no momento em que
// o navegador está saindo da página pro WhatsApp, então nada aqui pode demorar.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SHEETS_URL = process.env.SHEETS_SPLIT_WB_URL;
  if (!SHEETS_URL) return res.status(204).end();

  // sendBeacon manda text/plain, então o body pode chegar como string.
  let d = req.body;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch { d = null; }
  }
  if (!d || !d.variante) return res.status(204).end();

  try {
    await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        variante:     String(d.variante).slice(0, 40),
        evento:       d.evento === 'clique' ? 'clique' : 'pageview',
        utm_campaign: String(d.utm_campaign || '').slice(0, 120),
        utm_adset:    String(d.utm_adset || '').slice(0, 120),
        utm_content:  String(d.utm_content || '').slice(0, 120),
        utm_source:   String(d.utm_source || '').slice(0, 80),
        utm_medium:   String(d.utm_medium || '').slice(0, 80),
        referral:     String(d.referral || '').slice(0, 200),
      }),
    });
  } catch {
    // Evento de tracking perdido não pode virar erro pro visitante.
  }

  return res.status(204).end();
}
