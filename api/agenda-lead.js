// api/agenda-lead.js — Serverless function para a página /agenda-cs
// GET  ?date=YYYY-MM-DD  → retorna quantos agendamentos existem por horário nesse dia
// POST { date, time, nome, whatsapp, academia, interesse } → confirma o agendamento:
//   1. Busca o lead no DataCrazy por telefone (nunca cria lead novo)
//   2. Grava na planilha (fonte de verdade — capacidade de 2/horário é validada com
//      lock dentro do próprio Apps Script) e marca as tags no DataCrazy em paralelo
//
// Variáveis de ambiente (Vercel):
//   DC_TOKEN          — chave de API do DataCrazy
//   AGENDA_SHEET_URL   — URL /exec do Apps Script (Extensões > Apps Script > Implantar > App da Web)

const DC_BASE = "https://api.datacrazy.io/v1/crm/api/crm";
const TAG_AGENDADO = { id: "fd7363a5-5b78-4e54-b6c9-bc0617acef8d" }; // Agendado_Feira
const TAG_INTERESSE = {
  'Consultoria sobre a Plataforma': { id: '360c5420-9d19-4f55-bbf2-f43489300d0d' }, // Interesse_Consultoria
  'Conhecer o Novo Módulo de Retenção': { id: '4da7e5db-ec13-4ef8-bf90-429e90a28afc' }, // Interesse_Upsell
};
const VALID_DATES = ['2026-08-27', '2026-08-28', '2026-08-29'];
const BLOCKED = {
  '2026-08-28': ['17:00', '17:30', '18:00', '18:30'], // Plenária do Selo de Excelência
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const DC_TOKEN = process.env.DC_TOKEN;
  const AGENDA_SHEET_URL = process.env.AGENDA_SHEET_URL;

  if (!DC_TOKEN || !AGENDA_SHEET_URL) {
    return res.status(500).json({ error: 'DC_TOKEN ou AGENDA_SHEET_URL não configurados' });
  }

  if (req.method === 'GET') {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date obrigatório' });

    try {
      const counts = await getCountsForDate(date, AGENDA_SHEET_URL);
      return res.status(200).json({ counts });
    } catch (err) {
      return res.status(502).json({ error: 'Falha ao ler agenda', message: err.message });
    }
  }

  if (req.method === 'POST') {
    const { date, time, nome, whatsapp, academia, interesse, detalhes } = req.body || {};

    if (!date || !time || !nome || !whatsapp || !academia || !interesse) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
    }

    if (!VALID_DATES.includes(date)) {
      return res.status(400).json({ error: 'Data fora do período da feira' });
    }

    if ((BLOCKED[date] || []).includes(time)) {
      return res.status(409).json({ error: 'Horário bloqueado' });
    }

    try {
      // 1. Busca lead existente no DataCrazy (nunca cria lead novo). A checagem de
      //    capacidade real (contra corrida entre requisições simultâneas) acontece
      //    dentro do Apps Script, protegida por lock, no passo 2 — não precisamos
      //    de uma pré-checagem aqui, só atrasaria a resposta.
      const phoneDigits = whatsapp.replace(/\D/g, '');
      const matchedLead = await findLeadByPhone(phoneDigits, DC_TOKEN);
      const leadStatus = matchedLead ? 'encontrado' : 'não encontrado';
      const leadId = matchedLead ? matchedLead.id : '';

      // 2. Grava na planilha (fonte de verdade — trava via lock no Apps Script) e,
      //    em paralelo, marca as tags no DataCrazy usando o lead que já veio da
      //    busca acima (sem round-trip extra pra buscar as tags de novo). As duas
      //    chamadas saem juntas e são aguardadas juntas — não é "fire and forget"
      //    (a função serverless pode ser encerrada antes de uma promise solta
      //    terminar), mas a tag é best-effort: se falhar, não derruba o agendamento.
      const sheetPromise = fetch(AGENDA_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, nome, whatsapp, academia, interesse, detalhes: detalhes || '', leadStatus, leadId }),
      }).then((r) => r.json());

      const tagPromise = matchedLead
        ? addTags(matchedLead, [TAG_AGENDADO, TAG_INTERESSE[interesse]].filter(Boolean), DC_TOKEN)
        : Promise.resolve();

      const [sheetResult, tagResult] = await Promise.allSettled([sheetPromise, tagPromise]);

      if (tagResult.status === 'rejected') {
        console.error('Falha ao marcar tag (não bloqueia o agendamento):', tagResult.reason);
      }

      if (sheetResult.status === 'rejected') {
        throw sheetResult.reason;
      }
      const sheetData = sheetResult.value;

      if (!sheetData.success) {
        if (sheetData.error === 'full') {
          return res.status(409).json({ error: 'Horário lotado' });
        }
        throw new Error(sheetData.error || 'Falha ao gravar na planilha');
      }

      return res.status(200).json({ success: true, leadStatus });
    } catch (err) {
      console.error('Erro agenda-lead:', err);
      return res.status(500).json({ error: 'Erro interno', message: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Lê a planilha (via Apps Script doGet) e conta quantos agendamentos existem por horário no dia.
async function getCountsForDate(date, sheetUrl) {
  const url = `${sheetUrl}?date=${encodeURIComponent(date)}`;
  const res = await fetch(url);
  const data = await res.json();
  const rows = data.data || [];

  const counts = {};
  for (const row of rows) {
    const t = row['Horário'];
    if (!t) continue;
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

// Busca no DataCrazy um lead cujo telefone bata com os últimos 8 dígitos informados.
async function findLeadByPhone(phoneDigits, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const res = await fetch(`${DC_BASE}/leads?search=${encodeURIComponent(phoneDigits)}&limit=10`, { headers });
  const data = await res.json();

  const last8 = phoneDigits.slice(-8);
  const match = (data.data || []).find((lead) => {
    const leadPhone = (lead.phone || lead.rawPhone || '').replace(/\D/g, '');
    return leadPhone.slice(-8) === last8;
  });

  return match || null;
}

// Adiciona as tags (Agendado_Feira + interesse) sem remover as tags existentes do lead.
// Recebe o lead já carregado (a busca por telefone já retorna as tags atuais —
// evita um GET extra só pra reler o que já temos em mãos).
async function addTags(lead, tagsToAdd, token) {
  const existingTags = Array.isArray(lead.tags) ? lead.tags : [];
  const existingIds = new Set(existingTags.map((t) => t.id));

  const newTags = tagsToAdd.filter((t) => !existingIds.has(t.id));
  if (newTags.length === 0) return;

  const merged = [...existingTags.map((t) => ({ id: t.id })), ...newTags];

  await fetch(`${DC_BASE}/leads/${lead.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: merged }),
  });
}
