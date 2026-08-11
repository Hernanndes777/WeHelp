// api/lead-diagnostico.js — Função serverless (Vercel) da LP /diagnostico
// Leads caem no DataCrazy (substituiu o ActiveCampaign nessa LP, decisão do
// usuário em 2026-08-11): cria o lead no pipeline "Leads", etapa "Novos Leads",
// com a tag "Site" + campos de UTM já existentes no DataCrazy. Mantém o evento
// Lead no Meta CAPI (independente de qual CRM guarda o registro).
// Segue o padrão de 00-base/padrao-captura-lead.md.

import { createHash } from 'crypto';
const sha256 = (v) => createHash('sha256').update(String(v).toLowerCase().trim()).digest('hex');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DATACRAZY_URL = 'https://api.g1.datacrazy.io';
  const DATACRAZY_API_KEY = process.env.DATACRAZY_API_KEY;

  // IDs confirmados direto na conta DataCrazy em 2026-08-11
  const PIPELINE_STAGE_ID = 'e9ae521e-13c6-4a68-a0f8-ef7447c8d7dc'; // Pipeline "Leads" > etapa "Novos Leads"
  const TAG_SITE = '91ed2d79-6bf8-4744-8a9a-127850f7f00f';         // Tag "Site"
  const ATTENDANT_ID = '379b3f67-da07-4cf2-b2fa-d062ee3320eb';     // Caroline Bonini — atendente padrão dos leads do /diagnostico
  const FIELD_EMPRESA = 'dcb41d3d-26af-4ab2-9849-be84abc5bf6e';    // "Empresa"
  const FIELD_AREA_ATUACAO = '91af21ad-faeb-44a5-bc2f-af9a3100bbcd'; // "Área de atuação" — usado pro Segmento do form
  const FIELD_UTM_SOURCE = '897593b4-a00c-475d-b3a2-b8457498c7ba';
  const FIELD_UTM_CAMPAIGN = 'ba9b9dd4-c977-4b03-b72d-7bdf432a8994';
  const FIELD_UTM_MEDIUM = '3b60437b-315a-40c5-b192-77fee043c59c';
  const FIELD_UTM_CONTENT = 'd07ef2d1-a9fb-45a8-b8d1-2e5a4641531c';
  const FIELD_UTM_TERM = '8f5317cb-daad-487a-bfcb-53844c314227';

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!DATACRAZY_API_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor (DATACRAZY_API_KEY)' });
  }

  try {
    const {
      Nome_Completo, E_mail_Corporativo, WhatsApp,
      Nome_da_Empresa, Segmento,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id,
      fbclid, gclid, referral_source, url: pageUrl,
      event_id, fbc, fbp, test_event_code,
    } = req.body;

    if (!WhatsApp) {
      return res.status(400).json({ error: 'WhatsApp obrigatório' });
    }

    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                     || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const resolvedFbc = fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : '');
    const phoneDigits = WhatsApp.replace(/\D/g, '');
    const contactEmail = E_mail_Corporativo || `wp.${phoneDigits}@noemail.invalid`;

    const dcHeaders = {
      'Authorization': `Bearer ${DATACRAZY_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // 1. Cria o lead no DataCrazy (nome/email/telefone/empresa/tag)
    // [BUG DataCrazy] POST /leads/additional-fields (o endpoint "tudo em um"
    // documentado) retorna 500 (Prisma validation error) quando combinado com
    // additionalFields — confirmado em teste isolado em 2026-08-11. Contornado
    // criando o lead primeiro e aplicando os additionalFields num PATCH
    // separado logo em seguida, que funciona normalmente.
    const leadRes = await fetch(`${DATACRAZY_URL}/api/v1/leads`, {
      method: 'POST',
      headers: dcHeaders,
      body: JSON.stringify({
        name: Nome_Completo || 'Lead sem nome',
        email: contactEmail,
        phone: WhatsApp,
        company: Nome_da_Empresa || '',
        source: 'Diagnóstico B2B (Site)',
        tags: [{ id: TAG_SITE }],
        attendant: { id: ATTENDANT_ID },
      }),
    });

    const leadData = await leadRes.json();

    if (!leadRes.ok || !leadData.id) {
      console.error('Erro ao criar lead no DataCrazy:', leadData);
      return res.status(502).json({ error: 'Falha ao criar lead', details: leadData });
    }

    const leadId = leadData.id;

    // 2. Aplica os campos adicionais (empresa, segmento → Área de atuação, UTMs) via PATCH
    const additionalFields = [];
    if (Nome_da_Empresa) additionalFields.push({ id: FIELD_EMPRESA, value: Nome_da_Empresa });
    if (Segmento) additionalFields.push({ id: FIELD_AREA_ATUACAO, value: Segmento });
    if (utm_source) additionalFields.push({ id: FIELD_UTM_SOURCE, value: utm_source });
    if (utm_campaign) additionalFields.push({ id: FIELD_UTM_CAMPAIGN, value: utm_campaign });
    if (utm_medium) additionalFields.push({ id: FIELD_UTM_MEDIUM, value: utm_medium });
    if (utm_content) additionalFields.push({ id: FIELD_UTM_CONTENT, value: utm_content });
    if (utm_term) additionalFields.push({ id: FIELD_UTM_TERM, value: utm_term });

    const fieldsPromise = additionalFields.length ? fetch(`${DATACRAZY_URL}/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      headers: dcHeaders,
      body: JSON.stringify({ additionalFields }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao aplicar additionalFields no DataCrazy:', await r.text());
    }).catch((err) => console.error('Erro ao aplicar additionalFields no DataCrazy:', err)) : Promise.resolve();

    // 4. Cria o negócio no pipeline "Leads", etapa "Novos Leads"
    const businessPromise = fetch(`${DATACRAZY_URL}/api/v1/businesses`, {
      method: 'POST',
      headers: dcHeaders,
      body: JSON.stringify({
        leadId,
        stageId: PIPELINE_STAGE_ID,
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao criar negócio no DataCrazy:', await r.text());
    }).catch((err) => console.error('Erro ao criar negócio no DataCrazy:', err));

    // 5. Evento Lead pro Meta CAPI (mesmo pixel do site inteiro, independe do CRM)
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
            ph: [sha256(phoneDigits)],
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

    // Espera as chamadas em paralelo — a Vercel encerra a function assim que a
    // response sai, então sem esse await o negócio/CAPI corriam risco de nunca completar.
    await Promise.allSettled([fieldsPromise, businessPromise, capiPromise]);

    return res.status(200).json({ success: true, leadId });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
