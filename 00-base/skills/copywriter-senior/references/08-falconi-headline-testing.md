# Metodologia Falconi-Copywriter — Teste de Headlines

> Fusão da gestão por fato e dado (Vicente Falconi) com os frameworks da skill copywriter-senior. Use para testar e otimizar headlines de landing page com método, hipótese e ciclo de aprendizado.

**Princípio central:** "Não se gerencia o que não se mede" (Falconi) + "Lead fraco = copy morto" (Masterson). Headline é **item de controle**, não arte. PDCA descobre; SDCA consolida. **Uma variável por teste.**

---

## 1. Ciclo PDCA-Headline

### P — PLAN

**1.1 Diagnóstico Ishikawa 5M de Copy** — identifique a causa-raiz (não o sintoma):

- **Mensagem** — One Belief existe? Promessa específica? Prova presente?
- **Mercado** — Consciência (Schwartz 1–5) e sofisticação corretas?
- **Mecanismo** — Mecanismo único nomeado ou genérico?
- **Mídia** — Canal coerente com a intenção do prospect?
- **Momento** — Timing/sazonalidade certos?

Saída: **uma frase** descrevendo a causa-raiz provável.

**1.2 Hipótese (META Falconi + One Belief Evaldo)**

> Acreditamos que ao mudar **[X]** para **[Y]**, o **[KPI]** aumentará **[Z%]** até **[DATA]**, porque **[fundamento copywriting]**.

Toda hipótese carrega seu One Belief de 16 palavras (`references/03-16-palavras-evaldo.md`).

**1.3 Priorização ICE×F** — quando há várias hipóteses:

$$\text{Score} = \frac{I \times C \times E \times M \times R}{5}$$

| Critério | Pergunta | Escala |
|---|---|---|
| I — Impact | Quanto move o KPI? | 1–10 |
| C — Confidence | Quão certo da hipótese? | 1–10 |
| E — Ease | Fácil de implementar/medir? | 1–10 |
| M — Mensurabilidade *(Falconi)* | Variável isolável estatisticamente? | 1–10 |
| R — Reprodutibilidade *(Falconi)* | Aprendizado serve além desta landing? | 1–10 |

**1.4 Cálculo amostral** (A/B, 2 variantes, 95% confiança, 80% poder):

$$n = \frac{16 \times p(1-p)}{(p \times MDE)^2}$$

Sem tráfego para n adequado? Aumente MDE, use bandits (VWO/Optimizely) ou teste variáveis maiores (lead inteiro vs palavra solta).

**1.5 KPIs em hierarquia Falconi**

- **Primário** *(item de controle)*: CTR do hero CTA
- **Secundários** *(verificação)*: scroll depth, tempo na página, bounce, CR final
- **Guardrails** *(o que NÃO pode piorar)*: qualidade do lead, CAC, no-show

### D — DO

**2.1 Gerar variantes pela Matriz Masterson** (ver §2).

**2.2 Quality Gates** — toda variante precisa passar antes de subir:

- [ ] One Belief de 16 palavras definido
- [ ] Big Idea clara (Ogilvy)
- [ ] Nível de consciência e sofisticação corretos (Schwartz)
- [ ] Mecanismo único nomeado
- [ ] Linguagem do prospect, não da empresa
- [ ] Promessa específica e quantificada
- [ ] Subhead aprofunda — não repete

**2.3 Setup técnico** — split 50/50, cookie persistente por usuário, tráfego interno excluído, datas documentadas no Plan-Doc.

### C — CHECK

**3.1 Critérios de validade**

- [ ] Amostra mínima atingida
- [ ] ≥7 dias completos (ciclo semanal)
- [ ] Sem eventos atípicos (BF, incidente, alta de mídia)
- [ ] p < 0.05 OU probabilidade bayesiana >95%
- [ ] Direção consistente em segmentos-chave

**3.2 Análise de anomalias** — toda anomalia é aprendizado:

| Anomalia | Provável causa |
|---|---|
| Vence mobile, perde desktop | Headline longa demais em tela pequena |
| Vence orgânico, perde paid | Intenção de busca ≠ contexto do ad |
| Primário ↑ mas secundário ↓ | Atrai clique mas decepciona — red flag |
| Empate técnico com n suficiente | Variável testada não é alavanca real |

**3.3 Cinco Porquês** — toda vitória/derrota é diagnosticada até a causa-raiz para gerar aprendizado durável.

### A — ACT

**4.1 Implementar vencedor** — 100% do tráfego, monitorar 14 dias para confirmar manutenção.

**4.2 SDCA (consolidação Falconi)**

- **S** — Documentar o padrão vencedor
- **D** — Aplicar em outras peças do funil/produto
- **C** — Monitorar manutenção do resultado
- **A** — Atualizar playbook do cliente/produto

**4.3 Próxima hipótese** — toda vitória abre 2–3 hipóteses derivadas no backlog.

---

## 2. Matriz de Variantes Masterson

| Consciência | Lead recomendado | Estrutura |
|---|---|---|
| Mais consciente | Oferta | "[Produto] por R$X — só até [data]." |
| Consciente do produto | Promessa direta | "[Resultado] em [prazo] usando [produto]." |
| Consciente da solução | Solução de problemas | "Pare de [dor]. [Solução] resolve em [prazo]." |
| Consciente do problema | Solução + empatia | "Se você sofre com [dor], leia antes de tentar mais qualquer coisa." |
| Inconsciente | Big Idea / Bolsa de Veludo / História | "O [mecanismo] que [grupo improvável] usa para [resultado]." |

