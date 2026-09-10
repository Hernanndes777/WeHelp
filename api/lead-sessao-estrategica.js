// api/lead-sessao-estrategica.js — Função serverless (Vercel) da LP /sessao-estrategica
//
// Leads caem no DataCrazy via webhook de automação, mesmo padrão do
// /diagnostico (ver api/lead-diagnostico.js).
//
// [2026-09-09] Trocado da API direta (api.g1.datacrazy.io) pro webhook. A API
// pública tinha dois problemas que custaram lead de verdade:
//   1. additionalFields nunca persistia valor estruturado (bug confirmado com
//      o suporte DataCrazy) — o contorno era enfiar tudo em "notes";
//   2. quem já existia no CRM — e todo mundo vindo do webinário já existe —
//      derrubava a criação com "lead-with-same-contact-exists".
// A automação nativa resolve os dois: cria/atualiza o lead, aplica os campos
// estruturados, aplica as tags e cria o negócio direto na etapa AGENDAMENTO do
// pipeline "Webinário". Não precisa mais de token, ID de campo, ID de etapa nem
// lógica de pipeline aqui.
//
// Mantém o evento Lead no Meta CAPI (independe de qual CRM guarda o registro).
// Segue o padrão de 00-base/padrao-captura-lead.md.

import { createHash } from 'crypto';
const sha256 = (v) => createHash('sha256').update(String(v).toLowerCase().trim()).digest('hex');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // URL do webhook da automação do DataCrazy que joga o lead na etapa
  // AGENDAMENTO do pipeline "Webinário".
  // Fica fixa no código de propósito: a env var da Vercel já ficou apontando
  // pro deployment de um ciclo antigo e os leads sumiram em silêncio.
  // Vazia = pula o DataCrazy sem quebrar nada (Sheets e CAPI seguem normais).
  const DATACRAZY_WEBHOOK_URL = 'https://api.datacrazy.io/v1/crm/api/crm/flows/webhooks/62c3af3c-8e3e-4332-b002-ebcc5fa31fbd/a9cc0ca3-515d-4b59-ac8d-54aadf7a23a0';

  // Apps Script da planilha "[WBN] Aplicação". Fixa pelo mesmo motivo acima.
  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzu1GYaIYE-kCj7TEef2nm5W5TegaRFPvFg33OSVMT9YFbDFtIPzHOGOAJfYV2yFszD/exec';

  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

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

    // 1. Sheets dispara ANTES do CRM e nunca depende dele. Quando a criação no
    // DataCrazy falhava, a function devolvia 502 e o agendamento sumia sem
    // nunca chegar na planilha. A planilha é o registro de verdade — não pode
    // depender de terceiro pra existir.
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

    // 2. DataCrazy via webhook da automação "Aplicação - Webinário".
    // Os nomes aqui têm que casar com os placeholders do bloco de mapeamento
    // de campos da automação — é ela que decide onde cada um pousa, aplica as
    // tags e cria o negócio na etapa AGENDAMENTO.
    // Campo a mais no payload é ignorado sem erro; o que ABORTA a execução é
    // placeholder quebrado no mapeamento (sem a parte "|[Api-request-1]…").
    // Foi isso que derrubou 4 execuções em 2026-09-09 e devolveu {"ok":true}
    // mesmo sem criar lead nenhum.
    let dcOk = false;
    const dcPromise = DATACRAZY_WEBHOOK_URL ? fetch(DATACRAZY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: Seu_Nome_Completo || 'Lead sem nome',
        email: contactEmail,
        phone: WhatsApp,
        company: Nome_da_sua_academia || '',
        // A página não pergunta segmento, mas o fluxo mapeia "Área de atuação"
        // a partir daqui e todo lead deste funil é do mesmo ramo.
        businessArea: 'Academia',
        companySize: Quantos_clientes_ativos_voce_tem_atualmente || '',
        currentSystem: Qual_sistema_de_gestao_voce_utiliza_na_sua_academia_atualmente || '',
        // Os dois nomes de propósito: o mapeamento de "Maior desafio" na
        // automação aponta pra "mainChalleng", sem o "e" final. Mandando as
        // duas grafias o campo chega independente de alguém corrigir o typo
        // lá dentro depois. Campo que a automação não referencia é ignorado
        // sem erro, então isto não custa nada.
        mainChallenge: Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje || '',
        mainChalleng: Qual_e_o_seu_maior_desafio_financeiro_ou_de_gestao_hoje || '',
        // As tags "WB 08" e "Aplicação" são aplicadas dentro da automação
        // (bloco add-tag-action), não daqui.
        utmSource: UTM_Source || '',
        utmCampaign: UTM_Campaign || '',
        utmMedium: UTM_Medium || '',
        utmContent: UTM_Content || '',
        utmTerm: UTM_Term || '',
      }),
    }).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      dcOk = r.ok && data.ok !== false;
      if (!dcOk) console.error('Erro ao criar lead no DataCrazy (webhook, nao-fatal):', data);
    }).catch((err) => {
      console.error('Erro ao criar lead no DataCrazy (webhook, nao-fatal):', err);
    }) : Promise.resolve();

    // 3. Evento Lead pro Meta CAPI (mesmo pixel do site inteiro, independe do CRM)
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
    // response sai, então sem esse await o Sheets/DataCrazy/CAPI corriam risco
    // de nunca completar.
    await Promise.allSettled([sheetsPromise, dcPromise, capiPromise]);

    // success:true sempre que a request foi processada — é o que libera o
    // Calendly na página. O estado do CRM vai em "crm", só pra log.
    return res.status(200).json({ success: true, crm: dcOk ? 'ok' : 'falhou' });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
