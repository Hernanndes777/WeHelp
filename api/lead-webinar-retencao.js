// api/lead-webinar-retencao.js
// Captura de lead do webinário "Por que seus clientes cancelam (e como reter)".
// Copiado do padrão de api/lead.js. Ver 00-base/padrao-captura-lead.md.
//
// Funciona já no primeiro deploy: cria o contato no ActiveCampaign e dispara o
// Meta CAPI (usa as mesmas env vars AC_URL, AC_KEY, CAPI_ENDPOINT, META_ACCESS_TOKEN).
// Os passos marcados com TODO ficam desligados enquanto os IDs/URL estiverem nulos,
// então nada quebra: preencha quando criar os recursos do novo webinário.

import { createHash } from 'crypto';
const sha256 = (v) => createHash('sha256').update(String(v).toLowerCase().trim()).digest('hex');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const AC_URL = process.env.AC_URL;
  const AC_KEY = process.env.AC_KEY;

  // ─────────── Config do webinário (TODO: preencher antes de escalar tráfego) ───────────
  const LIST_ID   = null;   // TODO: criar lista "Webinário Retenção" no AC e pôr o ID (ex.: 21)
  const TAG_ID    = null;   // TODO: criar tag do webinário no AC e pôr o ID
  const SHEETS_URL = '';    // TODO: URL do Apps Script (doPost) da planilha deste webinário

  // Campos personalizados do AC (só enviam se o ID existir).
  const FIELD_SEGMENTO   = null;  // TODO: criar campo "Segmento" no AC e pôr o ID
  const FIELD_BASE       = null;  // TODO: criar campo "Tamanho da base" no AC e pôr o ID
  const FIELD_UTM_SOURCE   = 28;  // reutiliza os campos UTM já existentes na conta AC
  const FIELD_UTM_CAMPAIGN = 29;
  const FIELD_UTM_MEDIUM   = 30;

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!AC_URL || !AC_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
  }

  try {
    const {
      nome, email, whatsapp, segmento, base,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id,
      fbclid, gclid, referral_source, url,
      event_id, fbc, fbp, test_event_code,
    } = req.body;

    if (!whatsapp) return res.status(400).json({ error: 'WhatsApp obrigatório' });

    // Dados de contexto capturados no servidor
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                     || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /Mobile|Android|iPhone|iPad/i.test(userAgent) ? 'Mobile' : 'Desktop';
    const geoCountry = req.headers['x-vercel-ip-country'] || '';
    const geoRegion = req.headers['x-vercel-ip-country-region'] || '';
    const geoCity = req.headers['x-vercel-ip-city'] ? decodeURIComponent(req.headers['x-vercel-ip-city']) : '';
    const receivedAt = new Date().toISOString();

    const headers = { 'Api-Token': AC_KEY, 'Content-Type': 'application/json' };

    // Campos personalizados
    const fieldValues = [];
    if (FIELD_SEGMENTO && segmento) fieldValues.push({ field: String(FIELD_SEGMENTO), value: segmento });
    if (FIELD_BASE && base)         fieldValues.push({ field: String(FIELD_BASE), value: base });
    if (utm_source)   fieldValues.push({ field: String(FIELD_UTM_SOURCE), value: utm_source });
    if (utm_medium)   fieldValues.push({ field: String(FIELD_UTM_MEDIUM), value: utm_medium });
    if (utm_campaign) fieldValues.push({ field: String(FIELD_UTM_CAMPAIGN), value: utm_campaign });

    const phoneDigits = whatsapp.replace(/\D/g, '');
    const contactEmail = email || `wp.${phoneDigits}@noemail.invalid`;

    // 1. Cria ou atualiza o contato
    const syncRes = await fetch(`${AC_URL}/api/3/contact/sync`, {
      method: 'POST', headers,
      body: JSON.stringify({
        contact: { email: contactEmail, firstName: nome || '', phone: whatsapp, fieldValues },
      }),
    });
    const syncData = await syncRes.json();
    if (!syncRes.ok || !syncData.contact) {
      console.error('Erro sync:', syncData);
      return res.status(502).json({ error: 'Falha ao criar contato', details: syncData });
    }
    const contactId = syncData.contact.id;

    // 2. Lista (só se configurada)
    if (LIST_ID) {
      await fetch(`${AC_URL}/api/3/contactLists`, {
        method: 'POST', headers,
        body: JSON.stringify({ contactList: { list: LIST_ID, contact: contactId, status: 1 } }),
      }).catch(() => {});
    }

    // 3. Tag (só se configurada)
    if (TAG_ID) {
      await fetch(`${AC_URL}/api/3/contactTags`, {
        method: 'POST', headers,
        body: JSON.stringify({ contactTag: { contact: contactId, tag: TAG_ID } }),
      }).catch(() => {});
    }

    // 4. Google Sheets (só se a URL estiver configurada).
    //    O Apps Script escreve por POSIÇÃO fixa; mantenha a ordem das chaves alinhada
    //    ao cabeçalho da planilha deste webinário.
    if (SHEETS_URL) {
      await fetch(SHEETS_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome, email: contactEmail, whatsapp,
          segmento: segmento || '', base: base || '',
          utm_source: utm_source || '', utm_medium: utm_medium || '', utm_campaign: utm_campaign || '',
          utm_content: utm_content || '', utm_term: utm_term || '', utm_id: utm_id || '',
          fbclid: fbclid || '', gclid: gclid || '',
          ip: clientIp, dispositivo: device, pais: geoCountry, regiao: geoRegion, cidade: geoCity,
          referral_source: referral_source || '', url: url || '', received_at: receivedAt,
        }),
      }).catch(() => {});
    }

    // 5. Meta CAPI (deduplica com o Pixel do browser via event_id)
    if (CAPI_ENDPOINT && META_ACCESS_TOKEN) {
      const capiEventId = event_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const referer = req.headers['referer'] || url || '';
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
          custom_data: { value: 1, currency: 'BRL' },
        }],
        access_token: META_ACCESS_TOKEN,
      };
      if (test_event_code) capiPayload.test_event_code = test_event_code;
      fetch(CAPI_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capiPayload),
      }).catch((err) => console.error('CAPI error:', err));
    }

    return res.status(200).json({ success: true, contactId });
  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
