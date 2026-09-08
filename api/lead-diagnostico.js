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
  const FIELD_QUANTIDADE_CLIENTES = '0ee1d145-aa2d-4162-84de-4764333c57d6'; // "Quantos clientes possui" (campo tipo opções — valor tem que bater com um dos labels cadastrados)

  const SHEETS_URL = process.env.SHEETS_DIAGNOSTICO_URL;
  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!DATACRAZY_API_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor (DATACRAZY_API_KEY)' });
  }

  try {
    const {
      Nome_Completo, E_mail_Corporativo, WhatsApp,
      Nome_da_Empresa, Segmento, Quantidade_de_Clientes,
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
    const device = /Mobile|Android|iPhone|iPad/i.test(userAgent) ? 'Mobile' : 'Desktop';
    const geoCountry = req.headers['x-vercel-ip-country'] || '';
    const geoRegion = req.headers['x-vercel-ip-country-region'] || '';
    const geoCity = req.headers['x-vercel-ip-city']
      ? decodeURIComponent(req.headers['x-vercel-ip-city'])
      : '';
    const receivedAt = new Date().toISOString();
    const phoneDigits = WhatsApp.replace(/\D/g, '');
    const contactEmail = E_mail_Corporativo || `wp.${phoneDigits}@noemail.invalid`;

    const dcHeaders = {
      'Authorization': `Bearer ${DATACRAZY_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // 0. Sheets dispara em paralelo, sem depender do DataCrazy — antes
    // (2026-09-05) a planilha só recebia o lead DEPOIS do DataCrazy confirmar
    // a criação, então uma falha do DataCrazy (ex: contato duplicado, API
    // fora do ar) fazia a request inteira retornar 502 antes de chegar aqui,
    // e o lead nunca caía na planilha — mesmo sendo genuíno. A planilha é o
    // nosso registro de verdade, não pode depender de terceiro pra existir.
    const sheetsPromise = SHEETS_URL ? fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received_at: receivedAt,
          Nome_Completo: Nome_Completo || '',
          E_mail_Corporativo: contactEmail,
          WhatsApp: WhatsApp,
          Nome_da_Empresa: Nome_da_Empresa || '',
          Segmento: Segmento || '',
          Quantidade_de_Clientes: Quantidade_de_Clientes || '',
          UTM_Source: utm_source || '',
          UTM_Medium: utm_medium || '',
          UTM_Campaign: utm_campaign || '',
          UTM_Content: utm_content || '',
          UTM_Term: utm_term || '',
          UTM_Id: utm_id || '',
          fbclid: fbclid || '',
          gclid: gclid || '',
          IP_do_usuario: clientIp,
          Dispositivo: device,
          Referral_Source: referral_source || '',
          Pais_do_usuario: geoCountry,
          Regiao_do_usuario: geoRegion,
          Cidade_do_usuario: geoCity,
          URL: pageUrl || '',
        }),
      }).catch((err) => console.error('Erro ao enviar pro Sheets:', err)) : Promise.resolve();

    // 1. Cria o lead no DataCrazy (nome/email/telefone/empresa/tag)
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
    const dcOk = leadRes.ok && !!leadData.id;
    if (!dcOk) {
      // Best-effort: log e segue sem o CRM (ex: "lead with same contacts
      // already exists" num reenvio/clique duplo) — a planilha acima já
      // recebeu o lead independente disso, então nada se perde.
      console.error('Erro ao criar lead no DataCrazy (nao-fatal):', leadData);
    }
    const leadId = dcOk ? leadData.id : null;

    // 2. Aplica os campos adicionais (empresa, segmento → Área de atuação,
    // quantidade de clientes, UTMs)
    // [FIX 2026-09-08] A PATCH /api/v1/leads/{id} com additionalFields (usada antes)
    // retornava 200 mas NÃO persistia nada — confirmado com o suporte DataCrazy.
    // Testado e confirmado funcionando com lead real em 08/09. O suporte indicou
    // o endpoint interno correto (API não documentada oficialmente,
    // é a mesma que a ferramenta MCP deles usa): POST num domínio diferente
    // (crm.g1, não api.g1) em /additional-fields/lead/{leadId}/{fieldId}, com
    // {value} no corpo — um POST por campo, não um PATCH em lote.
    const DATACRAZY_INTERNAL_URL = 'https://crm.g1.datacrazy.io';
    const additionalFields = [];
    if (Nome_da_Empresa) additionalFields.push({ id: FIELD_EMPRESA, value: Nome_da_Empresa });
    if (Segmento) additionalFields.push({ id: FIELD_AREA_ATUACAO, value: Segmento });
    if (Quantidade_de_Clientes) additionalFields.push({ id: FIELD_QUANTIDADE_CLIENTES, value: Quantidade_de_Clientes });
    if (utm_source) additionalFields.push({ id: FIELD_UTM_SOURCE, value: utm_source });
    if (utm_campaign) additionalFields.push({ id: FIELD_UTM_CAMPAIGN, value: utm_campaign });
    if (utm_medium) additionalFields.push({ id: FIELD_UTM_MEDIUM, value: utm_medium });
    if (utm_content) additionalFields.push({ id: FIELD_UTM_CONTENT, value: utm_content });
    if (utm_term) additionalFields.push({ id: FIELD_UTM_TERM, value: utm_term });

    const fieldsPromise = leadId ? Promise.allSettled(additionalFields.map(({ id, value }) =>
      fetch(`${DATACRAZY_INTERNAL_URL}/api/crm/additional-fields/lead/${leadId}/${id}`, {
        method: 'POST',
        headers: dcHeaders,
        body: JSON.stringify({ value }),
      }).then(async (r) => {
        if (!r.ok) console.error(`Erro ao aplicar campo adicional ${id} no DataCrazy:`, await r.text());
      }).catch((err) => console.error(`Erro ao aplicar campo adicional ${id} no DataCrazy:`, err))
    )) : Promise.resolve();

    // 4. Cria o negócio no pipeline "Leads", etapa "Novos Leads"
    const businessPromise = leadId ? fetch(`${DATACRAZY_URL}/api/v1/businesses`, {
      method: 'POST',
      headers: dcHeaders,
      body: JSON.stringify({
        leadId,
        stageId: PIPELINE_STAGE_ID,
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao criar negócio no DataCrazy:', await r.text());
    }).catch((err) => console.error('Erro ao criar negócio no DataCrazy:', err)) : Promise.resolve();

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
    await Promise.allSettled([fieldsPromise, businessPromise, sheetsPromise, capiPromise]);

    return res.status(200).json({ success: true, leadId, crm: dcOk ? 'ok' : 'falhou' });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
