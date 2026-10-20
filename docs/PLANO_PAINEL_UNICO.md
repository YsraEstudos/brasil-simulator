# Plano — Painel único (o jogo inteiro a partir da mesa)

Versão 0.2 do documento • 20/10/2026 • ✅ Etapas 1–5 implementadas em 20/10/2026 (Etapas 1–2 nos PRs #17 e #18; Etapas 3–5 no PR da branch `feat/painel-etapas-3-5`) • v0.2: decisões da §6 tomadas
Documentos relacionados: [GAME_DESIGN.md](GAME_DESIGN.md) §4.2–§4.6 · [AI_INSTRUCTIONS.md](AI_INSTRUCTIONS.md) §2–§3

---

## 1. Objetivo

> **Status (20/10/2026):** o plano foi executado. Esta seção e as §2–§3 descrevem o desenho original; o estado final está em [GAME_DESIGN.md](GAME_DESIGN.md) §4.6.

Antes deste plano, o jogo é dividido em 5 abas (Presidência, Painel, Economia, Congresso, Notícias) e cada uma é um mundo
separado: o jogador decide na Presidência, olha o mapa no Painel, negocia no Congresso e volta à Presidência para
encerrar o mês. A partir deste plano:

1. Depois de **Novo jogo** (nome, dificuldade, objetivo…), **Carregar jogo** ou **Continuar**, o jogador cai
   **direto no Painel** com o globo do Brasil.
2. **Não existe mais barra de abas.** O Painel é a casa do jogo: tudo parte dele e tudo volta para ele.
3. O conteúdo dos outros módulos chega ao Painel de **dois jeitos**, para não poluir a tela:
   - **Folha (modal)** — consulta ou decisão rápida, sem sair da mesa: abre por cima do globo e fecha no ✕
     (é o que já existe hoje em Alertas, Meta, Camadas…).
   - **Subtela** — conteúdo grande, com cenário próprio: troca a tela inteira e tem o botão
     **"Voltar ao Painel"** (ex.: Notícias, com o jornal e as redes, exatamente como hoje).
4. O **"Encerrar o mês"** sai da Presidência e passa a ser o botão principal do Painel.

Regra para decidir onde cada coisa mora: **se cabe numa folha e não precisa de cenário próprio, é folha; se é uma
mesa de trabalho (muitas linhas, rolagem longa, cena 3D), é subtela.**

---

## 2. Onde vai cada conteúdo

### 2.1 Sempre visível no Painel (HUD)

| Conteúdo | Hoje | Depois |
| --- | --- | --- |
| Mês, turno, ações restantes | topo do Painel | igual |
| Aprovação, PIB, população | topo do Painel | igual |
| Capital político, inflação, desemprego | faixa de baixo | 2ª linha do topo (a base fica para a doca) |
| Sino com pendências | topo do Painel | igual |
| **Encerrar o mês** | fim da Presidência | botão dourado na doca (canto inferior direito), com "x de y ações usadas" |
| Voltar para a Presidência (←) | topo do Painel | vira **Menu** (☰): folha com Salvar e sair, Configurações, Menu principal |

### 2.2 Folhas (abrem por cima do globo)

| Folha | Origem do conteúdo | Observação |
| --- | --- | --- |
| **Alertas e eventos** | `EventInbox` (Presidência) | Deixa de ser só lista com link: o jogador **responde o evento ali**, vê os 3 pareceres e sanciona/veta. |
| **Relatório do mês** | `MonthSummary` (Presidência) | Abre sozinha depois de "Encerrar o mês" (GAME_DESIGN §4.2, passo 5); reabre pelo botão. |
| **Indicadores** | `Indicator` + `WhyChanged` (Presidência) + setores e PIB (Painel) | Une as folhas "Indicadores" e "Evolução do PIB"; tocar num indicador mostra o "Por que mudou?". |
| **Eleições** | `ElectionsCard` (Presidência) | O botão só aparece na janela eleitoral (com selo). |
| Meta atual, Camadas, Visão regional, Estado (UF) | Painel | Como hoje. |
| Ministérios (resumo) | Painel | Como hoje, com link "Gerir no Congresso". |
| **Menu** | `leaveToMenu` (Presidência) | Sair ao menu mantém a partida em memória (regra atual do CONTINUAR). |

### 2.3 Subtelas (trocam a tela; têm "Voltar ao Painel")

| Subtela | Conteúdo | Origem |
| --- | --- | --- |
| **Gabinete** (agenda presidencial) | Decisões grandes com mesa de despacho, políticas públicas e marcas de governo, ações de agenda simples | `DecisionPanel`, `DispatchCard`, `PublicPoliciesPanel`, `GovernmentBrands`, `AgendaActions` |
| **Congresso** | Hemiciclo, Mesas e pauta, propostas em tramitação, blocos, ministérios, negociações | `CongressPanel`, `ProposalList`, `MiniHemicycle` |
| **Economia** | Juros, atividade, câmbio, contas públicas, teto, receitas, Copom, sociedade | `EconomyPanel`, `SocietyPanel` |
| **Notícias** | Mesa 3D com jornal e notebook (redes) | `NewsDeskScreen` — só ganha o botão "Voltar ao Painel" |
| **Legado** (fim da campanha) | Relatório de legado | `LegacyReport`; o Painel abre nela quando a campanha termina |

Todas as subtelas têm a mesma moldura (`SubScreen`): barra superior escura com **← Voltar ao Painel**, título e uma
faixa compacta com mês, ações restantes e capital político — quem está montando a agenda no Gabinete ou no
Congresso vê quanto ainda cabe no mês sem voltar à mesa. O "voltar" do Android volta ao Painel (no notebook das
Notícias, primeiro volta para a mesa do jornal, como hoje).

### 2.4 A mesa do Painel, arrumada

Para caber o que entra sem poluir:

```
┌──────────────────────────────────────────────────────┐
│ ☰  [logo]  Mês · Aprovação · PIB · População    ⊕  🔔 │  ← topo
│            Capital · Inflação · Desemprego           │
│ 🔔                                              ▦    │
│ ⚑          (globo do Brasil)                    ◫    │  ← trilhos: folhas
│ 📄                                              📊   │
│ 🗳 (só na eleição)                               🏛   │
│                                                      │
│ [Gabinete] [Congresso] [Economia] [Notícias] [ENCERRAR O MÊS] │  ← doca: subtelas + ação principal
└──────────────────────────────────────────────────────┘
```

- **Trilho esquerdo — "o mês"**: Alertas, Meta, Relatório do mês, Eleições (condicional).
- **Trilho direito — "o país"**: Camadas, Visão regional, Indicadores, Ministérios.
- **Doca de baixo — "ir trabalhar"**: as 4 subtelas e o Encerrar o mês. Em paisagem a doca fica mais baixa e
  só com ícones; em retrato, ícone + rótulo curto.
- A folha "Congresso Nacional" (mini-hemiciclo) sai do trilho: o botão Congresso da doca leva direto à subtela,
  que abre com o hemiciclo no topo.
- Selos (badges) nos botões da doca quando há algo pendente lá: Gabinete (sanção aguardando), Congresso
  (votação marcada no mês), Notícias (edição nova).

---

## 3. Navegação técnica

### 3.1 Rotas

Hoje: `src/app/(tabs)/` com `Tabs` do expo-router (`presidencia`, `painel`, `economia`, `congresso`, `noticias`,
`design`).

Depois: grupo **`src/app/(jogo)/`** com **`Stack`** (sem cabeçalho), o Painel como âncora:

| Arquivo | URL | Animação |
| --- | --- | --- |
| `(jogo)/_layout.tsx` | — | `Stack`, `unstable_settings.anchor = 'painel'` |
| `(jogo)/painel.tsx` | `/painel` | `fade` ao entrar no jogo |
| `(jogo)/gabinete.tsx` | `/gabinete` | `fade_from_bottom` |
| `(jogo)/congresso.tsx` | `/congresso` | `fade_from_bottom` |
| `(jogo)/economia.tsx` | `/economia` | `fade_from_bottom` |
| `(jogo)/noticias.tsx` | `/noticias` | `fade` (a cena 3D faz a própria entrada) |
| `(jogo)/legado.tsx` | `/legado` | `fade` |
| `design.tsx` (vitrine) | `/design` | sai do grupo do jogo, fica na raiz |

- Subtelas abrem com `router.push` a partir do Painel; "Voltar ao Painel" usa `router.back()` (com
  `router.replace('/painel')` se não houver histórico, igual ao `SetupBits` hoje).
- Entradas no jogo passam a `router.replace('/painel')`: `NewCampaignScreen.tsx:185`,
  `SavedCampaignsScreen.tsx:49,57`, `MainMenuScreen.tsx:158`.
- `presidencia.tsx` é removido. Ligações de dentro do Painel para `/presidencia` (Alertas, voltar) somem com as
  folhas novas.

### 3.2 Estado e desempenho

- O rascunho do mês (`draft`) já está na store (Zustand): marcar algo no Gabinete e ver o contador no Painel
  funciona sem mudança na store.
- `endMonth` passa a ser chamado pelo Painel. A limpeza da mesa de despacho aberta (`expandedPolicy`) fica no
  Gabinete, que é recriado ao reabrir.
- Na pilha, o Painel **continua montado** por baixo da subtela (o globo não recarrega ao voltar). Para não ter
  dois `Canvas` 3D desenhando ao mesmo tempo (globo + mesa de Notícias), o globo pausa quando a tela perde o foco
  (`useIsFocused` → `frameloop="never"`). Hoje as abas já deixam os dois montados; isso **melhora** o atual.
- **Motor e banco não mudam**: é só interface e navegação. Nenhum save precisa de migração.

### 3.3 Tema visual

O Painel e as Notícias usam o HUD escuro (`hudTheme`); Gabinete, Congresso e Economia usam o tema claro/escuro do
sistema de design (`Card`, `Indicator`…). Para a troca não parecer outro app:

- Etapa curta: a moldura `SubScreen` força o **esquema escuro** no conteúdo (um `ThemeOverride` em volta do
  `ThemeContext`, sem mexer nos componentes) e usa o fundo `Hud.board`.
- Etapa longa (opcional, pode ficar para depois): reestilizar os `Card` das subtelas com a moldura dourada do
  `HudPanel`.

---

## 4. Etapas (cada uma um PR, ≤ 100 arquivos, branch a partir de `origin/main`)

> **Antes de começar:** a Etapa 1 parte de uma `main` que já tenha o PR "Ações de agenda" (estado v9), que mexe
> em vários dos mesmos componentes (`CampaignView`, `PainelScreen`, `hudData`…).

### Etapa 1 — Painel como casa, sem abas ✅ (20/10/2026, PR #17)
- `(tabs)` → `(jogo)` com `Stack`; rotas da §3.1.
- Componente `src/components/painel/SubScreen.tsx` (moldura: Voltar ao Painel, título, faixa de mês/ações/capital,
  "voltar" do Android).
- Economia, Congresso e Notícias dentro da moldura (conteúdo como está).
- **Gabinete provisório**: o `CampaignView` atual dentro da moldura (ainda com o Encerrar o mês dele).
- Entradas do jogo vão para `/painel`. Doca provisória com os 4 botões de subtela.
- **Resultado:** já dá para jogar sem barra de abas, tudo saindo do Painel.

### Etapa 2 — O mês se joga no Painel ✅ (20/10/2026, PR #18)
- Encerrar o mês na doca (com estado `busy` e contagem de ações).
- Folha **Relatório do mês**, aberta sozinha após encerrar.
- Folha **Menu** (substitui o ← da Presidência).
- Reorganização dos trilhos e da faixa de números (§2.4).
- Tira do Gabinete o cabeçalho, os indicadores, o resumo e os botões finais.

### Etapa 3 — Folhas que decidem ✅ (20/10/2026, PR da branch `feat/painel-etapas-3-5`)
- **Alertas e eventos** com `EventInbox` completo (escolha, pareceres, sanção/veto) — tela estreita, então os
  cartões de evento ficam recolhidos e abrem um por vez.
- Folha **Indicadores** unificada com "Por que mudou?".
- Folha **Eleições** (condicional) e subtela **Legado** ao fim da campanha.
- Selos nos botões da doca.

### Etapa 4 — Gabinete e Congresso definitivos ✅ (20/10/2026, PR da branch `feat/painel-etapas-3-5`)
- Gabinete só com decisões, políticas públicas, marcas e agenda; `CampaignView` é desmontado (ou removido).
- Congresso com o hemiciclo no topo e as propostas em tramitação (`ProposalList` sai do Gabinete).
- Pausa do globo fora de foco.

### Etapa 5 — Acabamento ✅ (20/10/2026, PR da branch `feat/painel-etapas-3-5`)
- Tema escuro forçado nas subtelas (§3.3); reestilização opcional.
- Documentos: GAME_DESIGN §4.2, §4.3.1, §4.5 (de "aba" para "subtela/folha"), ROADMAP (§2.1, adição), e páginas
  `docs/EXPLICACOES-paginas/tela-*.html` (Presidência some; Painel, Gabinete).
- `npm run check`; verificação no navegador (web) e no aparelho (Expo Go).

---

## 5. Testes

- Lógica pura nova em arquivo testável (ex.: `src/components/painel/mesaNav.ts`): quais botões aparecem (Eleições só
  na janela), contagem dos selos, rótulo do Encerrar o mês. Testes no estilo do `hudData.test.ts`.
- Testes existentes de `hudData` e `campaignSetupView` ajustados só onde o Presidência/abas aparecem.
- Roteiro manual por etapa: novo jogo → Painel; marcar decisão no Gabinete → contador no Painel; responder evento
  na folha; encerrar o mês → relatório; Notícias → notebook → voltar → Painel; "voltar" do Android em cada tela;
  sair ao menu → Continuar volta ao Painel com o rascunho.

---

## 6. Decisões (tomadas em 20/10/2026)

| # | Pergunta | Decisão |
| --- | --- | --- |
| P1 | Nome da subtela que herda a Presidência | **Gabinete** (a Presidência deixa de ser lugar; o Painel é o Palácio). Rota `/gabinete`. |
| P2 | Congresso: folha rápida antes da subtela? | **Não**: o botão da doca leva direto à subtela, que abre com o hemiciclo no topo. |
| P3 | Modo demonstração (Painel sem partida) | **Mantido só como reserva** (fallback sem partida); o caminho normal só chega ao Painel com partida. |
| P4 | Responder eventos na folha ou numa subtela | **Folha**: Alertas e eventos responde ali mesmo, com os três pareceres da mesa de despacho, e sanciona/veta projetos. |
| P5 | Reestilizar os cartões das subtelas no visual HUD | Só o tema escuro forçado: a paleta do HUD vem do tema (as subtelas ficam sempre no visual escuro e dourado da mesa). A reestilização completa dos cartões fica para depois. |

## 7. Fora do escopo

- Mudanças no motor, no banco ou nos saves.
- Conteúdo novo (eventos, políticas) e mudanças de regra.
- Tutorial (Fase 10).
