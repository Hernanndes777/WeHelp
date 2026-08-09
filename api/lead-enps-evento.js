// api/lead-enps-evento.js — Função serverless (Vercel) da LP /enps-evento
// Reaproveitada pro evento Conarh 2026: cria/atualiza contato no
// ActiveCampaign, aplica a tag "Evento - Conarh 2026" (id 82) e cria
// um Deal no pipeline "LEADS" (id 4), etapa "REALIZAR CONTATO" (id 21)
// — mesmo pipeline geral já usado por api/lead-diagnostico.js.
// Segue o padrão de 00-base/padrao-captura-lead.md e as correções já
// aprendidas nas outras functions: await em tudo (deal/CAPI/tag) antes
// do retorno, e group/stage/contact do Deal como STRING.

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

  const DEAL_PIPELINE_ID = 4;    // Pipeline "LEADS" (pipeline geral do site)
  const DEAL_STAGE_ID = 21;      // Etapa "REALIZAR CONTATO"
  const DEAL_OWNER_ID = '6';     // Mesmo owner padrão usado nos outros deals dessa etapa
  const FIELD_EMPRESA = 6;       // "Empresa" (já existia, reaproveitado)
  const TAG_CONARH_2026 = 82;    // "Evento - Conarh 2026" (criada em 2026-08-08)

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!AC_URL || !AC_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
  }

  try {
    const {
      Nome_Completo, Email, Telefone, Empresa,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id,
      fbclid, gclid, referral_source, url: pageUrl,
      event_id, fbc, fbp, test_event_code,
    } = req.body;

    if (!Email && !Telefone) {
      return res.status(400).json({ error: 'E-mail ou telefone obrigatório' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                     || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const resolvedFbc = fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : '');
    const phoneDigits = (Telefone || '').replace(/\D/g, '');
    const contactEmail = Email || `wp.${phoneDigits}@noemail.invalid`;

    const headers = {
      'Api-Token': AC_KEY,
      'Content-Type': 'application/json',
    };

    // 1. Cria ou atualiza o contato
    const fieldValues = [];
    if (Empresa) fieldValues.push({ field: String(FIELD_EMPRESA), value: Empresa });

    const syncRes = await fetch(`${AC_URL}/api/3/contact/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contact: {
          email: contactEmail,
          firstName: Nome_Completo || '',
          phone: Telefone || '',
          fieldValues,
        },
      }),
    });

    const syncData = await syncRes.json();

    if (!syncRes.ok || !syncData.contact) {
      console.error('Erro sync:', syncData);
      return res.status(502).json({ error: 'Falha ao criar contato', details: syncData });
    }

    const contactId = syncData.contact.id;

    // 2. Aplica a tag "Evento - Conarh 2026"
    const tagPromise = fetch(`${AC_URL}/api/3/contactTags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contactTag: { contact: String(contactId), tag: String(TAG_CONARH_2026) },
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao aplicar tag:', await r.text());
    }).catch((err) => console.error('Erro ao aplicar tag:', err));

    // 3. Cria o Deal no pipeline "LEADS", etapa "REALIZAR CONTATO"
    const dealPromise = fetch(`${AC_URL}/api/3/deals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deal: {
          title: `Conarh 2026 — ${Nome_Completo || 'Lead'}${Empresa ? ' (' + Empresa + ')' : ''}`,
          currency: 'usd',
          value: 0,
          group: String(DEAL_PIPELINE_ID),
          stage: String(DEAL_STAGE_ID),
          contact: String(contactId),
          owner: DEAL_OWNER_ID,
          fields: [
            { customFieldId: FIELD_EMPRESA, fieldValue: Empresa || '' },
          ],
        },
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao criar deal:', await r.text());
    }).catch((err) => console.error('Erro ao criar deal:', err));

    // 4. Evento Lead pro Meta CAPI (mesmo pixel do site inteiro)
    let capiPromise = Promise.resolve();
    if (CAPI_ENDPOINT && META_ACCESS_TOKEN) {
      const capiEventId = event_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const referer = req.headers['referer'] || pageUrl || '';

      const capiPayload = {
        data: [{
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: capiEventId,
          event_source_url: referer,
          action_source: 'website',
          user_data: {
            em: [sha256(contactEmail)],
            ...(phoneDigits ? { ph: [sha256(phoneDigits)] } : {}),
            client_ip_address: clientIp,
            client_user_agent: userAgent,
            ...(resolvedFbc ? { fbc: resolvedFbc } : {}),
            ...(fbp ? { fbp } : {}),
          },
        }],
        access_token: META_ACCESS_TOKEN,
      };

      if (test_event_code) capiPayload.test_event_code = test_event_code;

      capiPromise = fetch(CAPI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capiPayload),
      }).catch((err) => console.error('CAPI error:', err));
    }

    // Espera as três chamadas em paralelo — a Vercel encerra a function assim que a
    // response sai, então sem esse await a tag/deal/CAPI corriam risco de nunca completar.
    await Promise.allSettled([tagPromise, dealPromise, capiPromise]);

    return res.status(200).json({ success: true, contactId });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
