# WeHelp — Landing Pages

Repositório único das landing pages de marketing da **WeHelp** — plataforma de Experiência do Cliente (CX) com 3 módulos: Pesquisa de Satisfação, Módulo de Retenção de Churn e Módulo de Ticket. Modelo replicado do repositório da SouFit (`00-base/` como biblioteca, LPs na raiz, deploy automático a cada push).

> Apps e ferramentas (dashboard interno, calculadora de churn) **não** ficam aqui — moram nos próprios repositórios (`wehelp-dashboard`, `wehelp-churn-calculator`). Este repo é só landing page estática.

---

## Mapa do repositório

| Pasta | O que tem | Vai pro site? |
|---|---|---|
| `00-base/` | Biblioteca — produtos/módulos, personas por segmento, jornada por funil, design system | ❌ Interna |
| `retencao/`, `ativacao/`, `california/`, `webinario/`, `webinario-whatsapp/` | Landing pages publicadas | ✅ Sim |
| `api/lead.js` | Function serverless — captura lead do `webinario/` (ActiveCampaign + Google Sheets + Meta CAPI) | ✅ Sim (executa server-side) |
| `shared/` | Assets compartilhados entre LPs (logo etc) | ✅ Sim |
| `lp-taxonomy.json` | Catálogo de LPs + convenção de nomenclatura | ❌ Interna (doc) |
| `PROCESSO.md` | Checklist mestre pra criar LP nova | ❌ Interna (doc) |

## Por onde começar

### Vou criar uma LP nova
→ Vá direto pro [`PROCESSO.md`](PROCESSO.md).

### Vou consultar o que cada módulo faz
→ [`00-base/produtos/INDICE.md`](00-base/produtos/INDICE.md)

### Vou escrever copy educativa sobre NPS (LP de topo/meio de funil)
→ [`00-base/metodologia-nps.md`](00-base/metodologia-nps.md)

### Vou consultar persona / dor / objeção de algum segmento
→ [`00-base/personas/personas.md`](00-base/personas/personas.md) e [`00-base/personas/jornada.md`](00-base/personas/jornada.md)

### Vou aplicar cor/fonte/logo
→ [`00-base/design-system/design-system-wehelp.md`](00-base/design-system/design-system-wehelp.md) — **ainda provisório**, ver seção de pendências no próprio arquivo.

---

## Deploy

Publicado em `lp.wehelpsoftware.com` via **Vercel**, conectada a este repo no GitHub. Todo push/merge na `main` publica automaticamente — **sem passo manual, sem GitHub Actions** (diferente da SouFit, que usa VPS própria com rsync).

Cada pasta na raiz vira uma rota: `retencao/index.html` → `lp.wehelpsoftware.com/retencao`, e assim por diante.

## Histórico

- **2026-07-29** — Repo criado consolidando 3 LPs que antes viviam em repositórios separados mas compartilhavam sem querer o mesmo remoto do GitHub (`lp-beta`), competindo pelo mesmo `index.html`. Migradas pra pastas próprias: `retencao/` (era `LP-Beta`), `ativacao/` (era `LP-Beta-ativacao`), `california/` (era `lp-wehelp-california`). Os repositórios antigos não foram apagados — ver seção "Repositórios antigos" abaixo.
- **2026-07-31** — `lp.wehelpsoftware.com` conectado e validado em produção. Migradas mais 2 LPs: `webinario/` (era repo `lp-webinario`, tem lead capture via `api/lead.js`) e `webinario-whatsapp/` (era repo `LP-wb-redirect`, sem backend, só redireciona pro grupo do WhatsApp).

## Env vars necessárias

O `api/lead.js` (usado pela LP `webinario/`) precisa destas variáveis configuradas em **Settings → Environment Variables** no projeto Vercel deste repo — sem elas a captura de lead falha com erro 500:

| Variável | Pra quê |
|---|---|
| `AC_URL` | URL da conta ActiveCampaign |
| `AC_KEY` | API Key do ActiveCampaign |
| `CAPI_ENDPOINT` | Endpoint da Meta Conversions API (direto ou via Stape) |
| `META_ACCESS_TOKEN` | Token de acesso do Pixel (Events Manager → Configurações → Token da API) |

Esses valores já existiam configurados no projeto Vercel antigo (`lp-webinario`) — copiar de lá, não são segredo novo.

## Repositórios antigos (não apagar ainda)

`LP-Beta`, `LP-Beta-ativacao`, `lp-wehelp-california`, `LP-Webinario` e `LP-wb-redirect` continuam existindo localmente e no GitHub. Depois que este repo novo (`wehelp`) estiver publicado e validado em produção pras 5 LPs, eles podem ser arquivados. Não apague antes de confirmar que tudo migrou certo.
