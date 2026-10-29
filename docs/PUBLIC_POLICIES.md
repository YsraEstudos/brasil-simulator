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
`curva_s_projetos = 8` (faixa 4–12) controla a inclinação logística. A capacidade do indicado é a média de competência,
experiência e coordenação, geradas deterministicamente para cada pasta e indicação entre 0,65 e 1; são valores fictícios
e provisórios, apresentados antes da nomeação. Indicação política não implica capacidade inferior. A capacidade afeta
o prazo da obra; o efeito da proposta não recebe uma segunda redução pelo mesmo fator. A faixa de depreciação anual de `dep_kg` é 0,03–0,06 (padrão 0,04), e a
elasticidade `elast_kg` do capital concluído é 0,05–0,2 (padrão 0,1). Esses valores são parâmetros de calibração e
não constantes específicas da carteira.
Planejamento acumula trabalho conforme competência; licenciamento, conforme coordenação; contratação, conforme experiência.
A carteira registra a principal limitação do último mês (gestão, orçamento, suspensão ou intervalo de cronograma),
separando-a do desembolso. Ao trocar gestor durante a obra, saldos pagos permanecem e o restante é quitado antes da conclusão.
O painel também distribui o saldo ainda não desembolsado por ano, como estimativa uniforme a partir da fase e da
capacidade atuais. Não prevê contingenciamentos nem suspensões e não registra despesa, crédito ou autorização na LOA.
O horizonte exibido é limitado a 40 anos quando o prazo calculado ultrapassa esse limite, com aviso na interface.
No cenário com leis de planejamento, PPA, LDO e LOA tramitam e só passam a valer após sanção ou derrubada do veto.
Como simplificação do jogo, a LDO segue a prioridade do PPA vigente, quando houver, e a LOA segue a LDO do mesmo ano.
A LOA limita as alocações anuais da carteira à menor entre a autorização e a folga fiscal, atendendo primeiro a área
prioritária. Essa autorização não cria despesa nem representa o orçamento federal completo.
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

### Investimentos por setor (PLANO_EXPANSAO EX-31)

`sectorInvestments(state, content)` é uma **leitura derivada** da carteira e das propostas, mostrada no cartão
"Investimentos por setor" da Economia: não cria orçamento paralelo, não altera a simulação e não soma efeito. O setor é
a `area` da política. O dinheiro aparece em estágios que nunca se somam duas vezes:

| Estágio | O que conta | Fonte |
| --- | --- | --- |
| Anunciado | Proposta de obra em tramitação ou à espera de sanção, ainda fora da carteira (custo estimado por escala e prazo) | `state.proposals` |
| Aprovado | Custo total das obras na carteira, com sobrecusto, sem as canceladas | `PublicProject.budgetMillions` |
| Contratado | Obras que passaram da licitação (fase obra ou operação) | idem |
| Desembolsado | Pago de fato, acumulado; obra cancelada continua com o que pagou | `PublicProject.spentMillions` |
| No último mês | Parte do desembolsado paga no mês processado (o mesmo valor do impulso `gasto.investimento` da obra) | `PublicProject.monthSpentMillions` |

O empenho não é modelado em separado, e a interface diz isso. Setor do catálogo sem obra aparece como "nenhuma obra
aprovada ou anunciada", nunca como falta de dado. `monthSpentMillions` é zerado no início de cada passo da carteira e
só é gravado quando há pagamento; o invariante `checkPublicPolicies` exige que ele não passe do acumulado.

### Obras ferroviárias (PLANO_EXPANSAO EX-30)

Uma política de projeto pode citar um trecho da rede ferroviária nacional (`railway: { segmentId, kind }`, só com
`delivery: "projeto"`). O motor ignora o campo; o mapa usa a proposta e a fase da obra para desenhar o trecho na cor
do governo (verde) em vez do traçado planejado, e só o mostra como ativo quando a obra entra em operação. O cenário
v0.8.0 oferece duas obras para comparar: carga (Barreiras–Figueirópolis, FIOL 3: mais cara, 48 meses, licenciamento de
18 meses, manutenção 2,5%/ano) e passageiros (Brasília–Anápolis–Goiânia: mais barata, 36 meses, manutenção
4,5%/ano e custeio de operação maior). Custos PROVISORIO.

### Obras federativas (PLANO_EXPANSAO EX-20)

Um projeto com `federative: { counterpartShare, termMonths }` é executado por convênio com os estados do escopo
(regras em [POLITICAL_RULES.md](POLITICAL_RULES.md) §2.1.1). O convênio vive no próprio `PublicProject.federative`
(membros, assinatura, vigência, parcela federal): **não há segunda carteira**. Na carteira, a obra:

- decide a adesão de cada governador ao entrar e aceita `negociar_adesao` no planejamento;
- na assinatura, multiplica o orçamento pela parcela federal dos estados que aderiram e passa a incidir só neles;
- na obra, repassa na proporção da contrapartida paga (`counterpartCoverage`); inadimplência vira gargalo
  `contrapartida` e atraso;
- em operação, segue a manutenção de sempre; o ativo é a obra inteira (desembolso federal ÷ parcela federal).

O Gabinete mostra, sob a obra, quem aderiu, quem recusou, inadimplentes, vigência, parcela federal e contrapartida
paga, com um botão de negociação por governador que recusou (e a chance de aderir depois dela).

### Educação por coorte (PLANO_EXPANSAO EX-19)

Rotinas e projetos podem declarar alavancas de educação (`education: { alfabetizacao?, permanencia?, docentes? }`,
0–1). A carteira emite impulsos de um mês nos alvos `educacao.<alavanca>` com a força × capacidade entregue — a
**rotina** na proporção da dotação liberada, depois de `maturationMonths`; o **projeto** só em operação, na proporção
do ativo conservado (sem manutenção, o efeito cai). O gasto continua sendo o da rotina ou da obra: o módulo de educação
não cria despesa. No cenário v0.8.0: `rotina_alfabetizacao` (alfabetização 0,8, horizonte curto),
`rotina_formacao_docente` (docentes 0,8) e `projeto_escolas_tempo_integral` (permanência 1, horizonte longo: só age
depois de obra pronta). Modelo das coortes em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.22; o cartão "Educação" fica na
subtela Economia.

## Marcas e relatório

Enquanto uma marca existe, cada mês acrescenta a situação atual do projeto a `report.notes`, incluindo tramitação,
fase, avanço, suspensão, cancelamento ou operação. Esse acompanhamento é textual e não cria eventos da Fase 07.

`checkPublicPolicies` verifica unicidade de diretrizes, projetos e marcas, valores finitos e positivos, limites de
avanço e desembolso e a reconciliação do estoque de capital com os ativos em operação. A função é deliberadamente
pura e adequada para invariantes e migração de saves.
