# Brasil Simulator — Roadmap 2.0

Versão 0.1 do documento • 16/10/2026 • Continuação do [ROADMAP.md](ROADMAP.md), que cobre as Fases 00–08. Este documento cobre as Fases 09–11.
Prazos são estimativas para uma pessoa desenvolvendo com apoio intensivo de IA.

Documentos relacionados: [GAME_DESIGN.md](GAME_DESIGN.md) · [POLITICAL_RULES.md](POLITICAL_RULES.md) · [ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) · [DATA_SOURCES.md](DATA_SOURCES.md)

---

## 1. Versões

| Versão | Conteúdo obrigatório | Fases | Resultado |
| --- | --- | --- | --- |
| **1.0 — Lançamento** | Tutorial, equilíbrio, estabilidade e publicação (eleições e mandatos: Fase 08, no [ROADMAP.md](ROADMAP.md)) | 10 | Publicação Android |
| **2.0 — Expansão** | Realismo Extremo, diplomacia, novos cenários | 09, 11 | Profundidade adicional |

**Regra de produção:** a Fase 09 só começa com a 0.5 funcional, testada e jogável.

---

## 2. Fases

| Fase | Nome | Estimativa | Critério de conclusão | Status |
| --- | --- | --- | --- | --- |
| 09 | Realismo Extremo | 4–8 sem | Consistência e desempenho em campanhas de décadas; efeitos rastreáveis | ⬜ |
| 10 | Testes e publicação | 4–6 sem | Versão estável aprovada na Play Store | ⬜ |
| 11 | Expansões | contínuo | — | ⬜ |

O plano de tarefas de cada fase (formato dos `FASE_06.md` e `FASE_07.md`) é criado quando a fase começar.

---

## 3. Escopo já documentado (compilado dos documentos; não é um plano de tarefas)

### 3.1 Fase 09 — Realismo Extremo

**Modo de dificuldade (GAME_DESIGN.md §6; POLITICAL_RULES.md §1.1):**

- Ações de agenda: 2–3; ruído alto nos efeitos.
- Atraso real na divulgação de dados (ex.: PIB trimestral).
- Explicações como cadeia causal estimada, com incerteza.
- Previsões ministeriais com margem de erro e viés institucional.
- Regras completas e detalhadas (regimentos internos, prazos reais de tramitação, calendário orçamentário detalhado).
- Quebra de regras permitida, com consequências mais severas.

**Congresso e instituições (GAME_DESIGN.md §6; POLITICAL_RULES.md §6.4 e §9):**

- Comportamento individual dos parlamentares.
- Comissões permanentes individuais, emendas de plenário e parlamentares individuais.
- Bancadas estaduais no Congresso.
- CPI com comissão própria, votos por bancada e convocações; efeito das CPIs sobre ministérios (demissão automática).

**Economia (ECONOMIC_MODEL.md §10):**

- Expectativas heterogêneas.
- Setores interligados (insumo-produto simplificado).
- PPA, execução detalhada e comércio exterior.

**Outros:**

- Troca da biblioteca de gráficos por `victory-native` se o Realismo Extremo exigir ([ROADMAP.md](ROADMAP.md) §9.1, decisão D3).

### 3.2 Fase 10 — Testes e publicação

- Conteúdo da versão 1.0 ([ROADMAP.md](ROADMAP.md) §1): tutorial, equilíbrio e estabilidade (notícias: Fase 07; eleições e mandatos: Fase 08).
- Build de release própria: medir FPS e memória em aparelho de entrada e iPhone ([ROADMAP.md](ROADMAP.md) §4, item 11).
- Publicação Android na Play Store (EAS).
- Cuidados de publicação ([ROADMAP.md](ROADMAP.md) §10): aviso de ficção, sem marcas oficiais, transparência de fontes.

### 3.3 Fase 11 — Expansões

- Diplomacia e novos cenários ([ROADMAP.md](ROADMAP.md) §1).
- Candidatos fora do escopo da 1.0 (GAME_DESIGN.md §14): multiplayer em tempo real, Forças Armadas e guerra, governar estados ou municípios, IA generativa em diálogos, editor de cenários, diplomacia profunda.
- Pacote com partidos/nomes reais como expansão ([ROADMAP.md](ROADMAP.md) §9.1, decisão D1).

---

## 4. Decisões em aberto

| # | Decisão | Opções | Recomendação | Bloqueia |
| --- | --- | --- | --- | --- |
| D5 | Nome comercial definitivo | "Brasil Simulator" ou outro | Verificar disponibilidade de marca e na loja antes da Fase 10 | Fase 10 |
| D6 | Monetização | demo grátis + compra única | Conforme o plano mestre; revisar regras do Google Play no lançamento | Fase 10 |
