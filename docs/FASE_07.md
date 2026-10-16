# Fase 07 — Eventos, notícias e personagens

Escopo definido em 16/10/2026. Critério do ROADMAP §2: **campanha de 4 anos com eventos variados, causas identificáveis e efeitos persistentes**. Referências: GAME_DESIGN §11.3 e §13, POLITICAL_RULES §8–§10, ECONOMIC_MODEL §5.11. Executada no checkout atual, branch `codex/fase-06-sociedade` (sem commit nem push automáticos).

## Decisões

- **Cenário novo `brasil_2027_01_v060` v0.6.0** (cópia do v0.5.0 + elenco de personagens). Cenários e saves antigos não recebem eventos novos: todo evento novo traz `onlyScenarios: ["brasil_2027_01_v060"]` (AI_INSTRUCTIONS §8). `DEFAULT_SCENARIO_ID` passa a ser o v0.6.0 (48 meses, como o v0.5.0).
- **Estado v7, motor 0.7.0.** `EventsState` ganha `flags`, `scheduled`, `characters`, `news`. Save v6 → v7 por `upgradeGameState` (valores vazios), com fixture real `src/tests/saves/state_v6_fase06.json` (gravada pelo motor 0.6.0).
- **Persistência de efeitos** sem violar a regra "evento não cria efeito permanente" (≤ 24 meses): memória por **marcas** (`flags`), **cadeias** (`followUps`), **prestígio de personagens** e gatilhos que leem essas marcas.
- **Impeachment, CPI e TCU** entram como cadeias de eventos (POLITICAL_RULES §9–§10), alimentadas por `impeachmentPressure`. Condenação no Senado encerra a campanha (derrota, GAME_DESIGN §7.1) via `campaignOutcome(state)`.
- Notícias são **geradas pelo motor** e persistidas (até `NEWS_LIMIT` itens), cada uma com a **causa**. Nada de rede.
- Personagens, partidos e notícias são fictícios; nenhuma conduta é atribuída a pessoa real (GAME_DESIGN §13).

## Contratos (já implementados em `src/types/` e `src/engine/types.ts`)

Eventos (`src/types/event.ts`), tudo opcional, JSONs antigos continuam válidos:
- `trigger.requiresFlags` / `trigger.forbidsFlags`: marcas que precisam / não podem existir.
- `onFireFlags`: marcas gravadas quando o evento chega à caixa de entrada.
- Escolha: `setFlags`, `clearFlags`, `followUps: {eventId, delayMonths 1–24, probability}`, `characterEffects: {characterId, delta −30…30}`.
- `chainedOnly`: só chega por `followUps`; o sorteio mensal o ignora.
- Encadeado que chega pela fila (`scheduled`) passa pelas mesmas marcas (`requiresFlags`/`forbidsFlags`) e condições do gatilho; se alguma não valer no mês de chegada, ele é descartado.
- `onlyScenarios`, `characterId` (personagem em destaque).
- Condições novas: `impeachmentPressure` e `characterStanding` (com `characterId` na condição).

Cenário (`src/types/scenario.ts`): `characters?: Character[]` (`id`, `name`, `role`, `description`, `blocId?`, `initialStanding`, `dataStatus`).

Estado (`src/engine/types.ts`): `EventsState.flags: Record<string, number>` (mês em que foi gravada), `scheduled: ScheduledEvent[]`, `characters: Record<string, number>` (prestígio; ausente = `initialStanding`), `news: NewsItem[]`. `NewsItem`: `id`, `monthIndex`, `kind` (`economia|congresso|evento|personagem|institucional`), `tone` (`positiva|negativa|neutra`), `headline`, `cause`, `sourceId?`, `characterId?`.

### Elenco (IDs fixos; todos `FICTICIO`)

| id | nome | papel | bloco | prestígio inicial |
| --- | --- | --- | --- | --- |
| `min_fazenda` | Teodoro Vilar | Ministro da Fazenda | — | 40 |
| `pres_camara` | Anselmo Rocha | Presidente da Câmara dos Deputados | centro | 10 |
| `pres_senado` | Odete Brandão | Presidente do Senado | centro | 15 |
| `lider_oposicao` | Cleusa Marante | Líder da oposição na Câmara | direita | −40 |
| `presidente_bc` | Rui Coutinho | Presidente do Banco Central | — | 20 |
| `ministro_stf` | Álvaro Peixoto | Ministro do Supremo Tribunal Federal | — | 0 |
| `governador_nordeste` | Jair Amorim | Governador de um estado do Nordeste | esquerda | 30 |
| `governador_sudeste` | Lúcia Fontenelle | Governadora de um estado do Sudeste | centro_direita | −10 |
| `jornalista` | Beatriz Camargo | Colunista de política | — | 0 |
| `empresario_agro` | Hélio Prado | Presidente de uma confederação do agronegócio | centro_direita | −5 |
| `lider_sindical` | Marlene Duarte | Dirigente de uma central sindical | esquerda | 25 |
| `vice_presidente` | Nelson Arantes | Vice-presidente da República | centro | 35 |

## Plano de tarefas e arquivos

