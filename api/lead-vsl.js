// api/lead-vsl.js — Função serverless (Vercel) do funil de VSL (/vsl e /vsl-academia)
//
// Segue o padrão de captura de 00-base/padrao-captura-lead.md. Serve as DUAS
// variações da página VSL — o campo `origem` ('vsl-geral' | 'vsl-academia')
// diferencia de onde veio, e `Segmento` vira a "Área de atuação".
//
// Destinos do lead:
//   1. Google Sheets  → planilha "[VSL] Aplicação" (Apps Script /exec) — registro de verdade.
//   2. DataCrazy      → API direta (DC_TOKEN): acha/cria lead, marca a tag VSL,
//                       grava a qualificação em notas e cria o negócio na etapa
//                       APLICAÇÃO do pipeline "VSL". Pipeline/tag criados via MCP.
//   3. Meta CAPI      → evento Lead (mesmo pixel do site).
//
// DataCrazy vai pela API DIRETA (não pelo webhook do webinário) porque o
// DC_TOKEN já existe no ambiente (usado por calendly-sync, agenda-lead etc.) e
// isso evita depender de construir uma automação no painel. Tudo best-effort:
// falha em qualquer destino NÃO quebra a resposta — o que libera o /obrigado é
// só a request ter sido processada.

import { createHash } from 'crypto';
const sha256 = (v) => createHash('sha256').update(String(v).toLowerCase().trim()).digest('hex');

