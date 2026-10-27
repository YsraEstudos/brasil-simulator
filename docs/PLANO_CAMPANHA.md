# Plano — Carreira de 4 a 8 anos (Camadas 1 a 5)

Versão 0.6 do documento • 27/10/2026 • 🟨 Fases C0, C1 (M1.1) e C2 (parte M1.2) feitas a pedido do autor; as decisões continuam com o autor
v0.2: incorpora comentários de revisão de 27/10/2026 (persistência, percurso inicial, modelo eleitoral, posse, divisão da Fase C6, saves).
v0.3: incorpora a segunda revisão de 27/10/2026, na ordem de prioridade dela — M1 como sequência de entregas (§3.1), ações entre os turnos eleitorais (D-C15) e calendário fechado (§2.4), contabilidade dos eleitores (Fase C2), vitória do adversário no 1º turno (Fase C5), visibilidade e persistência das pesquisas (Fase C2), retenção, linha de base da posse e relógio da fila (§2.3), contratos de ordem e de sorteio (§4.1), Fase C6 separável com contratos de integração; e ajustes menores (nomenclatura, notícias, estimativas, D-C10).

v0.6: o autor pediu a Fase C2. Implementadas as tarefas M1.2 (C2.1–C2.5): as escolhas tomadas e o que ficou de fora estão em §5, Fase C2, "Implementação".

v0.5: Fase C0 feita, com as tarefas C0.1 a C0.5 e o protocolo e a estimativa no papel da C0.6. O resultado e as decisões que faltam estão em §5, Fase C0, "Resultado"; as fontes do §8 estão no [DATA_SOURCES.md](DATA_SOURCES.md) §6.

v0.4: o autor pediu a implementação da Fase C1. Registro da tarefa C1.0, das escolhas tomadas para implementá-la (D-C1 forma, D-C15, D-C9, D-C12, relógio da fila) e do que ficou de fora (§5, Fase C1, "Implementação").

**Nomenclatura deste documento:** "Camada 1…5" são as camadas de carreira do documento de origem; "Fase C0…C8" são as fases deste plano; "M1.1…M1.3" são entregas do primeiro percurso (§3.1). Camada e fase nunca são abreviadas da mesma forma.

Origem: página "Campanha de 4 a 8 anos" do site de explicações ([EXPLICACOES-paginas/sis-campanha.html](EXPLICACOES-paginas/sis-campanha.html), gerada a partir de [explicacoes/src/corpo/campanha-ciclo.html](explicacoes/src/corpo/campanha-ciclo.html) e da entrada `sis-campanha` em [explicacoes/src/site.mjs](explicacoes/src/site.mjs)).

