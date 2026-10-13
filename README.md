# Brasil Simulator

Jogo de estratégia e simulação política por turnos para Android (e, depois, iOS). O jogador assume a Presidência da República do Brasil e governa por meio de políticas que passam pelo Congresso, pelo orçamento e pelas demais instituições.

> Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro.

## Estado atual
**Fase 00 — Pré-produção.** Documentos de design criados e aguardando revisão. Ainda não há código.

## Documentação
| Documento | Conteúdo |
| --- | --- |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | Visão, regras de jogo, turnos, dificuldades, protótipo 0.1 |
| [docs/ECONOMIC_MODEL.md](docs/ECONOMIC_MODEL.md) | Modelo econômico, equações, parâmetros e invariantes |
| [docs/POLITICAL_RULES.md](docs/POLITICAL_RULES.md) | Competências, instrumentos legais, orçamento, Congresso, impeachment |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Fontes oficiais, status dos dados e pipeline |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Fases, versões, tarefas e decisões em aberto |
| [docs/AI_INSTRUCTIONS.md](docs/AI_INSTRUCTIONS.md) | Regras para agentes de IA que trabalham no projeto |

## Tecnologia planejada
React Native + Expo + TypeScript · Expo Router · Zustand · Expo SQLite · Zod · Vitest · Maestro · EAS Build

## Web (somente desenvolvimento)

A versão web serve para testar telas durante o desenvolvimento; o jogo é publicado para Android e iOS. O salvamento na web usa o SQLite em WebAssembly, que exige os cabeçalhos `Cross-Origin-Embedder-Policy: credentialless` e `Cross-Origin-Opener-Policy: same-origin`. O servidor de desenvolvimento (`npx expo start --web`) já os envia (`metro.config.js`); uma exportação web publicada precisaria configurá-los na hospedagem.
