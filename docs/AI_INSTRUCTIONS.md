# Brasil Simulator — Instruções para Agentes de IA

Versão 0.2 do documento • 13/10/2026 • ✅ Revisado pelo autor em 13/10/2026 • v0.2: calibração centralizada, saturação, fila de efeitos, atualização de saves antigos
Este arquivo vale para qualquer assistente de programação (Claude Code, Codex etc.) que trabalhe no repositório.

---

## 1. Antes de qualquer tarefa

1. Ler este arquivo e o documento da área afetada:
   - interface → [GAME_DESIGN.md](GAME_DESIGN.md) (§4.6: Painel, folhas e subtelas; não há barra de abas)
   - economia → [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md)
   - Congresso, leis, orçamento → [POLITICAL_RULES.md](POLITICAL_RULES.md)
   - dados de cenário → [DATA_SOURCES.md](DATA_SOURCES.md)
   - prioridades → [ROADMAP.md](ROADMAP.md) (Fases 00–08) e [ROADMAP_2.0.md](ROADMAP_2.0.md) (Fases 09–11)
2. Confirmar em que fase o projeto está ([ROADMAP.md](ROADMAP.md) §2 e [ROADMAP_2.0.md](ROADMAP_2.0.md) §2). Não implementar funcionalidades de fases futuras sem pedido explícito.

---

## 2. Regras obrigatórias

1. Ler a documentação do projeto antes de modificar código.
2. Trabalhar em **uma funcionalidade delimitada por tarefa**.
3. **Declarar, antes de editar, quais arquivos serão modificados.**
4. Não alterar regras econômicas ou jurídicas sem atualizar **o documento correspondente e os testes**.
5. Não substituir dados reais por números fictícios sem marcar o status (`FICTICIO`, `PROVISORIO` etc.).
6. Manter o motor de simulação **independente da interface**.
7. Executar `npm run check` (tipos, lint e testes) antes de concluir uma tarefa.
8. Registrar ao final: o que foi implementado, o que não foi e quais limitações permanecem.
9. Usar branches e pull requests para alterações importantes.
10. **Saves antigos: só depois do lançamento.** Enquanto o jogo não for lançado, não existe save de jogador a
    preservar; não gaste esforço com compatibilidade de saves anteriores (ver §2.1).

### 2.1 Compatibilidade de saves (antes e depois do lançamento)

**Situação atual (22/10/2026): jogo NÃO lançado.** Decisão do autor: ninguém terá um save anterior à versão
lançada, então manter compatibilidade com saves de desenvolvimento só gasta tempo e tokens.

