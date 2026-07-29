# WeHelp — Landing Pages

Repositório único das landing pages de marketing da **WeHelp** (software de NPS/pesquisa de satisfação pra reduzir churn). Modelo replicado do repositório da SouFit (`00-base/` como biblioteca, LPs na raiz, deploy automático a cada push).

> Apps e ferramentas (dashboard interno, calculadora de churn) **não** ficam aqui — moram nos próprios repositórios (`wehelp-dashboard`, `wehelp-churn-calculator`). Este repo é só landing page estática.

---

## Mapa do repositório

| Pasta | O que tem | Vai pro site? |
|---|---|---|
| `00-base/` | Biblioteca — personas por segmento, jornada por funil, design system | ❌ Interna |
| `retencao/`, `ativacao/`, `california/` | Landing pages publicadas | ✅ Sim |
| `shared/` | Assets compartilhados entre LPs (logo etc) | ✅ Sim |
| `lp-taxonomy.json` | Catálogo de LPs + convenção de nomenclatura | ❌ Interna (doc) |
| `PROCESSO.md` | Checklist mestre pra criar LP nova | ❌ Interna (doc) |

## Por onde começar

### Vou criar uma LP nova
→ Vá direto pro [`PROCESSO.md`](PROCESSO.md).

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

## Repositórios antigos (não apagar ainda)

`LP-Beta`, `LP-Beta-ativacao` e `lp-wehelp-california` continuam existindo localmente e no GitHub. Depois que este repo novo (`wehelp-lp`) estiver publicado e validado em produção, eles podem ser arquivados. Não apague antes de confirmar que tudo migrou certo.