Referências: [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) (regras do motor, §2.1 saves, §8 proibições), [ROADMAP.md](ROADMAP.md) §2 e §9–10, [ROADMAP_2.0.md](ROADMAP_2.0.md), [FASE_08.md](FASE_08.md) (formato deste plano), [GAME_DESIGN.md](GAME_DESIGN.md) §4.6, §6, §7, §13 e §14, [POLITICAL_RULES.md](POLITICAL_RULES.md) §1.1, §6.3, §8–§11, [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.11, §5.17, §7, §9 e §11, [DATA_SOURCES.md](DATA_SOURCES.md) §2 e §6, [MEDICAO_GLOBO.md](MEDICAO_GLOBO.md).

**O que este documento é:** um plano em fases (Fases C0–C8) para levar ao código as partes do documento de origem que ainda são design — a Camada 1 (pré-campanha e eleição antes da posse), a Camada 3 (bastidores de Brasília) e a Camada 5 (pós-presidência) — e uma conferência, com evidência no código, do que o documento diz já estar implementado nas Camadas 2 e 4.

**O que não é:** não muda o status de nenhuma fase do roadmap, não toma nenhuma decisão em aberto (§7) e não começa a implementação. Nomes de tipos, campos, arquivos e parâmetros que ainda não existem estão marcados **(proposto)**. Afirmações jurídicas estão **pendentes de verificação** (§8).

**Versões citadas:** números de versão (`STATE_SCHEMA_VERSION`, `ENGINE_VERSION`, id do cenário) são os de 27/10/2026. Como a implementação pode começar muito depois (D-C2), **toda fase confere de novo esses números ao abrir** e usa "versão atual + 1", nunca um número fixado aqui.

**Números de design:** todo valor tirado do documento de origem (percentuais, R$, probabilidades) entra como `PROVISORIO` (regra a calibrar) ou `FICTICIO` (valor de design), conforme [DATA_SOURCES.md](DATA_SOURCES.md) §2.1, até ser verificado (§8) ou calibrado por simulação.

---

## 1. Matriz de lacunas (documento × código)

Conferida em 27/10/2026 no commit `87b20f0` (`main`). Estado do motor nessa data: `STATE_SCHEMA_VERSION = 12`, `ENGINE_VERSION = '0.9.0'` ([src/engine/types.ts:12](../src/engine/types.ts), [:15](../src/engine/types.ts)); cenário padrão `brasil_2027_01_v080` ([src/content/scenarios.ts:26](../src/content/scenarios.ts)); `Difficulty = 'casual' | 'estrategica' | 'realismo'` ([src/engine/types.ts:17](../src/engine/types.ts)).

Coluna **Verificação**: **confirmado** (lido no código, com linha), **parcial** (parte lida, parte inferida de documento ou busca) ou **hipótese** (busca sem resultado conclusivo).

### 1.1 Camadas 2 e 4 (declaradas como implementadas)

| Camada / seção | O que o documento diz | O que o código faz (evidência) | Divergência | Verificação |
| --- | --- | --- | --- | --- |
| Camada 2 §2.1 Unidade de tempo | 1 turno = 1 mês; posse 5/1/2027 (EC 111/2021) | `monthIndex` inteiro, 0 = jan/2027 ([src/engine/calendar.ts:1-5](../src/engine/calendar.ts)); o dia da posse não é modelado | Nenhuma | confirmado |
| Camada 2 §2.1 Ações de agenda | 3 no Casual; 2 no Estratégico e no Realismo | `AGENDA_ACTIONS_PER_MONTH = { casual: 4, estrategica: 3, realismo: 3 }` ([src/engine/state.ts:25-29](../src/engine/state.ts)); [GAME_DESIGN.md](GAME_DESIGN.md) §6 diz 4 / 3 / 2–3 | **Divergente** nos três valores | confirmado |
| Camada 2 §2.1 Pipeline | 15 etapas | `DEFAULT_STEPS` com 15 etapas ([src/engine/advanceMonth.ts:48-64](../src/engine/advanceMonth.ts)) | Nenhuma | confirmado |
| Camada 2 §2.2 Lua de mel | Meses 0–5 | `meses_lua_de_mel = 6`, `fator_lua_de_mel = 0,6` ([src/engine/economy/calibration.ts:765-772](../src/engine/economy/calibration.ts)); `t % TERM_MONTHS` ([src/engine/politics/opinion.ts:25](../src/engine/politics/opinion.ts)), vale no 2º mandato | Nenhuma | confirmado |
| Camada 2 §2.2 Meio de mandato | Custo de coalizão cresce nos meses 6–38 | Nada encontrado por busca (`coaliz`, `coalition`, `manutencao`, `desgaste`); o mais próximo é o risco de escândalo crescente com os anos no cargo ([POLITICAL_RULES.md](POLITICAL_RULES.md) §6.5) | **Ausente** (C0.2): nenhuma regra desgasta a relação com os blocos ao longo dos meses; [POLITICAL_RULES.md](POLITICAL_RULES.md) §11.1 corrigido | confirmado |
| Camada 2 §2.2 Municipais | Mês 21 (69) | `mesEleicaoMunicipal: 21` ([src/data/scenarios/brasil_2027_01_v080.json:1199](../src/data/scenarios/brasil_2027_01_v080.json)); `monthOfTerm` ([src/engine/elections/elections.ts:250](../src/engine/elections/elections.ts); [src/engine/calendar.ts:17-19](../src/engine/calendar.ts)) | Nenhuma | confirmado |
| Camada 2 §2.2 Eleição geral | Mês 45 (93); 2º turno no mesmo passo | `mesEleicaoGeral: 45` ([…v080.json:1200](../src/data/scenarios/brasil_2027_01_v080.json)); `generalElectionMonth` ([src/engine/elections/elections.ts:135-166](../src/engine/elections/elections.ts)) | Nenhuma | confirmado |
| Camada 2 §2.2 Janela de declaração | Meses 39–44, custo 0 | `janelaDeclaracao` ([…v080.json:1201-1204](../src/data/scenarios/brasil_2027_01_v080.json)); `declarar_reeleicao` com `agendaCost: 0` ([src/engine/actions.ts:36](../src/engine/actions.ts), [:148](../src/engine/actions.ts)) | Nenhuma | confirmado |
| Camada 2 §2.2 Vedação | Meses 18–20 e 42–44; bypass com pena | `VEDACAO_MESES = 3`, `inVedacaoWindow` ([src/engine/elections/vedacao.ts:15](../src/engine/elections/vedacao.ts), [:31-35](../src/engine/elections/vedacao.ts)); Casual não aplica ([:37-41](../src/engine/elections/vedacao.ts)) | Menor: o documento omite o Casual; [POLITICAL_RULES.md](POLITICAL_RULES.md) §11 ainda diz "todo o ano eleitoral" | confirmado |
| Camada 2 §2.3 Derrota eleitoral | Só perder a **própria** reeleição | `derrota_eleitoral` sempre que `eleicao_geral.venceu` é falso ([src/engine/events/outcome.ts:25](../src/engine/events/outcome.ts)), inclusive com o sucessor apoiado ([elections.ts:145-146](../src/engine/elections/elections.ts)); [GAME_DESIGN.md](GAME_DESIGN.md) §7.1 concorda com o código | **Divergente** (corrigir o documento de origem) | confirmado |
| Camada 2 §2.3 Fim de mandato | Sem candidatura → `fim_de_mandato` no 48 | Só se a situação venceu ([outcome.ts:27](../src/engine/events/outcome.ts)) | Divergente (consequência da anterior) | confirmado |
| Camada 2 §2.3 Impeachment | 2/3 da Câmara e 2/3 do Senado | Cadeia de três eventos guiada por `impeachmentPressure` ([src/engine/events/pressure.ts:40](../src/engine/events/pressure.ts)); `impeachment_condenado` ([src/data/events/fase07_inst_impeachment_senado.json:39](../src/data/events/fase07_inst_impeachment_senado.json)) encerra ([outcome.ts:20](../src/engine/events/outcome.ts)); 2/3 não contados por bancada ([POLITICAL_RULES.md](POLITICAL_RULES.md) §10) | Simplificação não declarada | confirmado |
| Camada 4 §4.1 2ª reeleição | Bloqueada | Ação rejeitada fora do 1º mandato ([src/engine/agenda.ts:88](../src/engine/agenda.ts)); candidatura só no mandato 0 ([elections.ts:145](../src/engine/elections/elections.ts)) | Nenhuma | confirmado |
| Camada 4 §4.1 Renovação | Congresso e governadores | Deslocamento das relações por bloco ([elections.ts:172-175](../src/engine/elections/elections.ts)); `governorTurnoverStep` ([advanceMonth.ts:61](../src/engine/advanceMonth.ts)) | Nenhuma | confirmado |
| Camada 4 §4.1 Sucessão | Apoio transfere aprovação e intenção | Voto da situação = `fator_sucessao × votingIntention` ([elections.ts:146](../src/engine/elections/elections.ts)); o apoio só melhora a relação com o bloco ([elections.ts:204-210](../src/engine/elections/elections.ts)) | Menor | confirmado |
| Camada 4 §4.1 Fim da partida | 96 meses e "Ver legado" | `TWO_TERM_MONTHS = 96` ([src/content/scenarios.ts:33](../src/content/scenarios.ts), [:40](../src/content/scenarios.ts)); fim em [src/store/gameStore.ts:65](../src/store/gameStore.ts); botão em [src/components/painel/mesaNav.ts:78](../src/components/painel/mesaNav.ts) | Nenhuma | confirmado |

### 1.2 Camadas 1, 3 e 5 (declaradas como "não implementadas")

| Camada / seção | Status no código | Observação | Verificação |
| --- | --- | --- | --- |
| Camada 1 inteira | Ausente | O jogo sempre começa na posse (`monthIndex` 0, [src/engine/state.ts:99](../src/engine/state.ts)) | confirmado |
| Camada 1, calendário pré-posse | `toCalendar` lança `RangeError` para `monthIndex < 0` ([src/engine/calendar.ts:26-29](../src/engine/calendar.ts)); o banco exige `month_index >= 0` e usa o mês como chave (§2.3) | Bloqueio de tempo **e** de persistência | confirmado |
| Camada 3 §3.1 Estatais | Parcial: ministérios técnico/partidário ([POLITICAL_RULES.md](POLITICAL_RULES.md) §6.3.1, §6.5) | Estender, não duplicar | parcial (documento lido; código de gabinete não lido linha a linha) |
| Camada 3 §3.1 Ilícitos | Ausentes; emendas "como pedágio" existem ([POLITICAL_RULES.md](POLITICAL_RULES.md) §6.3) | — | parcial |
| Camada 3 §3.2 Pautas-bomba | **Ausentes** (C0.5): nenhum dos 55 eventos de `src/data/events/` traz aumento aprovado pelo Congresso nem escolha entre vetar e sancionar. O que há de vizinho: pauta travada (`camara_trava_pauta`, `fase07_pol_camara_cargos`, `fase07_pol_oposicao_obstrui`), liminar do STF sobre emendas (`fase07_pol_stf_suspende`), greve de servidores por reajuste (`greve_servidores`) | A Fase C6 cria a pauta-bomba sobre esses eventos | confirmado |
| Camada 3 §3.3 STF | Parcial: ADI/liminar por `riscoJuridico` ([POLITICAL_RULES.md](POLITICAL_RULES.md) §8); indicações não modeladas | — | parcial |
| Camada 3 §3.3 CPI | Parcial: cadeia da Fase 07 ([POLITICAL_RULES.md](POLITICAL_RULES.md) §9); comissão própria = **Fase 09** | — | parcial |
| Camada 3 §3.3 Gaveta | Parcial: o 1º evento da cadeia de impeachment é o pedido ([POLITICAL_RULES.md](POLITICAL_RULES.md) §10) | Estoque de pedidos é novo | parcial |
| Camada 3 §3.3 Copom e pressão sobre o BC | **Existe:** ação `pressionar_banco_central` ([src/engine/actions.ts:20](../src/engine/actions.ts)) consumida por `pressureMonth` ([src/engine/economy/monetary.ts:40](../src/engine/economy/monetary.ts)); Copom nos meses do cenário ([src/engine/economy/economy.ts:244-253](../src/engine/economy/economy.ts)) | Avaliar a apresentação e os efeitos, não criar ação nova (Fase C6f) | confirmado |
| Camada 3 §3.3 Opinião, pronunciamento | Ausentes; feed único de notícias (`src/engine/news/`) | — | parcial |
| Camada 3 §3.3 Diplomacia | Fase 11 ([GAME_DESIGN.md](GAME_DESIGN.md) §14) | — | confirmado no roadmap; ausência no código parcialmente verificada |
| Camada 5 | Ausente; fim mostra o Legado (`src/components/campaign/LegacyReport.tsx`) | — | parcial |

---

## 2. Inconsistências e lacunas do documento de origem

Cada item traz uma proposta. Nenhuma está adotada; as que exigem escolha estão no §7.

| # | Inconsistência | Onde | Proposta |
| --- | --- | --- | --- |
| I1 | Viralização "dobra o reconhecimento" × "+5% a +10%" | §1.7 × "Formas", item 1 | Uma regra saturada: ganho = `viral_ganho` × (1 − R). Nunca "dobrar" |
| I2 | `Votos = Reconhecimento × Aprovação` competiria com a `votingIntention` atual | §1.1 × [FASE_08.md](FASE_08.md) | Um modelo por estágio: antes da posse, o modelo eleitoral da Fase C2; depois, o modelo atual. A passagem herda modificadores explícitos (Fase C5) |
| I3 | Motor mensal × semanas, 45 dias, rodadas de debate, meses −24 a 0 | §1.5, §1.8, "Formas" | §2.3 e §2.4 |
| I4 | Caixa 2 "infinito" e "15% de chance por mês" (≈ 86% em 12 meses se aplicado todo mês) | §1.3, "Finanças" | Teto mensal e perigo por turno derivado de exposição (Fase C3) |
| I5 | Caixa pessoal no texto × tabela; "Recursos" em % no §1.4 | §1.3, §1.4, "Finanças" | **Conferido:** texto = coluna Estratégica da tabela. O §1.4 usa outra unidade; "Capacidade de recursos" é derivada (Fase C3) |
| I6 | Limiar de mídia: 15% × 8–12% × 12% | §1.7 × "Formas" | Um parâmetro por mídia, intervalos semiabertos |
| I7 | Faixas de influência sem 35% e 70–71% | "Finanças" | [0; 0,35), [0,35; 0,70], (0,70; 1] |
| I8 | Faixas do mapa sem valores fracionários | §1.6 | [0; 0,20], (0,20; 0,45], (0,45; 0,75], (0,75; 1] |
| I9 | "Rejeição acima de 50% mata a candidatura" | §1.2 | Decisão aberta (D-C10); o modelo inicial não tem teto pela rejeição |
| I10 | Ostracismo e crescimento orgânico sem ordem nem saldo | "Formas" × "Finanças" | Mesma etapa, decaimento antes, ambos multiplicados pela distância ao limite |
| I11 | HGPE leva R de 25% a 85% "em 4 semanas" | forma 5 | Trajetória-alvo de calibração, não regra |
| I12 | Perfis com rótulos ideológicos implícitos | §1.4 | Neutralidade ([GAME_DESIGN.md](GAME_DESIGN.md) §13) e teste de viés (§5.1) |
| I13 | Sobreposição com as Fases 09 e 11 e com a D1 | §3.3, §1.7 | A Fase C6 só estende o que existe |
| I14 | Marcas, veículos e pessoas reais; referência a jogo concorrente | §1.3–§1.7, Camada 3 | Proibido em conteúdo (§5.3); a referência sai do documento (Fase C0) |
| I15 | "Dívidas recaem sobre o CPF" | §1.3 | Compromisso com cobrança na Camada 2 (D-C6) |

### 2.3 Tempo, identidade dos turnos e persistência

**1. Calendário.** `toCalendar` não aceita mês negativo ([src/engine/calendar.ts:26-29](../src/engine/calendar.ts)), e todo o calendário eleitoral é relativo à posse (`monthOfTerm`). A direção recomendada é separar o tempo da pré-campanha do calendário do mandato.

**2. Persistência.** Hoje o banco identifica cada turno pelo mês:

- `snapshots`, `month_reports`, `indicator_history`, `regional_indicator_history` e `election_results` têm chave `(campaign_id, month_index)` e `CHECK (month_index >= 0)` ([src/database/migrations.ts:31-36](../src/database/migrations.ts), [:83-87](../src/database/migrations.ts), [:97-101](../src/database/migrations.ts), [:126-130](../src/database/migrations.ts), [:162-166](../src/database/migrations.ts));
- `recordMonth` só grava se `campaigns.current_month` for o mês do relatório, e então avança esse mês ([src/database/campaignRepository.ts:129-137](../src/database/campaignRepository.ts));
- a retenção apaga relatórios e snapshots pela distância em meses ([campaignRepository.ts:195-202](../src/database/campaignRepository.ts));
- a store carrega o relatório anterior por `monthIndex - 1` ([src/store/gameStore.ts:345](../src/store/gameStore.ts));
- 12 arquivos fora de teste usam `monthKey`/`toCalendar` para rótulos.

Manter `monthIndex = 0` durante a pré-campanha colidiria nas chaves e impediria distinguir os turnos.

**Dois conceitos explícitos (D-C1):**

- **Índice sequencial da partida** — identifica cada turno salvo, inclusive os da pré-campanha e, se houver, o 2º turno eleitoral como turno próprio (D-C15). É o que banco, retenção e store usam como identidade.
- **Mês do mandato** — continua começando em 0 na posse e alimenta calendário, eleições, vedações, lua de mel e as regras atuais.

Formas: (a) índice sequencial independente, com o mês do mandato derivado ou guardado à parte; (b) chave composta (estágio, turno). **A forma é escolhida depois da tarefa C1.0** (mapa de consumidores). Este plano não afirma qual exige menos mudança.

**3. Retenção (o que sobrevive).** O repositório guarda 12 relatórios e 13 snapshots ([campaignRepository.ts:23](../src/database/campaignRepository.ts), [:29](../src/database/campaignRepository.ts)). Proposta:

- preservar, fora da retenção, um **resumo compacto da pré-campanha** (resultado por turno eleitoral, principais decisões, compromissos herdados), numa tabela própria ou na linha da campanha **(proposto)**;
- relatórios detalhados seguem a retenção normal;
- o plano **não promete** que todos os relatórios da pré-campanha estarão disponíveis até o fim de 96 meses.

**4. Linha de base da posse.** Hoje a linha de base vem do snapshot do mês 0 ([src/store/gameStore.ts:346-347](../src/store/gameStore.ts)), mas esse snapshot **já é apagado** pela retenção depois do mês 13 ([campaignRepository.ts:200-203](../src/database/campaignRepository.ts)). A posse continua disponível pela **série** de indicadores, que inclui o mês 0 (teste `depois do mês 13 a posse continua na série`, [src/database/database.test.ts:462](../src/database/database.test.ts)). Regra: **a linha de base dos gráficos e do Legado aponta para o ponto da posse na série** (o primeiro ponto do estágio `governo`), nunca para o primeiro ponto da partida, que passa a ser da pré-campanha.

**5. Relógio da fila de efeitos.** `ScheduledImpulse` usa `startMonth`/`endMonth` comparados a `monthIndex` ([src/engine/impulses.ts:5-7](../src/engine/impulses.ts)). Decidir na Fase C1 qual relógio a fila usa (proposta: o índice sequencial da partida, com conversão explícita na posse para efeitos que já usam o mês do mandato). Um efeito criado na pré-campanha e com início depois da posse é aplicado **uma vez, no turno certo**, nem cedo nem duas vezes.

**6. Granularidade abaixo do mês:** semanas e rodadas de debate viram decisões estruturadas resolvidas dentro do turno. Custos semanais são convertidos para o turno na calibração.

**7. O resto do estado antes da posse:** economia e sociedade evoluem ou ficam congeladas (D-C12).

### 2.4 Turnos eleitorais e calendário fechado

**Ações entre o 1º e o 2º turno (D-C15), decidir antes da Fase C1:**

- **A — os dois turnos no mesmo turno de jogo.** Mais simples; o jogador vê o resultado completo, sem escolhas entre os turnos.
- **B — o 2º turno como turno de jogo próprio.** O jogador vê os finalistas e decide (mensagem, apoios). **Se a D-C1 escolher o índice sequencial, B custa um turno extra com o mesmo rótulo de outubro**, sem mexer no calendário do mandato; com chave composta, exige uma etapa a mais dentro do estágio.

Recomendação: **A no M1**; B avaliado depois, se o protótipo mostrar que as escolhas entre turnos valem a pena. As duas decisões (D-C1 e D-C15) são tomadas juntas.

**Exemplos fechados de calendário** (datas legais pendentes do §8; `PROVISORIO`):

Ponto de partida `'corrida'`, alternativa A:

| Turno (índice) | Rótulo | Estágio | O que acontece |
| --- | --- | --- | --- |
| 0 | ago/2026 | corrida | início da campanha oficial; primeira pesquisa |
| 1 | set/2026 | corrida | campanha; debate; pesquisa |
| 2 | out/2026 | eleição | 1º turno e, se houver, 2º turno; resultado |
| 3 | nov–dez/2026 | transição | turno único condensado: equipe e herança (só se eleito) |
| 4 | jan/2027 | governo | posse = mês do mandato 0 |

Na alternativa B, o turno 2 vira "out/2026 — 1º turno" e entra um turno 3 "out/2026 — 2º turno"; os seguintes andam uma posição.

Ponto de partida `'pre_campanha'` com início em out/2025 (exemplo):

| Turnos | Rótulos | Estágio | O que acontece |
| --- | --- | --- | --- |
| 0–8 | out/2025–jun/2026 | pré-campanha | reconhecimento, partido, arrecadação |
| 9 | jul/2026 | convenção | homologação ou não |
| 10–11 | ago–set/2026 | corrida | campanha oficial |
| 12 | out/2026 | eleição | 1º e 2º turnos (alternativa A) |
| 13 | nov–dez/2026 | transição | só se eleito |
| 14 | jan/2027 | governo | posse |

---

## 3. Grafo de dependências das fases

```
C0 ──► C1 ──► C2 ──► C3 ──► C4 ──► C5 ──► C8
        │                           │      ▲
        ├──► C6a … C6g ─────────────┼──────┤   (entregas separáveis, com contratos de integração; Camada 2)
        │                           ▼      │
        └─────────────────────────► C7 ────┘   (depende da Fase C5 para os desfechos novos)
```

Sem ciclo. As subfases da Fase C6 são **separáveis** (PR próprio cada uma), mas **não independentes**: as integrações estão na tabela da Fase C6. A Fase C7 depende da Fase C5 pela tabela completa de desfechos.

### 3.1 Primeiro percurso completo (marco M1) como sequência de entregas

As Fases C1–C5 não são feitas inteiras antes de chegar à eleição. Cada tarefa das fases está marcada na coluna **Entrega** como **M1.1**, **M1.2**, **M1.3** ou **Exp** (expansão, depois do M1). O desenvolvedor implementa primeiro tudo que é M1, na ordem M1.1 → M1.2 → M1.3, atravessando as fases; depois a expansão.

| Entrega | Conteúdo mínimo | Critério de entrega |
| --- | --- | --- |
| **M1.1 — infraestrutura** | identidade dos turnos (D-C1), gravação e retomada, relógio da fila, retenção do resumo, **entrada mínima** de nova campanha com ponto de partida `'corrida'` e um perfil, e uma **transição mínima de estágio** (troca de `stage` sem regras de posse) | salvar, fechar e retomar em qualquer turno; a transição mínima sobrevive a reinício; regressão do ponto `'posse'` |
| **M1.2 — campanha** | um caixa com teto global e reserva no turno, adversários simples, os 5 arquétipos de ação (sem compromissos nem caixa 2), um debate, pesquisa persistida, mapa 2D e lista acessível, eleição com a alternativa A | campanha jogável até o resultado da eleição; Maestro cobre ações, pesquisa e mapa |
| **M1.3 — desfecho e posse** | derrota ou vitória com resumo explicado, opção de recomeçar (D-C18), transição, posse com continuidade do PRNG e da linha de base, primeiro mês de governo | fluxo integrado do Maestro: criar → jogar → eleição → derrota (resumo) **ou** posse → mês 0 do governo; retomar antes e depois da posse; protótipo de ritmo avaliado pelo autor |
| **Exp — expansão** | pré-campanha longa, convenção, três bolsos, compromissos, caixa 2, vice selecionável, HGPE, mais debates, 2º turno jogável (se D-C15 = B), globo e caravana, Fases C6 e C7 | critérios de cada fase |

O M1 tem critérios próprios (acima) e não espera os critérios completos das Fases C3 e C4.

---

## 4. Regras comuns a todas as fases

- Ler [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) e declarar os arquivos antes de editar; uma funcionalidade delimitada por tarefa; não tocar em arquivos de outra tarefa.
- **Motor puro:** sem React, Expo ou SQLite; sem `Math.random()`, `Date` ou `console.log`; aleatoriedade só por PRNG com semente ([src/engine/rng.ts](../src/engine/rng.ts)); contratos de sorteio no §4.1.
- **Contribuição com causa** em toda variação relevante; variáveis fora de `Indicators` usam pseudo-indicador de relatório (como `'votingIntention'`).
- **Sem números mágicos:** calibração com `value`, `min`, `max`, `note`, `basis`, no padrão de `PARAMS` ([src/engine/economy/calibration.ts:29](../src/engine/economy/calibration.ts)); módulo `src/engine/career/calibration.ts` **(proposto)**.
- **Saturação** em todo laço; **defasagens** pela fila `ScheduledImpulse` ([src/engine/types.ts:225](../src/engine/types.ts)) com o relógio do §2.3.
- **Estado enxuto:** séries no banco ou no `MonthReport`, nunca no `GameState`.
- **Interface pela store** ([src/store/gameStore.ts](../src/store/gameStore.ts)). Abrir uma tela **nunca** altera o estado da simulação nem consome sorteio.
- **Campos novos opcionais.** Sistemas novos são **ligáveis por configuração interna do cenário** (uso em testes e regressão). Ligá-los por dificuldade ou como opção visível ao jogador é uma decisão de produto separada (D-C5), não um interruptor por sistema na tela.
- **Saves ([AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2.1):** antes do lançamento, subir a versão do estado quando ele mudar, sem função de atualização e sem teste de save antigo; tabela ou coluna nova por migração numerada, sem converter dados antigos. Depois do lançamento: função de atualização e teste com save da versão anterior.
- **Conteúdo:** antes do lançamento, cenários e eventos podem ser editados no próprio arquivo ([AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2.1); a proibição de alterar cenário publicado (§8) vale depois do lançamento.
- **Regressão — definição.** Com o cenário atual, a mesma semente e os mesmos comandos, o **comportamento** observável é igual: indicadores, recursos, relações, decisões aceitas e recusadas, eventos, notícias, desfechos e estado do PRNG em cada mês. Ficam de fora, **por lista explícita no teste**, só metadados alterados de propósito (versões) e campos opcionais novos ausentes. Nada de comparação literal do JSON inteiro.
- **Documentos:** cada fase atualiza as fontes que ela altera no mesmo PR; a Fase C8 faz a revisão de coerência.
- **PRs:** ≤ 100 arquivos (limite do autor), branch nova a partir de `origin/main`, `main` com squash. Número de arquivos não mede dificuldade.
- **Validação:** `npm run check` com zero erros e zero avisos; `npm run sim:balance` (ou `sim:*` novo) com estratégia-robô nova; `node docs/explicacoes/build.mjs` quando a fonte do site mudar.

### 4.1 Contratos de ordem e de sorteio

Três contratos diferentes, que a v0.2 misturava:

1. **Ordem financeira.** Quando decisões disputam recursos, **a ordem de envio importa**: a reserva é feita na ordem e a primeira que excede é rejeitada. A interface mostra isso ("as ações são pagas na ordem da lista").
2. **Sorteio de uma ação aceita.** É **estável** para a mesma ação no mesmo contexto: o resultado depende da chave (semente da campanha, estágio, índice do turno, sistema, id da ação, alvo, **ocorrência** no turno), não da posição na lista. A ocorrência distingue a mesma ação repetida no mesmo turno.
3. **Permutação de ações independentes.** Trocar a ordem só preserva o resultado quando as ações **não disputam recursos e não afetam uma à outra**. O teste de permutação usa apenas esses casos.

**Como sortear pela chave:** a chave vira um sal estável (hash de 32 bits **(proposto)**), e `deriveSeed(semente, sal)` ([src/engine/rng.ts:47](../src/engine/rng.ts)) gera um sorteio de uso único para aquela ação. Isso é **diferente** do padrão do clima: ali, a semente derivada dá ao clima um PRNG **próprio e sequencial** ([src/engine/climate/climate.ts](../src/engine/climate/climate.ts)), que o isola do PRNG principal mas não torna independentes os sorteios internos entre si. Decisão D-C11.

---

## 5. Fases

Coluna **Entrega**: M1.1, M1.2, M1.3 ou Exp (§3.1).

### Fase C0 — Auditoria, decisões e protótipo de ritmo

**Objetivo.** Fechar as decisões que bloqueiam a Fase C1, alinhar o documento de origem e testar o ritmo. Pode começar já.

| # | Tarefa | Arquivos (dono único) |
| --- | --- | --- |
| C0.1 | Corrigir a fonte do site: ações 4/3/3; `derrota_eleitoral` com o sucessor; impeachment por eventos; Camada 3 parcial (§1.2); sem jogo concorrente; marcas genéricas | `docs/explicacoes/src/corpo/campanha-ciclo.html`, `docs/explicacoes/src/site.mjs`, HTML gerado |
| C0.2 | Verificar o "custo de coalizão crescente" (hipótese do §1.1) | `docs/POLITICAL_RULES.md` |
| C0.3 | Alinhar [POLITICAL_RULES.md](POLITICAL_RULES.md) §11 com a vedação de 3 meses | `docs/POLITICAL_RULES.md` |
| C0.4 | Verificar as fontes do §8, com todos os campos | `docs/DATA_SOURCES.md` |
| C0.5 | Verificar pautas-bomba e eventos ligados à Camada 3 (atualizar a coluna Verificação) | leitura de `src/data/events/` |
| C0.6 | **Protótipo de ritmo** em papel ou planilha (corrida curta; pré-campanha longa), com o protocolo do §5.1; propor a duração-alvo (D-C13) e testar se a recuperação na convenção (D-C4) e o 2º turno jogável (D-C15) valem a pena | `docs/` (registro do resultado) |

**Critério de conclusão.** D-C1 (direção), D-C2, D-C3, D-C9, D-C13, D-C15 e D-C18 com escolha do autor; build do site sem diferença; §8 com campos preenchidos; protocolo do protótipo registrado.

**Estimativa.** Documentação 0,5–1; protótipo de ritmo 0,5–1.

#### Resultado (27/10/2026)

- **C0.1 — feito.** Fonte do site corrigida: ações 4/3/3; `derrota_eleitoral` também com o sucessor apoiado e `fim_de_mandato` só com vitória da situação; impeachment por cadeia de eventos, sem contagem de 2/3 por bancada; Camada 3 marcada como parcial; vedação de 3 meses (simplificação) e fora do Casual; custo de coalizão "não modelado"; referência a jogo concorrente retirada; marcas, plataformas, institutos, estatais e festas trocados pelos nomes genéricos do §5.3. `node docs/explicacoes/build.mjs` só alterou `sis-campanha.html`.
- **C0.2 — feito.** O custo de coalizão que cresce com o tempo **não existe** no motor (§1.1); [POLITICAL_RULES.md](POLITICAL_RULES.md) §11.1 corrigido. Criá-lo é proposta para a Camada 2, fora deste plano.
- **C0.3 — feito.** [POLITICAL_RULES.md](POLITICAL_RULES.md) §11 descreve a vedação como o motor aplica: 3 meses antes de cada pleito, recusa com motivo, quebra com pena e fora do Casual. Registra também que a lei vale o ano inteiro e que as outras condutas vedadas não são modeladas.
- **C0.4 — feito em parte.** Doze dos 14 itens do §8 foram conferidos e registrados no [DATA_SOURCES.md](DATA_SOURCES.md) §6, com link, data, dispositivo e conclusão.
  - Dos dez valores e datas, três vêm só da imprensa e ficam `PROVISORIO`: valor do FEFC de 2026, teto de gastos de 2026 e comparecimento de 2022.
  - A doação de empresa (ADI 4650) foi registrada sem reconferir a fonte primária.
  - Os custos de campanha ficaram sem verificação (Fase C3).
  - O calendário confirmado fecha a tabela do §2.4: propaganda a partir de 16/8, 1º turno em 4/10 e 2º turno em 25/10/2026.
- **C0.5 — feito.** Não há pautas-bomba (§1.2). A coluna Verificação da Camada 2 e a da Camada 3 §3.2 estão atualizadas.
- **C0.6 — protocolo e estimativa no papel; falta a sessão com pessoas.** Protocolo:
  1. Duas sessões no papel, uma por ponto de partida: `'corrida'` (5 turnos até a posse) e `'pre_campanha'` (15 turnos).
  2. A pessoa decide as ações da entrega M1.2 em cada turno, e o mediador anota o tempo e os campos do §5.1.
  3. Em seguida, uma variante com o 2º turno jogável (D-C15 = B) e outra com recuperação na convenção (D-C4).
  4. O mediador registra se a escolha extra mudou alguma decisão.

  Estimativa no papel, feita por Claude e ainda não medida com pessoas:

  | Ponto de partida | Turnos com escolha | Minutos por turno | Total até a posse |
  | --- | --- | --- | --- |
  | `'corrida'` | 3 (ago, set, out) | 3–5 | 10–15 min |
  | `'pre_campanha'` | 12 | 3–4 | 40–50 min |

  Na `'corrida'`, o turno nov–dez é condensado. Na `'pre_campanha'`, a estimativa vale se os meses sem escolha forem condensados. Proposta para a D-C13: **corrida até 15 min** e **pré-campanha até 45 min**. Acima disso, condensar turnos. Ainda não há evidência para a D-C15 = B nem para a D-C4: a recomendação fica como está até a sessão com pessoas.

**Decisões que continuam com o autor** (a Fase C0 só fecha com a escolha dele): D-C1 (direção), D-C2, D-C3, D-C9, D-C13, D-C15 e D-C18. Para a D-C1, a D-C15 e a D-C9, a Fase C1 já registrou as escolhas usadas na implementação. Elas valem até o autor rever.

---

### Fase C1 — Tempo, identidade dos turnos, persistência e contratos

**Dependências.** Fase C0 (D-C1 direção, D-C15).

**Pontos de partida (proposta):**

| | `'pre_campanha'` (Exp) | `'corrida'` (M1) | `'posse'` (padrão atual) |
| --- | --- | --- | --- |
| Calendário | exemplo fechado no §2.4 | exemplo fechado no §2.4 | como hoje |
| Decisões já tomadas | nenhuma | partido homologado; vice do perfil (fixo); coligação inicial | eleição vencida |
| Recursos iniciais | caixa do perfil (Fase C3) | caixa do perfil + repasse padrão | os de hoje |
| Reconhecimento, vice, partido, compromissos | do perfil (`FICTICIO`) | do perfil, mais um atalho documentado que simula a pré-campanha média, sem penalidade escondida | não se aplica |
| Calibração | chance de vitória da estratégia de referência numa faixa definida **antes** de simular (§5.1) | idem | — |
| Pular etapa | o jogo preenche o que faltar com os padrões do perfil e mostra o que assumiu | idem | — |

**Duração-alvo** em minutos (D-C13); cada turno com ao menos uma escolha relevante, ou é condensado.

**Contratos iniciais (propostos).** Revisados pelo autor nesta fase; **alterações posteriores são permitidas e registradas** (na seção da fase que as fez e no PR), não "congeladas".

- Cenário: `career?: { startPoints; profiles: CareerProfile[]; candidates?: …; dataStatus }`, com Zod `.strict()` e UFs validadas contra `scenario.ufs` (candidatos: D-C17, Fase C2).
- `CareerProfile = { id; name; recognition; valence; partyInfluence; wealth; liquidity; fundraisingCapacity; territorialBase: Record<uf, number>; dataStatus }`.
- Estado: `career?: CareerState = { stage; profileId; turnIndex (ou chave composta, D-C1); recognition: Record<uf, number>; valence; … }`.
- Identidade do turno e relógio da fila (§2.3), por migração numerada.
- `ImpulseTarget` novos; pseudo-indicadores; rejeições `'fora_do_estagio'`, `'sem_recursos'`, `'teto_legal'`.
- Versão do estado: **atual + 1** na abertura da fase.

| # | Tarefa | Entrega | Arquivos (dono único) |
| --- | --- | --- | --- |
| C1.0 | Mapear consumidores do mês como identidade (banco, repositório, store, relatórios, interface, simulações, linha de base, fila); registrar e decidir a forma da D-C1 | M1.1 | leitura; registro neste plano |
| C1.1 | Tipos e Zod do bloco `career` | M1.1 | `src/types/scenario.ts` |
| C1.2 | `CareerState`, identidade do turno, `ImpulseTarget`, rejeições, versão | M1.1 | `src/engine/types.ts` |
| C1.3 | Rótulos de calendário pré-posse (sem tocar no mês do mandato) | M1.1 | `src/engine/calendar.ts` |
| C1.4 | Migração, repositório, retenção e resumo compacto da pré-campanha | M1.1 | `src/database/migrations.ts`, `src/database/campaignRepository.ts` |
| C1.5 | Store: avanço, relatório anterior, retomada, linha de base pela série | M1.1 | `src/store/gameStore.ts` |
| C1.6 | Esqueleto das etapas pré-posse, despacho por estágio e transição mínima | M1.1 | `src/engine/advanceMonth.ts`, `src/engine/career/index.ts` **(proposto)** |
| C1.7 | Entrada mínima de nova campanha (`'corrida'`, um perfil) | M1.1 | `src/components/campaign/NewCampaignScreen.tsx`, `campaignSetupView.ts` |
| C1.8 | Cenário com bloco `career` (perfis `FICTICIO`) | M1.1 | `src/data/scenarios/…`, `src/content/scenarios.ts` |

**Testes exigidos.**

- Zod: perfil com UF inexistente, valores fora de faixa, ponto de partida desconhecido, campo extra.
- Regressão do ponto `'posse'` (§4).
- **Integração (banco + store):** salvar, fechar e retomar em vários turnos da pré-campanha; retomar imediatamente antes e depois da **transição mínima de estágio** (a posse real é testada na Fase C5/M1.3); decisões, relatório, estado do PRNG e estado nem duplicados nem perdidos; falha no meio da gravação → nada parcial; histórico pré-posse fora das séries de governo; resumo compacto sobrevive à retenção.
- **Fila:** efeito criado no último turno pré-transição com início depois dela → salvar, retomar → aplicado uma única vez no turno certo.
- **Linha de base:** com a pré-campanha na série, a linha de base é o primeiro ponto do estágio `governo`.
- Sem teste de save antigo antes do lançamento.

**Critério de conclusão.** M1.1 entregue; `npm run check` verde; contratos iniciais revisados.

**Estimativa (esforço).** Motor 1; banco e store 1–2; testes de integração 1.

#### Implementação (27/10/2026, entrega M1.1)

**Tarefa C1.0 — consumidores do mês como identidade** (lidos no código):

| Consumidor | Uso do mês | Destino |
| --- | --- | --- |
| `snapshots`, `month_reports`, `decisions`, `events` | chave / coluna do turno salvo | `turn_index` (migração 7, `RENAME COLUMN`; dados existentes já corretos) |
| `campaigns.current_month` | trava do `recordMonth` e rótulo da lista de saves | trava passa a `current_turn`; `current_month` fica como mês do mandato; coluna `stage` para o rótulo |
| `indicator_history`, `regional_indicator_history`, `election_results` | séries de governo | continuam por mês do mandato; **não** recebem turnos pré-posse |
| Retenção (`REPORT_RETENTION_MONTHS`, `SNAPSHOT_RETENTION_MONTHS`) | distância em meses | distância em turnos |
| Store: relatório e indicadores anteriores, linha de base | `monthIndex − 1`, snapshot do mês 0 | turno − 1; snapshot do **turno da posse** (`inaugurationTurnIndex`); sem base antes da posse |
| `loadProfileHistory` | mês da linha do snapshot | mês do mandato lido do estado/relatório; turnos pré-posse fora do rastro |
| Rótulos (`monthLabel`, `shortMonthLabel`, HUD, subtela, lista de saves) | `toCalendar(monthIndex)` | antes da posse, rótulo do calendário da campanha (`careerTurnLabel`); depois, como antes. Os demais rótulos de mês só aparecem em telas de governo |
| Fila `ScheduledImpulse` | `startMonth`/`endMonth` × `monthIndex` | sem mudança (decisão abaixo) |
| Motor (`advanceMonth`, eleições, vedação, lua de mel, calendário) | mês do mandato | sem mudança; antes da posse nenhuma etapa de governo roda |
| Simulações (`scripts/sim`) | mês do mandato | sem mudança (começam na posse) |

**Escolhas tomadas para implementar** (recomendações do §7, registradas aqui; o autor pode revê-las):

- **D-C1 forma (a), índice sequencial.** `CareerState.turnIndex` é o turno a jogar; `turnIndexOf(state)` devolve `monthIndex` quando não há carreira, então a partida da posse não muda. Antes da posse `monthIndex` fica em 0; depois, os dois relógios andam juntos (`inaugurationTurnIndex = turnIndex − monthIndex`).
- **D-C15 = A.** O calendário da corrida tem 4 turnos pré-posse (§2.4, alternativa A) no cenário.
- **D-C9 = bloco no cenário atual** (não a recomendação de cenário novo): `brasil_2027_01_v080` ganhou o bloco `career` (permitido antes do lançamento, [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2.1), com um perfil `FICTICIO` e só o ponto `'corrida'`. A posse não lê o bloco, e o teste de regressão confirma.
- **D-C12 = congelada.** O estado do governo nasce igual ao da posse e nada dele muda nem sorteia antes dela.
- **Relógio da fila (§2.3, item 5): o mês do mandato.** Como o mês do mandato não anda antes da posse e nenhuma etapa de governo lê a fila, um efeito criado antes da posse com `startMonth` no calendário do mandato vale uma vez, no mês certo. Efeitos com defasagem **dentro** da pré-campanha (Fase C2 em diante) precisarão de um relógio de turno próprio; não há nenhum ainda.
- **Versão do estado 13**, sem função de atualização: um save v12 só ganha o número (o `career` ausente é a partida da posse).

**Entregue:** tipos e Zod do bloco `career` (`src/types/scenario.ts`); `CareerState`, rejeições `fora_do_estagio`/`sem_recursos`/`teto_legal` (as duas últimas reservadas para a Fase C3), relatório com `turnIndex` e `career` (`src/engine/types.ts`); rótulos pré-posse (`calendarAt`, `offsetOfKey`); despacho por estágio, etapas pré-posse vazias (`PRE_INAUGURATION_STEPS`) e transição mínima (`src/engine/career/index.ts`); migração 7, retenção por turno e resumo compacto (`career_summaries`); store; ponto de partida no NOVO JOGO ("Corrida eleitoral", primeiro perfil do cenário); rótulos no HUD, na subtela e na lista de saves.

**Não entregue nesta fase:** pseudo-indicadores e `ImpulseTarget` da carreira (entram com a primeira regra que os use, Fase C2); ponto `'pre_campanha'` (Exp); escolha de perfil na tela (um perfil só); sem eleição: na entrega M1.1 todo jogador chega à posse (Fase C5); estratégia-robô de simulação para a corrida (`sim:*`); teste no Maestro (o fluxo integrado é do M1.3). Turnos pré-posse ainda não têm ações próprias: as decisões de governo enviadas neles são recusadas com motivo.

---

### Fase C2 — Viabilidade, modelo eleitoral e pesquisas

**Dependências.** Fase C1.

**Grandezas.** Por UF: **reconhecimento** R ∈ [0,1]; **aprovação** e **rejeição** entre quem conhece (não complementares: há neutros); **intenção** = escolha entre opções concorrentes. A valência é **nacional**; a variação por UF vem do alinhamento com a inclinação da UF (`lean`, [POLITICAL_RULES.md](POLITICAL_RULES.md) §11.2) e da base territorial do perfil.

**Contabilidade dos eleitores, por UF (especificação mínima).** Um eleitor nunca é contado duas vezes: cada UF é **uma única partição** do eleitorado.

1. **Base:** eleitorado E_uf (inteiro, `PROVISORIO`: proporcional à população, como em `regionalResult.ts`); abstenção A = round(E · `abstencao`); comparecimento C = E − A.
2. **Brancos e nulos:** BN = round(C · `brancos_nulos`); **válidos** V = C − BN.
3. **Distribuição entre opções concorrentes:** cada candidato i tem peso w_i = R_i · (1 − rej_i) · e^(u_i), com u_i a utilidade (valência, alinhamento, campanha). Nas pesquisas há também a opção **indeciso**, com peso próprio.
4. **Teto de elegibilidade:** a fração de C que vota em i não passa de R_i · (1 − rej_i) (quem conhece e não rejeita). A distribuição é feita **com teto e redistribuição**: o excesso de quem bate no teto vai aos demais proporcionalmente aos pesos; se todos baterem no teto, o restante vira branco/nulo (eleitor sem opção aceitável).
5. **Soma:** abstenção + brancos/nulos + indecisos (só em pesquisa) + Σ votos = E.
6. **Dia da eleição:** os indecisos se distribuem pelos pesos (com o teto) ou, na fração `indecisos_brancos`, viram branco/nulo.
7. **Agregação:** votos inteiros por UF, repartidos pelo método dos maiores restos (sem perder voto por arredondamento); nacional = soma das UFs; percentuais sobre os válidos nacionais.

**Exemplo de teste (obrigatório).** UF fictícia com 100.000 eleitores, dois candidatos, 10.000 abstenções e 5.000 brancos/nulos: 90.000 comparecimentos; 85.000 válidos; soma dos votos dos candidatos = 85.000; percentuais sobre válidos somam 100%.

**Nenhum voto válido.** Decisão D-C16: proposta = **estado inválido** detectado por invariante (o cenário e a calibração garantem `abstencao + brancos_nulos < 1`), com teste que confirma a rejeição sem divisão por zero.

**Monotonicidade (condições explícitas).** Na mesma UF, com reconhecimento, rejeição, adversários, sorteio e arredondamento fixos, aumentar a valência do candidato i **não reduz** os votos de i, medidos **depois** da distribuição com teto. O teste fixa essas condições; a propriedade nacional decorre da soma.

**Teto pela rejeição.** O modelo inicial **não** tem teto pela rejeição além do teto de elegibilidade do passo 4 (D-C10, decidida antes de fechar a Fase C2).

**Adversários (D-C17).** `elections.candidatos` tem só `blocId`, `name` e `dataStatus` ([src/types/scenario.ts:219-222](../src/types/scenario.ts)); fornece **identidade**, não modelo. Opções: (a) reutilizar essas identidades e guardar os dados de campanha (R, valência, evolução) no bloco `career`; (b) um catálogo próprio da eleição pré-posse que referencia blocos e personagens. Em ambas, **o jogador ocupa a vaga do bloco do seu partido**: o candidato listado desse bloco sai da disputa, para não haver dois candidatos no mesmo papel. Cenário com menos de dois candidatos (jogador incluído) é inválido no Zod.

**Pesquisas e visibilidade.**

| O que o jogador vê | Forma | Fonte |
| --- | --- | --- |
| Mapa de reconhecimento | **faixa estimada** por UF, com a data da última pesquisa | pesquisa persistida |
| Pesquisa | intenção estimada, data, abrangência (nacional ou UF) e margem | pesquisa persistida |
| Explicação | principais fatores em texto ("contribuiu para melhorar"), sem coeficientes | contribuições do turno |
| Valores internos do motor | **não** exibidos (só em ferramenta de depuração) | — |

Persistência das pesquisas:

- criadas em **etapa definida do turno** (proposta: a última etapa pré-posse), com sorteio pela chave do §4.1;
- a atual fica no estado; as anteriores, no relatório (sujeitas à retenção);
- reabrir a tela ou retomar o save mostra **a mesma** pesquisa; abrir a interface não consome sorteio;
- a interface distingue a pesquisa atual das antigas.

**Parâmetros novos (`PROVISORIO`).** `ostracismo_*`, `organico_*`, `valencia_escala`, `faixa_*`, `transbordo_regional`, `abstencao`, `brancos_nulos`, `indecisos_*`, `indecisos_brancos`, `transferencia_*`, `abstencao_2t`, `ruido_uf`, `ruido_nacional`, `pesquisa_margem`, `pesquisa_atraso`.

| # | Tarefa | Entrega | Arquivos (dono único) |
| --- | --- | --- | --- |
| C2.1 | Viabilidade: R, aprovação, rejeição, decaimento, saturação, contribuições | M1.2 | `src/engine/career/viability.ts` **(proposto)** |
| C2.2 | Partição dos eleitores, distribuição com teto, agregação inteira | M1.2 | `src/engine/career/electorate.ts` **(proposto)** |
| C2.3 | Adversários simples (identidade conforme D-C17) | M1.2 | `src/engine/career/opponents.ts` **(proposto)** |
| C2.4 | Pesquisas persistidas e leituras para a interface | M1.2 | `src/engine/career/polls.ts` **(proposto)** |
| C2.5 | Invariantes e parâmetros | M1.2 | `src/engine/invariants.ts`, `src/engine/career/calibration.ts` **(proposto)** |
| C2.6 | Refinamentos regionais e base territorial dinâmica | Exp | `src/engine/career/viability.ts` **(proposto)** |

**Testes exigidos.** O exemplo dos 100 mil eleitores; nenhum voto válido (D-C16); propriedades (partição soma E; nenhum candidato acima do teto de elegibilidade; nacional = soma das UFs sem perda; percentuais sobre válidos somam 100%); monotonicidade nas condições acima; pesquisa idêntica ao reabrir e ao retomar; abrir a tela não muda o estado do PRNG; fronteiras das faixas do mapa.

**Estimativa (esforço).** Motor 2–3; testes 1.

#### Implementação (27/10/2026, tarefas M1.2 C2.1–C2.5)

**Escolhas tomadas para implementar** (recomendações do §7, registradas aqui; o autor pode revê-las):

- **D-C17 = opção (a).** O nome de cada adversário vem de `elections.candidatos`. Os dados de campanha ficam em `career.opponents` (reconhecimento, valência, base territorial; `FICTICIO`). O perfil ganhou `blocId`: o jogador ocupa a vaga desse bloco, e o adversário do bloco sai da disputa. O Zod recusa:
  - adversário sem nome em `elections.candidatos`;
  - adversário repetido;
  - perfil que fique com menos de dois candidatos na disputa, contando o jogador.
- **D-C16 = estado inválido.** `tallyUf` recusa `abstencao + brancos_nulos ≥ 1`, e `validShares` recusa nenhum voto válido. As duas recusas são erros com motivo, sem divisão por zero. As faixas da calibração mantêm a soma abaixo de 1.
- **D-C10 = sem teto pela rejeição.** Só vale o teto de elegibilidade do passo 4.
- **D-C11 = sorteio por chave.** A pesquisa sorteia com `keyedRng(semente, ['career', 'poll', turno])`, que usa o sal FNV-1a de `career/draw.ts` e o `deriveSeed`. O PRNG principal não é tocado antes da posse.
- **Opinião entre quem conhece.** A partir da utilidade u = `valencia_escala` · valência + `alinhamento_peso` · alinhamento:
  - aprovação = (1 − `neutros`) · σ(`opiniao_escala` · u), e a rejeição é o resto de quem não é neutro;
  - o alinhamento vale de −1 a 1 e mede a distância entre a ideologia do bloco e o `lean` da UF;
  - teto = R · (1 − rejeição);
  - peso = teto · e^u.
- **Reconhecimento (I10).** A cada mês coberto pelo turno, nesta ordem:
  1. o esquecimento puxa o valor para o piso (`ostracismo_taxa`, `ostracismo_piso`);
  2. o crescimento orgânico o empurra para 1 (`organico_campanha` na corrida e na eleição; `organico_pre_campanha` antes delas).

  A transição não muda o reconhecimento. Os adversários seguem a mesma regra (adversários simples, sem ações).
- **Pesquisa.** É a última etapa de cada turno pré-posse, exceto na transição. Mostra a intenção sobre o comparecimento: candidatos, indecisos e brancos/nulos, somando 1. O erro de amostra é `ruido_nacional` em cada parcela, com renormalização. Cada UF recebe uma faixa de reconhecimento com erro `ruido_uf`, e a margem divulgada é `pesquisa_margem`. A pesquisa atual fica em `CareerState.poll`, e a de cada turno, em `MonthReport.career.poll`.
- **Eleitorado.** São 156.454.011 eleitores, repartidos entre as UFs pela população (`PROVISORIO`). A abstenção e os brancos e nulos usam os números de 2022 registrados no [DATA_SOURCES.md](DATA_SOURCES.md) §6.
- **Versão do estado 14**, sem função de atualização (§4, saves antes do lançamento).

**Entregue:**
- **Motor:** `src/engine/career/` com `calibration.ts` (`CAREER_PARAMS`, todos lidos pelo motor), `draw.ts`, `viability.ts`, `electorate.ts`, `opponents.ts` e `polls.ts`. As etapas `viabilityStep` e `pollStep` entraram em `PRE_INAUGURATION_STEPS`.
- **Relatório:** pseudo-indicador `'careerRecognition'`, que só aparece no relatório.
- **Invariantes:**
  - reconhecimento em [0, 1] e valência em [−1, 1];
  - pesquisa soma 1;
  - variação do reconhecimento nacional igual à soma das contribuições;
  - o tempo anda um turno, e o mês do mandato fica parado antes da posse.
- **Interface:** o trilho "Eleições" aparece antes da posse e mostra a pesquisa (`CareerPollCard`):
  - intenção, do mais ao menos citado, com data e margem;
  - faixas por UF;
  - "Por que mudou?" em texto, com as causas na direção da variação e sem coeficientes.
- **Duas lacunas da Fase C1, corrigidas:**
  - o relatório agora abre depois de um turno pré-posse (a mesa compara o turno, não o mês do mandato);
  - o título do relatório usa o rótulo da campanha ("Resumo de Setembro de 2026").
- **Testes:**
  - o exemplo dos 100 mil eleitores e o D-C16;
  - as propriedades: partição, teto, nacional = soma das UFs, percentuais;
  - monotonicidade na partição e na cadeia inteira;
  - a mesma pesquisa ao refazer o turno, ao recalcular e ao retomar do banco;
  - abrir a tela não muda o estado;
  - fronteiras das faixas e regras do Zod.

**Não entregue nesta fase:**
- C2.6 (Exp): transbordo regional e base territorial dinâmica.
- Parâmetros da lista proposta que nenhuma regra usa ainda: `transferencia_*` e `abstencao_2t` (2º turno, Fase C5) e `pesquisa_atraso`.
- Pesquisa por UF (só a nacional) e mapa 2D das faixas (Fase C4).
- Ações de campanha que mexam no reconhecimento ou na valência (Fase C4).
- Eleição de fato: a partição em modo `eleicao` existe e está testada, mas ninguém a chama ainda (Fase C5). Todo jogador continua chegando à posse.
- Estratégia-robô `sim:*` para a corrida.

---

### Fase C3 — Finanças de campanha

**Dependências.** Fase C2.

**Contabilidade.**

- **Unidade:** inteiro em R$ mil (D-C14). Valores guardados exatos; **arredondamento só na exibição**. Conversões de taxa (semana → turno) com arredondamento para o par mais próximo e teste de que 96 turnos não acumulam desvio além de 1 unidade.
- **Ordem das operações no turno:** recebimentos do turno (repasse já liberado, doações) → validação e reserva das ações **na ordem de envio** (§4.1, contrato 1) → gastos → dívida (só se escolhida) → fiscalização (risco do caixa 2) → prestação de contas (relatório).
- **Respostas às perguntas de contabilidade** (propostas):

| Pergunta | Proposta |
| --- | --- |
| O teto pessoal limita aporte, gasto ou ambos? | **Aporte:** limita a transferência do patrimônio para o caixa da campanha; o gasto é limitado pelo teto global |
| Repasse partidário é dinheiro disponível ou promessa? | Promessa com parcelas: cada parcela vira disponível no turno previsto; a parcela futura não conta no saldo |
| Uma ação que arrecada pode financiar a si mesma no mesmo turno? | Não: o que ela arrecada entra no turno seguinte |
| Ação rejeitada libera a reserva? | Sim, imediatamente: só ações aceitas reservam |
| O teto global conta gasto contratado ou pago? | Contratado (reservado) |
| Dívida é automática? | Não: só por escolha explícita, com limite (D-C6) |
| Quais bolsos pagam cada custo? | Tabela bolso × tipo de custo na especificação da fase (ex.: tráfego pago só com fundo ou doações) |
| O que acontece com o caixa na posse? | **Encerramento contábil da campanha:** sobra é registrada e encerrada (não é dinheiro pessoal apagado); dívida vira compromisso |

- **Teto global de gastos** do cargo (verificar, §8) sobre a soma dos bolsos.
- **Perfis:** patrimônio, liquidez, limite legal aplicável e capacidade de arrecadar, separados.

**Compromissos (Exp; fora do M1).** Estado, não marca solta. Campos **(propostos)**: origem (quem exigiu e por qual decisão); obrigação (o que o satisfaz); prazo (data no calendário do **governo**); status (`pendente`, `cumprido`, `expirado`, `negociado`, `cancelado`); cobrança (evento, perda de relação ou outro efeito); conflito (regra para dois compromissos que exigem o mesmo cargo ou escolhas incompatíveis); visibilidade (mostrado antes de aceitar e consultável depois). Começar com **um único tipo funcional** antes de multiplicar exigências.

**Caixa 2 (Exp).**

- Exposição E_t = δ·E_{t−1} + volume_t (δ < 1); perigo h_t = min(h_max, 1 − e^(−λ·E_t)).
- h_t é **o único sorteio de descoberta desse mecanismo no turno** (outros sistemas sorteiam seus próprios eventos), pela chave do §4.1.
- A expressão 1 − Π(1 − h_t) é a probabilidade de descoberta **numa trajetória de perigos especificada**; se os perigos futuros dependem de decisões ainda não tomadas, não é previsão. Para o jogador: **faixa de risco atual**; qualquer projeção mostra as hipóteses usadas.
- **Depois da descoberta:** a exposição dos atos descobertos é encerrada; novos atos podem gerar nova exposição e nova descoberta; as consequências da primeira continuam (investigação, possível cassação, Fase C5).
- Tabela de trajetórias de exemplo (`FICTICIO`) e testes para exposição constante, crescente e decrescente; h ≤ h_max.

| # | Tarefa | Entrega | Arquivos (dono único) |
| --- | --- | --- | --- |
| C3.1 | Um caixa, teto global, reserva na ordem, encerramento contábil | M1.2 | `src/engine/career/finance.ts` **(proposto)** |
| C3.2 | Triagem no motor | M1.2 | `src/engine/advanceMonth.ts` (trecho de triagem) |
| C3.3 | Três bolsos, parcelas de repasse, dívida por escolha | Exp | `src/engine/career/finance.ts` **(proposto)** |
| C3.4 | Compromissos (um tipo primeiro) | Exp | `src/engine/career/commitments.ts` **(proposto)** |
| C3.5 | Caixa 2 | Exp | `src/engine/career/illicit.ts` **(proposto)** |

**Testes exigidos.** Conservação em inteiros; saldo nunca negativo sem dívida escolhida; teto global sobre o contratado; fronteiras (saldo exato aceito, 1 unidade acima rejeitada; duas ações que juntas excedem → a segunda é rejeitada e a reserva da rejeitada é liberada); estabilidade do sorteio por chave (contrato 2); permutação só de ações independentes (contrato 3); trajetórias do caixa 2; sem deriva de arredondamento em 96 turnos.

**Implementação em verificação (27/10/2026).** O motor oferece caixa simples ou três bolsos por configuração do cenário, reserva na ordem, parcelas, aporte, arrecadação com recebimento no turno seguinte e contratação explícita por dívida. O fechamento registra as sobras e, fora do Casual, gera um compromisso pagável com patrimônio pessoal; uma dívida vencida produz cobrança de capital político. O caixa 2 fica fora do Casual, tem teto de entrada, exposição e um sorteio por turno; descoberta inicia investigação e notícia, sem condenação automática. A folha eleitoral mostra as escolhas e o risco; o relatório e o resumo persistido registram a contabilidade. O estado é v15 e o motor 0.10.0, sem migração nova de saves.

**Limites atuais.** O cenário usa repasses, riscos e custos `FICTICIO`, ainda sem calibração com prestações de contas. O teto de R$ 88.944 mil é uma aproximação conservadora `PROVISORIO` do limite do primeiro turno; a C5 precisa definir a regra de segundo turno. As doações são agregadas e não simulam a renda ou o limite de cada doador individual; a renda de arrecadação é uma simplificação de jogo. Os outros arquétipos e efeitos eleitorais são da C4; a eleição, resultado e possível cassação são da C5. A investigação registra a ocorrência, mas não condena nem cassa. Compromissos implementam inicialmente dívida com estados pendente, cumprido e expirado; negociação, cancelamento e conflitos entre cargos continuam sem modelagem. A homologação em aparelho, a sessão com pessoas e a calibração completa continuam pendentes.

**Protocolo de diagnóstico financeiro (pré-registro).** Executar 20 sementes por estratégia com a mesma dificuldade, saldo inicial, calendário e objetivo de terminar com recursos disponíveis: (1) sem decisões, (2) arrecadação limpa em cada turno possível, (3) a mesma arrecadação mais uma entrada de caixa 2 por turno possível. Registrar recusas, sobras oficiais, caixa 2, dívidas, investigações e um intervalo de Wilson de 95% para a proporção de campanhas com investigação. Critérios de integridade: zero violações das invariantes e determinismo por semente. São robôs de diagnóstico, não prova de melhor estratégia, calibração eleitoral ou homologação com pessoas; o resultado não mede vitórias, pois a eleição da C5 ainda não existe.

**Ampliação pré-registrada do diagnóstico.** Comparar também arrecadação limpa financiada por dívida com a estratégia limpa paga à vista. Em ambas, o objetivo é o valor final líquido (sobras oficiais e ilícitas + patrimônio pessoal disponível − dívida); ambas começam com os mesmos recursos e informação. O robô com caixa 2 faz a mesma arrecadação e usa a verba ilícita disponível quando permitida. Reportar a melhor das duas estratégias limpas testadas, sem extrapolar para o conjunto de todas as estratégias possíveis.
**Resultado exploratório (27/10/2026).** `npx vitest run --config vitest.balance.config.mts scripts/sim/careerFinance.sim.ts`: 20 sementes por estratégia, sem violações e com determinismo. Sobra oficial média em R$ mil: inerte 11.000; limpa 12.800; caixa 2 12.800, além de 1.500 de sobra ilícita média. Dívida e recusas médias: 0 nos três robôs. Investigação: 0/20 nas duas estratégias sem caixa 2 e 5/20 com caixa 2 (intervalo de Wilson de 95%: 11,2%–46,9%). Amostra pequena e roteiro fixo; não mede vitória eleitoral, não prova a melhor estratégia limpa nem substitui balanceamento e homologação.
**Resultado da ampliação (27/10/2026).** Em R$ mil de valor líquido médio: inerte 11.750; limpa à vista 13.550; limpa com dívida 13.550; caixa 2 15.050. A melhor das duas estratégias limpas testadas empatou em 13.550; caixa 2 teve 5/20 campanhas com investigação (IC95% de Wilson 11,2%–46,9%). As investigações ainda não têm as consequências da C5, portanto essa vantagem financeira é um sinal de balanceamento pendente, não uma recomendação nem avaliação de vitória. Foram observadas zero recusas e zero violações nas quatro estratégias, 20 sementes por estratégia.
**Trajetórias ilustrativas de caixa 2 (`FICTICIO`).** Condição hipotética sem descoberta; δ = 0,5, λ = 0,01 e teto de perigo = 0,30. Não são previsões de trajetórias futuras que dependam de decisões.

| Trajetória | Exposição inicial | Volumes por turno | Exposição antes da fiscalização | Perigo por turno aproximado |
| --- | ---: | --- | --- | --- |
| Constante | 20 | 10; 10; 10 | 20; 20; 20 | 18,1%; 18,1%; 18,1% |
| Crescente | 0 | 5; 10; 15 | 5; 12,5; 21,25 | 4,9%; 11,8%; 19,1% |
| Decrescente | 0 | 15; 5; 0 | 15; 12,5; 6,25 | 13,9%; 11,8%; 6,1% |

**Estimativa (esforço).** M1: motor 1. Expansão: motor 2; conteúdo 1; testes 1.

---

### Fase C4 — Ações, debates, vice e mapa

**Dependências.** Fase C3 (M1: só C3.1–C3.2). A pesquisa qualitativa (C4.8–C4.10) é expansão, distinta das pesquisas quantitativas da C2: a versão de governo pode ser feita independentemente da pré-campanha, após definir seu custo e financiamento; a versão pré-posse depende das finanças e dados da carreira; reeleição e sucessão dependem de caixa eleitoral próprio e janela de campanha definidos. Nenhuma dessas dependências bloqueia o M1.

**Ações: 5 arquétipos** (nacional amplo; regional direcionado; mobilização partidária; comunicação com risco e retorno; arrecadação/negociação). As 10 formas do documento de origem são **conteúdo** desses arquétipos; ação nova só entra com trade-off que nenhum arquétipo tem.

**HGPE (90/10)** (Exp): 10% igual e 90% pelas cadeiras da coligação (`Bloc.chamberSeats`, [src/types/scenario.ts:23](../src/types/scenario.ts)); verificar (§8).

**Debates:** postura × alvo com **informação observável** (pontos fortes e fracos do adversário, risco de bumerangue, efeito esperado, consequência de não responder). O protocolo do §5.1 verifica se o jogador explica por que a postura funcionou.

**Vice** (Exp; no M1 é fixo do perfil): escolha entre perfis com vantagens distintas; troca até a convenção, depois só por evento e com custo; consequências no início do governo (relação, exigência de cargo como compromisso, risco de rompimento); cadeiras do bloco do vice contadas **uma vez** na coligação.

**Mapa:** 2D e **lista textual** primeiro (faixa estimada e data, §Fase C2), molde em [src/components/map/electoralView.ts:28](../src/components/map/electoralView.ts); rótulos acessíveis, leitor de tela, texto ampliado, alternativa sem gesto preciso. Globo e caravana são acabamento (Fase C8).

#### Pesquisa qualitativa de imagem e opinião (Exp)

**Objetivo.** Permitir a contratação de um grupo focal nacional ou de uma UF para compreender percepções, dúvidas e possíveis motivos de insatisfação sobre a candidatura, o presidente ou o governo. O relatório é confidencial e qualitativo: informa decisões, mas **não altera diretamente aprovação, rejeição ou votos**. É complementar à pesquisa quantitativa da Fase C2; não a substitui nem integra os requisitos de pesquisa do M1.

**Contextos, disponibilidade e custos.**

| Contexto | Disponibilidade e objeto | Agenda | Fonte financeira |
| --- | --- | --- | --- |
| Pré-campanha e campanha pré-posse | Imagem da candidatura | **0 pontos** | Caixa oficial da campanha |
| Presidente em campanha de reeleição | Imagem da candidatura ou do presidente, conforme a escolha | **0 pontos** | Caixa da campanha de reeleição, quando existir |
| Presidente apoiando sucessor | Imagem do sucessor, do governo ou de ambos, conforme disponibilidade de dados | **0 pontos** | Caixa da campanha do sucessor, quando existir |
| Governo fora da campanha eleitoral | Percepção do presidente ou do governo | **Proposta: 1 ponto**, sujeita à decisão de design | Recurso governamental ou abstração coerente com o modelo fiscal, ainda a definir |
| Pós-presidência | Fora do escopo inicial | — | — |

Os recursos de campanha, os do governo e o patrimônio pessoal são distintos: nunca debitar automaticamente a pesquisa do dinheiro pessoal do presidente nem transferir recursos implicitamente entre essas fontes. Reeleição e sucessão só ficam disponíveis quando houver estrutura de campanha e caixa apropriados; não simular um saldo inexistente. Para o governo fora da eleição, definir e registrar o custo financeiro, sua fonte e o efeito fiscal antes da implementação; não criar conta desconectada do modelo existente.

O motor identifica o contexto pelo estado da partida e pela janela eleitoral definida para a funcionalidade, não pela interface. A janela eleitoral é uma decisão específica a definir e não se presume igual à janela de declaração de candidatura. Na contratação, o jogador escolhe o objeto disponível e a abrangência nacional ou UF; antes de confirmar, vê custo, fonte, pontos de agenda e turno de entrega. Contexto, UF, recursos e frequência são validados no motor; em caso de rejeição, informar o motivo e não descontar recursos. Uma pesquisa nacional e uma regional podem revelar temas diferentes.

**Conteúdo e fundamento.** O relatório traz contexto, data e abrangência; leitura geral; até três temas sustentados por dados ou acontecimentos disponíveis; falas fictícias identificadas como ilustrativas; possíveis caminhos de ação sem garantia de resultado; e uma explicação dos limites da leitura qualitativa. Comparações por idade, renda ou outros segmentos só aparecem quando houver dados ou regra de simulação explícita que as sustente; caso contrário, omitir ou explicar a indisponibilidade. Ordenar temas por relevância simulada não autoriza atribuir percentuais precisos de rejeição a causas sem suporte. Aprovação baixa não equivale automaticamente a rejeição eleitoral: sem variável própria, falar de insatisfação ou percepção negativa.

Na pré-posse, usar reconhecimento, percepção, rejeição quando modelada, situação regional, ações, debates, eventos e pesquisas disponíveis. No governo, usar aprovação nacional/regional, indicadores econômicos e sociais, decisões e eventos registrados; não afirmar causalidade além do que os dados permitem.

**Contratos iniciais (propostos; adaptar ao motor vigente):**

```typescript
type FocusGroupScope = { type: 'national' } | { type: 'state'; uf: string };
type FocusGroupSubject = 'candidate' | 'president' | 'government' | 'supported_successor';

interface QualitativeFinding {
  id: string;
  title: string;
  description: string;
  evidenceIds: string[];
  illustrativeQuote?: string; // fala fictícia e ilustrativa
}

interface QualitativeSegmentAnalysis {
  segmentId: string;
  perception: string;
  evidenceIds: string[];
}

interface FocusGroupReport {
  id: string;
  turnId: string; // representação final conforme identidade de turno da C1
  subject: FocusGroupSubject;
  scope: FocusGroupScope;
  overallPerception: string;
  findings: QualitativeFinding[];
  segments: QualitativeSegmentAnalysis[];
  possibleActions: string[];
  limitations: string;
}
```

Para a opção “sucessor e governo”, produzir leituras identificadas por objeto, sem fundir evidências de ambos. Os campos propostos não impõem a existência de dados demográficos nem percentuais causais.

**Geração, retenção e interface.** Gerar o resultado uma vez em uma etapa definida do turno; se houver sorteio, usar a chave de contexto e ocorrência do §4.1. Reabrir, navegar ou retomar nunca muda o relatório nem consome sorteios. Definir retenção limitada de relatórios recentes e resumo dos relevantes, escolhendo armazenamento compatível com a política de histórico: `MonthReport` sozinho não garante histórico duradouro, pois o repositório retém 12 relatórios ([src/database/campaignRepository.ts](../src/database/campaignRepository.ts)). Na interface, expor a ação em inteligência/comunicação da campanha ou opinião/comunicação do governo; na reeleição identificar o caixa eleitoral. Exibir relatório acessível em celular, sem depender apenas de cor. Nunca gerar manchete pública automaticamente por ser uma pesquisa confidencial.

| # | Tarefa | Entrega | Arquivos (dono único) |
| --- | --- | --- | --- |
| C4.1 | 5 arquétipos e catálogo mínimo | M1.2 | `src/engine/career/actions.ts` **(proposto)**, `src/engine/actions.ts` (ids) |
| C4.2 | Um debate com informação observável | M1.2 | `src/engine/career/debate.ts` **(proposto)** |
| C4.3 | Mapa 2D e lista acessível | M1.2 | `src/components/map/recognitionView.ts` **(proposto)**, componentes do mapa |
| C4.4 | Interface da campanha (folha × subtela, [GAME_DESIGN.md](GAME_DESIGN.md) §4.6) | M1.2 | `src/components/campaign/*`, `src/store/*` |
| C4.5 | HGPE | Exp | `src/engine/career/hgpe.ts` **(proposto)** |
| C4.6 | Vice selecionável | Exp | `src/engine/career/vice.ts` **(proposto)** |
| C4.7 | Variações de conteúdo e eventos sazonais | Exp | conteúdo em `src/data/` |
| C4.8 | Pesquisa qualitativa do governo: definir financiamento e custo, gerar relatório fundamentado, persistir e apresentar | Exp; pode anteceder a pré-campanha | motor, repositório/store e interface de governo, arquivos a definir |
| C4.9 | Integrar pesquisa qualitativa à pré-campanha e ao caixa eleitoral | Exp; depende de C3 e dados de C2 | motor de carreira, finanças e interface da campanha, arquivos a definir |
| C4.10 | Integrar pesquisa à reeleição e à sucessão | Exp; depende de janela e caixas eleitorais próprios | motor eleitoral, finanças e interface, arquivos a definir |

**Testes exigidos.** Ação fora do estágio rejeitada; debate (tabela de vantagens e escolha padrão); leitor de tela percorre a lista do mapa; **Maestro cobre ações, pesquisa e mapa até o limite da Fase C4** (o fluxo completo é do M1.3); HGPE e vice com os testes da expansão (soma 100%, monotonia nas cadeiras, sem dupla contagem).

**Testes da pesquisa qualitativa (por entrega).** Pré-campanha, reeleição e sucessão: custo de agenda zero e débito exclusivamente no caixa eleitoral correspondente; patrimônio pessoal inalterado; contexto ou UF inválidos e saldo insuficiente rejeitados sem desconto parcial. Governo fora da eleição: custo e fonte conforme decisão registrada. A pesquisa não altera diretamente aprovação, rejeição ou intenção; cada tema tem evidência, segmentos sem suporte são omitidos ou indicados como indisponíveis, e falas são fictícias e ilustrativas. Verificar abrangência nacional e UF, confidencialidade sem manchete automática, geração uma vez, estabilidade ao reabrir e após salvar/retomar, e ausência de consumo de PRNG ao navegar. Testar reeleição e sucessão quando seus caixas estiverem implementados; até lá, não marcar esses contextos como entregues.

**Estimativa (esforço).** M1: motor 1; interface 2. Expansão anterior à pesquisa: motor 1; interface 1; conteúdo 1. Pesquisa qualitativa: estimativa adicional a definir após escolher financiamento do governo, retenção e contratos dos caixas de reeleição e sucessão.

---

### Fase C5 — Convenção, eleição, desfechos e posse

**Dependências.** Fase C4.

**Regras da eleição (proposta):**

1. Se um candidato obtém a maioria exigida dos válidos no 1º turno (CF art. 77, a verificar), a eleição termina: **vitória** se for o jogador, **derrota** caso contrário — inclusive quando o jogador fica em segundo.
2. Senão, os dois mais votados vão ao 2º turno; os demais são derrotados.
3. **Empates** (na maioria, na disputa pela 2ª posição ou no 2º turno) seguem uma regra explícita e testada (proposta: a regra legal de desempate, a verificar no §8, com um atributo fictício determinístico).
4. Com um único adversário, o 1º turno decide, salvo empate exato. Menos de dois candidatos: cenário inválido (Fase C2).

**Máquina de estados.**

```
pre_campanha ──► convencao ──► nao_homologado (desfecho)
                    │
                    ▼
                 corrida ──► primeiro_turno ──► eleito_1t ──────────────► transicao ──► governo
                    │              │
                    │              ├──► derrotado_1t (adversário eleito no 1º turno, ou jogador fora dos dois primeiros)
                    │              ▼
                    │        segundo_turno ──► eleito_2t ──► transicao
                    │              └──► derrotado_2t (desfecho)
                    └──► cassacao (desfecho, se adotado; também possível na transição)
```

| Estado final | Tipo | Gatilho | O que o jogador vê |
| --- | --- | --- | --- |
| `nao_homologado` | derrota ou recuperação (D-C4) | influência abaixo do limiar | aviso antecipado nos turnos anteriores; causa |
| `derrotado_1t` | derrota | adversário com maioria no 1º turno **ou** jogador fora dos dois primeiros | resumo da derrota |
| `derrotado_2t` | derrota | menos válidos no 2º turno | resumo da derrota |
| `eleito` | continuidade | maioria dos válidos | posse |
| `cassacao` | derrota (se adotado) | caixa 2 descoberto e julgado | linha do tempo |

**Depois de uma derrota antes da posse (D-C18).** Proposta para o M1: **encerrar com um resumo útil e oferecer recomeçar** (nova campanha ou nova tentativa com o mesmo perfil), sem modo alternativo. O resumo traz: resultado (nacional e por UF); principais fatores; duas ou três escolhas com efeito relevante; e a separação entre o que foi influência do jogador e o que foi acontecimento externo.

**Interrupção e retomada:** cada transição acontece dentro de um turno gravado numa transação; fechar e reabrir em qualquer estado retoma no mesmo estado.

**Posse: destino de cada dado.** `createInitialState` reinicia o PRNG ([src/engine/state.ts:98](../src/engine/state.ts)); a posse usa uma variante que recebe o estado existente.

| Dado | Destino na posse |
| --- | --- |
| Semente e estado do PRNG | continuam; sorteios por chave mantêm os sais |
| Histórico e decisões da pré-campanha | resumo compacto fora da retenção; detalhes pela retenção normal (§2.3) |
| Linha de base | ponto da posse na série (§2.3) |
| Efeitos agendados | atravessam a posse pelo relógio definido (§2.3) |
| Relações políticas | ajustadas por coligação, vice e concessões, com causa |
| Recursos e dívidas | encerramento contábil; dívida vira compromisso (D-C6) |
| Compromissos (Exp) | migram com prazo no calendário do governo |
| Resultado nacional e regional | gravado como resultado eleitoral, com o estágio |
| Relatórios e notícias | os existentes seguem a retenção; o feed do governo começa com a posse |

| # | Tarefa | Entrega | Arquivos (dono único) |
| --- | --- | --- | --- |
| C5.1 | Regras da eleição e desfechos | M1.3 | `src/engine/career/election.ts` **(proposto)**, `src/engine/events/outcome.ts` |
| C5.2 | Resumo de derrota e recomeço | M1.3 | `src/components/campaign/*`, `src/store/*` |
| C5.3 | Transição e posse com continuidade | M1.3 | `src/engine/career/inauguration.ts` **(proposto)**, `src/engine/state.ts` |
| C5.4 | Convenção e recuperação limitada | Exp | `src/engine/career/convention.ts` **(proposto)** |
| C5.5 | Cassação | Exp | `src/engine/career/illicit.ts` **(proposto)** |
| C5.6 | Eventos do vice | Exp | `src/data/events/` |

**Testes exigidos.** Adversário eleito no 1º turno com o jogador em segundo → derrota; empates (maioria, 2ª posição, 2º turno); um adversário só; continuidade determinística na posse; retomar imediatamente antes e depois da posse real; persistência após reinício; regressão do ponto `'posse'`; invariantes em todos os turnos; **fluxo integrado do M1 no Maestro**.

**Estimativa (esforço).** M1: motor 1–2; interface 1; testes 1. Expansão: motor 1; conteúdo 0,5.

---

### Fase C6 — Bastidores de Brasília (Camada 3): entregas separáveis, com contratos de integração

**Dependências.** Camada 2 (governo). Cada subfase tem contrato, critério e PR próprios; se precisar de estado persistente, ele é projetado e revisado na própria subfase.

**Regressão.** Cada sistema é ligável por configuração interna do cenário. O ponto `'posse'` com os sistemas **desligados** é idêntico ao jogo atual; com eles **ligados**, a regressão compara só o que não deveria mudar. A exposição ao jogador (dificuldade ou opção) é D-C5.

| Subfase | Sistema | O que definir antes | Integrações (consome / produz) | Critério |
| --- | --- | --- | --- | --- |
| C6a | Diretorias | cargos limitados; custo de substituição; efeito político e risco; relação com ministérios técnico/partidário | produz risco de escândalo para C6b | nomear, substituir e sofrer escândalo, com causa |
| C6b | Escândalos e ilícitos | gatilhos; descoberta (mesma especificação de perigo da Fase C3); defesa; etapas graduais (investigação → acusação → condenação) | consome C6a; produz marcas para a pressão de impeachment, a CPI existente e C6e | nenhuma condenação automática por marca de investigação |
| C6c | Pauta-bomba | quem propõe, quando chega, sanção/veto, impacto fiscal; antes, verificar os eventos atuais (C0.5) | consome Congresso e sanção/veto ([POLITICAL_RULES.md](POLITICAL_RULES.md) §7) | custo fiscal coerente com [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) |
| C6d | STF | vaga, indicação e decisão judicial separadas; idade só com estado que a sustente | consome relação com o Senado | indicação com aprovação; liminar existente intacta |
| C6e | Gaveta do impeachment | acúmulo, descarte e abertura de pedidos | consome C6b e `housePresidents`; alimenta a cadeia atual ([POLITICAL_RULES.md](POLITICAL_RULES.md) §10) | a cadeia atual continua a única via de condenação |
| C6f | Banco Central | **avaliar** a ação existente `pressionar_banco_central` ([src/engine/actions.ts:20](../src/engine/actions.ts), [src/engine/economy/monetary.ts:40](../src/engine/economy/monetary.ts)): apresentação, efeito provável e incerteza; propor mudança só depois da análise | consome Copom e diretoria do BC | análise registrada; mudanças, se houver, com teste |
| C6g | Termômetros e pronunciamento | fórmula, escala, frequência, relação com indicadores; **leitura derivada**, não opinião medida de grupos | consome indicadores e eventos de C6a–C6e | leitura reproduzível a partir dos indicadores |

**Fora da Fase C6:** CPI com comissão própria e comissões individuais (Fase 09); diplomacia profunda (Fase 11).

**Testes.** Por subfase: regras, fronteiras, determinismo, regressão desligada, comparação parcial ligada, e **testes das integrações declaradas** na tabela. Campanhas de 240 meses são **simulações de estresse** do motor (`runCampaign`, [scripts/sim/balance.sim.ts:63](../scripts/sim/balance.sim.ts)), além de `campaignMonths`: medem invariantes, saturação e explosões, não equilíbrio do modo normal.

**Estimativa (esforço).** 1–2 por subfase (motor, conteúdo e testes), mais interface conforme o sistema.

---

### Fase C7 — Situação e possibilidades após o mandato (Camada 5)

**Dependências.** Fase C5 e o Legado existente. Seção do Legado, sem meses jogáveis (D-C7); projeções, não destinos definitivos.

**Aspectos independentes:** influência política; situação jurídica (nenhuma, investigação, acusação, condenação, restrição efetiva — marca de CPI ou escândalo **não** é condenação); legado de governo.

**Precedência dos desfechos:**

| Ordem | Desfecho | Origem |
| --- | --- | --- |
| 1 | `cassacao` (se adotado) | Fase C5 |
| 2 | `impeachment` | [outcome.ts:20](../src/engine/events/outcome.ts) |
| 3 | `nao_homologado` | Fase C5 |
| 4 | `derrotado_1t` / `derrotado_2t` | Fase C5 |
| 5 | `derrota_eleitoral` (no governo) | [outcome.ts:25](../src/engine/events/outcome.ts) |
| 6 | `fim_de_mandato` | [outcome.ts:27](../src/engine/events/outcome.ts) |
| 7 | fim por limite de meses | [gameStore.ts:65](../src/store/gameStore.ts) |

Derrotas antes da posse usam o resumo da Fase C5 (não há governo a avaliar). Consequências jurídicas ficam condicionadas ao §8.

**Testes.** Casos por aspecto e por desfecho; fronteiras; desfechos simultâneos.

**Estimativa (esforço).** Motor 0,5–1; interface 1.

---

### Fase C8 — Acabamento, tutorial, balanceamento e coerência

**Dependências.** Fase C5, subfases escolhidas da Fase C6, Fase C7.

| # | Tarefa |
| --- | --- |
| C8.1 | Refinar o Novo jogo (todos os pontos de partida, perfis, dificuldade) sobre a entrada mínima da tarefa C1.7 |
| C8.2 | Tutorial da campanha |
| C8.3 | Globo: camada de reconhecimento e animação da caravana (movimento reduzido; metas de [MEDICAO_GLOBO.md](MEDICAO_GLOBO.md); registro de modelo, configuração e cenário medido) |
| C8.4 | Balanceamento final (§5.1) e `docs/CALIBRATION.md` |
| C8.5 | Revisão de coerência dos documentos |
| C8.6 | Homologação no aparelho dos fluxos reais |

**Estimativa (esforço).** Interface 2–3; balanceamento 1–2; homologação 1.

---

## 5.1 Testes, simulações, balanceamento e homologação

- **Regra:** Vitest, cada teste cita a seção (`// PLANO_CAMPANHA.md Fase C3: teto global`).
- **Invariantes** de [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §7 mais os da carreira (partição do eleitorado soma E; teto de elegibilidade; saldos inteiros conservados; tetos; nenhuma ação proibida sem rejeição com motivo).
- **Determinismo** em todos os pontos de partida; **regressão** (§4).
- **Testes de fronteira:** todo limiar com um teste em cada lado. Teste de mutação automatizado é opção futura (D-C8).
- **Propriedades × sementes:** sementes variam o sorteio; a cobertura vem de **geradores de estado e de sequências de ações**, além das sementes.
- **Balanceamento:** 20 sementes = diagnóstico inicial; métricas e margens **registradas antes** de rodar; relatar amostra, variabilidade (intervalo de confiança) e separar exploração de calibração final; **robôs comparáveis** (mesmo orçamento, informação e objetivo; caixa 2 contra a melhor estratégia limpa); teste de viés entre perfis.
- **Fluxos reais:** interromper e retomar; derrota em cada etapa; posse; conclusão do mandato; acessibilidade. Robôs não substituem a homologação no aparelho.

**Protocolo de homologação com pessoas** (registro simples, sem metas numéricas por ora):

| Campo | O que registrar |
| --- | --- |
| Quem e onde | pessoa (sem dado pessoal), ponto de partida, dificuldade, aparelho |
| Tempo | até a primeira escolha relevante; total |
| Travamentos | momentos em que não sabia o que fazer |
| Rejeições | se entendeu por que uma ação foi rejeitada |
| Pesquisas | se entendeu as pesquisas e a diferença para o resultado |
| Consequências | se percebeu uma consequência posterior de uma escolha |
| Explicação | se explica por que ganhou ou perdeu |
| Vontade | se quis jogar de novo, depois da vitória ou da derrota |

Uma mecânica que gere repetição ou confusão recorrente pode ser **simplificada ou removida**; a decisão fica registrada.

## 5.2 Observabilidade

- **Relatório e contribuições** registram tudo com causa: viralização e gafe, repasses, compromissos, perigo do caixa 2, pesquisas, resultados de cada turno eleitoral, rompimento do vice, posse.
- **Notícias só para acontecimentos relevantes** (viralização, gafe grave, debate, convenção, resultado, descoberta do caixa 2, rompimento do vice, posse); ajustes pequenos ficam no relatório.
- Nenhum dado pessoal real em estado, relatório ou banco; sem `console.log` no motor.

## 5.3 Conteúdo, marcas e mecânicas ilegais

- Sem marcas, logotipos ou pessoas reais ([AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §8; [GAME_DESIGN.md](GAME_DESIGN.md) §13). Substituições genéricas, `dataStatus: "FICTICIO"`:

| No documento de origem | No jogo |
| --- | --- |
| Emissoras e portais citados | "emissora de notícias 24 h", "jornal de grande circulação", "portal de notícias" |
| Podcasts citados | "podcast de grande audiência" |
| Institutos de pesquisa citados | "instituto de pesquisa" |
| Plataformas de vídeo e anúncios | "rede de vídeos curtos", "plataforma de anúncios" |
| Estatais citadas | "estatal de energia", "banco público", "estatal de obras" |
| Festas e feiras citadas | "festa junina do Nordeste", "feira do agronegócio", "procissão religiosa no Norte" |
| "Estilo Crusader Kings" | retirado |

- Instituições como papéis genéricos, sem logotipo; dúvidas: decisão do autor (D1).
- Mecânicas ilegais: ficção com risco proporcional e consequência registrada; texto sem procedimento; aviso de ficção (D-C3).
- Conteúdo novo em JSON com Zod `.strict()`; decisões validadas no motor; nenhuma chamada de rede.

---

## 6. Proposta de encaixe no roadmap (somente proposta)

| Fase deste plano | Relação com o roadmap | Recomendação |
| --- | --- | --- |
| Fase C0 | Documentação e protótipo | Fazer já |
| Fases C1–C5 (Camada 1) | Fora das versões 0.5 e 1.0 ([ROADMAP.md](ROADMAP.md) §1) | Fase 11, "Modo Carreira", começando pelo M1 |
| Fase C6 (Camada 3) | Sobrepõe as Fases 09 e 11 | Realismo/CPI → Fase 09; o resto → Fase 11 |
| Fase C7 | Leitura do estado final | Fase 10 ou 11 |
| Fase C8 | Fecha o que for feito | Na fase do bloco que fechar |

Se as Fases C1–C5 forem feitas depois do lançamento, cada mudança de estado e de banco exige atualização de save e teste ([AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2.1). Nenhuma alteração em [ROADMAP.md](ROADMAP.md) ou [ROADMAP_2.0.md](ROADMAP_2.0.md) foi feita.

---

## 7. Decisões em aberto

Em ordem de prioridade. Nenhuma está tomada.

| # | Decisão | Opções | Recomendação | Bloqueia |
| --- | --- | --- | --- | --- |
| D-C1 | Tempo e identidade dos turnos (§2.3) | direção: separar o calendário do mandato; forma: índice sequencial / chave composta | Manter a direção; escolher a forma depois da tarefa C1.0, junto com a D-C15 | Fase C1 |
| D-C15 | Ações entre os turnos eleitorais (§2.4) | A: ambos no mesmo turno / B: 2º turno como turno próprio | A no M1; B avaliado no protótipo (com índice sequencial, B é um turno extra com rótulo de outubro) | Fase C1 |
| D-C2 | Quando fazer a Camada 1 | antes da 1.0 / Fase 11 | Fase 11, começando pelo M1 | Fase C1 |
| D-C18 | Depois de derrota antes da posse | encerrar com resumo e recomeçar / repetir a eleição / modo alternativo | Encerrar com resumo útil e oferecer recomeçar (M1) | Fase C5 (M1.3) |
| D-C17 | Adversários | identidades de `elections.candidatos` + dados em `career` / catálogo próprio | Identidades existentes + dados em `career`; jogador ocupa a vaga do seu bloco | Fase C2 |
| D-C16 | Nenhum voto válido | estado inválido / caso tratado | Estado inválido por invariante | Fase C2 |
| D-C10 | Teto pela rejeição (I9) | sem teto / sobre válidos / sobre eleitorado | **Modelo inicial sem teto** (só o de elegibilidade); decisão antes de fechar a Fase C2 | fechamento da Fase C2 |
| D-C11 | Sorteios | PRNG compartilhado / sorteio por chave com ocorrência (§4.1) | Sorteio por chave nos sistemas da carreira | Fase C2 (pesquisas), Fase C3 |
| D-C12 | Economia antes da posse | evolui / congelada | Congelada no M1 | Fase C1 |
| D-C13 | Duração-alvo | minutos por ponto de partida | Pelo protótipo de ritmo | Fase C1 |
| D-C14 | Unidade monetária | inteiro em R$ mil / centavos / ponto flutuante | Inteiro em R$ mil, exato, arredondado só na exibição | Fase C3 |
| D-C3 | Mecânicas ilegais | todas / com aviso e fora do Casual / nenhuma | Com aviso, fora do Casual, sem procedimento | Fases C3, C6b |
| D-C9 | Cenário da carreira | cenário novo / bloco no cenário atual | Cenário novo para isolar e comparar; a regra atual permite editar conteúdo antes do lançamento ([AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2.1) | Fase C1 |
| D-C4 | Não homologação | fim com aviso / recuperação limitada | Aviso antecipado obrigatório; recuperação avaliada no protótipo | Fase C5 (Exp) |
| D-C5 | Exposição dos sistemas da Camada 3 | configuração interna / por dificuldade / opção visível | Configuração interna; exposição decidida por sistema, sem sete interruptores | Fase C6 |
| D-C6 | Dívida de campanha (I15) | compromisso / some no Casual / some sempre | Compromisso com cobrança; some no Casual | Fase C3 (Exp) |
| D-C7 | Pós-mandato jogável | seção do Legado / meses jogáveis | Seção do Legado | Fase C7 |
| D-C8 | Propriedades e mutação | geradores com o PRNG do projeto / `fast-check` / Stryker | Geradores próprios; dependências só com ganho medido | Fase C2 |

---

## 8. Fontes a verificar

**Conferido em 27/10/2026 (Fase C0, tarefa C0.4)**: os resultados, com link e data, estão no [DATA_SOURCES.md](DATA_SOURCES.md) §6. Os valores de 2026 tirados da imprensa (FEFC e teto de gastos) e a ordem de grandeza do comparecimento ficam `PROVISORIO`. A ADI 4650 não foi reconferida na fonte primária, e os custos de campanha ficam para a Fase C3. Cada registro vai para [DATA_SOURCES.md](DATA_SOURCES.md) §6 com: link direto da fonte primária e data da consulta; versão e data da regra aplicável ao cenário (eleição de 2026, posse em 2027); dispositivo ou trecho; conclusão e simplificação adotada; responsável; e decisão registrada quando a fonte não vira mecânica diretamente.

**Complemento C3:** a pesquisa posterior está no mesmo documento. O TSE informa o FEFC de 2026 e a manutenção do teto de 2022; o STF confirma a vedação de doações empresariais. Os arquivos de despesas foram identificados, mas ainda não analisados, e os custos de jogo continuam fictícios. O anexo com os valores de 2026 não foi acessado diretamente.

| Item | O que verificar | Dispositivo provável (a confirmar) | Usado em |
| --- | --- | --- | --- |
| Base da vitória e desempate | maioria absoluta dos válidos; 2º turno; regra de empate | CF art. 77 | Fases C2, C5 |
| Comparecimento, brancos e nulos | ordens de grandeza para a calibração | estatísticas do TSE | Fase C2 |
| FEFC | valor para 2026 e divisão | Lei 9.504/1997 arts. 16-C e 16-D; LOA | Fase C3 |
| Limite de gastos | teto do cargo de presidente | Lei 9.504/1997 art. 18; resolução do TSE | Fase C3 |
| Autofinanciamento | 10% do limite de gastos | Lei 9.504/1997 art. 23 | Fase C3 |
| Doação de pessoa física | 10% dos rendimentos brutos | Lei 9.504/1997 art. 23 | Fase C3 |
| Doação de empresa | proibida | ADI 4650 (STF, 2015); Lei 13.165/2015 | Fase C3 |
| HGPE 90/10 | divisão e duração | Lei 9.504/1997 art. 47 | Fase C4 |
| Calendário | convenções, início da campanha, datas dos turnos | Lei 9.504/1997 arts. 8º e 36; CF art. 77 | §2.4, Fases C1, C5 |
| Reeleição | um período subsequente | CF art. 14 §5 (reconferir a PEC 12/2022) | Fase C5 |
| Posse | 5 de janeiro | EC 111/2021 | Fase C1 |
| Cassação e inelegibilidade | abuso de poder econômico; prazo | LC 64/1990 art. 22; LC 135/2010 | Fases C3, C7 |
| Inabilitação no impeachment | prazo | CF art. 52, parágrafo único | Fase C7 |
| Custos de campanha | ordem de grandeza | prestações de contas do TSE | Fase C3 |

Os demais números do documento de origem são `FICTICIO` até a calibração.

---

## 9. Estimativas preliminares

Em **semanas de esforço de uma pessoa** por frente, **não** em tempo de calendário: frentes que podem correr em paralelo não devem ser somadas mecanicamente. Revisar depois da Fase C0 e de cada entrega do M1.

| Bloco | Motor | Banco/store | Interface | Conteúdo | Testes e homologação |
| --- | --- | --- | --- | --- | --- |
| Fase C0 | — | — | — | 0,5–1 (docs) | 0,5–1 (protótipo) |
| M1.1 | 1 | 1–2 | 0,5 | 0,5 | 1 |
| M1.2 | 3–4 | — | 2 | 0,5 | 1 |
| M1.3 | 1–2 | 0,5 | 1 | — | 1–1,5 |
| Expansão das Fases C1–C5 | 4–5 | 0,5 | 2 | 2 | 2 |
| Fase C6 (por subfase) | 1–2 | conforme | conforme | 0,5–1 | 0,5 |
| Fase C7 | 0,5–1 | — | 1 | 0,5 | 0,5 |
| Fase C8 | — | — | 2–3 | — | 2–3 |

## 10. Riscos gerais

| Risco | Medida |
| --- | --- |
| A Camada 1 vira um segundo jogo e atrasa a 1.0 | D-C2; M1 antes de expandir |
| Identidade dos turnos espalhada pelo app | Tarefa C1.0 antes de decidir; testes de integração desde a Fase C1 |
| Linha de base ou efeitos cruzando a posse errados | Regras do §2.3 e testes dedicados |
| Quebra do modo padrão | Regressão (§4); sistemas ligáveis por configuração interna |
| Pré-campanha repetitiva | Protótipo de ritmo; turnos sem escolha condensados; protocolo do §5.1 |
| Modelo eleitoral que duplica eleitores | Partição única por UF; exemplo de 100 mil eleitores; propriedades |
| Pesquisa que muda ao navegar | Pesquisa persistida e sorteada por chave |
| Estratégia dominante | Saturação; robôs comparáveis; métricas definidas antes |
| Viés entre perfis | Teste de viés |
| Marcas e pessoas reais | §5.3 no review de cada PR |
| Desempenho do globo | Animação como acabamento; metas de [MEDICAO_GLOBO.md](MEDICAO_GLOBO.md) |
| Saves depois do lançamento | Atualização e teste a cada mudança (§4) |
