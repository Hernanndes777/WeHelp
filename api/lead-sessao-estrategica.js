// api/lead-sessao-estrategica.js — Função serverless (Vercel) da LP /sessao-estrategica
// Migrado do ActiveCampaign pro DataCrazy em 2026-08-12 (decisão do usuário: substituir
// totalmente, mesmo padrão já usado no /diagnostico e /academias). Leads caem no pipeline
// "Webinário" (grupo VENDAS, já existente no DataCrazy, criado pelo usuário em 2026-08-07)
// > etapa "AGENDAMENTO". Mesmo contorno do bug confirmado de additionalFields da API
// pública do DataCrazy — dado garantido via campo nativo "notes".
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

  // IDs confirmados via MCP do DataCrazy em 2026-08-12
  const PIPELINE_STAGE_ID = 'cff64878-e74a-4056-b240-7903901ea05f'; // Pipeline "Webinário" > etapa "AGENDAMENTO"
  const TAG_WB06 = '8971c60b-3d51-4795-821e-b624111a2411';         // Tag "WB 06" (criada 2026-08-13, específica dessa LP — pedido do usuário)
  const ATTENDANT_ID = '379b3f67-da07-4cf2-b2fa-d062ee3320eb';     // Caroline Bonini — mesmo padrão das outras LPs
  const FIELD_EMPRESA = 'dcb41d3d-26af-4ab2-9849-be84abc5bf6e';    // "Empresa" — usado pro Nome da academia

  // URL do Apps Script (/exec) da aba "Agendamentos WB 07". Fixa no código porque
  // a env var da Vercel ficou apontando pro deployment antigo (WB 06) e os leads
  // sumiam em silêncio — trocar aqui a cada ciclo de webinário.
  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzu1GYaIYE-kCj7TEef2nm5W5TegaRFPvFg33OSVMT9YFbDFtIPzHOGOAJfYV2yFszD/exec';

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!DATACRAZY_API_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor (DATACRAZY_API_KEY)' });
  }

  try {
    const {
      Seu_Nome_Completo, E_mail_Profissional, WhatsApp,
      Nome_da_sua_academia,
      Quantos_clientes_ativos_voce_tem_atualmente,
      Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje,
      Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente,
      UTM_Source, UTM_Medium, UTM_Campaign, UTM_Content, UTM_Term, UTM_Id,
      fbclid, gclid, Referral_Source, URL: pageUrl,
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
    const contactEmail = E_mail_Profissional || `wp.${phoneDigits}@noemail.invalid`;

    const dcHeaders = {
      'Authorization': `Bearer ${DATACRAZY_API_KEY}`,
      'Content-Type': 'application/json',
    };

    // 1. Cria o lead no DataCrazy (nome/email/telefone/academia/tag)
    // [BUG DataCrazy confirmado em 2026-08-11, ver api/lead-diagnostico.js pro
    // diagnóstico completo] additionalFields não persiste via API pública —
    // contorno: manda tudo formatado dentro de "notes" (campo nativo, texto
    // livre, confirmado funcionando).
    const notesLines = [];
    if (Nome_da_sua_academia) notesLines.push(`Academia: ${Nome_da_sua_academia}`);
    if (Quantos_clientes_ativos_voce_tem_atualmente) notesLines.push(`Clientes ativos: ${Quantos_clientes_ativos_voce_tem_atualmente}`);
    if (Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje) notesLines.push(`Maior desafio: ${Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje}`);
    if (Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente) notesLines.push(`Sistema de gestão atual: ${Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente}`);
    if (UTM_Source) notesLines.push(`UTM Source: ${UTM_Source}`);
    if (UTM_Campaign) notesLines.push(`UTM Campaign: ${UTM_Campaign}`);
    if (UTM_Medium) notesLines.push(`UTM Medium: ${UTM_Medium}`);

    const leadRes = await fetch(`${DATACRAZY_URL}/api/v1/leads`, {
      method: 'POST',
      headers: dcHeaders,
      body: JSON.stringify({
        name: Seu_Nome_Completo || 'Lead sem nome',
        email: contactEmail,
        phone: WhatsApp,
        company: Nome_da_sua_academia || '',
        source: 'Sessão Estratégica (Site)',
        notes: notesLines.join('\n'),
        tags: [{ id: TAG_WB06 }],
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
    const fieldsPromise = Nome_da_sua_academia ? fetch(`${DATACRAZY_URL}/api/v1/leads/${leadId}`, {
      method: 'PATCH',
      headers: dcHeaders,
      body: JSON.stringify({ additionalFields: [{ id: FIELD_EMPRESA, value: Nome_da_sua_academia }] }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao aplicar additionalFields no DataCrazy:', await r.text());
    }).catch((err) => console.error('Erro ao aplicar additionalFields no DataCrazy:', err)) : Promise.resolve();

    // 3. Cria o negócio no pipeline "Webinário", etapa "AGENDAMENTO"
    const dealPromise = fetch(`${DATACRAZY_URL}/api/v1/businesses`, {
      method: 'POST',
      headers: dcHeaders,
      body: JSON.stringify({
        leadId,
        stageId: PIPELINE_STAGE_ID,
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao criar negócio no DataCrazy:', await r.text());
    }).catch((err) => console.error('Erro ao criar negócio no DataCrazy:', err));

    // 4. Envia pro Google Sheets — colunas na mesma ordem/nome da planilha
    //    "Agendamentos WB 05" (ver PDF de referência anexado pelo usuário em 2026-08-02).
    const sheetsPromise = SHEETS_URL ? fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received_at: receivedAt,
          Seu_Nome_Completo: Seu_Nome_Completo || '',
          E_mail_Profissional: contactEmail,
          WhatsApp: WhatsApp,
          Nome_da_sua_academia: Nome_da_sua_academia || '',
          Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente: Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente || '',
          Quantos_clientes_ativos_voce_tem_atualmente: Quantos_clientes_ativos_voce_tem_atualmente || '',
          Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje: Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje || '',
          fbclid: fbclid || '',
          gclid: gclid || '',
          IP_do_usuario: clientIp,
          Data_da_conversao: receivedAt,
          Dispositivo: device,
          Referral_Source: Referral_Source || '',
          Id_da_pagina: 'sessao-estrategica',
          Id_do_formulario: event_id || '',
          Pais_do_usuario: geoCountry,
          Regiao_do_usuario: geoRegion,
          Cidade_do_usuario: geoCity,
          UTM_Source: UTM_Source || '',
          UTM_Medium: UTM_Medium || '',
          URL: pageUrl || '',
          UTM_Campaign: UTM_Campaign || '',
          UTM_Id: UTM_Id || '',
          UTM_Term: UTM_Term || '',
          UTM_Content: UTM_Content || '',
          Politicas_de_privacidade: 'Aceito ao enviar o formulário',
        }),
      }).catch((err) => console.error('Erro ao enviar pro Sheets:', err)) : Promise.resolve();

    // 5. Evento Lead pro Meta CAPI (mesmo pixel do site inteiro)
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
    // response sai, então sem esse await o negócio/Sheets/CAPI corriam risco de nunca completar.
    await Promise.allSettled([fieldsPromise, dealPromise, sheetsPromise, capiPromise]);

    return res.status(200).json({ success: true, leadId });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
