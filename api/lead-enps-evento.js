// api/lead-enps-evento.js — Função serverless (Vercel) da LP /enps-evento
// Migrado do ActiveCampaign pro DataCrazy em 2026-08-18 (pedido do usuário: o
// comercial precisa ver esses leads no DataCrazy). Leads caem no pipeline
// "Leads" (grupo VENDAS, mesmo pipeline geral usado por /diagnostico) > etapa
// "Realizar Contato", com a tag "Evento - Conarh 2026" (criada nessa data).
// Mesmo contorno do bug confirmado de additionalFields da API pública do
// DataCrazy — dado garantido via campo nativo "notes".
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

  // IDs confirmados via MCP do DataCrazy em 2026-08-18
  const PIPELINE_STAGE_ID = 'e9ae521e-13c6-4a68-a0f8-ef7447c8d7dc'; // Pipeline "Leads" > etapa "Realizar Contato"
  const TAG_CONARH_2026 = 'bf006040-9bef-4fe3-bc0b-cbf1a2c3ef18';   // Tag "Evento - Conarh 2026"
  const ATTENDANT_ID = '379b3f67-da07-4cf2-b2fa-d062ee3320eb';      // Caroline Bonini — mesmo padrão das outras LPs
  const FIELD_EMPRESA = 'dcb41d3d-26af-4ab2-9849-be84abc5bf6e';     // "Empresa"

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!DATACRAZY_API_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor (DATACRAZY_API_KEY)' });
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
    const phoneDigits = (Telefone || '').replace(/\D/g, '');
    const contactEmail = Email || `wp.${phoneDigits}@noemail.invalid`;

    const dcHeaders = {
      'Authorization': `Bearer ${DATACRAZY_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // 1. Cria o lead no DataCrazy (nome/email/telefone/empresa/tag)
    // [BUG DataCrazy confirmado em 2026-08-11, ver api/lead-diagnostico.js pro
    // diagnóstico completo] additionalFields não persiste via API pública —
    // contorno: manda tudo formatado dentro de "notes" (campo nativo, texto
    // livre, confirmado funcionando).
    const notesLines = [];
    if (Empresa) notesLines.push(`Empresa: ${Empresa}`);
    if (utm_source) notesLines.push(`UTM Source: ${utm_source}`);
    if (utm_campaign) notesLines.push(`UTM Campaign: ${utm_campaign}`);
    if (utm_medium) notesLines.push(`UTM Medium: ${utm_medium}`);

    const leadRes = await fetch(`${DATACRAZY_URL}/api/v1/leads`, {
      method: 'POST',
      headers: dcHeaders,
      body: JSON.stringify({
        name: Nome_Completo || 'Lead sem nome',
        email: contactEmail,
        phone: Telefone || '',
        company: Empresa || '',
        source: 'Evento Conarh 2026 (Site)',
        notes: notesLines.join('\n'),
        tags: [{ id: TAG_CONARH_2026 }],
        attendant: { id: ATTENDANT_ID },
      }),
    });

    const leadData = await leadRes.json();

    if (!leadRes.ok || !leadData.id) {
      console.error('Erro ao criar lead no DataCrazy:', leadData);
      return res.status(502).json({ error: 'Falha ao criar lead', details: leadData });
    }

    const leadId = leadData.id;

    // 2. Tenta aplicar o campo adicional "Empresa" (fire-and-forget — hoje não
    // persiste pela API pública, mantido pro dia que o DataCrazy corrigir o bug)
    const fieldsPromise = Empresa ? fetch(`${DATACRAZY_URL}/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      headers: dcHeaders,
      body: JSON.stringify({ additionalFields: [{ id: FIELD_EMPRESA, value: Empresa }] }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao aplicar additionalFields no DataCrazy:', await r.text());
    }).catch((err) => console.error('Erro ao aplicar additionalFields no DataCrazy:', err)) : Promise.resolve();

    // 3. Cria o negócio no pipeline "Leads", etapa "Realizar Contato"
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
            ...(fbc ? { fbc } : {}),
            ...(fbp ? { fbp } : {}),
          },
          custom_data: { value: 1, currency: 'BRL' },
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
