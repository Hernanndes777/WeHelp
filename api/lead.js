// api/lead.js — Função serverless (Vercel) que cria o contato no ActiveCampaign
// A API Key fica segura aqui no servidor, nunca aparece no navegador.

// [NEW] Crypto para hashar dados antes de enviar ao CAPI da Meta
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
  const LIST_ID = 20;           // Lista "Webinário"
  const TAG_ID = 80;            // Tag "Webinário #006"
  const FIELD_CLIENTES = 27;    // Campo "Quantos alunos ativos você tem atualmente?"
  const FIELD_UTM_SOURCE = 28;
  const FIELD_UTM_CAMPAIGN = 29;
  const FIELD_UTM_MEDIUM = 30;

  // [NEW] CAPI config — adicione estas variáveis no painel da Vercel:
  // CAPI_ENDPOINT = URL do endpoint Meta CAPI direto ou Stape
  //   Direto Meta: https://graph.facebook.com/v26.0/1106401696374974/events (confira a versão atual em developers.facebook.com/docs/graph-api/changelog)
  //   Via Stape:   https://capig.stape.pm/SEU_CONTAINER_ID/events (verifique no painel do Stape)
  // META_ACCESS_TOKEN = token de acesso do pixel (Events Manager > Configurações > Token da API)
  const CAPI_ENDPOINT = process.env.CAPI_ENDPOINT;
  const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!AC_URL || !AC_KEY) {
    return res.status(500).json({ error: 'Configuração ausente no servidor' });
  }

  try {
    const {
      nome, email, whatsapp, clientes,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id,
      fbclid, gclid, referral_source, url,   // [DATA] modelo de captura completa
      event_id, fbc, fbp, test_event_code,  // [NEW] campos do pixel
    } = req.body;

    if (!whatsapp) {
      return res.status(400).json({ error: 'WhatsApp obrigatório' });
    }

    // [DATA] Dados capturados no servidor — não dependem do que o navegador manda,
    // então funcionam mesmo se o JS do cliente falhar em algo.
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
                     || req.socket?.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const device = /Mobile|Android|iPhone|iPad/i.test(userAgent) ? 'Mobile' : 'Desktop';

    // A Vercel já resolve geolocalização por IP nos headers da Edge Network —
    // não precisa de nenhum serviço externo pra isso.
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

    // Monta campos personalizados
    const fieldValues = [];
    if (clientes)     fieldValues.push({ field: String(FIELD_CLIENTES), value: clientes });
    if (utm_source)   fieldValues.push({ field: String(FIELD_UTM_SOURCE), value: utm_source });
    if (utm_medium)   fieldValues.push({ field: String(FIELD_UTM_MEDIUM), value: utm_medium });
    if (utm_campaign) fieldValues.push({ field: String(FIELD_UTM_CAMPAIGN), value: utm_campaign });

    // AC exige email para criar contato — usamos o telefone como identificador único
    const phoneDigits = whatsapp.replace(/\D/g, '');
    const contactEmail = email || `wp.${phoneDigits}@noemail.invalid`;

    // 1. Cria ou atualiza o contato
    const syncRes = await fetch(`${AC_URL}/api/3/contact/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contact: {
          email: contactEmail,
          firstName: nome || '',
          phone: whatsapp,
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

    // 2. Adiciona à lista Webinário
    await fetch(`${AC_URL}/api/3/contactLists`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contactList: { list: LIST_ID, contact: contactId, status: 1 },
      }),
    });

    // 3. Adiciona a tag "Webinário #005"
    await fetch(`${AC_URL}/api/3/contactTags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contactTag: { contact: contactId, tag: TAG_ID },
      }),
    });

    // 4. Envia para o Google Sheets — o Apps Script (doPost) escreve por POSIÇÃO
    //    fixa, não por nome de chave, e ignora o cabeçalho da linha 1. As chaves
    //    abaixo têm que bater com o que o script lê (data.nome, data.email...),
    //    nessa ordem, senão vira coluna vazia. Ver 00-base/padrao-captura-lead.md.
    await fetch('https://script.google.com/macros/s/AKfycbxXpEdOaLR-Z8JOujEW5VGvFbxWHOg2vMkqeQXQAeqjViPJw_61XpLukGdnFzXd_Oym/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: nome,
        email: contactEmail,   // [FIX] era "email" vazio — agora sempre tem o email gerado
        whatsapp: whatsapp,
        clientes: clientes,
        utm_source: utm_source || '',
        utm_medium: utm_medium || '',
        utm_campaign: utm_campaign || '',
        utm_content: utm_content || '',
        utm_term: utm_term || '',
        fbclid: fbclid || '',
        gclid: gclid || '',
        // [DATA] campos novos — só populam depois que o Apps Script for
        // atualizado (ver instrução separada). Até lá o script ignora essas
        // chaves silenciosamente, sem quebrar nada.
        utm_id: utm_id || '',
        ip: clientIp,
        dispositivo: device,
        pais: geoCountry,
        regiao: geoRegion,
        cidade: geoCity,
        referral_source: referral_source || '',
        url: url || '',
      }),
    }).catch(() => {}); // não trava se o Sheets falhar

    // 5. [NEW] Envia evento Lead para Meta CAPI server-side
    // Isso cria um segundo sinal (server-side) que deduplica com o pixel do browser,
    // melhorando o EMQ (Event Match Quality) porque envia telefone e email hasheados.
    if (CAPI_ENDPOINT && META_ACCESS_TOKEN) {
      const capiEventId = event_id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const referer = req.headers['referer'] || url || '';

      const capiPayload = {
        data: [{
          event_name: 'Lead',
          event_time: Math.floor(Date.now() / 1000),
          event_id: capiEventId,      // mesmo ID do browser pixel → deduplicação
          event_source_url: referer,
          action_source: 'website',
          user_data: {
            // Valores hasheados em SHA-256 conforme exigido pela Meta
            em: [sha256(contactEmail)],
            ph: [sha256(phoneDigits)],   // formato E.164 sem +, ex: 5566999536241
            // Dados de contexto do browser (não precisam de hash)
            client_ip_address: clientIp,
            client_user_agent: userAgent,
            // Cookies do pixel — aumentam significativamente o match quality
            ...(fbc ? { fbc } : {}),
            ...(fbp ? { fbp } : {}),
          },
          custom_data: { value: 1, currency: 'BRL' },
        }],
        access_token: META_ACCESS_TOKEN,
      };

      // Suporte a test_event_code para testar no Events Manager
      if (test_event_code) capiPayload.test_event_code = test_event_code;

      fetch(CAPI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capiPayload),
      }).catch((err) => console.error('CAPI error:', err));
    }

    return res.status(200).json({ success: true, contactId });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
