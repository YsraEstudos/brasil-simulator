# Brasil Simulator — Roadmap

Versão 0.5 do documento • 20/10/2026 • v0.2: adições do plano v1.1 (§2.1) e decisão D7 • v0.3: Fases 09–11 movidas para [ROADMAP_2.0.md](ROADMAP_2.0.md) • v0.4: status da Fase 08 e branches das Fases 07–08 • v0.5: reorganização "Painel único" (§2.1)
Prazos são estimativas para uma pessoa desenvolvendo com apoio intensivo de IA.

---

## 1. Versões

| Versão | Conteúdo obrigatório | Fases | Resultado |
| --- | --- | --- | --- |
| **0.1 — Protótipo** | 12 turnos, 8 políticas, 10 eventos, 5 indicadores, salvamento | 00–02 | Validar a diversão central |
| **0.5 — Alpha** | Economia completa, Congresso, 27 UFs, políticas públicas, campanha de 4 anos | 03–07 | Jogo completo para testes |
| **1.0 — Lançamento** | Eleições, mandatos, notícias, tutorial, equilíbrio, estabilidade | 08, 10 | Publicação Android |

As Fases 09–11 (a Fase 10 conclui a 1.0; as Fases 09 e 11 são a 2.0) estão no [ROADMAP_2.0.md](ROADMAP_2.0.md).

**Regra de produção:** a Fase 09 só começa com a 0.5 funcional, testada e jogável.

---

## 2. Fases

| Fase | Nome | Estimativa | Critério de conclusão | Status |
| --- | --- | --- | --- | --- |
| 00 | Pré-produção e regras | 1–2 sem | Explicar sem código o caminho decisão → Congresso → orçamento → execução → indicadores | ✅ Concluída em 13/10/2026 (documentos revisados, D1–D3 decididas, itens ⚠ verificados) |
| 01 | Fundação técnica e interface | 2–3 sem | App instalado no Android, navegação funcional, partida salva após fechar e reabrir | ✅ Concluída em 13/10/2026 (rodando no Expo Go no moto g20; build própria adiada, ver item 11) |
| 02 | Protótipo jogável | 3–4 sem | 12 meses jogáveis, decisões diferentes → consequências diferentes, salvar/retomar | 🟡 Implementada em 13/10/2026 (itens 1–9); falta o teste com pessoas (item 10) |
| 03 | Motor econômico | 4–6 sem | Campanhas automáticas de 20 anos sem inconsistências ou explosões injustificadas | 🟡 Implementada em 13/10/2026 (itens 1–10 do §6); falta a revisão do autor da trajetória da dívida de longo prazo |
| 04 | Congresso e instituições | 3–5 sem | Propor, negociar e acompanhar uma reforma com resultado plausível | 🟡 Implementada em 13/10/2026 (itens 1–11 do §7); falta a revisão do autor da calibração política (força dos ministérios e das emendas) |
| 05 | Mapa e federação | 3–4 sem | Decisões federais com efeitos regionais diferentes e explicáveis | 🟡 Implementada em 14/10/2026 (itens 1–10 do §8); falta a revisão do autor dos dados das UFs e da força dos efeitos regionais |
| 06 | Sociedade e políticas públicas | 3–5 sem | ≥ 30 políticas com custos, efeitos e atrasos documentados | 🟡 Implementada em 15/10/2026 (42 políticas, sociedade, diretrizes, projetos e marcas); falta a revisão do autor da calibração social e da execução |
| 07 | Eventos, notícias, personagens | 2–4 sem | Campanha de 4 anos com eventos variados, causas identificáveis e efeitos persistentes | 🟡 Implementada em 16/10/2026 (37 eventos, cadeias, marcas, notícias e personagens; ver §8.2); falta a revisão do autor de calibração e conteúdo |
| 08 | Eleições e mandatos | 2–4 sem | Mandato completo + eleição + novo ciclo ou encerramento | 🟡 Implementada em 17/10/2026 (estado v8, motor 0.8.0, cenário v0.7.0 de 96 meses; ver [FASE_08.md](FASE_08.md)); falta a simulação e os documentos finais (T8) |

Continuação (Fases 09–11): [ROADMAP_2.0.md](ROADMAP_2.0.md).

### 2.1 Adições do plano v1.1 (13/10/2026)

Revisão externa avaliada em 13/10/2026. A ordem das fases não mudou (o motor já veio antes da interface, e o banco já guarda o estado como JSON). Entraram estas adições:

| Fase | Adição | Documento |
| --- | --- | --- |
| 02 | Mesa de despacho simples (Fazenda, Articulação, Comunicação) nas 8 decisões | GAME_DESIGN.md §4.4 |
| 02 | Lua de mel no modelo de opinião | POLITICAL_RULES.md §11.1 |
| 02 | Estratégias-robô inerte e populista fiscal; `npm run sim:balance` | ECONOMIC_MODEL.md §9 |
| 02 | Atualização de saves de versões antigas do estado | AI_INSTRUCTIONS.md §3 |
| 03 | Fila de efeitos agendados (`ScheduledImpulse`) | ECONOMIC_MODEL.md §5.11 |
| 03 | Retorno decrescente de tributos e saída de capital | ECONOMIC_MODEL.md §5.7 |
| 03 | Compressão das discricionárias e paralisação da máquina | ECONOMIC_MODEL.md §5.8 |
| 03 | Calibração centralizada e saturação de realimentações | ECONOMIC_MODEL.md §1, AI_INSTRUCTIONS.md §3 |
| 03 | Retenção do histórico (12 meses detalhados, depois só indicadores) | ECONOMIC_MODEL.md §11 |
| 03 | Eventos de 2027: CBS, regimes diferenciados, FNDR, orçamento de transição | GAME_DESIGN.md §11.3 |
| 04 | Capacidade de pauta, emendas como pedágio, ministérios técnicos ou partidários, estratégia-robô fisiológica | POLITICAL_RULES.md §6.3 |
| 05 | Estados como distribuição do agregado nacional (D7) | ECONOMIC_MODEL.md §5.12 |
| 06 | Políticas de rotina por diretriz e até 3 marcas de governo | GAME_DESIGN.md §9.2 |
| 08 | Memória curta do eleitor e vedações do ano eleitoral | POLITICAL_RULES.md §11 |
| Interface (20/10/2026) | ✅ **Painel único**: sem barra de abas; o jogo abre no Painel (globo com HUD), com folhas (consulta rápida) e subtelas (Gabinete, Congresso, Economia, Notícias, Legado). Só interface e navegação: motor, banco e saves não mudam. Etapas 1–2 nos PRs #17 e #18; Etapas 3–5 na branch `feat/painel-etapas-3-5` | [PLANO_PAINEL_UNICO.md](PLANO_PAINEL_UNICO.md), GAME_DESIGN.md §4.6 |

---

## 3. Fase 00 — checklist

- [x] `GAME_DESIGN.md`: visão, papel do jogador, turnos, dificuldades, fim de jogo, objetivos, ciclo de vida das decisões, exemplo completo, especificação do protótipo
- [x] `ECONOMIC_MODEL.md`: princípios, unidades, variáveis, ordem de cálculo, equações v0.1, parâmetros provisórios, invariantes
- [x] `POLITICAL_RULES.md`: competências, instrumentos, quórums, orçamento, regras fiscais e tributárias, Congresso em blocos, veto, controle judicial, impeachment, catálogo de 20 políticas
- [x] `DATA_SOURCES.md`: status dos dados, metadados, fontes, variáveis do cenário, pipeline
- [x] `AI_INSTRUCTIONS.md`: regras obrigatórias para agentes de IA
- [x] Revisão humana dos cinco documentos (13/10/2026)
- [x] Resolver as decisões que bloqueiam as Fases 01–02 (D1, D2, D3 — §9.1)
- [x] Verificar os itens ⚠ de POLITICAL_RULES.md que afetam o protótipo (13/10/2026; registro em DATA_SOURCES.md §6). Restam: execução provisória da LOA (aguarda LDO 2027) e texto compilado da LC 214/2025.

---

## 4. Fase 01 — plano de tarefas

Ordem sugerida, uma tarefa por branch/PR:

1. ✅ `git init`, `.gitignore`, `README`, repositório privado [YsraEstudos/brasil-simulator](https://github.com/YsraEstudos/brasil-simulator). Licença: pendente.
2. ✅ Criar projeto Expo (SDK estável mais recente no momento) com TypeScript `strict`, Expo Router e layout `src/`. Fixar versões.
3. ✅ ESLint + Prettier + Vitest; script `npm run check` (tipos, lint, testes).
4. ✅ GitHub Actions: rodar `check` em todo PR.
5. ✅ Esqueleto do motor: `src/engine/` com tipos `GameState`, `Decision`, `MonthResult`, PRNG com semente e `advanceMonth()` vazio, com testes de determinismo. **Sem React** (garantido pelo ESLint).
6. ✅ Esquemas Zod para cenário e políticas (`src/types/`): valor com fonte/status, política, cenário com blocos e Copom.
7. ✅ Banco SQLite: tabelas `campaigns`, `snapshots`, `decisions`, `events`, `schema_migrations`; sistema de migrações versionado com testes (expo-sqlite no app, `node:sqlite` nos testes).
8. ✅ Sistema de design: tokens de cor (claro/escuro), tipografia, escala de texto ajustável, componentes base (Card, Indicator, Alert, Button). Vitrine em `/design`; a escala de texto passa a ser salva no item 10.
9. ✅ Navegação: 5 abas — Presidência, Economia, Congresso, Brasil, Notícias. *(Substituída em 20/10/2026 pelo Painel único, §2.1: sem abas, com folhas e subtelas.)*
10. ✅ Criar, salvar, fechar e retomar uma partida fictícia (tela Presidência, store Zustand, cenário `prototipo_ficticio`, tamanho do texto salvo). Verificado na web e no moto g20 via Expo Go (criar, encerrar meses, fechar à força o app, reabrir e continuar).
11. ⏸ Rodando no Expo Go em aparelho Android físico (moto g20). Build de desenvolvimento própria **adiada** (decisão de 13/10/2026: o lançamento está distante). Fazer quando acontecer o primeiro destes gatilhos: (a) adicionar biblioteca nativa que não existe no Expo Go; (b) o Expo Go da Play Store passar a exigir um SDK mais novo que o do projeto (atualizar o SDK ou gerar a build); (c) medir FPS e memória de verdade, que exige build de release; (d) preparação da Fase 10.

### 4.1 Globo 3D (antecipado da Fase 05 a pedido, 13/10/2026)

Decisão: a tela "Brasil" é um globo 3D (three.js + @react-three/fiber + expo-gl) em vez do mapa SVG 2D previsto. Estilo estilizado por bioma; zoom até ~650 m/pixel (regiões e estados); tudo offline.

- [x] Pipeline de dados (`scripts/data/`) e assets (`assets/globe/`, ~12 MB)
- [x] Quadtree de 6 níveis com atlas 4x4, LOD por erro em tela, cache LRU, renderização sob demanda
- [x] Relevo 3D com exagero variável por zoom, inclinação automática perto do solo
- [x] Gestos: arrastar com inércia, pinça, toque duplo, toque para selecionar UF
- [ ] Medir FPS e memória em aparelho Android de entrada e em iPhone
- [ ] Rótulos de UFs e capitais
- [ ] Mapas de calor por indicador (Fase 05)

### 4.2 Globo vivo (antecipado a pedido, 20/10/2026)

Plano de clima, dia e noite, alinhamento ideológico, mapa eleitoral e mapa 2D em [PLANO_GLOBO.md](PLANO_GLOBO.md); roteiro de 15 PRs em §7.

- [x] PR 0: medição no aparelho (contador de dev no app e `scripts/perf/medir-globo.ps1` via adb; `docs/MEDICAO_GLOBO.md`, em branch separada)
- [x] PR 1: prévia regional na mesa de despacho e mapa 2D (Mapa 2D e Mapa 2D leve em Configurações)
- [ ] PRs 2–14: ver [PLANO_GLOBO.md](PLANO_GLOBO.md) §7

## 5. Fase 02 — plano de tarefas

1. ✅ Cenário `brasil_2027_01` v0.1.0 com valores `PROVISORIO` (aprovação inicial `FICTICIO`) e bloco econômico; é o cenário padrão das novas campanhas.
2. ✅ Motor mínimo (`src/engine/economy/`): hiato, inflação, Banco Central, desemprego, contas públicas, dívida e credibilidade, com invariantes §7.1–7.3, 7.5–7.6. Simplificações em ECONOMIC_MODEL.md §5.13; calibração centralizada em `calibration.ts`.
3. ✅ Máquina de estados de propostas (`src/engine/proposals/`): ato do Executivo, tramitação, recesso, capacidade de pauta, votação, sanção, MP com vigência imediata, execução com riscos e anterioridade/noventena. Fila de impulsos agendados (ECONOMIC_MODEL.md §5.11).
4. ✅ Congresso em 5 blocos (`src/engine/congress/`): apoio por ideologia, relação, interesse e opinião; quóruns de PL, PLP, PLN, MP e PEC (3/5 em dois turnos).
5. ✅ 8 políticas em `src/data/policies/`.
6. ✅ 10 eventos em `src/data/events/`, com condições, probabilidade, intervalo mínimo e escolha padrão.
7. ✅ Relatório mensal com "Por que mudou?", manchetes e mesa de despacho (`src/engine/report/`); relatórios dos últimos 12 meses salvos no banco (migração 3). Lua de mel na opinião pública (`src/engine/politics/`).
8. ✅ Telas: Presidência (briefing, caixa de entrada, agenda com mesa de despacho, propostas, relatório de legado), Economia, Congresso e Notícias. Verificado na web (criar, decidir, encerrar meses, retomar).
9. ✅ Campanhas automáticas (`src/engine/sim/`, 5 estratégias-robô × sementes × 12 e 48 meses) e `npm run sim:balance`. Saves v1 são atualizados para o estado v2.
10. ⬜ Teste com 3–5 pessoas: o jogo é interessante após vários meses?

**Limitações conhecidas ao fim da implementação (para a Fase 03):** a dívida bruta sobe cerca de 5 p.p. do PIB ao ano em todas as estratégias (juros nominais ~9,7% do PIB: taxa implícita e Selic do cenário provisório); as estratégias-robô diferem pouco em inflação e dívida em 12 meses; sem câmbio, prêmio de risco e pressão sobre o BC; riscos de judicialização e escândalo das políticas não são modelados na execução; a pontuação do legado é uma média simples de sinais.

## 6. Fase 03 — plano de tarefas

Branch `feat/fase-03-motor-economico`. Estado v3 (saves v2 atualizados), motor 0.3.0, cenário `brasil_2027_01` v0.2.0.

1. ✅ **Setor externo e risco** (`src/engine/economy/external.ts`): prêmio de risco saturado (dívida, meta, credibilidade, tributação do capital), câmbio em nível com retorno ao câmbio de equilíbrio, juros externos e termos de troca estocásticos com semente, repasse cambial à inflação e ajuste cambial da dívida (ECONOMIC_MODEL.md §5.5, §8).
2. ✅ **Banco Central v2**: juro neutro com prêmio de risco, passo maior em crise e **pressão pública** como ação de agenda, com diretoria indicada pela LC 179/2021 (§5.4, §5.4.1).
3. ✅ **Receitas por grupo** com repartição a estados e municípios e **retorno decrescente** das alíquotas (§5.7).
4. ✅ **Despesas por grupo, limite do arcabouço e compressão das discricionárias**: limite revisto em janeiro (70%/50% da receita real, faixa 0,6–2,5%), obrigatórias indexadas (benefícios, salário mínimo pela Lei 15.077/2024, vinculações à receita), discricionárias = limite − obrigatórias, piso de funcionamento e estouro registrado (§5.8; POLITICAL_RULES.md §4.2–4.3).
5. ✅ **Níveis e contas**: PIB potencial e nível de preços como índices, PIB nominal corrente para converter custos, crescimento nominal mensal na dívida, impulso fiscal estrutural que se dissipa.
6. ✅ **Conteúdo de 2027**: política de valorização do salário mínimo; eventos CBS, regimes diferenciados, FNDR, orçamento de transição e paralisação da máquina (GAME_DESIGN.md §11.3).
7. ✅ **Invariantes e validação**: §7.4 (limite com exceções registradas) e §7.8 (estado estacionário); campanhas de 240 meses; estratégias distributiva, pró-oferta e pressão sobre o BC; teste de sentido da pressão; cenários de estresse; `npm run sim:balance` com 240 meses.
8. ✅ **Sensibilidade e calibração documentada**: justificativa por parâmetro e `npm run sim:sensitivity` (cada parâmetro no mínimo e no máximo da faixa), gerando `docs/CALIBRATION.md`.
9. ✅ **Retenção do histórico** (migração 4): série de indicadores por mês; snapshots completos só do mês atual e dos 12 anteriores (ECONOMIC_MODEL.md §11).
10. ✅ **Interface**: aba Economia com câmbio, risco, receitas, limite e discricionárias; ação "Pressionar o Banco Central".

**Resultado (13/10/2026):** 342 testes; 8 estratégias-robô sem violação de invariantes em 12, 48 e 240 meses; todos os parâmetros nos extremos da faixa sem violação nem explosão ([CALIBRATION.md](CALIBRATION.md)). Verificado na web: ação de pressionar o BC, aba Economia com câmbio, risco, limite e receitas.

**Limitações conhecidas (para revisão):** a dívida bruta termina entre ~185% e ~240% do PIB em 20 anos (~310% com pressão trimestral sobre o BC): juros reais de ~5% contra crescimento de 2% com primário perto de zero; estabilizar exige ~2,5% do PIB de primário, fora do alcance das 9 políticas atuais. Sem reformas, as discricionárias chegam ao mínimo por volta de 2029–2030 e o limite passa a ser estourado todo mês. A aprovação de longo prazo converge para perto da base em todas as estratégias. Riscos de judicialização e escândalo continuam sem efeito na execução.

**Fora do escopo da Fase 03:** setores, quintis e 27 UFs (Fases 05–06); carteira de projetos e capital público explícito (§5.10, Fase 06); importação de dados oficiais (o cenário de jan/2027 só existirá depois de dez/2026).

## 7. Fase 04 — plano de tarefas

Branch `feat/fase-04-congresso` (a partir da Fase 03). Estado v4 (saves v3 atualizados), motor 0.4.0, cenário `brasil_2027_01` v0.3.0. Critério: propor, negociar e acompanhar uma reforma com resultado plausível.

1. ✅ **Câmara e Senado separadas** (POLITICAL_RULES.md §6.4): a proposta vota numa Casa e só depois segue para a outra, com prazo próprio em cada uma; PEC vota os dois turnos na mesma Casa. **Capacidade de pauta por Casa**, com PEC ocupando 2 vagas (§6.3).
2. ✅ **Relator e presidentes das Casas**: relator sorteado por Casa (peso das cadeiras e do bloco que preside a Casa); relator com pouco apoio altera o texto e pode incluir acréscimos estranhos ao projeto; presidente da Casa com relação ruim deixa de pautar (adiamento registrado).
3. ✅ **Negociação por proposta** (ações de agenda com alvo): negociar com um bloco, liberar emendas, ceder no texto e pedir urgência constitucional (PL e PLP). **Emendas como pedágio**: em votação difícil sem emendas liberadas, os líderes adiam a votação; as emendas saem do espaço das discricionárias (ECONOMIC_MODEL.md §5.8).
4. ✅ **Ministérios técnicos ou partidários** (POLITICAL_RULES.md §6.3.1): nomear e demitir, com apoio do bloco nas votações, execução pior das políticas da pasta, pasta que trava políticas contrárias ao bloco e risco de escândalo que cresce com o tempo no cargo (evento "Escândalo em ministério").
5. ✅ **Sanção e veto** (§7): aprovação final → sanção no mês seguinte (silêncio = sanção tácita); veto total ou só dos acréscimos; apreciação do veto em sessão conjunta (derrubada por maioria absoluta de cada Casa).
6. ✅ **Medida provisória** (§3, CF art. 62): perde a eficácia se não for convertida em 120 dias; depois de 45 dias tranca a pauta da Casa onde está.
7. ✅ **STF e escândalo na execução** (§8): os riscos `judicializacao` e `escandalo` das políticas passam a ter efeito (liminar que suspende a execução, julgamento que pode derrubar a medida; perda de aprovação), com risco jurídico maior quando há quebra de regra (LRF, limite).
8. ✅ **Conteúdo**: política "Reforma da previdência (parâmetros)" (PEC, catálogo nº 18); ministérios e presidências das Casas no cenário v0.3.0.
9. ✅ **Estratégia-robô fisiológica** (cede ministérios, libera emendas e negocia para aprovar reformas) e teste de plausibilidade da reforma: sem negociação a PEC passa às vezes, com atraso e texto alterado; com negociação passa quase sempre, com custo fiscal, de pastas e de escândalo (`npm run sim:reform`).
10. ✅ **Interface**: aba Congresso com as duas Casas, presidentes, pauta, ministérios e propostas por etapa com votos previstos; negociação e nomeações entram na agenda do mês; sanção e veto na caixa de entrada.
11. ✅ **Documentos e calibração**: POLITICAL_RULES, GAME_DESIGN, ECONOMIC_MODEL, DATA_SOURCES; `npm run sim:sensitivity` regenerando docs/CALIBRATION.md.

**Resultado (13/10/2026):** 418 testes; 9 estratégias-robô sem violação de invariantes em 12, 48 e 240 meses; parâmetros novos nos extremos da faixa sem violação ([CALIBRATION.md](CALIBRATION.md)). Plausibilidade (20 sementes, 36 meses): sem negociação, a reforma administrativa passou em 13 de 20 campanhas (~10 meses, com adiamentos e texto alterado); com a coalizão fisiológica, a previdência passou em 20 (8 meses) e a administrativa em 19 (12 meses), ao custo de 5 pastas de bloco, emendas e ~0,8 escândalo por campanha. Saves v3 atualizados para o estado v4 (fixture real da Fase 03). Verificado na web: enviar a PEC, liberar emendas e entregar uma pasta na aba Congresso (a previsão da Câmara passou de "faltam votos" para "aprovação provável"), votação nas duas Casas, sanção e veto total mantido em sessão conjunta.

**Limitações conhecidas (para revisão):** a coalizão por cargos é forte: uma pasta de peso alto mais emendas põe um bloco de coesão baixa inteiro na base, e a fisiológica aprova quase tudo; a perda de aprovação por escândalo é pequena perto do ganho. A reforma da previdência reduz obrigatórias, mas sob o limite fixo o espaço vira discricionárias (melhora o primário só quando o limite já estoura). As datas nos textos do motor aparecem como "2027-05" (a interface usa "mai/2027"). Comissões, destaques, obstrução, recesso de julho, convocação extraordinária, CPIs, TCU e impeachment não são modelados. O jogo ainda termina em dez/2027 (protótipo de 12 meses).

**Fora do escopo da Fase 04:** impeachment, CPIs e parecer do TCU (proposta: Fase 07, com eventos encadeados); comissões permanentes individuais, emendas de plenário e parlamentares individuais (Fase 09); recesso de julho e convocação extraordinária (o turno é mensal: só janeiro é recesso); indicações ao STF.

## 8. Fase 05 — plano de tarefas

Branch `feat/fase-05-federacao` (a partir da Fase 04). Estado v5 (saves v4 atualizados), motor 0.5.0, cenário `brasil_2027_01` v0.4.0. Critério: decisões federais com efeitos regionais diferentes e explicáveis. Arquitetura pela decisão D7 (ECONOMIC_MODEL.md §5.12): o motor nacional não muda; as UFs recebem uma **distribuição** do agregado, sem motor macroeconômico por UF.

1. ✅ **Dados das 27 UFs no cenário v0.4.0** (`regions`): população, participação no PIB, peso de agropecuária, extrativa, indústria e serviços, desemprego inicial, pobreza, bloco do governador e relação inicial (DATA_SOURCES.md §4.2). Valores `PROVISORIO` (ordens de grandeza do IBGE) e governadores `FICTICIO`.
2. ✅ **Motor regional** (`src/engine/regions/`): participação estrutural de cada UF mais um desvio explicado por causa (setores × hiato e termos de troca, gasto federal pela chave de distribuição de cada política, choques regionais de eventos); capital público regional muda a participação estrutural. Desemprego e aprovação por UF são desvios da média nacional, normalizados para que a média ponderada reproduza o número nacional (invariante §7.9).
3. ✅ **Chaves de distribuição e impulsos regionais**: cada política diz como o gasto (ou o tributo) se reparte entre as UFs (população, pobreza, PIB); impulsos carregam o escopo regional; eventos ganham alvos `regiao.atividade`, `regiao.aprovacao` e `governadores.relacao` com regiões ou UFs.
4. ✅ **Governadores** (POLITICAL_RULES.md §2): relação por UF que segue o bloco do governador, a aprovação local e as transferências recebidas; governador aliado ou hostil puxa a aprovação local; programas com `adesao_estadual` dependem da adesão de cada estado (substitui o sorteio genérico de baixa adesão).
5. ✅ **Ação de agenda "Visitar um estado"** (1 ação, alvo UF): aprovação local e relação com o governador sobem por alguns meses.
6. ✅ **Conteúdo**: chave regional nas 10 políticas; efeitos regionais na seca, nas enchentes e nos eventos de governadores; evento novo "Estados endividados pedem alívio".
7. ✅ **Explicação**: relatório mensal com a decomposição por UF ("Por que este estado está diferente da média?"); mesa de despacho com a incidência regional e a adesão prevista dos estados; dispersão regional no relatório de legado (GAME_DESIGN.md §7.2).
8. ✅ **Testes**: invariante §7.9 em todas as campanhas automáticas; testes de sentido (transferência à baixa renda favorece Norte e Nordeste; tributo sobre a renda pesa mais no Sudeste; seca concentra a perda no Nordeste; relação ruim com governadores reduz a adesão); determinismo; save v4 real atualizado para v5.
9. ✅ **Interface**: aba Brasil com mapa de calor no globo por indicador (crescimento, desemprego, aprovação, renda per capita, relação com o governador), legenda, lista ordenada das UFs e cartão da UF com os valores, a explicação, o governador e a visita.
10. ✅ **Documentos e calibração**: ECONOMIC_MODEL §5.12/§5.15 e §7.9, POLITICAL_RULES §2.1, GAME_DESIGN (aba Brasil), DATA_SOURCES (cenário v0.4.0), `npm run sim:sensitivity` regenerando CALIBRATION.md.

**Resultado (14/10/2026):** 450 testes; 9 estratégias-robô sem violação de invariantes (incluindo o §7.9) em 12, 48 e 240 meses; 204 parâmetros nos extremos da faixa sem problema ([CALIBRATION.md](CALIBRATION.md)). Efeitos regionais testados por sentido: transferência à baixa renda favorece Norte e Nordeste; tributo sobre a renda pesa mais no Sudeste e no DF; seca concentra a perda no Nordeste e no Centro-Oeste; termos de troca favoráveis puxam UFs agrícolas e extrativas; governadores aliados aderem mais. Em 48 meses, a aprovação relativa do Nordeste fica +1,8 p.p. acima da média com a estratégia distributiva, contra +0,4 p.p. na inerte. Save v4 real atualizado para v5. Verificado na web: mapa de calor por indicador, lista, cartão da UF com explicação, visita na agenda e efeito depois de encerrar o mês, inclusive numa partida salva antes da Fase 05.

**Limitações conhecidas (para revisão):** os dados das UFs são ordens de grandeza (`PROVISORIO`) e os governadores, fictícios; a dispersão regional da renda quase não muda em 4 anos (0,389 → 0,388–0,390), porque só o capital público regional mexe na participação de tendência; o reajuste do salário mínimo não tem efeito regional (não passa pela fila de impulsos); não há finanças estaduais nem FPE/FPM por UF; o ciclo setorial é relativo (não há setores no motor nacional); eventos regionais são fixos em regiões (não sorteiam a UF atingida); a camada de cores do globo ignora o relevo (fica por cima dele) e não há rótulos de UFs no globo.

**Arquivos modificados:** `src/engine/` (novo `regions/`, `types.ts`, `state.ts`, `upgrade.ts`, `advanceMonth.ts`, `invariants.ts`, `actions.ts`, `agenda.ts`, `proposals/proposals.ts`, `events/events.ts`, `economy/calibration.ts`, `report/`, `sim/`, `index.ts`), `src/types/` (cenário, política, evento), `src/data/` (cenário, políticas, eventos), `src/globe/` (camada de mapa de calor), `src/app/brasil.tsx`, `src/components/` (aba Brasil, legado, despacho), `src/tests/saves/state_v4_fase04.json` (gravado pelo motor 0.4.0, commit ffd00cd: estratégia fisiológica, semente 4, sete meses), `scripts/sim/`, `docs/`.

**Fora do escopo da Fase 05:** motor econômico por UF (D7 proíbe), finanças estaduais (receita, dívida e folha dos estados), municípios, eleições de governadores (Fase 08), bancadas estaduais no Congresso (Fase 09), setores no motor nacional e quintis de renda (Fase 06), rótulos de capitais no globo.

---

## 8.1 Fase 06 — sociedade e políticas públicas

Branch `codex/fase-06-sociedade`. Plano e decisões: [FASE_06.md](FASE_06.md).
Estado v6, motor 0.6.0, cenário `brasil_2027_01_v050` v0.5.0. Cenários e
políticas legadas preservados, com migração sequencial e fixture v5 real.

1. **Catálogo:** 42 políticas validadas — 10 legadas, 22 rotinas e 10 projetos.
   Cada uma tem custo, canais, prazos, riscos e incidência; documentação em
   [POLICIES.md](POLICIES.md).
2. **Sociedade:** seis setores reconciliados com o produto nacional, cinco
   quintis, renda real, salário mínimo, desemprego e pobreza estimada. Incidência
   de impulsos ativos com saturação e reversão após o fim dos programas.
3. **Diretrizes:** orçamento anual de rotina por pasta, troca na agenda e
   renovação anual limitada pela disponibilidade discricionária, sem criar
   dotação ou contornar a tramitação das demais políticas.
4. **Carteira:** planejamento, licenciamento, licitação, obra e operação;
   desembolso e avanço físico, atrasos, suspensão, ativo concluído, depreciação
   e manutenção. Os projetos novos não duplicam oferta ou gasto do fluxo legado.
5. **Marcas:** até três projetos nomeados por mandato; acompanhamento mensal
   e legado, inclusive cancelamentos que consomem a escolha.
6. **Interface:** catálogo por área, pastas recolhíveis, dotação, carteira e
   marcas na Presidência; setores e quintis na Economia; resultados no legado.
   Seleção apenas prepara a agenda, aplicada ao encerrar o mês.
7. **Jogabilidade:** 48 meses no cenário novo para acompanhar os projetos;
   campanhas antigas continuam limitadas a 12 meses. Eleições e expansão do
   conteúdo de eventos permanecem nas Fases 07–08.

**Limitações para homologação:** todos os números novos são `PROVISORIO`;
pobreza e quintis são forma reduzida de jogo, sem importação de séries
oficiais; setores distribuem o agregado e não formam um modelo insumo-produto.
Desempenho e gestos em aparelhos Android/iPhone continuam dependendo de teste
físico. A revisão humana da força dos efeitos e da diversão não é substituída
pelas campanhas automáticas.

**Validação de 15/10/2026:** 496 testes em 31 arquivos; tipos, lint e
formatação verificados. Campanhas com diretriz, obra e marca por 48/240 meses
em três sementes, mais extremos dos quatro parâmetros novos por 240 meses.
Bundle web exportado e verificado a 390 px: seleção de diretriz sem executar,
encerramento do mês, persistência após recarregar/continuar e painel social
na Economia. Revisão independente sem P1; inconsistências de catálogo e UI
corrigidas. Não houve teste físico Android/iPhone nem publicação.

## 8.2 Fase 07 — eventos, notícias e personagens

Branch `feat/fase-07-eventos-noticias` (PR #8, na `main` por squash). Plano e decisões: [FASE_07.md](FASE_07.md).
Estado v7, motor 0.7.0, cenário `brasil_2027_01_v060` v0.6.0 (48 meses).
Cenários e saves anteriores não recebem nenhum evento novo.

1. **Eventos:** 37 novos (`fase07_*`), todos restritos ao v0.6.0. 29 usam
   marcas, 10 só chegam por cadeia e há 13 ligações de encadeamento
   ([GAME_DESIGN.md](GAME_DESIGN.md) §11.3.1).
2. **Instituições:** CPI, TCU e impeachment como cadeias de eventos, com a
   pressão `impeachmentPressure` ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.17).
   A condenação no Senado grava `impeachment_condenado` e encerra a campanha
   como derrota ([POLITICAL_RULES.md](POLITICAL_RULES.md) §9–§10).
3. **Notícias:** feed persistido de até 48 manchetes, com causa, tom e filtro
   por tipo, gerado pelo motor sem rede.
4. **Personagens:** elenco fictício de 12, com prestígio de −100 a 100 que muda
   por escolhas e vale como condição. Não tem agenda própria.
5. **Save:** v6 → v7 por `upgradeGameState`, sem alterar os campos antigos;
   fixture real `state_v6_fase06.json`.

**Validação por simulação (16/10/2026, T8):** `src/engine/sim/phase07.test.ts`
e `npm run sim:events` (`scripts/sim/events.sim.ts`). Nove estratégias, 20
sementes, 48 meses: nenhuma violação de invariante; 45 tipos de evento
distintos disparam, 29 deles `fase07_*`; manchetes de todos os cinco tipos.
Determinismo, persistência de marcas e isolamento do v0.5.0 (nenhum `fase07_*`
em 48 meses) testados.

Pressão de impeachment, 48 meses, 20 sementes (`PROVISORIO`):

| Estratégia | Pressão média | Pressão máx. | Denúncia aceita | Condenado |
| --- | --- | --- | --- | --- |
| Inerte (linha de base) | 4,5% | 15,2% | 0/20 | 0/20 |
| Populista fiscal | 7,2% | 41,0% | 0/20 | 0/20 |
| Austera | 4,9% | 11,6% | 0/20 | 0/20 |
| Reformista | 4,6% | 19,1% | 0/20 | 0/20 |
| Distributiva | 6,0% | 23,6% | 0/20 | 0/20 |
| Pró-oferta | 4,1% | 12,6% | 0/20 | 0/20 |
| Fisiológica | 17,5% | 78,5% | 4/20 | **1/20** |
| Inerte + pressão sobre o BC | 5,0% | 16,5% | 0/20 | 0/20 |
| Aleatória | 5,0% | 22,8% | 0/20 | 0/20 |

Em 240 meses, 20 sementes, a condenação é quase universal (populista, 0/20,
é a exceção): inerte 20/20 (primeiro mês 161), distributiva 20/20 (106),
aleatória 20/20 (138), inerte + BC 20/20 (134), pró-oferta 17/20 (160),
fisiológica 17/20 (17), austera 19/20 (175) e reformista 15/20 (186). Cada
campanha das estratégias que chegam à condenação tem em média 2,8 a 3,7
eventos encadeados distintos antes do fim (a populista, 0,9).

**Limitações conhecidas (para revisão do autor):**
- **Calibração do impeachment:** na primeira medição a fisiológica era
  condenada em 9 de 20 campanhas de 48 meses; depois de corrigir a dupla
  contagem da CPI (abaixo) caiu para 1 de 20 (denúncia aceita em 4 de 20, CPI
  em 15 de 20). Em 240 meses a condenação continua quase universal nas
  estratégias passivas, porque a pressão se acumula com o tempo e as escolhas
  padrão da cadeia (aceitar a denúncia, deixar a Câmara votar, aguardar o
  julgamento) levam à condenação sem resposta do jogador. Fora da campanha de
  48 meses; parâmetros `PROVISORIO` para revisão do autor.
- **Corrigido na revisão do coordenador:** (1) `cpi_instalada` e `cpi_encerrada`
  contavam como duas marcas na pressão; agora são uma CPI só
  (`scandalFlagCount`). (2) A causa de um encadeado com atraso de 1 mês caía em
  "acontecimento do mês"; agora a origem vem das escolhas resolvidas no
  relatório (teste em `phase07.test.ts`).
- **Mobilizar a base no Senado:** a descrição diz que a escolha "perde força"
  se a base não estiver pronta, mas o motor arquiva sempre.
- **Prazo de resposta:** o evento chega no mês em que deve ser respondido. Sem
  resposta, a escolha padrão vale nesse mesmo mês. O ramo de prazo futuro em
  `resolveEventsStep` não é alcançado pelo sorteio atual.
- Números de gatilho e efeito são `PROVISORIO`; não houve teste com pessoas.
  Personagens não têm agenda própria. Eleições e a memória do eleitor ficam na
  Fase 08.

**Fora do escopo da Fase 07:** eleições (Fase 08); comissões, emendas de
plenário e parlamentares individuais (Fase 09); i18n; imprensa com rede.

## 9. Decisões

### 9.1 Tomadas

| # | Decisão | Escolha | Data |
| --- | --- | --- | --- |
| D1 | Partidos reais ou fictícios | **Fictícios**, agrupados em 5 blocos e calibrados pelas cadeiras reais agregadas de cada campo. Um pacote com nomes reais pode virar expansão (Fase 11). | 13/10/2026 |
| D2 | Idioma dos identificadores | Código em **inglês**; textos de interface, rotas e IDs de conteúdo em **português** (AI_INSTRUCTIONS.md §4) | 13/10/2026 |
| D3 | Biblioteca de gráficos | **Componentes SVG próprios** (`react-native-svg`): `LineChart`, `BarChart`, `Sparkline`, isolados para permitir troca por victory-native se o Realismo Extremo exigir | 13/10/2026 |
| D7 | Economia regional | **Agregado nacional primeiro, distribuído às UFs** por matriz de participação e sensibilidade setorial; nunca 27 motores somados (ECONOMIC_MODEL.md §5.12) | 13/10/2026 |

### 9.2 Em aberto

| # | Decisão | Opções | Recomendação | Bloqueia |
| --- | --- | --- | --- | --- |
| D4 | Regra de reeleição no cenário | atual (uma reeleição) / sem reeleição | Atual, como parâmetro | Fase 08 |

As decisões D5 (nome comercial) e D6 (monetização) estão no [ROADMAP_2.0.md](ROADMAP_2.0.md) §4.

---

## 10. Riscos principais

| Risco | Medida preventiva |
| --- | --- |
| Simulação econômica inconsistente | Invariantes contábeis e campanhas automáticas desde a Fase 02 |
| Escopo excessivo | Escopo fechado por versão (§1); nada da Fase 09 antes da 0.5 |
| Código de IA difícil de manter | Arquitetura modular, tarefas pequenas, revisão por PR (AI_INSTRUCTIONS.md) |
| Lentidão em celulares | Processamento por turno; testes em aparelho de entrada |
| Saves incompatíveis | Versão de motor e cenário no save; migrações testadas |
| Viés político | Parâmetros documentados; teste de estratégias-robô |
| Dados desatualizados ou errados | Status e metadados obrigatórios; cenários congelados |
| Problemas de publicação | Aviso de ficção, sem marcas oficiais, transparência de fontes |