| # | Tarefa | Arquivos (dono único) |
| --- | --- | --- |
| T1 | **Motor de eventos**: marcas, encadeamento, personagens, filtro `onlyScenarios`, `impeachmentPressure`, `characterStanding`, `campaignOutcome`, estado inicial v7 e `upgrade` v6→v7 com teste da fixture | `src/engine/events/*`, `src/engine/state.ts`, `src/engine/upgrade.ts`, `src/engine/upgrade.test.ts` |
| T2 | **Notícias**: `src/engine/news/` (geração com causa, persistência, limite) e integração no `advanceMonth` | `src/engine/news/*`, `src/engine/advanceMonth.ts`, `src/engine/report/explain.ts` |
| T3 | **Conteúdo A** — economia, mercado, setores, clima (14 eventos) | `src/data/events/fase07_eco_*.json` |
| T4 | **Conteúdo B** — Congresso, governadores, STF, personagens do elenco, sociedade, mandato (14 eventos) | `src/data/events/fase07_pol_*.json` |
| T5 | **Conteúdo C** — cadeias institucionais: escândalo → CPI → TCU → impeachment (≥ 8 eventos) | `src/data/events/fase07_inst_*.json` |
| T6 | **Cenário v0.6.0** + elenco + registro + `campaignMonths` + testes de conteúdo | `src/data/scenarios/brasil_2027_01_v060.json`, `src/content/scenarios.ts`, `src/content/scenarios.test.ts`, `src/content/events.ts`, `src/content/events.test.ts` |
| T7 | **Interface**: aba Notícias com o feed persistido e a causa, personagem no briefing do evento, encerramento por impeachment | `src/components/tabs/NewsPanel.tsx`, `src/components/campaign/EventInbox.tsx`, `src/components/campaign/CampaignView.tsx`, `src/store/*`, `src/components/campaign/LegacyReport.tsx` |
| T8 | **Simulação e documentos**: campanhas de 48/240 meses sem violação, determinismo, cobertura de eventos; GAME_DESIGN, POLITICAL_RULES, DATA_SOURCES, ROADMAP, glossário | `src/engine/sim/*`, `scripts/sim/*`, `docs/*` |

Regras comuns a todas: ler `docs/AI_INSTRUCTIONS.md`; declarar os arquivos antes de editar; não tocar arquivos de outra tarefa; não editar `src/types/event.ts`, `src/types/scenario.ts` nem `src/engine/types.ts` (contrato fechado — pedir ao coordenador se faltar algo); rodar só os testes dos próprios arquivos (`npx vitest run <arquivo>`); o `npm run check` completo roda o coordenador.

## Critérios de aceitação

1. ≥ 36 eventos novos (T3–T5), válidos pelo esquema, com limites de magnitude e duração do `src/content/events.test.ts`, todos com `onlyScenarios` e `dataStatus: "FICTICIO"`; ≥ 6 cadeias com `followUps`; ≥ 10 eventos que usam marcas; todo `characterId` e `characterEffects` aponta para o elenco.
2. Campanha de 48 meses com estratégias-robô: eventos de pelo menos 20 tipos diferentes disparam; nenhuma violação de invariante; determinismo (mesma semente, mesmo estado).
3. Toda notícia tem `cause` e vem de causa rastreável (relatório, evento, proposta, indicador).
4. Save v6 real é atualizado para v7 sem alterar campos antigos.
5. `npm run check` verde.

## Fora do escopo

Eleições e memória do eleitor (Fase 08); comissões, emendas de plenário e parlamentares individuais (Fase 09); personagens com agenda própria autônoma; i18n; imprensa com rede.

## Progresso

- Contratos e fixture v6 prontos (coordenador). Tarefas T1–T8 delegadas a subagentes Haiku.
- **T8 (16/10/2026): validação por simulação e documentação.** `src/engine/sim/phase07.test.ts` cobre
  invariantes e determinismo do sweep de 48 meses (9 estratégias × 3 sementes), cobertura de eventos (≥ 20 tipos,
  ≥ 5 `fase07_*`, ≥ 3 encadeados em 240 meses), notícias (causa, limite do feed, ≥ 3 tipos), persistência de
  marcas por JSON e `upgradeGameState(7, ...)`, isolamento do v0.5.0 e faixa da pressão em estratégias passivas.
  `npm run sim:events` (`scripts/sim/events.sim.ts`) faz a varredura de 20 sementes em 48 e 240 meses.
- Documentos atualizados: GAME_DESIGN §11.3.1, POLITICAL_RULES §8–§10, ECONOMIC_MODEL §5.17, DATA_SOURCES §5.2 e
  registro, glossário (AI_INSTRUCTIONS), ROADMAP §2 e §8.2.
- **Pendente para o autor:** calibração do impeachment (fisiológica condenada em 1/20 em 48 meses depois da
  correção da dupla contagem; 240 meses condena quase sempre nas estratégias passivas), ver ROADMAP §8.2.
- **Defeitos encontrados e corrigidos pelo coordenador:** (1) causa de encadeado com atraso de 1 mês
  (`news.ts`, `eventCause`, agora lê as escolhas resolvidas do relatório); (2) `cpi_encerrada` e `cpi_instalada`
  contavam duas vezes na pressão (`pressure.ts`, `scandalFlagCount`). Aberto: "mobilizar a base no Senado" arquiva
  sempre (texto ajustado).