Enquanto o jogo não for lançado:
- Mudou o formato do `GameState`? Suba `STATE_SCHEMA_VERSION`, mas **não** escreva função de atualização da versão
  anterior nem teste com save antigo. Um save mais velho pode ser recusado com uma mensagem clara ("comece um novo
  jogo"); não é bug.
- Banco SQLite: tabela ou coluna nova continua entrando por migração numerada (é assim que o banco é criado), mas sem
  converter nem preencher dados antigos.
- Conteúdo (eventos, políticas, cenários) pode ser editado no próprio arquivo; não é preciso criar uma versão nova
  só para não mexer na anterior.
- As funções de atualização e os testes que já existem podem ficar; não precisam ser removidos nem estendidos.

**Quando o jogo for lançado** (o autor atualiza esta seção com a data e a versão), a regra se inverte:
toda mudança de estrutura persistida exige função de atualização + teste que carrega um save da versão anterior,
dados de conteúdo publicados ganham nova versão em vez de edição, e só saves de versão **mais nova** que o app são
recusados.

---

## 3. Regras de arquitetura

| Camada | Pasta | Pode importar | Não pode importar |
| --- | --- | --- | --- |
| Motor | `src/engine/` | `src/types/`, utilitários puros | React, Expo, SQLite, `src/app`, `src/components`, `src/database` |
| Dados de conteúdo | `src/data/` | — (JSON validado por Zod) | código executável |
| Persistência | `src/database/` | `src/engine` (tipos), `src/types` | componentes de interface |
| Estado da interface | `src/store/` (Zustand) | engine, database | — |
| Interface | `src/app/`, `src/components/` | store, types | chamar o motor diretamente para alterar estado sem passar pela store |
| Globo 3D | `src/globe/` | three, R3F, `src/globe/data` (gerado) | o motor de simulação; `src/globe/data/*` é gerado por `scripts/data/build_globe.py` e não deve ser editado à mão |
| Pipeline de dados | `scripts/data/` (Python) | numpy, Pillow, scipy, pyshp | ser importado pelo app |

### Regras do motor
- **Funções puras**: `advanceMonth(state, decisions, rng) → { state, report }`. Sem efeitos colaterais.
- **Proibido** dentro de `src/engine/`: `Math.random()`, `Date.now()`, `new Date()`, I/O, `console.log` em código final.
- Aleatoriedade somente pelo PRNG com semente que recebe como parâmetro.
- Toda alteração de variável relevante registra uma `contribution` com causa (para o "Por que mudou?").
- Unidades conforme [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §2. Nunca misturar porcentagem inteira com fração.
- O jogador nunca altera um indicador de resultado diretamente.
- **Sem números mágicos.** Nenhum coeficiente, elasticidade, peso ou atraso escrito dentro de função de lógica (ex.: `gdp * 0.015`). Todo valor desse tipo mora no módulo de calibração (`src/engine/economy/calibration.ts` e equivalentes por área), com nome, faixa e justificativa. Exceções: constantes matemáticas e conversões de unidade (12 meses, 100 para porcentagem na exibição).
- **Realimentações saturam.** Todo laço de realimentação usa saturação (`tanh`, logística ou limite explícito). Crise só acontece com causa registrada ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §1.8).
- **Defasagens pela fila.** Efeitos futuros são agendados como `ScheduledImpulse` ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.11), não calculados com `if/else` sobre o histórico.
- **Estado enxuto.** Séries históricas não vivem no `GameState`; ficam no banco ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §11).
- **Saves antigos: regra do §2.1.** Antes do lançamento, basta subir `STATE_SCHEMA_VERSION`, sem função de atualização. Depois do lançamento, saves antigos são atualizados, não recusados: função de atualização da versão anterior (ou valor padrão no esquema Zod) com teste que carrega um save da versão anterior; só saves de versão **mais nova** que o app são recusados.

---

## 4. Convenções de código

- TypeScript `strict`; sem `any` (usar `unknown` + validação).
- **Identificadores de código em inglês** (`advanceMonth`, `primaryBalance`).
- **IDs de conteúdo, rotas e textos de interface em português** (`infraestrutura_ferrovias`, `/congresso`).
- Textos visíveis ao jogador centralizados (preparar para i18n futura), em português do Brasil.
- Nomes de arquivos: `camelCase.ts` para módulos, `PascalCase.tsx` para componentes.
- Testes ao lado do código ou em `src/tests/`, com nome `*.test.ts`.

