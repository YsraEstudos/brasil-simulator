# Brasil Simulator — Sociedade (Fase 06)

Este módulo é uma forma reduzida **PROVISÓRIA** para o jogo. Ele distribui o agregado nacional já calculado pela
economia e acompanha setores, renda por quintil, salário real, desemprego e pobreza estimada. Os parâmetros estão em
`src/engine/society/calibration.ts`; não são uma projeção oficial nem substituem séries do IBGE.

## Contrato do motor

`initialSociety()` cria as seis atividades nacionais (`agropecuaria`, `extrativa`, `industria`, `construcao`,
`energia`, `servicos`) e os cinco quintis (`q1` a `q5`). `initialSocietyForGame(game)` é usado quando o controlador já
conhece o cenário: ele alinha `nationalOutput` a `potentialIndex × exp(outputGap)`, desemprego ao indicador nacional e
salário mínimo ao índice fiscal vigente.

`societyStep` é uma `MonthStep` pura. O controlador deve executá-la depois de `economyStep` e antes de opinião e
regiões. O bloco social não altera indicadores nem o produto agregado; devolve o `GameState` com `society` persistido.

`checkSociety(state, game)` retorna textos de violação para o controlador e para os testes. As identidades verificadas
são:

```
nationalOutput = potentialIndex × exp(outputGap)
Σ setor.output = nationalOutput
Σ setor.share = 1
Σ quintil.incomeShare = 1
```

## Setores

As participações anteriores são atualizadas por crescimento relativo. O crescimento nacional entra em todos os setores;
termos de troca favorecem principalmente agropecuária e extrativa. Impulsos ativos são filtrados pela fila com
`activeImpulses`. Quando o impulso carrega `affected.sectors`, o setor indicado recebe a incidência cheia e os demais
recebem o vazamento calibrado. O produto nacional é aplicado depois da normalização das participações, portanto esses
efeitos mudam a composição sem criar PIB adicional.

As explicações de setor usam `cause = sourceId` e `label` do impulso. A entrada interna de atividade fecha o
resíduo de termos de troca, atividade nacional e normalização depois das contribuições dos impulsos; assim a soma
das explicações de produção coincide com a variação observada. Políticas legadas também podem ser resolvidas pelo
`sourceId` (`proposta:`, `diretriz:`, `projeto:` ou `rotina:`), consultando seus `affected.sectors`.

## Distribuição e defasagens

Renda real recebe parte do crescimento da atividade, da melhora do desemprego e do salário real. O caminho do salário
mínimo é incorporado gradualmente. A incidência de transferências e tributos é um componente de nível (`policyAdjustment`)
que converge ao impulso ativo e decai quando ele termina; um programa constante não cria crescimento exponencial
permanente. Transferências de baixa renda favorecem q1 e q2; transferências de alta renda favorecem q4 e q5. Tributos
de consumo e carga tributária geral usam a incidência regressiva calibrada; tributo sobre renda usa uma incidência
progressiva. Desonerações têm o sinal inverso. O cálculo preserva a ordem crescente dos cinco quintis.

A pobreza é uma soma logística por quintil, usando a linha de pobreza e a suavização declaradas na calibração. Assim,
uma transferência pode reduzir a taxa continuamente, sem um salto causado por uma fronteira artificial. As cinco
participações de renda são renormalizadas a cada mês e somam exatamente 1.

Cada variação relevante deixa uma entrada em `SocietyState.explanations` com `{ cause, label, delta, metric }`.
`cause` permanece rastreável ao impulso ativo; causas internas identificam atividade, mercado de trabalho e salários.
O histórico mensal continua fora do `GameState`, conforme ECONOMIC_MODEL.md §11.

## Calibração PROVISÓRIA

