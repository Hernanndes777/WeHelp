// api/lead-fitness-brasil-2026.js — Função serverless (Vercel) da LP /fitness-brasil-2026
// Formulário de agendamento no estande (folder sanfonado + QR Code).
// Por decisão do usuário, esse funil NÃO cai no ActiveCampaign (lead
// já é abordado ao vivo no estande) — só planilha do Google Sheets +
// evento Lead no Meta CAPI, seguindo 00-base/padrao-captura-lead.md.

import { createHash } from 'crypto';
const sha256 = (v) => createHash('sha256').update(String(v).toLowerCase().trim()).digest('hex');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // [PENDENTE] URL do Apps Script (/exec) da planilha da Feira —
  // configurar como env var na Vercel assim que a planilha for criada.
  const SHEETS_URL = process.env.SHEETS_FITNESS_BRASIL_2026_URL;

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  try {
    const {
      Nome_Completo, WhatsApp, Nome_da_Academia, Faixa_alunos,
      Alunos_ativos, Mensalidade_media, Permanencia_media_meses, Cancelamentos_mes,
      Perda_anual_calculada,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id,
      fbclid, gclid, referral_source, url: pageUrl,
      event_id, fbc, fbp, test_event_code, skip_capi,
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

    // 1. Envia pro Google Sheets (planilha ainda pendente de criação)
    const sheetsPromise = SHEETS_URL ? fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received_at: receivedAt,
          Nome_Completo: Nome_Completo || '',
          WhatsApp: WhatsApp,
          Nome_da_Academia: Nome_da_Academia || '',
          Faixa_alunos: Faixa_alunos || '',
          Alunos_ativos: Alunos_ativos || '',
          Mensalidade_media: Mensalidade_media || '',
          Permanencia_media_meses: Permanencia_media_meses || '',
          Cancelamentos_mes: Cancelamentos_mes || '',
          Perda_anual_calculada: Perda_anual_calculada || '',
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

    // 1b. DataCrazy — lead + tag "Evento - Fitness Brasil 2026" + negocio no
    // pipeline Leads > Realizar Contato. Mesmo padrao do lead-enps-evento.js
    // (notes carrega os numeros da calculadora — additionalFields tem bug na
    // API publica). Best-effort: falha aqui NUNCA derruba a request, a
    // planilha e a fonte primaria do estande.
    const DATACRAZY_URL = 'https://api.g1.datacrazy.io';
    const DATACRAZY_API_KEY = process.env.DATACRAZY_API_KEY;
    const DC_TAG_FITNESS_BRASIL = 'b7d33288-e3ff-4930-82fd-e476adec8950';    // "Evento - Fitness Brasil 2026" (LP)
    const DC_TAG_CALCULADORA = 'fc48dd3b-a781-4086-95c2-ac8c7e63e028';        // "Evento - Calculadora Fitness Brasil 2026" (tablet /estande)
    const DC_STAGE_REALIZAR_CONTATO = 'e9ae521e-13c6-4a68-a0f8-ef7447c8d7dc';
    const DC_ATTENDANT_CAROL = '379b3f67-da07-4cf2-b2fa-d062ee3320eb';

    let dcPromise = Promise.resolve();
    if (DATACRAZY_API_KEY) {
      const dcHeaders = {
        'Authorization': `Bearer ${DATACRAZY_API_KEY}`,
        'Content-Type': 'application/json',
      };
      const notesLines = [];
      if (Nome_da_Academia) notesLines.push(`Academia: ${Nome_da_Academia}`);
      if (Faixa_alunos) notesLines.push(`Faixa de alunos: ${Faixa_alunos}`);
      if (Alunos_ativos) notesLines.push(`Alunos ativos: ${Alunos_ativos}`);
      if (Mensalidade_media) notesLines.push(`Mensalidade media: R$ ${Mensalidade_media}`);
      if (Permanencia_media_meses) notesLines.push(`Permanencia media: ${Permanencia_media_meses} meses`);
      if (Cancelamentos_mes) notesLines.push(`Cancelamentos/mes: ${Cancelamentos_mes}`);
      if (Perda_anual_calculada) notesLines.push(`Perda anual calculada: R$ ${Number(Perda_anual_calculada).toLocaleString('pt-BR')}`);
      notesLines.push(`Origem: ${utm_medium === 'tablet' ? 'Tablet do estande' : 'LP fitness-brasil-2026'}`);
      if (utm_source) notesLines.push(`UTM: ${utm_source} / ${utm_medium || ''} / ${utm_campaign || ''}`);

      dcPromise = fetch(`${DATACRAZY_URL}/api/v1/leads`, {
        method: 'POST',
        headers: dcHeaders,
        body: JSON.stringify({
          name: Nome_Completo || 'Lead sem nome',
          email: `wp.${phoneDigits}@noemail.invalid`,
          phone: WhatsApp,
          company: Nome_da_Academia || '',
          source: utm_medium === 'tablet' ? 'Feira Fitness Brasil 2026 (Tablet)' : 'Feira Fitness Brasil 2026 (LP)',
          notes: notesLines.join('
'),
          tags: [{ id: utm_medium === 'tablet' ? DC_TAG_CALCULADORA : DC_TAG_FITNESS_BRASIL }],
          attendant: { id: DC_ATTENDANT_CAROL },
        }),
      }).then(async (r) => {
        const leadData = await r.json().catch(() => ({}));
        if (!r.ok || !leadData.id) {
          console.error('DataCrazy: falha ao criar lead (nao-fatal):', leadData);
          return;
        }
        return fetch(`${DATACRAZY_URL}/api/v1/businesses`, {
          method: 'POST',
          headers: dcHeaders,
          body: JSON.stringify({ leadId: leadData.id, stageId: DC_STAGE_REALIZAR_CONTATO }),
        }).then(async (r2) => {
          if (!r2.ok) console.error('DataCrazy: falha ao criar negocio (nao-fatal):', await r2.text());
        });
      }).catch((err) => console.error('DataCrazy: erro (nao-fatal):', err));
    }

    // 2. Evento Lead pro Meta CAPI (mesmo pixel do site inteiro)
    let capiPromise = Promise.resolve();
    // skip_capi: o tablet do estande (/estande) manda dezenas de leads do mesmo
    // IP/aparelho — CAPI com isso envenena o aprendizado do pixel. Sheets continua.
    if (CAPI_ENDPOINT && META_ACCESS_TOKEN && !skip_capi) {
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

    // Espera as duas chamadas em paralelo — a Vercel encerra a function assim que a
    // response sai, então sem esse await o Sheets/CAPI corriam risco de nunca completar.
    await Promise.allSettled([sheetsPromise, dcPromise, capiPromise]);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