### Glossário domínio → código
| Português | Código |
| --- | --- |
| Resultado primário | `primaryBalance` |
| Dívida bruta do governo geral | `grossDebt` |
| Hiato do produto | `outputGap` |
| PIB potencial | `potentialGdp` |
| Expectativa de inflação | `inflationExpectation` |
| Proposta | `proposal` |
| Tramitação | `legislativeProcess` |
| Bloco parlamentar | `bloc` |
| Contingenciamento | `spendingFreeze` |
| Crédito adicional | `supplementaryCredit` |
| Capital político | `politicalCapital` |
| Ação de agenda (custo `agendaCost`, limite mensal `agendaActionsPerMonth`) | `AgendaAction` |
| Aprovação | `approval` |
| Relator | `rapporteur` |
| Acréscimos do relator ("jabutis") | `rider` |
| Sanção / veto | `sanction` / `veto` |
| Ministério, gabinete | `ministry`, `cabinet` |
| Diretoria de estatal / "porteira fechada" (bloco com a diretoria e o ministério) | `directorate` (`congress/directorates.ts`, ação `nomear_diretoria`) / `isClosedGate` |
| Pauta | `pauta` (sem tradução: termo do regimento) |
| Unidade da Federação (UF) | `uf` (id = sigla, ex.: `BA`) |
| Participação no PIB / de tendência | `share` / `structuralShare` |
| Governador, adesão (a convênio) | `governor`, `adherents` |
| Chave de distribuição | `RegionalKey` (`populacao`, `pobreza`, `pib`, `renda_alta`) |
| Diretriz ministerial | `MinistryDirective` |
| Carteira de projetos / marca de governo | `PublicProject` / `GovernmentBrand` |
| Renda real / quintil / pobreza estimada | `realIncome` / `quintile` / `povertyRate` |
| Marca (memória de evento, gravada por escolha ou chegada) | `flag` (`EventsState.flags`, valor = mês) |
| Pressão de impeachment | `impeachmentPressure` |
| Cadeia (evento encadeado agendado por escolha) | `followUp` (`followUps`; `ScheduledEvent`) |
| Notícia (manchete persistida, com causa) | `NewsItem` (`EventsState.news`) |
| Prestígio de personagem | `standing` (`EventsState.characters`, −100 a 100) |
| Elenco (personagens do cenário) | `characters` (`Scenario.characters`) |
| Painel (a mesa do jogo: globo com HUD; rota `/painel`, âncora do grupo `src/app/(jogo)/`) | `painel` |
| Folha (modal de consulta ou decisão rápida, por cima do globo) | `sheet` |
| Subtela (mesa de trabalho em tela cheia, com "Voltar ao Painel": `/gabinete`, `/congresso`, `/economia`, `/noticias`, `/legado`) | `SubScreen` |
| Gabinete (subtela da agenda presidencial; antiga tela Presidência) | `gabinete` |
| Perfil ideológico do governo (média móvel das posições das decisões; eixos econômico e social) | `government.profile` (`IdeologyPoint`) |
| Inclinação política da UF / alinhamento do perfil com ela | `lean` (`ScenarioUf.lean`) / `alignment` |
| Eleitor mediano (média ponderada das inclinações das UFs) | `medianVoter` |
| Clima (ENSO, chuva e seca por UF, PRNG próprio) | `GameState.climate` (`ClimateState`, `UfClimate`) |
| Anomalia de chuva (fração da normal do mês) / seca acumulada (0–1) | `rain` / `dryness` |
| Normal de chuva (mm por UF e mês) / teleconexão ENSO (macrorregião × estação) | `rainfallNormal` / `ensoTeleconnection` (`Climatology`) |
| Resultado simulado por UF da eleição geral (fotografia gravada no banco, sem sorteio novo) / intenção de voto estimada por UF | `ElectionResult` (`MonthReport.electionResult`, tabela `election_results`) / `regionalVoteIntention` |
| Prevenção climática (força do programa em `Policy.prevention`; proteção = fração do dano evitada por UF; nunca muda a chuva) / visita e obra no mapa | `prevention` / `preventionOf` (`ImpulseTarget` `clima.prevencao_seca`, `clima.prevencao_cheia`) / marcadores `visit` e `work` (`projectUfs`) |

---

## 5. Testes

- **Regras e economia:** Vitest. Testar **regras corretas segundo os documentos**, não apenas o comportamento atual do código. Cada teste de regra cita a seção do documento (ex.: `// POLITICAL_RULES.md §3: PEC exige 3/5`).
- **Invariantes:** ver [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §7. Obrigatórios em toda simulação de teste.
- **Determinismo:** mesma semente → mesmo estado final.
- **Campanhas automáticas:** estratégias-robô × várias sementes.
- **Migrações:** só depois do lançamento (§2.1): carregar saves de versões anteriores (fixtures) e verificar integridade.
- **Interface:** Maestro (a partir da Fase 01/02).
- Proibido ajustar valores esperados de um teste apenas para fazê-lo passar sem explicar o motivo no PR.

---

## 6. Modelo de tarefa

```
## Tarefa
<descrição curta>

## Fase / documento de referência
Fase XX — <DOC.md §N>

## Arquivos que serão modificados
- ...

## Critério de aceitação
- ...

## Fora do escopo
- ...
```

## 7. Modelo de relatório ao concluir

```
## Implementado
## Não implementado
## Limitações conhecidas
## Documentos atualizados
## Testes (comando e resultado)
```

---

## 8. Proibições

- Copiar interfaces, nomes, imagens ou textos de jogos concorrentes.
- Usar logotipos ou marcas oficiais de órgãos públicos.
- Atribuir condutas, falas ou escândalos a pessoas reais.
- Adicionar dependências sem justificar e sem fixar a versão.
- Introduzir chamadas de rede no fluxo principal do jogo (o jogo é offline primeiro).
- Alterar dados de cenários publicados em vez de criar uma nova versão.