| Parâmetro | Valor | Faixa para balanceamento | Justificativa |
| --- | ---: | ---: | --- |
| `sectorShares` | agropecuaria 0,08; extrativa 0,09; industria 0,12; construcao 0,06; energia 0,04; servicos 0,61 | cada componente 0–1; soma 1 | composição inicial do produto; mantém as seis atividades reconciliadas |
| `quintileIncomes` | q1 0,28; q2 0,56; q3 0,84; q4 1,16; q5 2,16 | cada componente 0,10–3,00; ordem crescente | índices relativos de renda real usados para iniciar a distribuição |
| `termsOfTradeSensitivity` | agropecuaria 0,40; extrativa 0,70; industria 0,15; construcao 0,03; energia 0,20; servicos 0,02 | por setor 0–1,20 | exposição relativa de cada atividade aos termos de troca |
| `sectorGrowthSaturation` | 0,08 | 0,04–0,16 | limita a realimentação relativa dos setores |
| `sectorImpulsePassThrough` | 0,75 | 0,3–1,2 | fração do impulso que muda a composição setorial |
| `unaffectedSectorSpillover` | 0,20 | 0,05–0,40 | comércio e encadeamentos para setores não atingidos |
| `outputIncomePassThrough` | 0,20 | 0,05–0,40 | defasagem entre atividade e renda |
| `employmentIncomePassThrough` | 0,35 | 0,10–0,70 | transmissão gradual do mercado de trabalho |
| `wageIncomePassThrough` | 0,45 | 0,15–0,80 | parcela da variação do salário real médio que chega à renda dos quintis |
| `minimumWageLag` | 0,25 | 0,10–0,50 | incorporação gradual do salário mínimo |
| `transferIncomePassThrough` | 0,90 | 0,50–1,20 | parcela do fluxo de transferência que chega à renda disponível após a defasagem |
| `lowIncomeTransferIncidence` | q1 1,00; q2 0,70; q3 0,20; q4 0,05; q5 0,00 | cada componente 0–1 | incidência relativa de transferência focalizada na baixa renda |
| `highIncomeTransferIncidence` | q1 0,00; q2 0,05; q3 0,20; q4 0,70; q5 1,00 | cada componente 0–1 | incidência relativa de transferência focalizada na alta renda |
| `regressiveTaxIncidence` | q1 1,00; q2 0,75; q3 0,50; q4 0,30; q5 0,15 | cada componente 0–1 | peso relativo de tributos sobre consumo e carga geral |
| `incomeTaxIncidence` | q1 0,10; q2 0,25; q3 0,50; q4 0,75; q5 1,00 | cada componente 0–1 | peso relativo de tributos sobre renda e suas desonerações |
| `minimumWageIncidence` | q1 1,00; q2 0,70; q3 0,30; q4 0,08; q5 0,00 | cada componente 0–1 | alcance distributivo do salário mínimo por quintil |
| `policyAdjustmentLag` | 0,25 | 0,10–0,50 | convergência mensal do efeito de transferências/tributos |
| `policyAdjustmentLimit` | 0,25 | 0,10–0,40 | saturação para evitar explosões de renda |
| `minimumQuintileGap` | 0 | 0–0,02 | piso opcional que preserva a ordem sem impor distância artificial |
| `povertyThreshold` | 0,50 | 0,35–0,65 | linha relativa à renda média, aguardando série oficial |
| `povertySmoothness` | 0,08 | 0,04–0,16 | evita saltos quando a renda cruza a linha |
| `quintilePopulationShare` | 0,20 | 0,20–0,20 | cinco grupos de população com o mesmo peso no agregado |
| `minimumPositiveLevel` | 10⁻⁹ | 10⁻¹²–10⁻⁶ | piso numérico para razões, logs e normalização |
| `maximumUnemployment` | 1,00 | 1,00–1,00 | limite superior da taxa de desemprego |
| `initialNationalOutput` | 1,00 | 1,00–1,00 | índice de referência antes de alinhar ao cenário |
| `initialUnemployment` | 0,08 | 0,04–0,14 | referência provisória quando o save não tem sociedade |
| `initialRealWage` | 1,00 | 0,80–1,20 | índice de salário real de referência |
| `initialMinimumWage` | 1,00 | 0,80–1,20 | índice de salário mínimo de referência |

As cinco matrizes de incidência têm uma entrada nomeada por quintil e cada componente permanece entre zero e um. O
valor do impulso é aplicado ao vetor correspondente, passa pelo `policyAdjustmentLag` e é limitado por
`policyAdjustmentLimit`; por isso uma transferência constante converge para um nível e não gera crescimento
exponencial permanente. Os vetores setoriais usam a mesma ordem fixa (`agropecuaria`, `extrativa`, `industria`,
`construcao`, `energia`, `servicos`) e as participações são renormalizadas para soma exata igual a um.

Todos os valores permanecem `PROVISORIO` até a importação das séries oficiais de Contas Nacionais e distribuição de
renda. As faixas são limites de calibração do jogo, não intervalos de confiança estatística.
