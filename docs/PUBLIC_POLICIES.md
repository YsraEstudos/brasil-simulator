# Execução de políticas públicas — Fase 06

Este documento descreve o contrato do módulo `src/engine/publicPolicies/`. Os valores monetários usados pelo
catálogo e pelo estado estão em R$ milhões; o fiscal converte esses valores para frações do PIB anual antes de
calcular a despesa do mês.

## Ações

`definir_diretriz` seleciona uma política com `delivery: "rotina"` para um ministério que atende a sua área e
recebe `ministryId`, `policyId` e `annualMillions`. A política precisa ser um ato executivo, ter custo positivo e
ter exatamente um impacto positivo de custeio; um impacto de aprovação é opcional. A dotação anual usa o espaço
discricionário acima de `discricionaria_minima`. Quando mais de uma decisão chega no mesmo mês, o screening deve
encadear `reservePublicAction`: a cópia reservada inclui as solicitações aceitas e impede que a segunda decisão use
o mesmo espaço.

Uma diretriz é válida até dezembro. Em janeiro, a carteira copia as diretrizes do ano anterior para o novo ano e a
execução informa no relatório qualquer corte provocado pela disponibilidade. Trocar a política ou o valor da mesma
pasta substitui a reserva anterior daquela pasta; repetir a mesma política com o mesmo valor é uma ação repetida.
Cada mês emite somente os impulsos correspondentes à alocação efetiva. Cada alocação ocupa o espaço uma única vez, no mês em que é decidida: impulsos da carteira (rotinas com defasagem, obras e manutenção) não entram no cálculo do espaço livre dos meses seguintes. O impulso positivo de custeio desloca as
discricionárias livres calculadas pelo limite de despesas e não cria uma segunda despesa.

`marcar_governo` recebe `proposalId` e um nome com 1–60 caracteres. A proposta precisa ser uma política de projeto
do próprio governo em `em_tramitacao`, `parada`, `em_execucao` ou `concluida`. A mesma proposta não pode receber duas
marcas e o limite é de três escolhas por mandato; marcas não são removidas quando um projeto é cancelado.

## Carteira de projetos

Depois da aprovação, uma política com `delivery: "projeto"` ganha uma entrada em `PublicPolicyState.projects`. A
execução percorre `planejamento`, `licenciamento`, `licitacao`, `obra` e `operacao`. Os meses existentes de
`planningMonths` e `executionMonths` correspondem, respectivamente, ao planejamento e à obra; `project` acrescenta
licenciamento, licitação, eficiência e manutenção anual.

O custo nominal total da obra é `cost.annualMillions × executionMonths / 12 × proposal.scale`, com o fator de
sobrecusto calibrado aplicado quando esse risco foi sorteado. `cost.disbursementProfile` reparte esse total entre as
frações anuais declaradas pelo catálogo; dentro de cada fração, o desembolso segue uma curva S normalizada. Se a
capacidade ministerial estender o prazo, as janelas anuais são estendidas, preservando o total e o perfil relativo.
Os parâmetros da curva e da capacidade ficam na calibração central: `curva_s_projetos = 8` (faixa 4–12) controla a
inclinação logística, e `capacidade_minima_projetos = 0,1` (faixa 0,05–0,2) limita a execução de uma pasta partidária;
o ocupante técnico mantém capacidade 1. A faixa de depreciação anual de `dep_kg` é 0,03–0,06 (padrão 0,04), e a
elasticidade `elast_kg` do capital concluído é 0,05–0,2 (padrão 0,1). Esses valores são parâmetros de calibração e
não constantes específicas da carteira.
O espaço fiscal é compartilhado com diretrizes e manutenção. Como a conta fiscal é anualizada, uma parcela mensal de
obra é convertida em parcela anualizada por `× 12` antes de virar impulso. Sem espaço a obra fica parada e registra
um atraso; alocação parcial aumenta o avanço físico proporcionalmente ao valor
executado, mas não avança o índice de parcela da curva (`phaseMonth`) até
completar a parcela mensal. A próxima execução cobra apenas o saldo restante.
Suspensão pausa avanço
e desembolso. Abandono cancela a carteira. A proposta só é concluída quando o avanço físico alcança 100%,
independentemente do prazo antigo de `executionEnd`.

Na operação, a manutenção anual necessária é calculada sobre o ativo nominal. O motor usa apenas o espaço disponível;
quando ele fica abaixo do necessário, registra contingenciamento em `report.notes` e limita explicitamente a manutenção
do mês, sem criar estouro fiscal. Além da depreciação mensal normal, a parcela sem manutenção acelera a perda do ativo
por `dep_kg × (1 − manutenção_financiada / manutenção_necessária) / 12`; assim, a carteira não mascara uma restrição
de custeio como serviço preservado.

Os riscos de atraso, sobrecusto, adesão e judicialização são sorteados uma vez no início da proposta pelo fluxo de
`scheduleImpulses`. Para um projeto, a carteira substitui somente os canais de investimento e capital; custos
operacionais, aprovação, credibilidade e demais efeitos agendados continuam no fluxo original, com seus atrasos e
incidência regional. A carteira emite o investimento efetivamente desembolsado uma única vez. Ao entrar em operação,
o ativo real líquido entra no estoque explícito,
passa por depreciação mensal a partir de `dep_kg`, exige manutenção anual e gera um único impulso de oferta por
`elast_kg × (ΔK / PIB real) × 12`. Depreciação negativa é registrada pelo mesmo canal, com a causa correspondente.

## Marcas e relatório

Enquanto uma marca existe, cada mês acrescenta a situação atual do projeto a `report.notes`, incluindo tramitação,
fase, avanço, suspensão, cancelamento ou operação. Esse acompanhamento é textual e não cria eventos da Fase 07.

`checkPublicPolicies` verifica unicidade de diretrizes, projetos e marcas, valores finitos e positivos, limites de
avanço e desembolso e a reconciliação do estoque de capital com os ativos em operação. A função é deliberadamente
pura e adequada para invariantes e migração de saves.
