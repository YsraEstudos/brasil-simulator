# Fase 08 — Eleições e mandatos

Escopo definido em 16/10/2026. Critério do ROADMAP §2: **mandato completo com eleição no fim: novo ciclo ou encerramento**. Referências: GAME_DESIGN §7, POLITICAL_RULES §11, ECONOMIC_MODEL §5.8. Executada no checkout atual (sem commit nem push automáticos).

Este documento registra as decisões da Fase 08 naquele momento. A eleição anterior à posse e seu estado atual estão em [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md); ela tem modelo próprio e não substitui a eleição durante o mandato descrita aqui.

## Decisões

- **Cenário novo `brasil_2027_01_v070` v0.7.0** (cópia do v0.6.0 + bloco `elections` + candidatos fictícios por bloco). Cenários e saves antigos não recebem eleições: sem bloco `elections` o motor nunca roda o passo eleitoral, aplica vedação ou muda desfecho. `DEFAULT_SCENARIO_ID` passa a ser o v0.7.0; `campaignMonths(v070) = 96` (dois mandatos), v0.5.0/v0.6.0 continuam em 48.
- **Estado v8, motor 0.8.0.** `GameState.politics?: PoliticsState` (opcional: migração content-blind, o campo só aparece quando o passo eleitoral cria o estado). Fixture real `src/tests/saves/state_v7_fase07.json`, gravada pelo motor 0.7.0 (fisiológica, semente 4, sete meses, cenário v0.6.0).
- **Calendário eleitoral** (meses do mandato, `monthIndex % 48`): municipais no mês 21 (out/2028 e out/2032), eleição geral no 45 (out/2030 e out/2034), posse no jan. seguinte (48/96). Janela de declaração de candidatura: meses 39–44. Vedação eleitoral: os 3 meses antes de cada pleito (18–20 e 42–44), Lei 9.504/97 art. 73 §10 simplificada (a vedações reais começam em julho; adotamos 3 meses uniformes para cobrir esse piso de setembro/dezembro).
- **Intenção de voto (`votingIntention`, 0–1)** é variável do estado `politics`, não dos `Indicators` (o relatório não ganha um "objetivo" novo). `Contribution.indicator` ganha o pseudo-indicador `'votingIntention'` (report-only): `applyContributions` só aplica indicadores reais, e as contribuições de intenção participam da explicação/Whychanged.
- **Memória do eleitor**: a cada mês o passo calcula o "clima" (`mood`) do ano: `−fator_inflacao·Δinflação12m(pp) − fator_desemprego·Δdesemprego(pp) + fator_renda·Δrenda real(%)`, limitado a ±1. A memória guarda até 12 climas mensais (antigo→novo); os 6 mais recentes pesam 3, os demais 1.
- **Dinâmica da intenção** (mensal, no `electionsStep`, depois do passo de opinião): as partes são deltas mensais — `ajuste_intencao·(alvo − intenção)` com `alvo = int_base + int_peso_aprovacao·(aprovação − aprovacao_base)`, mais `ajuste_intencao·int_peso_memoria·média ponderada da memória`, mais impulsos de intenção (declaração, quebra de vedação). Limites: 0,03–0,95.
- **Eleição geral**: candidata quem declarou dentro da janela, se `reeleicaoPermitida` (CF art. 14 §5: uma reeleição — sem 2ª reeleição) e se o presidente atual cumpriu **menos de dois mandatos consecutivos** (`AdministrationIdentity.consecutiveTerm`; onda R4). 1º turno: vitória se intenção (+ ruído) > 0,5; senão, top‑2 decidido **no mesmo passo** (simplificação documentada: sem nunca pausar a campanha), com recuperação proporcional à relação média com o Congresso. Sem candidatura: a votação da situação é `fator_sucessao` × intenção do governo (o apoio a um bloco não entra na conta do voto; ele apenas melhora a relação com o bloco, +`apoio_relacao_candidato`).
- **Efeitos da eleição geral**: governadores entre no turno por UF com chance que cai com a relação (`novo governador` parte de −15); renovação do Congresso como **deslocamento sorteado das relações por bloco** (cadeiras por bloco continuam fixas no cenário).
- **Municipais**: contribuição de aprovação da causa `municipais`, proporcional ao clima do ano (`municipais_efeito × média ponderada da memória`), + registro em `politics.eleicao_municipal` + notícia.
- **Vedação eleitoral** (POLITICAL_RULES §11.2): na janela, o `screenInput` rejeita o envio de "novo benefício" (canais de transferência de renda, despesa obrigatória ou salário mínimo real com magnitude positiva) com o motivo `vedacao_eleitoral`. A quebra é uma escolha: `decision.params.vedacao_bypass = true` (a interface ativa automaticamente ao incluir a política) — paga `pena_intencao_vedacao`/mês por `vedacao_abuso_meses` na intenção de voto e arrisca multa da Justiça Eleitoral (`prob_justica_vedacao`, choque de `multa_aprovacao_vedacao` na aprovação por 1 mês), agendados no envio da proposta (D3: adesão estadual de execução não é vedada; D5: só os canais de benefício com magnitude positiva contam). A dificuldade `casual` não aplica.
- **Desfechos**: `campaignOutcome` volta `'impeachment'`, `'derrota_eleitoral'` (mês seguinte à geral não vencida) ou `null`. Derrota encerra a campanha; a vitória abre o mandato seguinte (lua de mel natural do calendário) e a posse do sucessor **não** encerra mais a partida: `presidentialTransitionStep` abre a nova administração e o controle passa para quem assumiu (onda R4, EX-16/EX-17).
- Números só com `dataStatus`/`basis`: todos os parâmetros novos entram em `PARAMS` com min/max/note/basis; `docs/CALIBRATION.md` regenerada por simulação.
- Manter nomenclatura fictícia: candidatos seguem `dataStatus: "FICTICIO"` no cenário.

