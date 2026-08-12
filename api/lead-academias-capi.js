// api/lead-academias-capi.js — Evento Lead do Meta CAPI pra LP /academias.
// Separado do api/lead-academias.js de propósito: a conversão do Meta Ads
// (igual a do GA4) só deve contar quem chega na página de obrigado, não quem
// só clicou em enviar o formulário. Por isso esse endpoint é chamado pelo
// script de academias/obrigado/index.html no carregamento da página, não pelo
// submit do form (decisão do usuário, 2026-08-12).

import { createHash } from 'crypto';
const sha256 = (v) => createHash('sha256').update(String(v).toLowerCase().trim()).digest('hex');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!CAPI_ENDPOINT || !META_ACCESS_TOKEN) {
    return res.status(200).json({ skipped: true });
  }

  try {
    const { email, phone, event_id, url: pageUrl, fbc, fbp, test_event_code } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'phone obrigatório' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                     || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const phoneDigits = String(phone).replace(/\D/g, '');
    const contactEmail = email || `wp.${phoneDigits}@noemail.invalid`;
    const referer = req.headers['referer'] || pageUrl || '';
    const capiEventId = event_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const capiPayload = {
      data: [{
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: capiEventId,
        event_source_url: referer,
        action_source: 'website',
        user_data: {
          em: [sha256(contactEmail)],
          ph: [sha256(phoneDigits)],
          client_ip_address: clientIp,
          client_user_agent: userAgent,
          ...(fbc ? { fbc } : {}),
          ...(fbp ? { fbp } : {}),
        },
      }],
      access_token: META_ACCESS_TOKEN,
    };

    if (test_event_code) capiPayload.test_event_code = test_event_code;

    await fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(capiPayload),
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Erro CAPI academias:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