**Variantes-padrão para gerar a partir do controle (escolha 1–2 por teste):**

| Variante | Manobra | Quando |
|---|---|---|
| B — Mecanismo Único | Adicionar nome de método/sistema | Sofisticação 3+ |
| C — Bolsa de Veludo | Esconder o "como" — criar curiosidade | Sofisticação 4+ |
| D — Inimigo Comum | "Nós vs eles" contra crença saturada | Mercado saturado |
| E — Especificidade Numérica | Número exato no lugar de genérico | Sempre |
| F — Identificação Tribal | "Para [ICP específico] que [comportamento]" | ICP pulverizado |

---

## 3. Template Plan-Doc (uso obrigatório por teste)

```markdown
# TESTE #[N] — [NOME CURTO]

## Contexto
- Landing: [URL] | Produto: [nome] | ICP: [descrição]
- Funil: [topo/meio/fundo] | Tráfego/dia: [N] | CR baseline: [X%]

## Diagnóstico (Ishikawa 5M)
- Mensagem / Mercado / Mecanismo / Mídia / Momento: [análise]
- CAUSA-RAIZ: [uma frase]

## Hipótese
> Acreditamos que ao mudar [X] para [Y], [KPI] aumentará [Z%] até [DATA], porque [fundamento].

- One Belief: [16 palavras Evaldo]
- Tipo de lead (Masterson): [...]
- Mecanismo único: [...]
- Big Idea: [...]

## Variantes
| ID | Headline | Subhead | Lead | One Belief |
|----|----------|---------|------|------------|
| A (controle) | ... | ... | ... | ... |
| B | ... | ... | ... | ... |

## KPIs
- Primário: [CTR hero CTA]
- Secundários: [scroll, tempo, bounce, CR final]
- Guardrails: [não pode piorar X, Y]

## Setup
- Ferramenta: [...] | Split: [50/50] | n por variante: [...]
- Início: [data] | Término previsto: [data]

## Resultado (preencher no CHECK)
- Vencedora: [...] | Uplift: [X%] | p-value: [...]
- Anomalias: [...] | 5 Porquês: [...]

## Ação (preencher no ACT)
- Implementação: [data]
- SDCA: [onde aplicar o aprendizado]
- Hipóteses derivadas: [...]
```

---

## 4. Biblioteca de Hipóteses (ponto de partida)

| Categoria | Hipótese | Quando aplicar |
|---|---|---|
| **Lead** | Promessa vs solução de problemas | Consciência do problema vs solução |
| **Lead** | Direto vs história de origem | Sofisticação 1-2 vs 3-4 |
| **Lead** | Pergunta vs declarativa | Curiosidade vs autoridade |
| **Mecanismo** | Com vs sem nome de mecanismo único | Sofisticação 3+ |
| **Mecanismo** | Mecanismo nomeado vs descrito | Mercado pulverizado |
| **Especificidade** | Número genérico vs exato (47, 13, 9) | Sempre |
| **Especificidade** | Prazo vago vs específico | Sempre |
| **Emoção** | Dor vs prazer | Por estágio do funil |
| **Emoção** | FOMO vs aspiração | Por perfil |
| **Emoção** | Inimigo comum vs jornada solo | Saturado vs nascente |
| **Prova** | Com vs sem número de prova social no hero | Confiança baixa |
| **Prova** | Logo de mídia vs número de clientes | B2B vs B2C |

---

## 5. Regras Inquebráveis

1. **Uma variável por teste.** Múltiplas = lixo estatístico.
2. **Nunca parar antes da amostra mínima.** Viés de confirmação mata aprendizado.
3. **Toda anomalia → 5 Porquês.** Aprendizado não extraído é desperdício.
4. **Sem One Belief, sem teste.** Chute não é hipótese.
5. **Primário ↑ com guardrail ↓ = derrota.** Vaidade não é vitória.
6. **Vitória gera 3 hipóteses novas.** PDCA é ciclo, não evento.
7. **Aprendizado não documentado não existe.** Diário > teste isolado.
8. **Re-medir consciência/sofisticação a cada 6 meses.** Mercado evolui.
9. **Cliente paga pelo método, não pela headline.** Entregue o sistema.
10. **Empate técnico → mantém o controle.** Novidade sem ganho = risco operacional.

---

## 6. Indicadores de Maturidade

| Nível | Característica | Próximo passo |
|---|---|---|
| 1 — Caos | Testa "no feeling" | Adotar PDCA |
| 2 — Reativo | Testa quando algo dá errado | Construir backlog priorizado |
| 3 — Estruturado | Sempre com hipótese e KPI | Documentar aprendizados |
| 4 — Sistêmico | Diário ativo + SDCA aplicado | Prever resultado antes do teste |
| 5 — Excelência | Playbook por nicho + biblioteca de leads validados | Manter |

---

## Síntese

Headline tratada como **item de controle Falconi** + **lead Masterson** + **One Belief Evaldo** = teste com hipótese, método e aprendizado durável. PDCA descobre o vencedor; SDCA transforma vitória em padrão. **O ativo final não é a headline — é o diário de aprendizados.**