// ── DataCrazy (criados via MCP em 2026-09-14) ──
const DC_BASE = 'https://api.datacrazy.io/v1/crm/api/crm';
const DC_TAG_VSL = '2d8a0d42-0691-4820-a351-5e1ffb7e8f84';           // tag "VSL"
const DC_PIPELINE_VSL = '3a36cced-730d-4b77-b6d5-2103ee5846e9';       // pipeline "VSL"
const DC_STAGE_APLICACAO = '5299a81d-f28f-4b52-974f-2f95c8c2b7a2';    // etapa "APLICAÇÃO"

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Apps Script da planilha "[VSL] Aplicação" (aba "Aplicações VSL"). Fixa no
  // código (mesma decisão do lead-sessao-estrategica: env var da Vercel já
  // apontou pra deployment velho e sumiu lead). Vazia = pula o Sheets sem quebrar.
  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwG8Blc8AQjxQ0hHPMGceL6bagD-uoOiyZBZyAxQ5ExI0rC5Uz59WH6wJ-3fpAKWBZX/exec';

  const DC_TOKEN = process.env.DC_TOKEN;
  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  try {
    const {
      Seu_Nome_Completo, E_mail_Profissional, WhatsApp,
      Empresa, Segmento,
      Quantos_clientes_ativos_voce_tem_atualmente,
      Qual_e_o_seu_maior_desafio_hoje,
      Sistema_de_gestao,
      origem,
      UTM_Source, UTM_Medium, UTM_Campaign, UTM_Content, UTM_Term, UTM_Id,
      fbclid, gclid, Referral_Source, URL: pageUrl,
      event_id, fbc, fbp, test_event_code,
    } = req.body;

    if (!WhatsApp) {
      return res.status(400).json({ error: 'WhatsApp obrigatório' });
    }

    const pageId = origem === 'vsl-academia' ? 'vsl-academia' : 'vsl-geral';
    const businessArea = origem === 'vsl-academia' ? 'Academia' : (Segmento || '');

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

    // 1. Sheets — registro de verdade, independente do CRM.
    const sheetsPromise = SHEETS_URL ? fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received_at: receivedAt,
          Seu_Nome_Completo: Seu_Nome_Completo || '',
          E_mail_Profissional: contactEmail,
          WhatsApp: WhatsApp,
          Empresa: Empresa || '',
          Segmento: businessArea,
          Sistema_de_gestao: Sistema_de_gestao || '',
          Quantos_clientes_ativos_voce_tem_atualmente: Quantos_clientes_ativos_voce_tem_atualmente || '',
          Qual_e_o_seu_maior_desafio_hoje: Qual_e_o_seu_maior_desafio_hoje || '',
          Id_da_pagina: pageId,
          UTM_Source: UTM_Source || '', UTM_Medium: UTM_Medium || '',
          UTM_Campaign: UTM_Campaign || '', UTM_Content: UTM_Content || '',
          UTM_Term: UTM_Term || '', UTM_Id: UTM_Id || '',
          fbclid: fbclid || '', gclid: gclid || '',
          Referral_Source: Referral_Source || '', URL: pageUrl || '',
          IP_do_usuario: clientIp, Dispositivo: device,
          Pais_do_usuario: geoCountry, Regiao_do_usuario: geoRegion, Cidade_do_usuario: geoCity,
          Data_da_conversao: receivedAt, Id_do_formulario: event_id || '',
          Politicas_de_privacidade: 'Aceito ao enviar o formulário',
        }),
      }).catch((err) => console.error('Erro ao enviar pro Sheets:', err)) : Promise.resolve();

    // 2. DataCrazy via API direta.
    let dcOk = false;
    const dcPromise = DC_TOKEN ? (async () => {
      const headers = { Authorization: `Bearer ${DC_TOKEN}`, 'Content-Type': 'application/json' };

      // 2a. acha ou cria o lead (busca por telefone; nunca duplica quem já existe).
      let leadId;
      const searchTerm = phoneDigits || contactEmail;
      if (searchTerm) {
        const s = await fetch(`${DC_BASE}/leads?search=${encodeURIComponent(searchTerm)}&limit=1`, { headers });
        const sd = await s.json().catch(() => ({}));
        if (sd.data && sd.data.length) leadId = sd.data[0].id;
      }
      let isNew = false;
      if (!leadId) {
        const c = await fetch(`${DC_BASE}/leads`, {
          method: 'POST', headers,
          body: JSON.stringify({
            name: Seu_Nome_Completo || 'Lead sem nome',
            ...(E_mail_Profissional ? { email: E_mail_Profissional } : {}),
            ...(phoneDigits ? { phone: `+${phoneDigits}` } : {}),
            ...(Empresa ? { company: Empresa } : {}),
          }),
        });
        if (!c.ok) throw new Error(`criar lead: ${await c.text()}`);
        const cd = await c.json();
        leadId = cd.id || cd.data?.id;
        isNew = true;
      }
      if (!leadId) throw new Error('sem leadId');

      // 2b. marca a tag VSL sem remover as existentes (mesmo padrão do calendly-sync).
      const g = await fetch(`${DC_BASE}/leads/${leadId}`, { headers });
      const lead = await g.json().catch(() => ({}));
      const existingTags = Array.isArray(lead.tags) ? lead.tags : [];
      if (!existingTags.some((t) => t.id === DC_TAG_VSL)) {
        const merged = [...existingTags.map((t) => ({ id: t.id })), { id: DC_TAG_VSL }];
        await fetch(`${DC_BASE}/leads/${leadId}`, { method: 'PATCH', headers, body: JSON.stringify({ tags: merged }) });
      }

      // 2c. grava a qualificação em notas (contorno do bug de additionalFields do
      // DataCrazy — ver histórico em lead-sessao-estrategica.js). Best-effort.
      const notas = [
        `[VSL] Origem: ${pageId}`,
        `Segmento/Área: ${businessArea || '-'}`,
        `Clientes/alunos: ${Quantos_clientes_ativos_voce_tem_atualmente || '-'}`,
        `Maior desafio: ${Qual_e_o_seu_maior_desafio_hoje || '-'}`,
        `Sistema: ${Sistema_de_gestao || '-'}`,
        `UTM: source=${UTM_Source || '-'} campaign=${UTM_Campaign || '-'} content=${UTM_Content || '-'}`,
      ].join('\n');
      try {
        await fetch(`${DC_BASE}/leads/${leadId}`, { method: 'PATCH', headers, body: JSON.stringify({ notes: notas }) });
      } catch (e) { /* nao-fatal */ }

      // 2d. cria o negócio na etapa APLICAÇÃO do pipeline VSL. Só pra lead novo,
      // pra não empilhar cards duplicados quando a mesma pessoa reenvia. Best-effort.
      if (isNew) {
        try {
          await fetch(`${DC_BASE}/businesses`, {
            method: 'POST', headers,
            body: JSON.stringify({ leadId, stageId: DC_STAGE_APLICACAO, pipelineId: DC_PIPELINE_VSL }),
          });
        } catch (e) { /* nao-fatal */ }
      }

      dcOk = true;
    })().catch((err) => { console.error('DataCrazy (nao-fatal):', err && err.message ? err.message : err); }) : Promise.resolve();

    // 3. Evento Lead pro Meta CAPI (mesmo pixel do site inteiro).
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

    await Promise.allSettled([sheetsPromise, dcPromise, capiPromise]);

    return res.status(200).json({ success: true, crm: dcOk ? 'ok' : 'falhou' });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
