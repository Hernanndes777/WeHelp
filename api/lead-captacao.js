// api/lead-captacao.js — Função serverless (Vercel) da página /captacao
// (cadastro rápido de abordagem no corredor da feira). Planilha própria
// "Leads FB Brasil" (env var SHEETS_CAPTACAO_URL) + DataCrazy, mesma tag
// da feira. Sem Meta CAPI: um único tablet/celular cadastra dezenas de
// pessoas diferentes — mandar isso pro pixel envenenaria o aprendizado,
// mesma decisão já tomada pro /estande.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SHEETS_URL = process.env.SHEETS_CAPTACAO_URL;

  try {
    const {
      Nome_Completo, WhatsApp, Email, Area_da_Empresa, Area_da_Empresa_Detalhe, Faixa_alunos,
      utm_source, utm_medium, utm_campaign, referral_source, url: pageUrl,
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

    // 1. Planilha "Leads FB Brasil"
    const sheetsPromise = SHEETS_URL ? fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          received_at: receivedAt,
          Nome_Completo: Nome_Completo || '',
          WhatsApp: WhatsApp,
          Email: Email || '',
          Area_da_Empresa: Area_da_Empresa || '',
          Area_da_Empresa_Detalhe: Area_da_Empresa_Detalhe || '',
          Faixa_alunos: Faixa_alunos || '',
          IP_do_usuario: clientIp,
          Dispositivo: device,
          Referral_Source: referral_source || '',
          Pais_do_usuario: geoCountry,
          Regiao_do_usuario: geoRegion,
          Cidade_do_usuario: geoCity,
          UTM_Source: utm_source || '',
          UTM_Medium: utm_medium || '',
          UTM_Campaign: utm_campaign || '',
          URL: pageUrl || '',
        }),
      }).catch((err) => console.error('Erro ao enviar pro Sheets:', err)) : Promise.resolve();

    // 2. DataCrazy — mesma tag/pipeline/atendente da feira. Best-effort:
    // falha aqui nunca derruba a request, a planilha é a fonte primária.
    const DATACRAZY_URL = 'https://api.g1.datacrazy.io';
    const DATACRAZY_API_KEY = process.env.DATACRAZY_API_KEY;
    const DC_TAG_FITNESS_BRASIL = 'b7d33288-e3ff-4930-82fd-e476adec8950'; // "Evento - Fitness Brasil 2026"
    const DC_STAGE_REALIZAR_CONTATO = 'e9ae521e-13c6-4a68-a0f8-ef7447c8d7dc';
    const DC_ATTENDANT_CAROL = '379b3f67-da07-4cf2-b2fa-d062ee3320eb';

    let dcPromise = Promise.resolve();
    if (DATACRAZY_API_KEY) {
      const dcHeaders = {
        'Authorization': `Bearer ${DATACRAZY_API_KEY}`,
        'Content-Type': 'application/json',
      };
      const notesLines = [];
      const areaFinal = Area_da_Empresa === 'Outro' && Area_da_Empresa_Detalhe
        ? `Outro — ${Area_da_Empresa_Detalhe}` : Area_da_Empresa;
      if (areaFinal) notesLines.push(`Área da empresa: ${areaFinal}`);
      if (Faixa_alunos) notesLines.push(`Clientes ativos: ${Faixa_alunos}`);
      notesLines.push('Origem: Abordagem no corredor (Fitness Brasil 2026)');

      dcPromise = fetch(`${DATACRAZY_URL}/api/v1/leads`, {
        method: 'POST',
        headers: dcHeaders,
        body: JSON.stringify({
          name: Nome_Completo || 'Lead sem nome',
          email: Email || `wp.${phoneDigits}@noemail.invalid`,
          phone: WhatsApp,
          source: 'Feira Fitness Brasil 2026 (Abordagem)',
          notes: notesLines.join('\n'),
          tags: [{ id: DC_TAG_FITNESS_BRASIL }],
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

    await Promise.allSettled([sheetsPromise, dcPromise]);

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Erro geral:', err);
    return res.status(500).json({ error: 'Erro interno', message: err.message });
  }
}
