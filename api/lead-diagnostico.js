// api/lead-diagnostico.js — Função serverless (Vercel) da LP /diagnostico
// Leads caem no DataCrazy via webhook da automação "Leads - Diagnóstico
// (isolado)" (clone de "Leads - Site", que já funciona pro site principal).
// [2026-09-08] Trocado da API direta (api.g1.datacrazy.io) pro webhook: a API
// pública de additionalFields nunca persistia valores estruturados (bug
// confirmado com o suporte DataCrazy), enquanto o webhook nativo funciona —
// testado com lead real e todos os campos batendo. A automação já cuida de
// criar o lead, aplicar os campos estruturados, criar o negócio na etapa
// certa e atribuir a Caroline Bonini como atendente — não precisa mais de
// token, IDs de campo nem lógica de pipeline aqui.
// Mantém o evento Lead no Meta CAPI (independente de qual CRM guarda o registro).
// Segue o padrão de 00-base/padrao-captura-lead.md.

import { createHash } from 'crypto';
const sha256 = (v) => createHash('sha256').update(String(v).toLowerCase().trim()).digest('hex');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const DATACRAZY_WEBHOOK_URL = 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/62c3af3c-8e3e-4332-b002-ebcc5fa31fbd/a6145cad-a31d-489c-aa29-3e1b725e2d0c';

  const SHEETS_URL = process.env.SHEETS_DIAGNOSTICO_URL;
  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

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

    // 1. Cria o lead na DataCrazy via webhook da automação (nome/email/telefone/
    // empresa/segmento/quantidade de clientes/UTMs) — a automação já cuida de
    // campos estruturados, negócio e atendente, então é só um POST.
    let dcOk = false;
    const dcPromise = fetch(DATACRAZY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: Nome_Completo || 'Lead sem nome',
        email: contactEmail,
        phone: WhatsApp,
        company: Nome_da_Empresa || '',
        businessArea: Segmento || '',
        companySize: Quantidade_de_Clientes || '',
        utmSource: utm_source || '',
        utmCampaign: utm_campaign || '',
        utmMedium: utm_medium || '',
        utmContent: utm_content || '',
        utmTerm: utm_term || '',
      }),
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      dcOk = r.ok && data.ok !== false;
      if (!dcOk) console.error('Erro ao criar lead no DataCrazy (webhook, nao-fatal):', data);
    }).catch((err) => {
      console.error('Erro ao criar lead no DataCrazy (webhook, nao-fatal):', err);
    });

    // 2. Evento Lead pro Meta CAPI (mesmo pixel do site inteiro, independe do CRM)
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
    // response sai, então sem esse await o DataCrazy/CAPI corriam risco de nunca completar.
    await Promise.allSettled([dcPromise, sheetsPromise, capiPromise]);

    return res.status(200).json({ success: true, crm: dcOk ? 'ok' : 'falhou' });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
