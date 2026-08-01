# Módulo de Retenção de Churn

> Status: 🆕 lançado recentemente. LP de venda já publicada em `retencao/`, LP de ativação (pra quem já é cliente) em `ativacao/`.

## O que é

Módulo que identifica alunos/clientes com risco de cancelamento **antes que cancelem**, independente de o cliente ter respondido pesquisa ou não, usando um modelo de análise de risco de churn baseado em perfil e comportamento.

## Como o modelo funciona (explicado pelo Rogerio Aranda, fundador, em 2026-07-31)

1. **Constrói um perfil de quem cancela.** O modelo analisa o perfil e comportamento dos clientes que já cancelaram — idade, gênero, tempo de casa, se respondeu pesquisa (promotor/passivo/detrator), frequência de acesso, se faz outras atividades além de "bater catraca" (aula coletiva, natação etc).
2. **Compara clientes ativos com esse perfil.** Quanto mais perto um cliente ativo estiver desse perfil/comportamento de quem cancela, maior o risco. Quanto mais distante, menor.
3. **Não é só frequência absoluta — é frequência + recência + mudança de comportamento.** Um cliente que sempre foi 1x/semana pode ter risco menor que um que caiu de 4x/semana pra 2x — a *queda* importa tanto quanto o nível.
4. **Regra populacional de referência** (ajustada por cada academia com dados próprios): frequenta 1x/semana ou menos = risco alto; 2-3x = risco médio; 4x+ = risco baixo. Recência: 7 dias sem frequentar ≈ 70% de risco; 30 dias ≈ 90% de risco (por isso o corte de "adormecido" é 30 dias).
5. **Modelo "vivo"**: reprocessado continuamente. Analisa os últimos 4 meses de acesso/cancelamento (via integração com o sistema de gestão da academia) e se ajusta a cada novo acesso ou cancelamento — individualizado por empresa, unidade e até por cliente.
6. **Sem dado histórico próprio? Usa modelo padrão de mercado.** Pra habilitar o módulo, é **obrigatório** receber dado de acesso diariamente (senão a informação de risco fica sempre atrasada). Já o dado de cancelamento **não é obrigatório** de início — se a academia ainda não tem histórico de cancelamento suficiente, o modelo usa dados populacionais de mercado como ponto de partida, e migra pro modelo próprio conforme acumula dado real (Rogerio sugere ~2-3 meses).

## Segmentação de saída (o que a academia vê)

Da base de clientes, o módulo classifica em:

- **Adormecidos** — sem frequência há 30+ dias. *Isso não significa abandonar o contato* — o objetivo é entender o motivo (férias? esqueceu de trancar o plano? ficou doente?) antes de agir.
- **Novos** — ainda sem dado suficiente pra classificar risco.
- **Ativos com risco alto / médio / baixo** de cancelamento.

## Onde a ação acontece

Identificar o risco é só metade — a ação (oferecer novo treino, aula especial, contato personalizado) acontece **dentro do Módulo de Atendimento**, no mesmo Kanban usado pros outros tipos de atendimento. Ver `../modulo-ticket/modulo-ticket.md`.

## Proposta de valor (copy já validada — extraída da LP `retencao/`)

Seção "Por que ativar agora — O que você ganha com o Módulo de Retenção":

1. **Saiba quem vai sair antes que saia** — identifica alunos com maior risco de evasão com antecedência, mantém a base estável e lucrativa.
2. **Pare de adivinhar. Os dados mostram quem vai embora** — análise preditiva que transforma comportamento dos alunos em ações concretas de retenção.
3. **A janela para agir é pequena. O módulo avisa na hora certa** — alertas no momento ideal pra abordar o aluno em risco, antes da decisão de cancelar.
4. **Aborde cada aluno em risco com o argumento certo** — usa o perfil completo (frequência, plano, histórico) pra personalizar a abordagem.
5. **Retenha mais gastando menos — sem campanhas genéricas** — foca energia/recursos nos alunos certos, reduz custo, aumenta eficiência.
6. **Visibilidade total sobre quem fica e quem vai** — clareza sobre o futuro da base, decisão mais inteligente pro negócio.

Headline da LP de venda: *"Recupere até 40% dos alunos em risco antes que eles vão embora"*

## Features (a partir do copy acima)

- Score de risco de evasão por aluno/cliente (análise preditiva)
- Alertas no timing certo pra intervenção
- Perfil completo do aluno (frequência, plano, histórico) pra personalizar abordagem
- Dashboard de visibilidade da base (quem fica / quem sai)

## Segmento hoje

Fitness (academias/estúdios) — é o caso de uso documentado nas LPs existentes. Avaliar se o módulo é genérico o suficiente pra outros segmentos (SaaS teria "usuários em risco de cancelar assinatura", Clínicas teria "pacientes que não voltam").

## Pendências

- [ ] Confirmar se o módulo já vale pra outros segmentos além de fitness, ou é fitness-only por enquanto (a mecânica hoje é bem calibrada pro conceito de "frequência/catraca" de academia)
- [ ] Preço/plano
- [ ] Case/prova social real (número de "40%" da headline — validar origem do dado pra reforçar credibilidade em LPs futuras)

## Estratégia de venda dos 3 módulos juntos (Rogerio Aranda, 2026-07-31)

Os módulos **podem ser comprados separados**, mas o recomendado é o conjunto — são complementares. Raciocínio do Rogerio:

- Habilitar **só o Retenção** identifica quem está em risco, mas não atua na causa raiz (limpeza ruim, atendimento ruim, manutenção ruim etc) — ele descreve isso como "ficar enxugando gelo".
- Pra cliente com problema de retenção que ainda não tem os 3 módulos, a sugestão de sequência é: iniciar **Pesquisa + Atendimento** por ~3 meses (gera dado e já começa a agir nos pontos de contato) e habilitar o **Retenção** desde já com o modelo padrão de mercado — ele migra pro modelo próprio conforme a academia acumula histórico.
- Essa lógica é útil tanto pra copy de upsell (cliente que já tem 1-2 módulos) quanto pra definir a oferta "pacote completo" em LPs de venda nova.
