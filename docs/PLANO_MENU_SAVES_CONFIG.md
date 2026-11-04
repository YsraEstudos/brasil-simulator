# Plano — Menu, saves e configurações (qualidade de vida)

Versão 0.2 do documento • 03/11/2026 • 🟡 Fase M1 implementada em 03/11/2026 (não commitada; falta ver no aparelho)
Documentos relacionados: [GAME_DESIGN.md](GAME_DESIGN.md) §4.6 e §13 · [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2–§4 · [ROADMAP.md](ROADMAP.md) §10

---

## 1. Objetivo e regras do plano

Fechar as pontas soltas do menu principal, dar ao jogador controle sobre as partidas salvas e ampliar as
Configurações. **Nada aqui mexe no motor** (`src/engine/`): todas as fases são interface, store e banco. A única
leitura do motor é `ENGINE_VERSION` (tela Sobre) e o `GameState`/`MonthReport` já gravados (mini-resumo, conquistas).

Regras que valem para todas as fases:

- **Um PR por fase** (ou por etapa, quando a fase for grande), branch nova a partir de `origin/main`, squash, **no
  máximo 100 arquivos por PR**.
- **Saves antigos (AI_INSTRUCTIONS.md §2.1):** o jogo não foi lançado. Colunas novas entram por migração numerada
  (8, 9…), sem preencher nem converter dados antigos além de um `DEFAULT` simples.
- **Preferências** ficam na tabela `settings` (fora do save), como as de hoje (`mapa_qualidade`, `mapa_nuvens`…).
- **Dependências novas** só com justificativa e versão fixada (AI_INSTRUCTIONS.md §8). Todas as desta lista são
  módulos oficiais do Expo SDK 58 (`npx expo install`), sem rede.
- `npm run check` verde ao fim de cada fase; relatório no formato do AI_INSTRUCTIONS.md §7.

### 1.1 Onde está cada coisa hoje (levantamento de 03/11/2026)

| Ponto | Situação |
| --- | --- |
| Menu principal | `src/components/menu/MainMenuScreen.tsx`: SAIR, CONQUISTAS e MULTIJOGADOR caem em `SOON` ("em breve") |
| Aviso de ficção | Exigido em GAME_DESIGN.md §13 e ROADMAP.md §10; **não existe** no app |
| Lista de saves | `src/components/campaign/SavedCampaignsScreen.tsx`; semente só `selectable`; sem ordenação nem filtro |
| Tabela `campaigns` | `name`, `status`, `current_month`, `current_turn`, `stage`, `created_at`, `updated_at` (migrações 1–7) |
| Repositório | `src/database/campaignRepository.ts`: há `createCampaign`, `listCampaigns`, `finishCampaign`, `deleteCampaign`; não há renomear, duplicar, exportar |
| Preferências | `src/store/gameStore.ts` lê cada chave à mão (`TEXT_SCALE_KEY`, `MAP_QUALITY_KEY`, `REDUCE_MOTION_KEY`…) |
| Tema | `src/theme/ThemeProvider.tsx` segue `useColorScheme()` do sistema; o HUD do Painel é sempre escuro |
| Globo | `src/globe/GlobeView.tsx` já usa `frameloop="demand"`; gestos em `src/globe/controller.ts` |
| Áudio, vibração, área de transferência, arquivos | Nenhum módulo instalado (há `expo-file-system`) |
| Dicas / tutorial | **Não existe** sistema de dicas; o tutorial é da Fase 10 (ROADMAP_2.0.md) |

---

## 2. Visão geral das fases

| Fase | Nome | Itens | Migração | Dependência nova | Tamanho |
| --- | --- | --- | --- | --- | --- |
| **M1** | Menu inicial e identidade | SAIR, aviso de ficção, CONTINUAR com nome e mês, tela Sobre | — | — | P |
| **M2** | Cartão do save | mini-resumo, "última vez que jogou", tempo de jogo, copiar semente | 8 | `expo-clipboard` | M |
| **M3** | Gerenciar a lista | renomear, cadeado, alfinete, ordenar/filtrar, apagar encerradas | 9 | — | M |
| **M4** | Novo Jogo e recomeço | 🎲 nome automático, colar semente, recomeçar com as mesmas opções | — | (usa `expo-clipboard`) | P |
| **M5** | Cópia e arquivos | duplicar ("Salvar como"), exportar e importar save | — | `expo-document-picker`, `expo-sharing` | G |
| **M6** | Aparência e acessibilidade | registro de preferências, tema claro/escuro, daltônicos, canhoto, R$ bi × % do PIB | — | — | M |
| **M7** | Globo, movimento e início | 30/60 FPS, rotação e zoom do globo, pular animações, abrir direto na campanha | — | — | M |
| **M8** | Som e vibração | vibração (fim do mês, evento urgente), sons e música com volume | — | `expo-haptics`, `expo-audio` | G |
| **M9** | Fechamento das Configurações | restaurar padrões (cobre M6–M8) | — | — | P |
| **M10** | Conquistas | desenho, avaliação, gravação e tela | 10 | — | G |
| **M11** | Rever instruções | botão nas Configurações | — | — | P (bloqueada) |

Ordem recomendada: M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11. M1, M4 e M6 não dependem de nada e
podem ser adiantadas; M3 depende da M2 (mesma tela e migração anterior); M9 vem depois de toda preferência nova; M10
precisa das decisões da §5; M11 espera o tutorial da Fase 10.

---

## 3. Fases

### Fase M1 — Menu inicial e identidade

1. **SAIR funcionando.** Android: `BackHandler.exitApp()` depois de uma confirmação ("Sair do jogo? A partida aberta
   já está salva."). iOS não permite fechar o app por código (diretriz da App Store) e na web não faz sentido: o
   botão **some** nessas plataformas e o painel recalcula a altura (`BUTTONS` passa a ser derivado da lista
   filtrada). Se houver rascunho de agenda em montagem, a confirmação avisa que ele será perdido.
2. **Aviso de ficção na abertura.** Texto do GAME_DESIGN.md §13 ("Simulação fictícia e independente, sem afiliação a
   qualquer órgão do governo brasileiro.") em duas camadas: (a) linha fixa no rodapé do menu, ao lado da versão; (b)
   folha de abertura na primeira execução, com botão "Entendi", gravada na chave `aviso_ficcao_visto`.
3. **CONTINUAR com nome e mês.** O rótulo vira `CONTINUAR — <nome> • Mês <n>` (antes da posse: `• <estágio>`), com
   a mesma regra de escolha de `continueLast` extraída para uma função pura (`pickContinueTarget`) e testada. Nome
   longo é cortado com reticências (`numberOfLines={1}`); sem partida, fica só `CONTINUAR`.
4. **Tela Sobre** (rota `/sobre`): versão do app (`expoConfig.version`), do motor (`ENGINE_VERSION`), do cenário
   (`Scenario.version` de cada cenário embutido), versão do esquema do estado e do banco (`STATE_SCHEMA_VERSION`,
   `LATEST_DB_VERSION`), o aviso de ficção e o link para as fontes de dados (DATA_SOURCES.md, resumido). Entrada:
   item "Sobre" nas Configurações e toque na versão do rodapé do menu.

**Arquivos:** `MainMenuScreen.tsx`, `SettingsScreen.tsx`, `src/app/sobre.tsx` (novo),
`src/components/menu/AboutScreen.tsx` (novo), `src/components/menu/FictionNotice.tsx` (novo), `src/store/gameStore.ts`.
**Aceite:** SAIR fecha o app no Android e não aparece no iOS/web; o aviso aparece só na 1ª execução e sempre no
rodapé; CONTINUAR mostra a partida que de fato abre; Sobre mostra as 5 versões.

### Fase M2 — Cartão do save

Migração **8 `resumo_do_save`** em `campaigns`:
`play_time_ms INTEGER NOT NULL DEFAULT 0`, `last_played_at TEXT`, `summary_json TEXT` (aprovação, PIB, data do mês
— gravado pelo `recordMonth` na mesma transação, para a lista não abrir snapshot nenhum).

1. **Mini-resumo** (aprovação, mês, PIB): lido de `summary_json`; partida sem resumo (criada antes da migração ou
   antes do 1º mês) mostra só o mês. Formatação pelos utilitários de `src/components/ui/format.ts`.
2. **Última vez que jogou** ("Há 2 horas", "Ontem às 21h", "12/10 às 14h"): `last_played_at` gravado ao carregar e
   ao encerrar o mês (`updated_at` muda também em renomear, então não serve). Função pura `relativePlayedLabel(iso,
   now)` com testes de virada de dia, ontem e mais de uma semana. Fica na interface: o motor nunca vê `Date`.
3. **Tempo total de jogo** ("1h 45m jogados"): a store soma o tempo com a partida aberta **e o app em primeiro plano**
   (`AppState`), descarta pausas acima de 5 min sem toque (constante nomeada) e grava em `play_time_ms` ao sair da
   partida, ao ir para segundo plano e a cada encerramento de mês.
4. **Copiar semente com 1 toque**: botão ao lado da semente, `expo-clipboard`, confirmação "Semente copiada".

**Arquivos:** `migrations.ts`, `campaignRepository.ts` (+ `touchCampaign`, `addPlayTime`), `gameStore.ts`,
`SavedCampaignsScreen.tsx`, `format.ts` (+ testes), `database.test.ts`, `package.json`.
**Aceite:** a lista abre sem ler snapshots; o tempo não conta com o app em segundo plano; testes do rótulo relativo.

### Fase M3 — Gerenciar a lista

Migração **9 `organizacao_dos_saves`**: `pinned INTEGER NOT NULL DEFAULT 0`, `locked INTEGER NOT NULL DEFAULT 0`.

1. **Renomear**: ação no cartão abre folha com o mesmo campo e validação do Novo Jogo (`CAMPAIGN_NAME_MAX`,
   reaproveitar o validador de `campaignSetup.ts`). `renameCampaign` no repositório; atualiza a partida aberta.
2. **Cadeado**: `locked = 1` esconde o botão Apagar e faz `deleteCampaign` recusar com erro próprio
   (`CampaignLockedError`) — a trava vale no banco, não só na tela.
3. **Alfinete**: fixadas sempre no topo, em qualquer ordenação; ícone no cabeçalho do cartão.
4. **Ordenar e filtrar**: ordem (última jogada, criação, nome) × filtro (todas, ativas, encerradas). Função pura
   `sortAndFilterCampaigns(list, sort, filter)` testada; escolha lembrada em `lista_saves_ordem`.
5. **Apagar todas as encerradas**: botão no fim do filtro "Encerradas", confirmação com a contagem ("Apagar 4
   campanhas encerradas? 1 com cadeado será mantida."), uma transação.

**Arquivos:** `migrations.ts`, `campaignRepository.ts`, `gameStore.ts`, `SavedCampaignsScreen.tsx`,
`src/components/campaign/savedList.ts` (novo, puro) + teste, `database.test.ts`.
**Aceite:** save com cadeado não é apagado nem pelo "apagar encerradas"; fixadas ficam no topo; testes da ordenação.

### Fase M4 — Novo Jogo e recomeço

1. **🎲 nome automático** ao lado do campo de nome: sorteia de listas curtas e neutras ("Governo 2027", "Mandato
   da Reconstrução", "Gestão Horizonte"…) em `src/data/` ou num módulo de textos da interface. Usa `Math.random()`
   **fora do motor** (permitido) e evita repetir nome já salvo.
2. **Colar semente**: botão "Colar" no campo de semente; aceita só inteiro válido (mesmo validador do campo) e
   mostra erro se a área de transferência tiver outra coisa.
3. **Recomeçar com as mesmas opções** no fim da campanha (LegacyReport: impeachment, derrota, fim do mandato) e no
   cartão de save encerrado: cria uma campanha nova com dificuldade, cenário, perfil/ponto de partida e semente da
   original (lidos da linha `campaigns` + estado inicial), nome "<nome> (2)". Passa pelo fluxo da store, nunca
   chama o motor direto.

**Arquivos:** `NewCampaignScreen.tsx`, `campaignSetup.ts` (+ testes), `LegacyReport.tsx`, `SavedCampaignsScreen.tsx`,
`gameStore.ts` (+ `restartCampaign`), `src/data/campaignNames.json` (novo).
**Aceite:** recomeçar com a mesma semente e as mesmas decisões reproduz o mesmo estado (teste de determinismo pela
store).

### Fase M5 — Cópia e arquivos

Base comum: um **pacote de campanha** (`CampaignBundle`) = linha de `campaigns` + todas as tabelas filhas
(`snapshots`, `decisions`, `events`, `month_reports`, `indicator_history`, `regional_indicator_history`,
`election_results`, `career_summaries`), com `format: 'brasil-save'`, `formatVersion`, `dbVersion`,
`engineVersion`, `scenarioVersion`. Funções puras `exportBundle(db, id)` e `importBundle(db, bundle, newId)`.

1. **Duplicar / "Salvar como"**: `importBundle(exportBundle(id), novoId)` na mesma transação, nome "<nome> — cópia"
   (editável). Ação no cartão e na folha ☰ do Painel ("Salvar como…", copia o estado salvo do início do mês; o
   rascunho da agenda não entra — avisar).
2. **Exportar**: grava o pacote em JSON (`expo-file-system`) e abre o compartilhamento (`expo-sharing`). Nome do
   arquivo: `<nome>-mes<n>.brasilsave.json`.
3. **Importar**: `expo-document-picker` → leitura → **validação Zod do pacote inteiro** (nunca confiar no arquivo) →
   `upgradeState` em cada snapshot → id novo (nunca sobrescreve) → entra na lista. Recusa com mensagem clara:
   formato desconhecido, save mais novo que o app (`SaveTooNewError`), cenário ausente, arquivo corrompido. Antes
   do lançamento (§2.1), save de versão mais antiga pode ser recusado ("comece um novo jogo").
4. Web: exportar = download do arquivo; importar = `<input type="file">` (o document-picker já cobre).

**Arquivos:** `src/database/campaignBundle.ts` (novo) + teste, `campaignRepository.ts`, `gameStore.ts`,
`SavedCampaignsScreen.tsx`, folha ☰ do Painel, `package.json`.
**Aceite:** exportar → importar devolve uma campanha que continua igual à original (mesmo `advanceMonth` com as
mesmas decisões); arquivo adulterado é recusado sem tocar no banco.

### Fase M6 — Aparência e acessibilidade

0. **Registro de preferências** (pré-requisito da M9): `src/store/preferences.ts` com uma entrada por chave
   (`key`, `default`, `resolve(unknown)`), substituindo as leituras soltas do `gameStore.ts`. Sem mudar nomes de
   chave existentes.
1. **Tema claro / escuro / do sistema** (`tema`): o `ThemeProvider` passa a combinar a escolha com
   `useColorScheme()`. O HUD do Painel continua escuro de propósito (dizer isso na legenda da opção).
2. **Modo para daltônicos** (`daltonico`): troca `positive`/`negative` (e as versões `Soft`) por azul/laranja nos
   dois temas e no HUD; as escalas de cor do globo e do mapa 2D (`src/globe/fills.ts`, `FlatBrazilMap`) ganham a
   paleta alternativa; `Indicator` e variações passam a mostrar sempre `+`/`−` e seta, não só cor. Checar
   contraste mínimo 4,5:1.
3. **Modo canhoto** (`canhoto`): espelha os trilhos laterais e a doca do `PainelScreen.tsx` (botão dourado de
   encerrar o mês vai para a esquerda). As áreas reservadas do HUD (`hudReserved.ts`) e o posicionamento dos rótulos
   do globo precisam do lado invertido — ajustar os testes de `hudReserved`.
4. **Valores fiscais em R$ bilhões ou % do PIB** (`unidade_fiscal`): um formatador único
   (`formatFiscal(value, gdp, unit)`) usado em Economia, Orçamento, Mesa de despacho e notícias com valor. O motor
   continua em R$ (ECONOMIC_MODEL.md §2); a conversão é só de exibição, com o PIB do mês corrente anualizado.

**Arquivos:** `preferences.ts` (novo), `gameStore.ts`, `ThemeProvider.tsx`, `constants/theme.ts`,
`SettingsScreen.tsx`, `PainelScreen.tsx`, `hudReserved.ts`, `fills.ts`, `FlatBrazilMap.tsx`, `Indicator.tsx`,
`format.ts`, `EconomyPanel.tsx`, `labels.ts`. Se passar de 100 arquivos, dividir em M6a (0–2) e M6b (3–4).
**Aceite:** cada opção muda a tela sem reiniciar; teste de que toda tela fiscal usa `formatFiscal`.

### Fase M7 — Globo, movimento e início

1. **Limitador 30/60 FPS** (`globo_fps`): como o Canvas já é `demand`, o limite vale para os laços contínuos
   (inércia, nuvens, pulso, transição do Sol): o laço que chama `invalidate()` respeita o intervalo mínimo. Medir
   antes e depois com `frameStats.ts` (MEDICAO_GLOBO.md) — se o ganho de bateria for desprezível, documentar e
   manter só 60.
2. **Velocidade de rotação e zoom** (`globo_rotacao`, `globo_zoom`): dois controles deslizantes (0,5×–2×) que
   multiplicam os ganhos em `controller.ts`. Precisa de um componente `Slider` próprio em `src/components/ui`
   (evita dependência nova) com passos discretos e leitura por acessibilidade.
3. **Pular animações** (`pular_animacoes`): duas chaves independentes do "Reduzir movimento" — abertura do jornal 3D
   (`FoldingNewspaper`/`NewsDeskScreen`) e transição de passagem de mês. Reduzir movimento continua ligando as duas.
4. **Abrir direto na última campanha ativa** (`abrir_na_campanha`): na inicialização da store, se ligado e houver
   campanha ativa, carrega e vai para `/painel`; se falhar, cai no menu com aviso. O menu continua a um toque
   (☰ → Menu principal).

**Arquivos:** `GlobeView.tsx`, `controller.ts`, `cloudLoop.ts`, `Slider.tsx` (novo), `NewsDeskScreen.tsx`,
transição de mês do Painel, `src/app/_layout.tsx`, `gameStore.ts`, `preferences.ts`, `SettingsScreen.tsx`.
**Aceite:** medição registrada no MEDICAO_GLOBO.md; abrir direto não pula o aviso de ficção da 1ª execução.

### Fase M8 — Som e vibração

1. **Vibração** (`vibracao`, padrão ligado): `expo-haptics` em dois pontos — encerramento do mês concluído
   (notificação leve) e chegada de evento urgente (aviso). Um serviço `src/feedback/haptics.ts` chamado pela store
   (o motor não sabe de vibração). Respeita o modo silencioso do sistema.
2. **Sons e música** (`volume_musica`, `volume_efeitos`, `som_mudo`): `expo-audio`; serviço `src/feedback/audio.ts`
   com música do menu, música do Painel em laço e efeitos (toque de botão, fim do mês, evento urgente, eleição).
   Pausa em segundo plano; reaproveita o `Slider` da M7.
3. **Assets de áudio**: o projeto não tem nenhum. Precisam ser **originais ou com licença livre comprovada**
   (CC0/CC-BY com crédito na tela Sobre), registrados num `assets/audio/CREDITOS.md`. Formato `.m4a`/`.ogg`
   comprimido; orçamento de tamanho a definir (§5, D-M3).

**Arquivos:** `package.json`, `src/feedback/*` (novo), `gameStore.ts`, `preferences.ts`, `SettingsScreen.tsx`,
`AboutScreen.tsx`, `assets/audio/*`.
**Aceite:** volume 0 não carrega o áudio; nenhum som com o app em segundo plano.

### Fase M9 — Restaurar padrões

1. Botão "Restaurar configurações padrão" no fim das Configurações, com confirmação. Usa o registro da M6: apaga
   **só** as chaves de preferência (tema, texto, mapa, globo, som, vibração…), nunca saves, `aviso_ficcao_visto`,
   última dificuldade/cenário nem conquistas.
2. Teste: cada entrada do registro volta ao `default` e nada fora dele é apagado.

### Fase M10 — Conquistas

Precisa das decisões D-M4 e D-M5 (§5) antes do código.

1. **Desenho** numa seção nova do GAME_DESIGN.md: lista inicial (~20 conquistas) em três tipos — marcos
   (completar o mandato, ser reeleito), desafios (dívida/PIB abaixo de X ao fim do mandato, aprovar uma PEC) e
   descobertas (ver todos os tipos de evento de uma cadeia). Sem conquista que premie orientação ideológica
   (GAME_DESIGN.md §13, neutralidade).
2. **Dados**: `src/data/achievements.json` validado por Zod (id, título, descrição, ícone, oculta?, regra).
3. **Avaliação** pura em `src/achievements/evaluate.ts`: recebe `GameState` + `MonthReport` e devolve as
   desbloqueadas. Fica fora de `src/engine/` (não altera a simulação), chamada pela store depois do `recordMonth`.
4. **Gravação**: migração 10 `conquistas` — tabela global `achievements (id PRIMARY KEY, campaign_id, unlocked_at)`
   (fora do save; apagar a campanha não tira a conquista).
5. **Tela** `/conquistas` (some do `SOON`): grade com bloqueadas em cinza, ocultas como "???", progresso "7 de 20",
   e aviso discreto no Painel ao desbloquear (com vibração/som da M8, se existirem).

**Aceite:** teste de cada regra com estado montado; exportar/importar save (M5) não duplica nem desbloqueia
conquista.

### Fase M11 — Rever instruções básicas

**Bloqueada:** o jogo não tem sistema de dicas nem tutorial (Fase 10, ROADMAP_2.0.md). Quando o tutorial existir,
ele grava quais dicas foram fechadas numa chave (`dicas_vistas`); o botão "Rever instruções básicas" apaga essa
chave e abre a primeira dica. Até lá, o item não entra nas Configurações (nada de botão que não faz nada).

---

## 4. Itens e onde estão

| Pedido | Fase |
| --- | --- |
| Botão SAIR | M1 |
| Tela de Conquistas | M10 |
| Renomear campanha | M3 |
| "Salvar como" / duplicar | M5 |
| Exportar e importar save | M5 |
| Ordenar e filtrar a lista | M3 |
| Mini-resumo no cartão | M2 |
| Tema claro ou escuro | M6 |
| Sons e música com volume | M8 |
| Vibração | M8 |
| Tela Sobre | M1 |
| Aviso de ficção na abertura | M1 |
| Restaurar configurações padrão | M9 |
| Apagar todas as encerradas | M3 |
| R$ bilhões × % do PIB | M6 |
| CONTINUAR com nome e mês | M1 |
| 🎲 nome automático | M4 |
| Copiar semente / Colar semente | M2 / M4 |
| Data e hora da última vez que jogou | M2 |
| Tempo total de jogo | M2 |
| Cadeado contra exclusão | M3 |
| Fixar no topo (alfinete) | M3 |
| Recomeçar com as mesmas opções | M4 |
| Modo para daltônicos | M6 |
| Modo canhoto | M6 |
| Abrir direto na última campanha | M7 |
| Limitador 30/60 FPS | M7 |
| Velocidade de rotação e zoom do globo | M7 |
| Pular animações | M7 |
| Rever instruções básicas | M11 (bloqueada) |

---

## 5. Decisões em aberto

| # | Decisão | Opções | Recomendação | Bloqueia |
| --- | --- | --- | --- | --- |
| D-M1 | SAIR no iOS/web | esconder / voltar ao menu / manter "em breve" | Esconder | M1 |
| D-M2 | "Salvar como" dentro da partida | copiar o início do mês / gravar o rascunho da agenda também | Início do mês (o rascunho não é estado do motor) | M5 |
| D-M3 | Origem e tamanho dos áudios | compor / banco CC0 / adiar música e fazer só efeitos | Começar só com efeitos CC0 (≤ 1 MB), música depois | M8 |
| D-M4 | Lista inicial de conquistas | ~10 / ~20 / ~40 | ~20, revisadas pelo autor | M10 |
| D-M5 | Conquistas valem em qualquer dificuldade? | todas / só Estratégica e Realismo / marcadas por dificuldade | Todas, com selo da dificuldade | M10 |
| D-M6 | Limitador de FPS | manter se a medição mostrar ganho / sempre oferecer | Decidir pela medição da M7 | M7 |
