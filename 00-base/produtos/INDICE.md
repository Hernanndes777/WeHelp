# Índice de Produtos — WeHelp

A WeHelp é uma **plataforma de gestão da experiência do cliente com foco em retenção** (definição do fundador, Rogerio Aranda). A tese: melhorar a experiência do cliente reduz evasão e melhora retenção — mas isso é secundário ao foco principal, que é ajudar empresas a reter mais clientes, com dado, não achismo.

Hoje tem 3 módulos:

| Módulo | O que faz | Status | Dossiê |
|---|---|---|---|
| **Pesquisa de Satisfação** | Software de NPS® — envia pesquisas (email/SMS/widget/QR), coleta e organiza respostas, dashboards + eNPS pra colaboradores. Dá voz ao cliente, processo de médio prazo. | Produto base, bem documentado | [`pesquisa-satisfacao/pesquisa-satisfacao.md`](pesquisa-satisfacao/pesquisa-satisfacao.md) |
| **Módulo de Atendimento** ("Módulo de Ticket") | Formulários de escuta nos pontos de contato do dia a dia (rápido, transacional) + Kanban centralizador de todo atendimento (de pesquisa, de ponto de contato, ou de cliente em risco). | Existe, bem documentado | [`modulo-ticket/modulo-ticket.md`](modulo-ticket/modulo-ticket.md) |
| **Módulo de Retenção de Churn** | Modelo preditivo de risco de cancelamento por perfil + comportamento (frequência, recência, mudança de padrão), independente de o cliente ter respondido pesquisa. Roda com modelo de mercado até acumular dado próprio. | 🆕 Lançado recentemente, bem documentado | [`modulo-retencao-churn/modulo-retencao-churn.md`](modulo-retencao-churn/modulo-retencao-churn.md) |

Metodologia de NPS (Promotores/Passivos/Detratores, cálculo, faixas) documentada em [`../metodologia-nps.md`](../metodologia-nps.md) — reaproveitável em qualquer LP educativa.

## Como os módulos se conectam (explicado pelo Rogerio Aranda, 2026-07-31)

Não é bem um funil linear "ouvir → prever → agir" — é mais **dois motores de escuta que alimentam um centro de ação**:

1. **Pesquisa** = escuta estruturada e periódica (médio prazo). Dá voz ao cliente, mas é lenta — você espera semanas/meses pra ouvir todo mundo.
2. **Atendimento** = escuta ágil e transacional (tempo real), nos pontos de contato do dia a dia. Compensa a lentidão da Pesquisa. **E também é onde qualquer atendimento se fecha** — seja ele originado de pesquisa, de ponto de contato, ou de cliente em risco.
3. **Retenção** = não escuta, **prevê** — aponta quem está em risco de cancelar, com ou sem dado de pesquisa, baseado em comportamento (frequência/recência/padrão). A ação sobre esse risco acontece dentro do Atendimento.

**Pra copy**: uma LP de Retenção pode mencionar que a ação sobre o risco identificado acontece no Atendimento. Uma LP de Atendimento pode reforçar que ele funciona em tempo real, diferente da Pesquisa. Todos os 3 compartilham a mesma tese central: dado > achismo.

## Estratégia comercial: comprar separado ou junto?

**Pode comprar separado — mas o recomendado é o conjunto**, porque só o Retenção sem os outros dois é "ficar enxugando gelo": identifica quem tá saindo, mas não ataca a causa raiz (limpeza ruim, atendimento ruim etc). Sequência sugerida pelo Rogerio pra quem começa do zero: Pesquisa + Atendimento por ~3 meses (gera dado e já age nos pontos de contato) + Retenção habilitado desde já com modelo de mercado, migrando pro modelo próprio depois de acumular histórico. Ver detalhe em `modulo-retencao-churn/modulo-retencao-churn.md`.

## Pendências

- [ ] Preço do Módulo de Retenção de Churn e do Módulo de Atendimento
- [ ] Confirmar se "Sistema de atendimento integrado" (mencionado no site principal) é a mesma coisa que o Módulo de Atendimento descrito pelo Rogerio, ou uma feature diferente — ver nota em `pesquisa-satisfacao/pesquisa-satisfacao.md`
