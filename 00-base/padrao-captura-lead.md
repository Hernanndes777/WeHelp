# Padrão de captura de lead — modelo pra todas as LPs com formulário

> Implementado pela primeira vez em `webinario/` + `api/lead.js` (2026-08-01). Toda LP nova com formulário deve seguir esse mesmo padrão — é o nível de dado que uma ferramenta tipo GreatPages captura por padrão, e a gente replica manualmente aqui.

## Por que isso importa

Quanto mais dado de contexto value junto com o lead, melhor: mais fácil auditar campanha, mais fácil debugar duplicidade, e principalmente **melhora o Event Match Quality (EMQ) do Meta CAPI** — o que reduz custo por resultado nos anúncios.

## Campos que toda LP com formulário deve capturar

### Visíveis (o usuário preenche)
Definidos pela LP — nome, WhatsApp/e-mail, pergunta de qualificação etc.

### Ocultos — capturados automaticamente, sem o usuário perceber

| Campo | De onde vem | Onde captar |
|---|---|---|
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_id`, `utm_term`, `utm_content` | Query string da URL | Front-end, `URLSearchParams(location.search)` |
| `fbclid` | Query string (clique vindo de anúncio Meta) | Front-end, mesma URLSearchParams |
| `gclid` | Query string (clique vindo de anúncio Google) | Front-end, mesma URLSearchParams |
| `referral_source` | De onde a pessoa veio antes da LP | Front-end, `document.referrer` |
| `url` | URL completa com querystring, no momento do envio | Front-end, `location.href` |
| `event_id` | ID único do evento, gerado e persistido em `sessionStorage` | Front-end — usado pra deduplicar Pixel (browser) com CAPI (server) |
| `fbc` / `fbp` | Cookies do Meta Pixel | Front-end, `document.cookie` |
| IP do usuário | Header da requisição | **Backend** — `req.headers['x-forwarded-for']` |
| Dispositivo (Mobile/Desktop) | User-Agent | **Backend** — regex simples no header `user-agent` |
| País / Região / Cidade | Geolocalização por IP | **Backend** — headers `x-vercel-ip-country`, `x-vercel-ip-country-region`, `x-vercel-ip-city` (a **Vercel já resolve isso de graça**, não precisa de serviço externo tipo ipapi/MaxMind) |
| `received_at` / data da conversão | Timestamp do servidor no momento do POST | **Backend** — `new Date().toISOString()` |

## Regra de ouro do fbc

Se o cookie `_fbc` não existir (bloqueio de cookie, primeira visita) mas veio `fbclid` na URL, **reconstrua o `_fbc`** no formato que a Meta exige, em vez de simplesmente não mandar nada:

```js
const resolvedFbc = fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : '');
```

Isso evita perder o sinal de matching só porque o cookie não foi setado a tempo.

## Pra onde esses dados vão

1. **ActiveCampaign** — só os campos que já têm Custom Field ID configurado (hoje: clientes, utm_source, utm_medium, utm_campaign). Se quiser mais campos lá dentro (fbclid, ip, device etc), **precisa criar o Custom Field no AC primeiro** e me passar o ID — não dá pra inventar.
2. **Google Sheets** (via Apps Script) — payload completo, todas as chaves acima, nomeadas exatamente igual ao cabeçalho da planilha existente (`Nome`, `E_mail`, `WhatsApp`, `fbclid`, `IP_do_usuario`, `Pais_do_usuario` etc).
3. **Meta CAPI** — email/telefone hasheados (SHA-256) + IP + User-Agent + fbc/fbp + event_id (dedup com o Pixel do navegador).

## Referência de implementação

Ver `api/lead.js` (função completa) e a seção final de `webinario/index.html` (onde o objeto `data` é montado antes do fetch). Copiar essa estrutura pra qualquer LP nova que tenha formulário.
