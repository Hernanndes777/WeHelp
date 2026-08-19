// api/agenda-lead.js — Serverless function para a página /agenda-cs
// GET  ?date=YYYY-MM-DD  → retorna quantos agendamentos existem por horário nesse dia
// POST { date, time, nome, whatsapp, academia, interesse } → confirma o agendamento:
//   1. Revalida se o horário ainda tem vaga (máx 2, contra a planilha)
//   2. Busca o lead no DataCrazy por telefone — se achar, só adiciona a tag Agendado_Feira
//      (nunca cria lead novo — os leads da feira já existem no CRM)
//   3. Grava a linha na planilha (Google Sheets via Apps Script), inclusive se não achou o lead
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
const MAX_PER_SLOT = 2;
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
    const { date, time, nome, whatsapp, academia, interesse } = req.body || {};

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
      // 1. Checagem rápida de capacidade (evita trabalho desnecessário) — a checagem
      //    que realmente vale (contra corrida entre requisições simultâneas) acontece
      //    dentro do Apps Script, protegida por lock, no passo 3.
      const counts = await getCountsForDate(date, AGENDA_SHEET_URL);
      if ((counts[time] || 0) >= MAX_PER_SLOT) {
        return res.status(409).json({ error: 'Horário lotado' });
      }

      // 2. Busca lead existente no DataCrazy e marca a tag (nunca cria lead novo)
      const phoneDigits = whatsapp.replace(/\D/g, '');
      let leadStatus = 'não encontrado';
      let leadId = '';

      const matchedLead = await findLeadByPhone(phoneDigits, DC_TOKEN);
      if (matchedLead) {
        const tagsToAdd = [TAG_AGENDADO];
        if (TAG_INTERESSE[interesse]) tagsToAdd.push(TAG_INTERESSE[interesse]);
        await addTags(matchedLead.id, tagsToAdd, DC_TOKEN);
        leadStatus = 'encontrado';
        leadId = matchedLead.id;
      }

      // 3. Grava na planilha — fonte de verdade final. O Apps Script usa um lock
      //    pra garantir que 2 gravações simultâneas não furem o limite de vagas,
      //    e só respondemos sucesso ao cliente se ele confirmar a escrita.
      const sheetRes = await fetch(AGENDA_SHEET_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, nome, whatsapp, academia, interesse, leadStatus, leadId }),
      });
      const sheetData = await sheetRes.json();

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
async function addTags(leadId, tagsToAdd, token) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const getRes = await fetch(`${DC_BASE}/leads/${leadId}`, { headers });
  const lead = await getRes.json();
  const existingTags = Array.isArray(lead.tags) ? lead.tags : [];
  const existingIds = new Set(existingTags.map((t) => t.id));

  const newTags = tagsToAdd.filter((t) => !existingIds.has(t.id));
  if (newTags.length === 0) return;

  const merged = [...existingTags.map((t) => ({ id: t.id })), ...newTags];

  await fetch(`${DC_BASE}/leads/${leadId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ tags: merged }),
  });
}
