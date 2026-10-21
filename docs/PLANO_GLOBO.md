# Plano — Globo vivo (decisões, tempo, clima, dia e noite, alinhamento e eleições)

Versão 0.4 do documento • 20/10/2026 • ⬜ Aguardando revisão do autor
v0.3: incorpora a revisão externa v0.2 (pontos aceitos), as decisões do autor de 20/10/2026 e o novo sistema de
**perfil ideológico do governo e alinhamento por UF**.
v0.4: fecha as decisões em aberto — 2D completo com modo leve, perfil inicial escolhido no Novo Jogo, termo
nacional do alinhamento, perfil ideológico logo depois da série regional.
Documentos relacionados: [GAME_DESIGN.md](GAME_DESIGN.md) §4.5 · [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.15 ·
[POLITICAL_RULES.md](POLITICAL_RULES.md) §2.1, §6.2 e §11 · [ROADMAP.md](ROADMAP.md) §4.1 e §8 ·
[AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2–§3

---

## 0. Princípios

1. O jogo é um **simulador político mensal**, não um simulador meteorológico. O mapa é interface de decisão e de
   explicação causal.
2. **Efeito visual pode sumir em aparelho fraco; dado, decisão, explicação e consequência nunca somem.** Tudo o
   que o globo mostra também existe na lista de UFs, no cartão e em números.
3. Arquitetura preservada: motor TypeScript puro, Zustand, SQLite, R3F/three. Sem trocar de engine, sem MapLibre.
4. **D7 continua valendo:** estados são distribuição do agregado nacional; nenhum sistema deste plano cria 27
   economias.
5. Hora do dia e nuvens são **só visuais**. Clima (chuva/seca) e alinhamento ideológico são **do motor**.
6. **No máximo 100 arquivos por PR. Nunca mais.** (Regra do autor; PR menor quando a revisão pedir.)

---

## 1. Decisões do autor (20/10/2026)

| # | Decisão |
| --- | --- |
| D-G1 | Mapa 2D (sem WebGL) é um **perfil Essencial completo**, com todas as camadas, e tem um **modo leve** em Configurações que o reduz ainda mais (§3.4). |
| D-G2 | Medições no **moto g20** do autor. |
| D-G3 | Limite de **100 arquivos por PR** mantido. |
| D-G4 | Prevenção hídrica, Defesa Civil, governabilidade e obras entram **depois do clima**. |
| D-G5 | **Mapa eleitoral entra**, junto com um **perfil ideológico do governo** e o **alinhamento de cada UF** (§5). |
| D-G6 | **Saves atuais ganham clima** (migração com clima neutro e PRNG próprio). |
| D-G7 | Sol: **hora fictícia fixa** por padrão, com **"Sempre dia"** e **"Hora real"** como opções. Só visual. |
| D-G8 | **Luzes das cidades à noite** entram (§4.3) — de forma barata, que roda até no modo Econômico. |
| D-G9 | **Perfil ideológico inicial escolhido no Novo Jogo** (§5.1). |
| D-G10 | A distância do governo ao **eleitor mediano** também mexe, pouco e saturado, na **aprovação nacional** (§5.1). |
| D-G11 | O **perfil ideológico** entra **logo depois da série regional** (PR 4 no §7). |

---

## 2. Fatos do código que o plano respeita

- `GlobeView`: `frameloop="demand"` (e `never` pausado) — manter.
- `GlobeScene`: globo base + tiles LOD + mapa de calor por UF — estender, não reescrever.
- three 0.186 **só tem renderizador WebGL2**: os shaders já recebem `#version 300 es` e o `texelFetch` dos tiles
  já roda no moto g20. Ainda assim: registrar falha de compilação e **perda de contexto**, com queda para o mapa 2D.
- `tileStore`/`config`: até 20 blocos de cor (JPEG 256²–1024² por bloco). Teto teórico de ~107 MiB de cor se
  todos fossem 1024² com mipmaps: **medir a distribuição real** antes de mexer.
- Gabinete é **subtela** e o globo pausa por baixo: a prévia **não pode depender do Canvas 3D**.
- `ufs.ts` tem centróides, **não capitais** — capitais precisam de coordenadas próprias.
- `build_globe.py` já calcula uma **máscara de água** — usar, nunca detectar água por cor.
- `PendingEvent` guarda só `eventId` e `monthIndex` — o local do evento precisa ser **gravado no disparo**.
- Ordem do mês (`DEFAULT_STEPS`): eventos → gabinete → propostas → Congresso → políticas → **economia** →
  sociedade → opinião → eleições → **regiões** → governadores → novos eventos.
- Eleição nacional sorteia o voto do governo (`vote1`/`vote2`); **não há voto por UF**.
- Snapshots completos: 13 meses (`SNAPSHOT_RETENTION_MONTHS`); série nacional em `indicator_history`.
- As 42 políticas já têm `position: { economic, social }` (−1 estado … 1 mercado; −1 progressista … 1
  conservador), usada pelos blocos no Congresso. Os blocos têm `ideology` nos mesmos eixos.
- `PublicProject` não tem localização — **não inventar coordenadas**.

---

## 3. Desempenho e compatibilidade

### 3.1 Perfis de qualidade (Configurações; tabela `settings`, fora do `GameState`)

| Perfil | Renderização | Ambiente | LOD/cache | Alvo |
| --- | --- | --- | --- | --- |
| **Essencial 2D** | SVG (`react-native-svg`), sem WebGL, todas as camadas | sombra do terminador e luzes como formas estáticas | 27 polígonos estáticos | aparelho fraco e fallback de falha gráfica |
| **Essencial 2D leve** | idem, só cores, seleção e lista | nada | 27 polígonos, sem rótulos/pins no mapa | economia máxima |
| **Econômico 3D** | globo e tiles com teto menor | Sol fixo no mês, luzes das cidades (pontos), sem nuvens | `TILE_CACHE_BLOCKS`, `MAX_LEVEL`, DPR reduzidos | 30 qps ao arrastar no moto g20 |
| **Equilibrado** (padrão) | globo e tiles atuais | Sol fixo, nuvens estáticas (mudam no fim do mês), luzes | cache atual | moto g20 se a medição permitir |
| **Alto** | idem + efeitos | nuvens animadas (≤ 30 qps), transições, textura de luzes noturnas se medida | LOD maior só se sustentado | aparelho moderno |

- **Escolha automática** só depois de aquecer (shaders compilados, tiles carregados): amostra de quadros em
  movimento e em repouso, com histerese para não ficar trocando. A escolha manual é guardada e desliga o ajuste.
- Parâmetros por perfil: `TILE_CACHE_BLOCKS`, `MAX_CONCURRENT_LOADS`, `LOD_TEXEL_THRESHOLD`, DPR, `MAX_LEVEL`
  (sem regerar assets). **Implementado no PR 5** em `src/globe/qualityProfiles.ts` (`GLOBE_BUDGETS`):

| Parâmetro | Econômico 3D | Equilibrado (= `config.ts`) | Alto |
| --- | --- | --- | --- |
| Blocos de cor em cache (`tileCacheBlocks`) | 12 | 20 | 28 |
| Downloads simultâneos (`maxConcurrentLoads`) | 2 | 4 | 4 |
| Limiar de LOD, px por texel (`lodTexelThreshold`; maior = menos detalhe) | 1,5 | 1,0 | 0,75 |
| Nível máximo desenhado (`maxLevel`; os assets vão até 5) | 4 | 5 | 5 |
| Teto da razão de pixels (`dprCap`) | 1,25 | 2 | 2 |
| Efeitos permitidos, **reservados** (`effects`: nuvens / nuvens animadas / textura de luzes) | não / não / não | sim / não / não | sim / sim / sim |

  Os booleanos de efeitos ainda não são lidos por ninguém (entram nos PRs 6 e 10). **DPR:** o R3F nativo fixa a razão
  de pixels do aparelho (expo-gl só desenha na resolução nativa); o teto vale na web e é preparado para um futuro
  desenho em resolução reduzida no Android, a ser medido no moto g20.
- **Troca de perfil em tempo de execução:** o globo lê o orçamento por `ref`, sem recriar a cena. O `TileStore`
  recebe os novos tetos (`setBudget`): se o cache encolheu, os blocos fora de uso saem na hora (dispose das texturas) e o
  resto sai assim que deixar de ser usado; o LOD usa o novo limiar/nível no quadro seguinte (o globo invalida um
  quadro). Nada é reiniciado nem recarregado à força.
- **Escolha em Configurações:** "Automático" (padrão) ou um perfil fixo, na tabela `settings` (`mapa_qualidade`; o último
  perfil do automático em `mapa_qualidade_auto`). Migração do valor antigo `mapa_renderizador`: `globe` → Automático
  (começa no Equilibrado, os mesmos tetos de antes), `flat` → Essencial 2D, `flat-light` → Essencial 2D leve.
- **Ajuste automático** (`src/globe/autoQuality.ts`, máquina de estados pura): só depois de 30 quadros seguidos sem tile
  carregando; janelas de ~60 amostras de intervalo entre quadros em movimento (gesto ou inércia) e de 20 em repouso
  (rajadas, como a chegada de tiles). Janela de movimento **lenta** = mediana > 33,4 ms ou p95 > 50 ms; **rápida** =
  mediana ≤ 18 ms e p95 ≤ 25 ms; o resto é neutra e zera as contagens. Descer exige 3 janelas lentas seguidas (ou 3
  janelas de repouso com p95 > 100 ms); subir, 8 rápidas seguidas e nenhum repouso lento no meio. Um nível por vez, 20
  quadros descartados após cada troca, nunca vai ao 2D (só a falha de GL faz isso) e, se uma subida é seguida de descida,
  o perfil de onde se desceu fica vetado até fechar o app. A escolha manual desliga o ajuste; o resultado é gravado e o
  próximo início parte dele.
- Opções separadas: **Hora do dia** (fixa / sempre dia / real), **Nuvens** (sim/não), **Reduzir movimento**.

### 3.2 Regras de renderização

| Regra | Como |
| --- | --- |
| Parado = sem quadros | Nada anima sozinho fora do Alto. Sol fixo no mês **não** pede quadro periódico; com "hora real" o Sol só é atualizado quando já há um quadro (gesto, troca de camada, volta ao Painel). |
| Sem passada nova de tela cheia | Sol e seca entram nos shaders que já existem (tiles e globo base). Nuvens: uma malha só sobre a caixa do Brasil, **opcional** e desligada no Econômico. |
| Textura em vez de conta | Ruído das nuvens pré-gerado no `build_globe.py` (R8 256² = 64 KiB). Campos de clima: textura 128² RGBA (64 KiB), refeita **uma vez por mês**. Comparar 128² × 256² em zoom próximo. |
| IDs categóricos nunca borrados | Índice de UF em R8 (`build_globe.py`), sem filtro linear. Só os **campos contínuos** (chuva, seca, nuvem) são suavizados. |
| Precisão | `highp` em coordenadas (lon/lat, UV de clima); `mediump` só para cor. |
| Nada de `setState` por quadro | uniforms e materiais mutados fora do React; `dispose()` de tudo; pausa por navegação, `AppState` e Gabinete. |

### 3.3 Medição (moto g20)

- **Build de desenvolvimento/preview via EAS instalada no moto g20** (o Expo Go serve só de indicação).
- Contador de dev ampliado: qps e ms por quadro (p50/p95/p99), `renderer.info` (chamadas, triângulos, programas,
  texturas — contagem, não VRAM), memória do processo, quedas > 100 ms.
- Cenários: arrastar 60 s, repouso 60 s, alternar camadas/subtelas, sessão de 15–30 min (aquecimento e bateria).
- **Metas iniciais (a confirmar no PR 0):** Econômico 3D ≥ 30 qps ao arrastar, p95 < 50 ms; parado sem laço de
  quadros; memória de GPU nova ≤ 2 MB fora do Alto.

### 3.4 Mapa 2D

`MapSurface` escolhe `FlatBrazilMap` (SVG, 27 paths simplificados gerados pelo `build_globe.py`) ou `GlobeView`,
os dois alimentados pelo **mesmo modelo** (`RegionalMapViewModel`: cores, seleção, legenda, rótulos, marcadores).
O mapa 2D serve de **mini-mapa da prévia no Gabinete**, de **perfil Essencial** e de **fallback** quando o WebGL
falha.

**Essencial 2D (completo):** toda camada nova nasce com as duas representações, 3D e 2D, a partir do mesmo
`RegionalMapViewModel` — o critério de aceite de cada PR inclui o 2D.

| Camada | No 2D |
| --- | --- |
| Mapa de calor, prévia, alinhamento, eleitoral, chuva, seca | cor de preenchimento por UF (27 shapes montados uma vez; só o estilo muda) |
| Seca e chuva forte | cor + hachura por UF (padrão SVG reutilizado), nunca um nó por pixel |
| Siglas e capitais | texto nativo do React Native por cima do SVG, com prioridade/colisão por zoom |
| Marcadores de eventos e notícias | ícones nativos sobre o SVG, agrupados |
| Dia e noite | um único path de sombra do terminador com gradiente, recalculado só quando a hora muda |
| Luzes das cidades | círculos pequenos no lado noturno (mesma lista de ~150 municípios) |
| Nuvens | ícone estático por UF com chuva acima do normal (sem animação) |

**Essencial 2D leve (Configurações):** só os 27 polígonos com a cor da camada, a seleção e a lista; sem
rótulos, pins, terminador, luzes ou ícones no mapa (tudo continua na lista e no cartão). Zoom/pan só se a medição
no moto g20 mostrar folga.

---

## 4. Céu visual

### 4.1 Dia e noite

- `visualClock`: **hora fictícia fixa** (padrão: tarde), **sempre dia**, ou **hora real do aparelho**. Estação
  pelo **mês do jogo** (declinação solar do `monthIndex`). Não afeta o motor.
- `uSunDir` no globo base e nos tiles com a mesma convenção (sem emenda); piso noturno ~0,35 para o mapa seguir
  legível; mapa de calor, rótulos e marcadores não são iluminados.
- **Convenção (PR 6):** o Sol é um vetor unitário no referencial do globo (`lonLatToVec3`: lon 0 em +x, polo norte em
  +y, lon −90° em +z) apontando para o ponto subsolar: latitude = declinação do dia 15 do mês do calendário do jogo
  (−23° em dezembro, +23° em junho), longitude = −15° × (hora UTC − 12). Horas fixas em Brasília (UTC−3): manhã 9h,
  tarde 15h (padrão), entardecer 18h, noite 22h. Equação do tempo ignorada. Dia = `dot(normal, Sol) > 0`.
- Transição de 1,5 s do Sol ao encerrar o mês — só se "Reduzir movimento" estiver desligado.

### 4.2 Nuvens (opcionais) e seca

- Textura de clima 128² sobre a caixa do Brasil, montada pelo índice de UF + suavização dos campos contínuos:
  R = cobertura de nuvem (normal do mês × anomalia), G = índice de seca, B = chuva forte.
- **Nuvens:** calota 32×32 sobre a caixa do Brasil, fade nas bordas, 2 leituras do ruído + 1 do clima. Chuva
  forte = nuvem mais densa e mais cinza. Somem com zoom próximo; 30% de opacidade com mapa de calor ligado.
  Desligadas no Econômico; no 2D viram ícone estático por UF (§3.4) e somem no 2D leve. Se a GPU não sustentar, só elas saem — os dados ficam.
- **Seca:** no shader dos tiles, cor puxada para palha/ocre pelo índice de seca (memória hídrica, não a chuva do
  mês), **só onde a máscara diz terra**.
- Camadas novas no seletor: **Chuva** (marrom ↔ azul, comparada ao normal) e **Seca** (sequencial), com lista e
  números.

### 4.3 Luzes das cidades à noite (sim, dá para fazer barato)

- **Base (todos os perfis 3D):** ~150 maiores municípios (coordenadas da sede e população, IBGE, dados públicos;
  registrar em DATA_SOURCES.md), gerados pelo `build_globe.py` num arquivo pequeno. Desenhados como **um único
  `Points`** com brilho aditivo, tamanho por log da população, **aceso só no lado noturno** (`dot(normal, sol)`)
  e apagando com fade no terminador. Uma chamada de desenho, ~150 vértices: custo desprezível até no Econômico.
- **Alto (opcional, após medir):** textura de luzes noturnas (NASA Black Marble, domínio público) recortada para a
  caixa do Brasil, misturada no shader dos tiles no lado noturno.
- Com "Sempre dia" as luzes não aparecem; com hora fixa o jogador pode escolher "noite" para vê-las.

---

## 5. Perfil ideológico do governo e alinhamento por UF (novo)

**Ideia:** cada decisão tem posição nos eixos **econômico** (estado ↔ mercado) e **social** (progressista ↔
conservador). O governo acumula um **perfil** com o que faz; cada UF tem uma **inclinação** nesses eixos. Quanto
mais distante o perfil do governo da inclinação da UF, menor a aprovação ali **em relação à média** (ex.: uma
agenda liberal tende a render mais em SC e menos no Nordeste — e o inverso para uma agenda estatista).

### 5.1 Motor

- `GameState.government.profile: { economic, social }` (novo). **Perfil inicial escolhido no Novo Jogo**
  (D-G9): opções nomeadas por posição nos eixos (ex.: "Centro", "Centro-esquerda", "Esquerda", "Centro-direita",
  "Liberal", "Conservador"), sem nomes de partidos reais; a escolha vai para a semente da campanha, não muda as
  regras. Saves antigos migram com perfil neutro (0/0).
- **Como o perfil se move:** média móvel com memória (`profile' = (1 − λ)·profile + λ·posição`), por decisão:
  política **sancionada/executada** pesa cheio; **proposta enviada** pesa pouco (sinal de intenção); **veto**
  pesa ao contrário. Peso pela relevância da política (campo opcional `salience`, padrão 1). Escolhas de evento
  podem ganhar `position` opcional (ex.: "privatizar" = econômico +0,6). Sem número mágico: `λ`, pesos e
  limites em `politics/calibration`.
- **Inclinação das UFs:** `lean: { economic, social }` por UF numa **nova versão do cenário**, `PROVISORIO`,
  derivada de dados agregados públicos (resultados eleitorais por UF do TSE e pesquisas de opinião), **sem nomes
  de partidos ou pessoas reais** no jogo.
- **Efeito na aprovação:** desvio regional = `k · tanh((alinhamento_UF − alinhamento_médio)/s)`, com
  alinhamento = 1 − distância normalizada. Vai por `regiao.aprovacao` (a média segue a nacional, D7).
- **Termo nacional (D-G10):** `aprovacao` recebe um efeito pequeno e saturado pela distância do perfil ao
  **eleitor mediano** (média das inclinações das UFs ponderada pela população), com teto em calibração e causa
  "Distância do eleitor médio" no "Por que mudou?". Os dois termos não se somam em dobro: o regional só
  redistribui, o nacional só mexe no total. **Neutralidade (GAME_DESIGN.md §1):** nenhuma posição é premiada em si; os dois lados têm onde ganhar e onde
  perder.
- Causa registrada: "Alinhamento com o perfil do governo" entra no "Por que esta UF está diferente da média?".
- Os blocos do Congresso já usam a mesma posição; nada muda lá.

### 5.2 Interface

- Folha **"Perfil do governo"**: plano de dois eixos com o ponto do governo, o rastro dos últimos meses e as UFs
  como pontos pequenos (inclinação); as decisões que mais moveram o perfil.
- Camada **"Alinhamento"** no globo e no mapa 2D (divergente: azul = alinhado, vermelho = distante) com lista.
- **Na prévia de decisão (PR 1, estendida no PR 4):** mostrar para onde a política empurra o perfil e quais UFs tendem a
  ganhar ou perder pelo alinhamento — como **estimativa**, nunca garantia.

### 5.3 Mapa eleitoral

Quatro camadas separadas e rotuladas:
1. **Relação com o governador** (já existe).
2. **Inclinação política da UF** (dado do cenário).
3. **Intenção de voto estimada por UF** — da aprovação por UF (que já inclui o alinhamento), com o selo
   "estimativa".
4. **Resultado simulado por UF** — no mês da eleição, a partir do voto nacional sorteado: cada UF parte do seu
   logit de aprovação e recebe **um mesmo deslocamento** encontrado por bissecção para que a soma ponderada pelo
   eleitorado **feche exatamente** com o resultado nacional. Determinístico, sem sorteio novo, gravado no banco
   como fotografia da eleição. Nunca mostrado como "resultado" antes de existir.

Troca de governador aparece no mês da posse, separada do resultado presidencial.

---

## 6. Clima no motor

### 6.1 Contrato

- `GameState.climate`: `enso` (−1…1), por UF `rain` (anomalia, fração) e `dryness` (0…1), e `rng` próprio
  (semeado da semente da campanha com sal estável). `STATE_SCHEMA_VERSION` sobe (depois da subida do PR 4); **todos os saves ganham
  clima** neutro (D-G6). Como o clima tem PRNG próprio, os sorteios dos sistemas atuais não mudam de ordem.
- **Normais de chuva por UF × mês** em mm (INMET Normais 1991–2020, agregadas por UF no pipeline Python;
  `PROVISORIO`). A anomalia é relativa a elas, e o déficit em mm distingue o semiárido de uma região úmida.
- **Teleconexão ENSO por macrorregião × estação** (5 × 4), com o sinal documentado (CPTEC/NOAA). Não por UF × mês:
  seriam 324 coeficientes sem fonte.

### 6.2 Passos

- `climateEvolutionStep` (**antes de `economyStep`**): ENSO (AR(1) saturado), anomalia por UF (persistência +
  ENSO + choque regional compartilhado + ruído da UF), seca com memória e recuperação, risco de cheia (chuva forte
  × umidade anterior × vulnerabilidade simplificada). Calcula o dano **agregado** (agro, energia, alimentos) que
  entra no nacional.
- `climateRegionalEffects` (**junto de `regionsStep`**): distribui uma vez o efeito entre as UFs (seca ×
  participação da agropecuária; chuva demais → `regiao.aprovacao` saturada, causa "Chuvas acima do normal";
  seca prolongada pesa no humor devagar). Parte nacional da aprovação = soma ponderada pela população, sem
  duplicar.
- Dificuldade muda a **magnitude**, nunca o lugar.

### 6.3 Eventos geográficos

- `PendingEvent` (e `ScheduledEvent`, `eventsFired`, `NewsItem`, relatório) ganha `instanceId` e
  `location: { affectedUfs, primaryUf?, severityByUf? }`, **gravados no disparo**. Responder dois meses depois
  atinge as mesmas UFs.
- Gatilho climático especializado que devolve as UFs atingidas (não basta `droughtMax`).
- **Sem contagem dupla:** o clima dá a probabilidade e o dano de base; o evento traz a crise e as escolhas, sem
  repetir o choque. Nova versão dos arquivos de evento (sem editar os publicados).

---

## 7. Roteiro por PRs (cada um ≤ 100 arquivos, `npm run check`, benchmark antes/depois quando mexe na GPU)

| PR | Título | Critério de aprovação |
| --- | --- | --- |
| 0 | Medição e baseline no moto g20 | Build EAS no aparelho; contador ampliado; números de referência registrados; log de falha de shader e perda de contexto. Pode correr em paralelo com o PR 1. |
| 1 | Prévia regional + mapa 2D Essencial | `buildRegionalDecisionPreview` puro (sem RNG, sem mudar estado), separando fração de recursos, efeito conhecido com defasagem e incertezas (votação, adesão); `RegionalMapViewModel` + `FlatBrazilMap`; mini-mapa no Gabinete; modo 2D leve em Configurações; falha de GL cai no 2D sem perder a partida. |
| 2 | Siglas, capitais e colisões | Atlas e coordenadas das capitais gerados no build; uma chamada de desenho no 3D e texto nativo no 2D; DF/SE/AL como pin no zoom geral; testado em 320/360/400 dp. |
| 3 | Série regional e variação | Tabela `regional_indicator_history` (mês 0 + cada mês, na mesma transação do `recordMonth`); variação desde o mês passado/posse, 12 meses no cartão, ranking; save antigo mostra "Sem dados anteriores". |
| 4 | Perfil ideológico e alinhamento por UF | Perfil inicial no Novo Jogo; perfil com memória a partir das decisões; inclinação das UFs na nova versão do cenário; efeito regional (redistribui) + nacional (eleitor mediano) com causas; folha "Perfil do governo"; camada Alinhamento (3D e 2D); prévia mostra o empurrão no perfil; migração do estado com perfil neutro. |
| 5 | Perfis de qualidade e orçamento | Tetos de cache/LOD/DPR por perfil; escolha automática após aquecimento, com histerese; escolha manual persiste. |
| 6 | Dia e noite + luzes das cidades | Hora fixa/sempre dia/real; mesmo terminador no globo e nos tiles; luzes por pontos no lado noturno; terminador e luzes no 2D; nenhum quadro periódico. |
| 7 | Contrato climático | Migração de todos os saves com clima neutro, PRNG próprio, normais por UF, calibração; determinismo. |
| 8 | Motor climático nacional + regional | Efeito nacional antes da economia, regional depois; invariantes D7; sem contagem dupla; causas no relatório. |
| 9 | Eventos geográficos | Local congelado no disparo; gatilho climático que devolve UFs; nova versão dos eventos de seca e enchente. |
| 10 | Seca e chuva no globo + nuvens opcionais | Máscara de água e índice de UF do build; camadas Chuva e Seca (3D e 2D com hachura); nuvens fora do Econômico; GPU dentro do orçamento. |
| 11 | Marcadores de eventos e notícias | Pins no atlas compartilhado (3D) e ícones nativos (2D), agrupados; tocar abre o alerta/jornal da mesma instância; pulso breve só para novos críticos. |
| 12 | Mapa eleitoral | Intenção estimada por UF; resultado simulado por UF que fecha com o nacional; fotografia gravada; selos "estimativa" × "resultado". |
| 13 | Prevenção, Defesa Civil, governabilidade e obras | Novas escolhas com custo, orçamento e Congresso (reduzem dano esperado, não desligam a chuva); pins de visitas; obras sem coordenadas inventadas. |
| 14 | Leitura, acessibilidade e consolidação | Macrorregião, busca, comparação, 5 melhores/piores; campanhas de 48/96/240 meses estáveis; metas de release no moto g20. |

Status: PR 0 e PR 1 implementados em 20/10/2026 (aguardando revisão e medição no moto g20).
PR 5 (perfis de qualidade e orçamento) implementado em 20/10/2026: `qualityProfiles.ts` (orçamentos por perfil), `autoQuality.ts` (escolha automática com histerese), Configurações → "Qualidade do mapa", migração de `mapa_renderizador`. Pendente de medição no moto g20: limiares do ajuste automático, valores do Econômico/Alto e o efeito do DPR no Android (§3.1). Obs.: o contador de quadros do PR 0 (`frameStats`) vive em outro PR; o PR 5 traz o seu amostrador próprio e mínimo (`autoQuality.ts`), a unificar depois.
PR 3 (série regional: migração 5 `regional_indicator_history`, cartão do estado com variação, 12 meses e ranking) implementado em 20/10/2026.

PR 4 (motor) implementado em 20/10/2026: perfil do governo (`government.profile`, estado v10), escolha no Novo Jogo, movimento por decisão, inclinação das UFs no cenário v0.8.0 (`PROVISORIO`), efeito regional (`alinhamento_perfil`) e nacional (`eleitor_mediano`), `alignmentView` e `previewProfilePush`. Interface implementada em 20/10/2026: folha "Perfil do governo" (botão do trilho direito da mesa; plano de dois eixos, rastro de até 12 meses lido dos snapshots, UFs, eleitor mediano, termo nacional e decisões que mais moveram o perfil), camada "Alinhamento" (globo 3D, mapa 2D e lista, escondida em cenário sem inclinação) e o empurrão no perfil na prévia da decisão (`RegionalPreviewCard`, sempre como estimativa). Regras em [POLITICAL_RULES.md](POLITICAL_RULES.md) §11.2.

PR 6 (dia e noite + luzes das cidades) implementado em 21/10/2026: `visualClock.ts` (puro; Sol pelo mês do jogo e pela hora, em hora fixa de Brasília — padrão **tarde, 15h** —, "Sempre dia" ou "Hora real" com o relógio UTC do aparelho), `uSunDir`/`uSunOn` compartilhados pelo globo base e por todos os tiles (mesma função `sunLight`, piso noturno 0,35, faixa do terminador `dot` −0,10…0,22; mapa de calor, contorno, rótulos e atmosfera não são iluminados), luzes das 150 maiores cidades (`cities.json`, um `Points`, brilho aditivo, só no lado noturno, em todos os perfis 3D), terminador e luzes no 2D completo (`flatSun.ts`: 5 faixas translúcidas empilhadas + círculos com degradê; só 25% da sombra sobre um mapa de calor; o 2D leve não mostra nada) e Configurações → "Hora do dia" (`mapa_hora`). Nenhum quadro periódico: hora fixa e "Sempre dia" só gravam o Sol ao mudar a escolha ou o mês; "Hora real" relê o relógio dentro do `useFrame` (e a tela 2D, ao renderizar). **Fora deste PR:** a transição de 1,5 s do Sol ao encerrar o mês (§4.1) — não existe a opção "Reduzir movimento" no app, então o Sol muda de estação de uma vez; entra junto com essa opção. A textura de luzes noturnas do perfil Alto (`cityLightsTexture`) segue reservada. Pendente de medição no moto g20: custo das luzes e do `varying` extra nos tiles.

PR 7 (contrato climático) implementado em 21/10/2026, **só contrato, sem mudar nenhum resultado de simulação**: `GameState.climate = { enso, ufs[27] { id, rain, dryness }, rng }` (estado v11), neutro (ENSO 0, chuva 0, seca 0) em campanha nova e em todo save atualizado (`v10ToV11`); PRNG próprio semeado por `deriveSeed(semente da campanha, sal "CLIM")`, sem consumir o PRNG principal; normais de chuva por UF × mês e teleconexão ENSO (5 macrorregiões × 4 estações) numa **climatologia compartilhada** (`src/data/climate/climatologia.json`, gerada por `scripts/data/build_climatology.py`, `PROVISORIO`; esquema `src/types/climate.ts`), `CLIMATE_PARAMS` (`src/engine/climate/calibration.ts`) e leitores puros (`rainfallNormal`, `ensoTeleconnection`, `seasonOf`, `climateOf`). Nenhuma etapa lia ou alterava o clima até o PR 8 (as impressões digitais de partidas e de saves reais do PR 7 foram substituídas pelos testes do PR 8). Regras e fontes em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.18, [DATA_SOURCES.md](DATA_SOURCES.md) §4.3 e [CALIBRATION.md](CALIBRATION.md).

PR 8 (motor climático nacional + regional) implementado em 21/10/2026: `climateEvolutionStep` (antes de `economyStep`) evolui ENSO (AR(1) saturado), anomalia de chuva por UF (persistência + teleconexão ENSO da macrorregião na estação + choque regional compartilhado + ruído da UF, saturada em `chuva_anomalia_max`) e seca com memória e recuperação dirigida pelo déficit em mm contra a normal do mês e pela vulnerabilidade hídrica da UF (o semiárido seca mais depressa); só o `climate.rng` é consumido (33 normais por mês, ordem fixa: ENSO, 5 regiões, 27 UFs). O dano **agregado** (PIB, alimentos, energia, chuva excessiva) entra uma vez, antes da economia, pela fila de impulsos já existente (`choque.hiato` com a persistência do hiato, `choque.inflacao`), com as causas "Seca" e "Chuvas acima do normal" no "Por que mudou?"; o efeito **regional** (`climateRegionalEffects`, dentro de `regionsStep`) só redistribui — seca × participação da agropecuária na atividade da UF; chuva acima do normal e seca prolongada no humor, centrados pela média ponderada pela população (D7) — e a parte nacional do humor entra uma vez em `opinionStep`. Risco de cheia (`floodRisk`) é função pura para os PRs 9 e 10. Dificuldade escala só a magnitude. Regras em [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.19; parâmetros (todos lidos; PROVISORIO) em [CALIBRATION.md](CALIBRATION.md). Testes: determinismo, PRNG principal intacto, limites, semiárido × úmido, D7 e somas das explicações em 60 meses, PIB agregado e desvios regionais sem contagem dupla (§8, testes 1, 4 e 5); as impressões digitais do PR 7 foram substituídas por esses testes.

Versões do estado: o PR 4 sobe `STATE_SCHEMA_VERSION` para 10 (perfil do governo) e o PR 7 para 11 (clima); cada
um com a sua função de atualização (`v9ToV10`, `v10ToV11`) e teste com save da versão anterior.

---

## 8. Testes obrigatórios

1. Mesma semente e decisões → mesmo resultado; perfil gráfico não altera a simulação.
2. Save da versão anterior abre com perfil neutro (PR 4) e clima neutro (PR 7); sorteios dos sistemas antigos na
   mesma ordem.
3. Prévia não altera estado nem PRNG; votação nunca aparece como certa.
4. Seca reduz o PIB agregado e muda os desvios das UFs sem contar duas vezes com o evento.
5. Invariantes D7: aprovação ponderada = nacional; participações somam 1; saturações respeitadas.
6. Evento disparado em março no RS e respondido em maio atinge o RS.
7. Perfil: política de mercado sancionada move o perfil para "mercado"; UF de inclinação próxima ganha aprovação
   relativa, distante perde; a média nacional não muda pelo termo regional.
8. Resultado eleitoral por UF: soma ponderada pelo eleitorado = resultado nacional (tolerância numérica).
9. Histórico regional depois do mês 13 conserva a posse; save sem histórico mostra lacuna honesta.
10. Falha de GL / perda de contexto → mapa 2D, sem perder a campanha.
11. Globo parado, Painel desfocado ou app em segundo plano → sem laço de quadros.
12. Sessão de 15–30 min no moto g20: p50/p95/p99, memória, aquecimento.

---

## 9. Fora do escopo

Nuvens volumétricas, sombra de nuvem, partículas de chuva, clima diário ou municipal, cidades/estradas 3D,
MapLibre, finanças estaduais, 27 economias, hora do dia no motor, nomes reais de partidos ou políticos.

---

## 10. Ainda em aberto para o autor

Nenhuma decisão de escopo pendente. Ficam para a revisão de calibração de cada PR: força do humor pela chuva,
tetos do alinhamento (regional e nacional), opções e posições do perfil inicial no Novo Jogo e as metas finais de
desempenho depois do PR 0.
