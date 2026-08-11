// api/lead-diagnostico.js — Função serverless (Vercel) da LP /diagnostico
// Contato + Deal no ActiveCampaign (pipeline "LEADS", etapa "REALIZAR CONTATO")
// + linha na planilha do Diagnóstico B2B + evento Lead no Meta CAPI.
// Segue o padrão de 00-base/padrao-captura-lead.md — mesma estrutura de
// api/lead-sessao-estrategica.js, já com as correções aprendidas nele:
// - await em tudo (deal/sheets/capi) antes do retorno, senão a Vercel
//   congela a function e as chamadas fire-and-forget nunca terminam.
// - group/stage/contact do Deal como STRING, não número — a API do
//   ActiveCampaign rejeita silenciosamente se for número puro no JSON.

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

  // IDs confirmados direto na conta ActiveCampaign em 2026-08-07
  const DEAL_PIPELINE_ID = 4;    // Pipeline "LEADS" (pipeline geral, já usado por outros formulários do site)
  const DEAL_STAGE_ID = 21;      // Etapa "REALIZAR CONTATO"
  const DEAL_OWNER_ID = '6';     // Mesmo owner padrão usado nos outros deals dessa etapa
  const FIELD_EMPRESA = 6;       // "Empresa" (já existia)
  const FIELD_SEGMENTO = 46;     // "Segmento (Diagnóstico B2B)" — criado pra essa LP
  // FIELD_CLIENTES (47) removido do formulário em 2026-08-11 pra reduzir
  // atrito — campo continua existindo no AC, só não é mais preenchido por aqui.
  const FIELD_UTM_SOURCE = 28;
  const FIELD_UTM_CAMPAIGN = 29;
  const FIELD_UTM_MEDIUM = 30;

  // [PENDENTE] URL do Apps Script (/exec) da planilha do Diagnóstico B2B —
  // configurar como env var na Vercel assim que a planilha for criada.
  const SHEETS_URL = process.env.SHEETS_DIAGNOSTICO_URL;

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!AC_URL || !AC_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
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
    const device = /Mobile|Android|iPhone|iPad/i.test(userAgent) ? 'Mobile' : 'Desktop';

    const geoCountry = req.headers['x-vercel-ip-country'] || '';
    const geoRegion = req.headers['x-vercel-ip-country-region'] || '';
    const geoCity = req.headers['x-vercel-ip-city']
      ? decodeURIComponent(req.headers['x-vercel-ip-city'])
      : '';

    const receivedAt = new Date().toISOString();
    const resolvedFbc = fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : '');

    const headers = {
      'Api-Token': AC_KEY,
      'Content-Type': 'application/json',
    };

    const phoneDigits = WhatsApp.replace(/\D/g, '');
    const contactEmail = E_mail_Corporativo || `wp.${phoneDigits}@noemail.invalid`;

    // 1. Cria ou atualiza o contato, já com os campos personalizados desse formulário
    const fieldValues = [];
    if (Nome_da_Empresa) fieldValues.push({ field: String(FIELD_EMPRESA), value: Nome_da_Empresa });
    if (Segmento) fieldValues.push({ field: String(FIELD_SEGMENTO), value: Segmento });
    if (utm_source) fieldValues.push({ field: String(FIELD_UTM_SOURCE), value: utm_source });
    if (utm_medium) fieldValues.push({ field: String(FIELD_UTM_MEDIUM), value: utm_medium });
    if (utm_campaign) fieldValues.push({ field: String(FIELD_UTM_CAMPAIGN), value: utm_campaign });

    const syncRes = await fetch(`${AC_URL}/api/3/contact/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contact: {
          email: contactEmail,
          firstName: Nome_Completo || '',
          phone: WhatsApp,
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

    // 2. Cria o Deal no pipeline "LEADS", etapa "REALIZAR CONTATO"
    const dealPromise = fetch(`${AC_URL}/api/3/deals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deal: {
          title: `Diagnóstico B2B — ${Nome_Completo || 'Lead'}${Nome_da_Empresa ? ' (' + Nome_da_Empresa + ')' : ''}`,
          currency: 'usd',
          value: 0,
          group: String(DEAL_PIPELINE_ID),
          stage: String(DEAL_STAGE_ID),
          contact: String(contactId),
          owner: DEAL_OWNER_ID,
          fields: [
            { customFieldId: FIELD_EMPRESA, fieldValue: Nome_da_Empresa || '' },
            { customFieldId: FIELD_SEGMENTO, fieldValue: Segmento || '' },
          ],
        },
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao criar deal:', await r.text());
    }).catch((err) => console.error('Erro ao criar deal:', err));

    // 3. Envia pro Google Sheets (planilha ainda pendente de criação)
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
          fbclid: fbclid || '',
          gclid: gclid || '',
          IP_do_usuario: clientIp,
          Data_da_conversao: receivedAt,
          Dispositivo: device,
          Referral_Source: referral_source || '',
          Pais_do_usuario: geoCountry,
          Regiao_do_usuario: geoRegion,
          Cidade_do_usuario: geoCity,
          UTM_Source: utm_source || '',
          UTM_Medium: utm_medium || '',
          URL: pageUrl || '',
          UTM_Campaign: utm_campaign || '',
          UTM_Id: utm_id || '',
          UTM_Term: utm_term || '',
          UTM_Content: utm_content || '',
        }),
      }).catch((err) => console.error('Erro ao enviar pro Sheets:', err)) : Promise.resolve();

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

    // Espera as três chamadas em paralelo — a Vercel encerra a function assim que a
    // response sai, então sem esse await o deal/Sheets/CAPI corriam risco de nunca completar.
    await Promise.allSettled([dealPromise, sheetsPromise, capiPromise]);

    return res.status(200).json({ success: true, contactId });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
