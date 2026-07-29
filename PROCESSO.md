# Processo de Criação de LP — WeHelp

> Documento mestre. Abra este arquivo ANTES de começar qualquer LP nova.
> Adaptado do processo da SouFit — mesma lógica, ajustado pro que a WeHelp já tem hoje.

---

## Fontes da verdade (leia antes de começar)

| O quê | Onde | Quando usar |
|---|---|---|
| Catálogo de produtos (o que cada módulo faz, features, copy validada) | `00-base/produtos/INDICE.md` | Etapa 1 (briefing) |
| Personas por segmento (dor, como a WeHelp resolve, canais) | `00-base/personas/personas.md` | Etapa 1 (briefing) |
| Jornada por funil (Topo/Meio/Fundo — o que a pessoa já sabe) | `00-base/personas/jornada.md` | Etapa 1 e 2 |
| Catálogo de LPs já feitas + convenção de slug | `lp-taxonomy.json` | Antes de começar — checar se já tem parecida |
| Design system (cor, logo, tom) | `00-base/design-system/design-system-wehelp.md` | Etapa 4 (build) — **ainda provisório, confirmar com marca oficial** |
| Assets compartilhados (logo etc) | `shared/` | Etapa 4 (build) |
| LPs já no ar (reaproveitar componentes) | `retencao/`, `ativacao/`, `california/` | Etapa 4 (build) |

---

## Checklist

### 1. Briefing (10 min)
- [ ] **Produto/módulo**: Pesquisa de Satisfação / Módulo de Retenção de Churn / Módulo de Ticket (ver `00-base/produtos/INDICE.md`)
- [ ] **Segmento**: fitness / saas / saude / hospitalar / corporativo / genérico (ver `personas.md`)
- [ ] **Tipo de LP**: venda / ativação / captura / parceria / webinário
- [ ] **Estágio de funil**: topo / meio / fundo (ver `jornada.md` — define quanto precisa educar antes de vender)
- [ ] **Tráfego de origem**: Meta Ads / orgânico / parceria/afiliado / e-mail / webinar
- [ ] **Oferta fechada**: o que exatamente está sendo oferecido (teste grátis, demo, ativação, plano). Trial padrão é **7 dias grátis** — em LP de parceria/campanha específica é válido negociar um trial maior (ex: `california/` usa 15 dias) como diferencial da oferta, desde que combinado antes com quem aprova.
- [ ] **Dor principal + objeção mais provável** (puxar de `jornada.md` pro segmento certo)
- [ ] **Slug**: `{segmento}-{tipo}-{versão}` — ver `lp-taxonomy.json`

### 2. Estrutura (por tipo de LP)

- **Venda direta** (ex: `retencao/`): hero → dor/agitação → como a WeHelp resolve → prova social → oferta → CTA
- **Ativação** (ex: `ativacao/`): hero direto no benefício → passo a passo simples → CTA único
- **Parceria/afiliado** (ex: `california/`): hero com o parceiro nomeado → prova social do setor → oferta com prazo → CTA
- **Captura/topo de funil**: hero educativo → 3 benefícios → prova social → formulário

### 3. Copy
- [ ] Puxar dor + "como a WeHelp resolve" de `personas.md` pro segmento certo
- [ ] Puxar objeções de `jornada.md` pro estágio de funil certo e responder cada uma na copy
- [ ] Usar um dos "ângulos validados" de `personas.md` como base do headline

### 4. Design + assets
- [ ] Aplicar cores de `design-system-wehelp.md` (ainda provisório — confirmar antes de finalizar arte)
- [ ] Reaproveitar `shared/logo-wehelp.png` — pedir versão SVG se precisar de mais qualidade
- [ ] Conferir LPs existentes antes de criar asset novo

### 5. Build (HTML/CSS)
- [ ] Criar pasta em `{slug}/` na raiz do repo
- [ ] Mobile first
- [ ] Reaproveitar componentes das LPs anteriores quando fizer sentido

### 6. QA antes do deploy
- [ ] Teste em celular real
- [ ] Links de CTA funcionam
- [ ] OG tags + meta description preenchidas
- [ ] Favicon WeHelp no lugar

### 7. Deploy
- [ ] `git add {slug}/ && git commit -m "feat: lp {slug}"`
- [ ] `git push origin main` — a Vercel publica automaticamente (git integration, sem passo manual)
- [ ] Confirmar URL no ar: `lp.wehelpsoftware.com/{slug}`

### 8. Pós-deploy
- [ ] Adicionar entrada em `lp-taxonomy.json` (campo `landings`)
- [ ] Anotar hipótese de teste A/B se aplicável

---

## Regra de ouro

Igual na SouFit: **arquivo não commitado não existe no site.** A Vercel só publica o que está no `main` do GitHub. Antes de considerar uma LP "pronta", confirme `git status` limpo.

## Diferença importante em relação à SouFit

A WeHelp publica via **Vercel (deploy automático por git push)**, não via VPS própria com rsync. Isso significa: **não precisa de workflow de GitHub Actions pra deploy** — a Vercel já faz isso sozinha a cada push na `main`. Só é preciso configurar isso uma vez no painel da Vercel (conectar o repo `wehelp` e apontar o domínio `lp.wehelpsoftware.com`).
