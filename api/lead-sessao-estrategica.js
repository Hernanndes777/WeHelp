// api/lead-sessao-estrategica.js — Função serverless (Vercel) da LP /sessao-estrategica
// Contato + Deal no ActiveCampaign (pipeline "Webinário", etapa "LEADS APLICAÇÃO WEBNÁRIO")
// + linha na planilha "Agendamentos WB 05" + evento Lead no Meta CAPI.
// Segue o padrão de 00-base/padrao-captura-lead.md — mesma estrutura de api/lead.js.

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

  // IDs confirmados direto na conta ActiveCampaign (ver 00-base/padrao-captura-lead.md)
  const DEAL_PIPELINE_ID = 19;   // Pipeline "Webinário"
  const DEAL_STAGE_ID = 172;     // Etapa "LEADS APLICAÇÃO WEBNÁRIO"
  const FIELD_ACADEMIA = 39;     // "Nome da sua academia" (texto)
  const FIELD_CLIENTES = 35;     // "Quantos clientes ativos você tem atualmente?" (dropdown)
  const FIELD_DESAFIO = 36;      // "Qual é o seu maior desafio financeiro ou de gestão hoje?" (dropdown)
  const FIELD_SISTEMA = 37;      // "Qual sistema de gestão você utiliza na sua academia atualmente?" (dropdown)
  const FIELD_UTM_SOURCE = 28;
  const FIELD_UTM_CAMPAIGN = 29;
  const FIELD_UTM_MEDIUM = 30;

  // [PENDENTE] URL do Apps Script (/exec) da planilha "Agendamentos WB 05" —
  // configurar como env var na Vercel assim que o Apps Script novo for implantado.
  const SHEETS_URL = process.env.SHEETS_SESSAO_ESTRATEGICA_URL;

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!AC_URL || !AC_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
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

    const headers = {
      'Api-Token': AC_KEY,
      'Content-Type': 'application/json',
    };

    const phoneDigits = WhatsApp.replace(/\D/g, '');
    const contactEmail = E_mail_Profissional || `wp.${phoneDigits}@noemail.invalid`;

    // 1. Cria ou atualiza o contato, já com os campos personalizados desse formulário
    const fieldValues = [];
    if (Nome_da_sua_academia) fieldValues.push({ field: String(FIELD_ACADEMIA), value: Nome_da_sua_academia });
    if (Quantos_clientes_ativos_voce_tem_atualmente) fieldValues.push({ field: String(FIELD_CLIENTES), value: Quantos_clientes_ativos_voce_tem_atualmente });
    if (Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje) fieldValues.push({ field: String(FIELD_DESAFIO), value: Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje });
    if (Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente) fieldValues.push({ field: String(FIELD_SISTEMA), value: Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente });
    if (UTM_Source) fieldValues.push({ field: String(FIELD_UTM_SOURCE), value: UTM_Source });
    if (UTM_Medium) fieldValues.push({ field: String(FIELD_UTM_MEDIUM), value: UTM_Medium });
    if (UTM_Campaign) fieldValues.push({ field: String(FIELD_UTM_CAMPAIGN), value: UTM_Campaign });

    const syncRes = await fetch(`${AC_URL}/api/3/contact/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contact: {
          email: contactEmail,
          firstName: Seu_Nome_Completo || '',
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

    // 2. Aplica a tag "WB Aplicação 05" (id 79) — identifica leads dessa LP
    // especificamente, mesmo padrão das tags "WB Aplicação"/"WB Aplicação 02".
    const TAG_WB_APLICACAO_05 = 79;
    const tagPromise = fetch(`${AC_URL}/api/3/contactTags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contactTag: { contact: String(contactId), tag: String(TAG_WB_APLICACAO_05) },
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao aplicar tag:', await r.text());
    }).catch((err) => console.error('Erro ao aplicar tag:', err));

    // 3. Cria o Deal no pipeline "Webinário", etapa "LEADS APLICAÇÃO WEBNÁRIO"
    // owner "6" = mesmo dono usado nos 3 deals que já existem hoje nessa etapa exata
    // (conferido direto na conta em 2026-08-02). Ajuste aqui se o responsável mudar.
    //
    // [FIX] As chamadas abaixo (deal, Sheets, CAPI) precisam de "await" — a Vercel
    // congela a execução da function assim que a response é enviada, então um
    // fetch "fire-and-forget" (sem await) corria o risco de nunca terminar. Por
    // isso tudo aqui embaixo é aguardado com Promise.allSettled antes do retorno.
    //
    // [FIX] group/stage/contact precisam ir como STRING no corpo da requisição —
    // enviados como número, a API da ActiveCampaign rejeitava a criação do deal
    // silenciosamente (confirmado em produção em 2026-08-02).
    const DEAL_OWNER_ID = '6';
    const dealPromise = fetch(`${AC_URL}/api/3/deals`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deal: {
          title: `Sessão Estratégica — ${Seu_Nome_Completo || 'Lead'}${Nome_da_sua_academia ? ' (' + Nome_da_sua_academia + ')' : ''}`,
          currency: 'usd',
          value: 0,
          group: String(DEAL_PIPELINE_ID),
          stage: String(DEAL_STAGE_ID),
          contact: String(contactId),
          owner: DEAL_OWNER_ID,
          fields: [
            { customFieldId: FIELD_ACADEMIA, fieldValue: Nome_da_sua_academia || '' },
            { customFieldId: FIELD_CLIENTES, fieldValue: Quantos_clientes_ativos_voce_tem_atualmente || '' },
            { customFieldId: FIELD_DESAFIO, fieldValue: Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje || '' },
            { customFieldId: FIELD_SISTEMA, fieldValue: Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente || '' },
          ],
        },
      }),
    }).then(async (r) => {
      if (!r.ok) console.error('Erro ao criar deal:', await r.text());
    }).catch((err) => console.error('Erro ao criar deal:', err));

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

    // Espera as três chamadas em paralelo — a Vercel encerra a function assim que a
    // response sai, então sem esse await o deal/Sheets/CAPI corriam risco de nunca completar.
    await Promise.allSettled([tagPromise, dealPromise, sheetsPromise, capiPromise]);

    return res.status(200).json({ success: true, contactId });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