### Decisões de execução (16/10/2026)

- **D1** (revista na onda R4): vitória do sucessor apoiado na eleição geral **abre o mandato seguinte**. A posse sem candidatura do presidente não encerra mais a partida como `fim_de_mandato`: `presidentialTransitionStep` fecha a administração anterior, abre a seguinte e o jogador passa a controlar o sucessor eleito (meses 48/96). A derrota eleitoral continua encerrando.
- **D2**: notícias da declaração, das municipais e da geral usam `kind: 'institucional'` e entram primeiro na ordem de prioridade do feed.
- **D3**: a vedação eleitoral vale para o envio de política no mês; adesão estadual de execução não é vedada (simplificação documentada).
- **D4**: `governador_peso_relacao` aplica a relação em pontos (−100…100), sem divisão por 100; nota do parâmetro corrigida.
- **D5**: `isNovoBeneficio` = canal de benefício com magnitude > 0 (transferência de renda, despesa obrigatória ou salário mínimo real); cortes e revogações não contam.
- **D6**: o schema do cenário exige a eleição municipal antes da geral e no máximo um candidato por bloco.

## Contratos (já decididos em `src/types/scenario.ts` e `src/engine/types.ts`)

Cenário:
- `scenario.elections?: { reeleicaoPermitida: boolean; janelaDeclaracao: { inicio: number; fim: number }; mesEleicaoMunicipal: number; mesEleicaoGeral: number; candidatos?: { blocId: string; name: string; dataStatus: DataStatus }[] }` (opcional; JSONs antigos continuam válidos). O schema exige a eleição municipal antes da geral e no máximo um candidato por bloco (D6).

Estado (`politics?: PoliticsState`):
- `votingIntention: number` (0–1), `memoria: number[]` (clima mensal, antigo→novo), `declaracao: number | null` (monthIndex), `apoio: string | null` (bloco apoiado), `eleicao_geral?: { monthIndex; candidatura; venceu; turno2; winnerId?; winnerBlocId? }`, `eleicao_municipal?: { monthIndex }`.
- `GameState.administrations?: AdministrationIdentity[]` e `GameState.control?: ControlIdentity` (onda R4): histórico de quem governou (`id`, `presidentId`, `blocId`, `startedAtMonth`, `endedAtMonth?`, `termIndex`, `consecutiveTerm`, `origin`) e o personagem controlado. Opcionais; só nascem quando o cenário tem `elections`.

Motor:
- `ImpulseTarget` ganha `'intencao'`; contribuição com `indicator: 'votingIntention'` é report-only.
- Rejeição nova em decisões: `'vedacao_eleitoral'`; parâmetro de decisão `vedacao_bypass`.

## Plano de tarefas e arquivos

| # | Tarefa | Arquivos (dono único) |
| --- | --- | --- |
| T1 | **Contratos**: v8/0.8.0, `PoliticsState`, pseudo-indicador, `'intencao'`, schema `elections`, calendário eleitoral | `src/engine/types.ts`, `src/types/scenario.ts`, `src/engine/calendar.ts` |
| T2 | **Motor eleitoral**: `electionsStep` (intenção, memória, municipais, geral, governadores, renovação), desfechos, notícias | `src/engine/elections/*`, `src/engine/events/outcome.ts`, `src/engine/news/news.ts` |
| T3 | **Vedação + ações**: rejeição/bypass, penalidade, `declarar_reeleicao`, `apoiar_candidato`, invariantes | `src/engine/advanceMonth.ts`, `src/engine/proposals/proposals.ts`, `src/engine/actions.ts`, `src/engine/agenda.ts`, `src/engine/invariants.ts` |
| T4 | **Parâmetros e estado**: `PARAMS` (`int_*`, `mood_*`, `eleicao_*`, `governador_*`, `municipais_*`, `vedacao_*`, `renovacao_*`, `turno2_*`, `declaracao_*`), `PoliticsState` inicial, `upgrade` v7→v8 + fixture | `src/engine/economy/calibration.ts`, `src/engine/state.ts`, `src/engine/upgrade.ts`, `src/engine/upgrade.test.ts` |
| T5 | **Cenário v0.7.0**: JSON + registro + `campaignMonths` + testes de conteúdo | `src/data/scenarios/brasil_2027_01_v070.json`, `src/content/scenarios.ts`, `src/content/scenarios.test.ts` |
| T6 | **Fase Eleitoral (avanço de mês)**: `electionsStep` no `DEFAULT_STEPS`, invariantes, desfechos | `src/engine/advanceMonth.ts`, `src/engine/invariants.ts`, `src/engine/events/outcome.ts` |

