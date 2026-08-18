// api/calendly-sync.js
// Vercel Cron: roda a cada 5 minutos, puxa novos agendamentos do Calendly → DataCrazy
// Configurar no Vercel (Settings → Environment Variables):
//   CALENDLY_TOKEN  — Personal Access Token do Calendly
//   DC_TOKEN        — Chave de API do DataCrazy (dc_eyJ...)
//   CRON_SECRET     — Qualquer string aleatória para proteger a rota

const CALENDLY_ORG = "https://api.calendly.com/organizations/21625ea6-0ed2-4ba5-9040-ec6e48d255a6";
const DC_BASE = "https://api.datacrazy.io/v1/crm/api/crm";
const TAG_AGENDADO = { id: "fd7363a5-5b78-4e54-b6c9-bc0617acef8d" }; // Agendado_Feira
const LOOKBACK_MS = 10 * 60 * 1000; // 10 minutos (cron roda a cada 5 → janela dupla)

export default async function handler(req, res) {
  // Protege a rota — Vercel Cron envia Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers["authorization"] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const CALENDLY_TOKEN = process.env.CALENDLY_TOKEN;
  const DC_TOKEN = process.env.DC_TOKEN;

  if (!CALENDLY_TOKEN || !DC_TOKEN) {
    return res.status(500).json({ error: "CALENDLY_TOKEN ou DC_TOKEN não configurados" });
  }

  const minCreatedAt = new Date(Date.now() - LOOKBACK_MS).toISOString();

  // 1. Busca eventos recentes no Calendly
  // min_start_time = ontem para pegar eventos futuros recém-agendados
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const eventsUrl = new URL("https://api.calendly.com/scheduled_events");
  eventsUrl.searchParams.set("organization", CALENDLY_ORG);
  eventsUrl.searchParams.set("sort", "start_time:asc");
  eventsUrl.searchParams.set("count", "50");
  eventsUrl.searchParams.set("status", "active");
  eventsUrl.searchParams.set("min_start_time", yesterday);

  const eventsRes = await fetch(eventsUrl.toString(), {
    headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` },
  });
  const eventsData = await eventsRes.json();

  if (!eventsData.collection) {
    return res.status(502).json({ error: "Calendly API error", details: eventsData });
  }

  // Filtra apenas os criados nos últimos 10 minutos
  const recent = eventsData.collection.filter((e) => e.created_at >= minCreatedAt);

  const results = [];

  for (const event of recent) {
    const eventUuid = event.uri.split("/").pop();

    // 2. Busca os convidados deste evento
    const invRes = await fetch(
      `https://api.calendly.com/scheduled_events/${eventUuid}/invitees`,
      { headers: { Authorization: `Bearer ${CALENDLY_TOKEN}` } }
    );
    const invData = await invRes.json();

    for (const invitee of invData.collection || []) {
      const name = invitee.name || "Sem nome";
      const email = invitee.email || "";

      // Extrai telefone das respostas do formulário
      const phoneAnswer = (invitee.questions_and_answers || []).find((q) =>
        /telefone|whatsapp|phone/i.test(q.question)
      );
      const phone = phoneAnswer?.answer?.replace(/\D/g, "") || "";

      try {
        const leadId = await upsertLead({ name, email, phone }, DC_TOKEN);
        if (leadId) {
          await addTag(leadId, DC_TOKEN);
          results.push({ name, email, phone, leadId, ok: true });
        }
      } catch (err) {
        results.push({ name, email, error: err.message, ok: false });
      }
    }
  }

  return res.status(200).json({
    checkedAt: new Date().toISOString(),
    window: `últimos ${LOOKBACK_MS / 60000} min`,
    eventsFound: recent.length,
    results,
  });
}

// Busca lead por telefone ou email; cria se não existir. Retorna o ID.
async function upsertLead({ name, email, phone }, token) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const searchTerm = phone || email;
  if (searchTerm) {
    const searchRes = await fetch(
      `${DC_BASE}/leads?search=${encodeURIComponent(searchTerm)}&limit=1`,
      { headers }
    );
    const searchData = await searchRes.json();
    if (searchData.data?.length > 0) {
      return searchData.data[0].id;
    }
  }

  // Lead não existe — cria
  const createRes = await fetch(`${DC_BASE}/leads`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone: `+${phone}` } : {}),
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Falha ao criar lead: ${err}`);
  }

  const created = await createRes.json();
  return created.id || created.data?.id;
}

// Adiciona a tag Agendado_Feira sem remover as tags existentes.
async function addTag(leadId, token) {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // Busca tags atuais do lead
  const getRes = await fetch(`${DC_BASE}/leads/${leadId}`, { headers });
  const lead = await getRes.json();

  const existingTags = Array.isArray(lead.tags) ? lead.tags : [];

  // Não adiciona se a tag já estiver presente
  if (existingTags.some((t) => t.id === TAG_AGENDADO.id)) return;

  const merged = [...existingTags.map((t) => ({ id: t.id })), TAG_AGENDADO];

  await fetch(`${DC_BASE}/leads/${leadId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ tags: merged }),
  });
}
