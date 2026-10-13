# Brasil Simulator — Roadmap

Versão 0.1 do documento • 13/10/2026
Prazos são estimativas para uma pessoa desenvolvendo com apoio intensivo de IA.

---

## 1. Versões

| Versão | Conteúdo obrigatório | Fases | Resultado |
| --- | --- | --- | --- |
| **0.1 — Protótipo** | 12 turnos, 8 políticas, 10 eventos, 5 indicadores, salvamento | 00–02 | Validar a diversão central |
| **0.5 — Alpha** | Economia completa, Congresso, 27 UFs, políticas públicas, campanha de 4 anos | 03–07 | Jogo completo para testes |
| **1.0 — Lançamento** | Eleições, mandatos, notícias, tutorial, equilíbrio, estabilidade | 08, 10 | Publicação Android |
| **2.0 — Expansão** | Realismo Extremo, diplomacia, novos cenários | 09, 11 | Profundidade adicional |

**Regra de produção:** a Fase 09 só começa com a 0.5 funcional, testada e jogável.

---

## 2. Fases

| Fase | Nome | Estimativa | Critério de conclusão | Status |
| --- | --- | --- | --- | --- |
| 00 | Pré-produção e regras | 1–2 sem | Explicar sem código o caminho decisão → Congresso → orçamento → execução → indicadores | ✅ Concluída em 13/10/2026 (documentos revisados, D1–D3 decididas, itens ⚠ verificados) |
| 01 | Fundação técnica e interface | 2–3 sem | App instalado no Android, navegação funcional, partida salva após fechar e reabrir | 🟡 Expo SDK 57, 5 abas, globo 3D, repositório e CI prontos; faltam motor, SQLite, salvamento |
| 02 | Protótipo jogável | 3–4 sem | 12 meses jogáveis, decisões diferentes → consequências diferentes, salvar/retomar | ⬜ |
| 03 | Motor econômico | 4–6 sem | Campanhas automáticas de 20 anos sem inconsistências ou explosões injustificadas | ⬜ |
| 04 | Congresso e instituições | 3–5 sem | Propor, negociar e acompanhar uma reforma com resultado plausível | ⬜ |
| 05 | Mapa e federação | 3–4 sem | Decisões federais com efeitos regionais diferentes e explicáveis | ⬜ |
| 06 | Sociedade e políticas públicas | 3–5 sem | ≥ 30 políticas com custos, efeitos e atrasos documentados | ⬜ |
| 07 | Eventos, notícias, personagens | 2–4 sem | Campanha de 4 anos com eventos variados, causas identificáveis e efeitos persistentes | ⬜ |
| 08 | Eleições e mandatos | 2–4 sem | Mandato completo + eleição + novo ciclo ou encerramento | ⬜ |
| 09 | Realismo Extremo | 4–8 sem | Consistência e desempenho em campanhas de décadas; efeitos rastreáveis | ⬜ |
| 10 | Testes e publicação | 4–6 sem | Versão estável aprovada na Play Store | ⬜ |
| 11 | Expansões | contínuo | — | ⬜ |

---

## 3. Fase 00 — checklist

- [x] `GAME_DESIGN.md`: visão, papel do jogador, turnos, dificuldades, fim de jogo, objetivos, ciclo de vida das decisões, exemplo completo, especificação do protótipo
- [x] `ECONOMIC_MODEL.md`: princípios, unidades, variáveis, ordem de cálculo, equações v0.1, parâmetros provisórios, invariantes
- [x] `POLITICAL_RULES.md`: competências, instrumentos, quórums, orçamento, regras fiscais e tributárias, Congresso em blocos, veto, controle judicial, impeachment, catálogo de 20 políticas
- [x] `DATA_SOURCES.md`: status dos dados, metadados, fontes, variáveis do cenário, pipeline
- [x] `AI_INSTRUCTIONS.md`: regras obrigatórias para agentes de IA
- [x] Revisão humana dos cinco documentos (13/10/2026)
- [x] Resolver as decisões que bloqueiam as Fases 01–02 (D1, D2, D3 — §6.1)
- [x] Verificar os itens ⚠ de POLITICAL_RULES.md que afetam o protótipo (13/10/2026; registro em DATA_SOURCES.md §6). Restam: execução provisória da LOA (aguarda LDO 2027) e texto compilado da LC 214/2025.

---

## 4. Fase 01 — plano de tarefas

Ordem sugerida, uma tarefa por branch/PR:

1. ✅ `git init`, `.gitignore`, `README`, repositório privado [YsraEstudos/brasil-simulator](https://github.com/YsraEstudos/brasil-simulator). Licença: pendente.
2. ✅ Criar projeto Expo (SDK estável mais recente no momento) com TypeScript `strict`, Expo Router e layout `src/`. Fixar versões.
3. ✅ ESLint + Prettier + Vitest; script `npm run check` (tipos, lint, testes).
4. ✅ GitHub Actions: rodar `check` em todo PR.
5. Esqueleto do motor: `src/engine/` com tipos `GameState`, `Decision`, `MonthResult`, PRNG com semente e `advanceMonth()` vazio, com testes de determinismo. **Sem React.**
6. Esquemas Zod para cenário e políticas (`src/types/`).
7. Banco SQLite: tabelas `campaigns`, `snapshots`, `decisions`, `events`, `schema_migrations`; sistema de migrações versionado com testes.
8. Sistema de design: tokens de cor (claro/escuro), tipografia, escala de texto ajustável, componentes base (Card, Indicator, Alert, Button).
9. ✅ Navegação: 5 abas — Presidência, Economia, Congresso, Brasil, Notícias.
10. Criar, salvar, fechar e retomar uma partida fictícia.
11. 🟡 Rodando no Expo Go em aparelho Android físico (moto g20); falta build de desenvolvimento própria.

### 4.1 Globo 3D (antecipado da Fase 05 a pedido, 13/10/2026)

Decisão: a tela "Brasil" é um globo 3D (three.js + @react-three/fiber + expo-gl) em vez do mapa SVG 2D previsto. Estilo estilizado por bioma; zoom até ~650 m/pixel (regiões e estados); tudo offline.

- [x] Pipeline de dados (`scripts/data/`) e assets (`assets/globe/`, ~12 MB)
- [x] Quadtree de 6 níveis com atlas 4x4, LOD por erro em tela, cache LRU, renderização sob demanda
- [x] Relevo 3D com exagero variável por zoom, inclinação automática perto do solo
- [x] Gestos: arrastar com inércia, pinça, toque duplo, toque para selecionar UF
- [ ] Medir FPS e memória em aparelho Android de entrada e em iPhone
- [ ] Rótulos de UFs e capitais
- [ ] Mapas de calor por indicador (Fase 05)

## 5. Fase 02 — plano de tarefas

1. Cenário `brasil-2027-01` v0 com valores `PROVISORIO` e metadados.
2. Motor mínimo: hiato, inflação, BC, desemprego, primário (subset de ECONOMIC_MODEL.md §5) + invariantes.
3. Máquina de estados de propostas (GAME_DESIGN.md §9).
4. Congresso em 5 blocos (POLITICAL_RULES.md §6).
5. 8 políticas em `src/data/policies/`.
6. 10 eventos em `src/data/events/`.
7. Relatório mensal com decomposição "Por que mudou?".
8. Telas do protótipo: briefing, decisões, relatório, indicadores.
9. Testes de campanha automática (12 meses × N sementes × estratégias-robô).
10. Teste com 3–5 pessoas: o jogo é interessante após vários meses?

---

## 6. Decisões

### 6.1 Tomadas

| # | Decisão | Escolha | Data |
| --- | --- | --- | --- |
| D1 | Partidos reais ou fictícios | **Fictícios**, agrupados em 5 blocos e calibrados pelas cadeiras reais agregadas de cada campo. Um pacote com nomes reais pode virar expansão (Fase 11). | 13/10/2026 |
| D2 | Idioma dos identificadores | Código em **inglês**; textos de interface, rotas e IDs de conteúdo em **português** (AI_INSTRUCTIONS.md §4) | 13/10/2026 |
| D3 | Biblioteca de gráficos | **Componentes SVG próprios** (`react-native-svg`): `LineChart`, `BarChart`, `Sparkline`, isolados para permitir troca por victory-native se o Realismo Extremo exigir | 13/10/2026 |

### 6.2 Em aberto

| # | Decisão | Opções | Recomendação | Bloqueia |
| --- | --- | --- | --- | --- |
| D4 | Regra de reeleição no cenário | atual (uma reeleição) / sem reeleição | Atual, como parâmetro | Fase 08 |
| D5 | Nome comercial definitivo | "Brasil Simulator" ou outro | Verificar disponibilidade de marca e na loja antes da Fase 10 | Fase 10 |
| D6 | Monetização | demo grátis + compra única | Conforme o plano mestre; revisar regras do Google Play no lançamento | Fase 10 |

---

## 7. Riscos principais

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