Plano consolidado (efeitos visíveis ao fim):

| # | Tarefa | Arquivos (dono único) |
| --- | --- | --- |
| T7 | **Interface**: intenção no card do ciclo (pseudo-indicador), motivo de rejeição, aviso/bypass de vedação, card "Eleições", encerramento por derrota e histórico de administrações | `src/components/campaign/*`, `src/store/*` |
| T8 | **Simulação e documentos**: `withElectoralDeclarations`, campanhas de 48/96 meses sem violação, determinismo; roadmap, GAME_DESIGN, POLITICAL_RULES, ECONOMIC_MODEL, DATA_SOURCES, CALIBRATION, glossário | `src/engine/sim/*`, `scripts/sim/*`, `docs/*` |

Regras comuns a todas: ler `docs/AI_INSTRUCTIONS.md`; declarar os arquivos antes de editar; não tocar arquivos de outra tarefa; não editar `src/types/scenario.ts` nem `src/engine/types.ts` (contrato fechado — pedir ao coordenador se faltar algo); rodar só os testes dos próprios arquivos (`npx vitest run <arquivo>`); o `npm run check` completo roda o coordenador.

## Critérios de aceitação

1. Estado v7 é atualizado para v8 sem alterar campos antigos e continua jogável (cenário v060, 24 meses).
2. Cenário v070: `electionsStep` roda todos os meses, invariantes limpos, e a campanha de 96 meses (estratégias-robô + declaração automática) termina em vitória → mandato seguinte (reeleição ou sucessão, com transição sem reset), ou derrota → `derrota_eleitoral`.
3. Vedação: nas janelas (meses do mandato 18–20 e 42–44), novo benefício é rejeitado sem bypass, vai com bypass com penalidades na intenção (e risco de multa de aprovação).
4. Municipais (meses 21 e 69) movem a aprovação com causa `municipais` e geram notícia; geral (45/93) grava `eleicao_geral` com resultado e turno.
5. Governadores mudam de dono na eleição geral (relação nova −15 + dispersion); lançamento de declaração (meses 39–44 apenas; fora da janela → rejeitada `alvo_invalido`) move a intenção (impulso +2 pp).
6. Determinismo: mesma semente e mesmo input → mesmas eleições e mesmas listas de impulsos.
7. `npm run check` verde.

## Fora do escopo

Eleições ano a mês (2º turno decidido no mesmo passo), nomes legais de partidos, eleições por UF simuladas candidato a candidato, comissões e parlamentares individuais (Fase 09), jogo com voto obrigatório fora dos meses eleitorais, i18n.

## Progresso

- Fixture v7 real gerada com o motor 0.7.0 (16/10/2026): `src/tests/saves/state_v7_fase07.json` — fisiológica, semente 4, sete meses, cenário `brasil_2027_01_v060`.
- Plano e contratos fechados (16/10/2026). T1–T8 em execução pelo coordenador (sem subagentes).
- T1–T5 e as correções da auditoria de execução aplicadas (17/10/2026): migração v7→v8 com teste da fixture (conversão + 12 meses jogáveis), validações e chave das ações eleitorais, penalidades da vedação no envio, invariantes da intenção/memória, desfechos e notícias de eleição; `npm run check` verde (657 testes, 39 arquivos).
- T7 (17/10/2026, achados da revisão do PR #9): card "Eleições" com a intenção de voto e "Por que mudou?" (pseudo-indicador), confirmação de quebra declarada da vedação na mesa de despacho (`vedacao_bypass`), `apoiar_candidato` com escolha de bloco, `declarar_reeleicao` movida do `AgendaActions` para o card (com contexto da janela) e desfechos `derrota_eleitoral`/`fim_de_mandato` no relatório de legado; `npm run check` verde.
- Correções da 2ª rodada do PR #9 (17/10/2026): os 40 eventos com escopo por `onlyScenarios` que listavam o v0.6.0 passaram a listar também o v0.7.0 (o cenário padrão herda todo o elenco de eventos, com teste de paridade em `phase07.test.ts`), e `electionCandidateSchema` exige `dataStatus` (candidatos do v0.7.0 marcados como FICTICIO).
- Correção da 3ª rodada do PR #9 (17/10/2026): a posse dos governadores eleitos virou etapa própria (`governorTurnoverStep`), que roda depois de `regionsStep` no `DEFAULT_STEPS` — no mês da eleição geral o governador recém-eleito parte de `governador_nova_relacao` sem ser puxado pelo arrasto da evolução regional do mesmo mês, e a contribuição de aprovação do pleito continua entrando antes da distribuição às UFs (teste de regressão no pipeline completo em `elections.test.ts`).
