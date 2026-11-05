# Plano: os países do mundo no globo (Fases P1–P7)

> Versão 0.2 · 05/11/2026 · 🟡 P1 feita (branch `feat/paises-p1`); P2–P7 aguardam aprovação do autor, fase a fase.
>
> Pedido do autor: todos os países com nome no mapa e clicáveis, com uma ficha de informações úteis (matérias-primas, crescimento e o que mais servir). As ações sobre o país (declarar guerra, fazer transações e outras) entram **só como menu**, sem efeito no motor. Antes de planejar, conferi o código da `main` (até o PR #44) e da pilha R (#60–#66), onde está o comércio exterior.

## 1. Resumo

O jogador gira o globo, vê o nome de cada país e toca nele. Abre-se a **folha do país**, com sete seções: identidade, economia, população e sociedade, matérias-primas e energia, comércio exterior, relação com o Brasil e governo. No fim da folha fica o menu **Ações**, com os botões marcados "Em breve".

Os números da ficha são dados públicos, guardados num JSON do app e conferidos por Zod. **O motor não muda em nenhuma fase deste plano.** A ficha só lê dele o que já existe: a relação, o acordo e a barreira dos 6 parceiros comerciais do R7 (#65).

## 2. O que o código já tem (levantamento de 05/11/2026)

| Dado | Onde está | Situação |
| --- | --- | --- |
| Textura do mundo fora do Brasil | `assets/globe/world.jpg` (Natural Earth II, 4096×2048), gerada por `scripts/data/build_globe.py` | Mostra relevo e água. **Sem fronteiras, sem nomes** |
| Tiles de alta resolução | `assets/globe/tiles/` (114 arquivos), só na caixa do Brasil, que também pega parte dos vizinhos | Regerar os tiles passa do limite de 100 arquivos por PR (§3) |
| Toque no globo | `GlobeView.tsx`: `controller.pick` → `findUf(lon, lat)` → `onSelect(sigla)`. Fora do Brasil, o toque não seleciona nada | É aqui que o país vai entrar |
| Índice por pixel | `ufIndex.json` (RLE, só a caixa do Brasil) e `ufIndexAt`. A Argentina dá 0 | Mesmo formato para o índice de países |
| Rótulos | `labels.json` + atlas `labels.png` (512², DejaVu Sans Bold), com colisão e prioridade em `labelLayout.ts` | Só as 27 siglas e as capitais |
| Câmera | `CAMERA.maxAltitude = 3.2` e longitude livre | Já dá para girar até qualquer país |
| Mapa 2D | `FlatBrazilMap` (27 polígonos) | Só o Brasil |
| Setor externo do motor | `economy/external.ts`: juro externo, termos de troca, câmbio e risco | Agregado. Não existe país no motor da `main` |
| Parceiros comerciais | **PR #65 (R7), não integrado:** `src/data/trade/comercio_exterior.json` com China, Estados Unidos, União Europeia, Mercosul, Japão e Índia (participação nas exportações e importações, setor exposto, relação inicial −100 a 100). O motor tem `state.trade` (relação, acordo, choques), as ações `missao_comercial` e `negociar_acordo`, e o cartão `TradeCard` no Gabinete | `PROVISORIO`. É o único dado "vivo" de país |
| Fora da 1.0 | GAME_DESIGN.md §14: "Forças Armadas e guerra" e "diplomacia profunda" ficam para a Fase 11 | Por isso guerra e diplomacia ficam só como menu |

Consequências para o plano:
- Países, nomes, fronteiras e fichas são todos **novos**. Nada disso existe hoje.
- As fronteiras não podem entrar regerando os tiles, porque isso mexeria nos 114 arquivos. Elas vão como uma malha de linhas (D-P2).
- A relação com o Brasil só é simulada para os 6 parceiros do R7. Os outros países aparecem como "sem relação simulada".

## 3. Regras para todas as fases

- **Um PR por fase**, no máximo 100 arquivos, num branch novo a partir de `origin/main`.
- **Motor intocado.** Nenhuma fase muda `src/engine/`. A interface só lê exportações que já existem (`tradeOf`, `agreementInForce`, `partnerAccess` e o modelo `tradeView`, todos do R7). Se uma fase precisar de algo no motor, ela para e pergunta.
- **Sem rede no jogo.** Os dados são baixados por scripts de `scripts/data/` na máquina de desenvolvimento e gravados como JSON. O app não faz nenhuma chamada (AI_INSTRUCTIONS.md §8).
- **Todo número tem origem.** Cada valor da ficha leva status, fonte e ano de referência (DATA_SOURCES.md §2.2). A ficha mostra o ano ("dado de 2025") e o selo quando o valor for `ESTIMADO` ou `PROVISORIO`.
- **Sem pessoas reais.** A ficha diz "presidente" ou "primeiro-ministro", mas nunca dá o nome de quem ocupa o cargo (AI_INSTRUCTIONS.md §8).
- **Lógica fora da tela.** As contas ficam em `*View.ts` puros, com teste no Vitest. O `.tsx` só desenha. Os textos ficam centralizados, em pt-BR, e os identificadores em inglês.
- **Globo:** `frameloop="demand"` continua valendo, sem nenhum quadro novo parado. A meta de memória de GPU nova é de no máximo 2 MB fora do perfil Alto (PLANO_GLOBO.md §3.3). Tudo que o globo mostra também tem que estar numa lista, porque o perfil Essencial 2D não tem o mundo (PLANO_GLOBO.md §0.2).
- **Acessibilidade:** os rótulos e a ficha funcionam com o leitor de tela. Nas camadas, a cor nunca é o único sinal. Tudo respeita o modo canhoto e o tamanho do texto.
- **Saves:** nada do plano entra no save. O país selecionado e a seção aberta ficam na memória do app, e não há migração.
- **Checagens antes do PR:** `npm run check` e conferência no navegador.

## 4. De onde vem cada dado

Os downloads entram em `scripts/data/fetch_globe_data.py` (o mesmo script do globo) e a montagem em `scripts/data/build_countries.py`. A licença de cada fonte é registrada em DATA_SOURCES.md antes da primeira importação.

| Dado da ficha | Fonte | Licença / termos | Status |
| --- | --- | --- | --- |
| Contornos, código ISO, continente, sub-região, nome em português (`NAME_PT`) | Natural Earth, Admin 0 Countries, **ponto de vista do Brasil** (`ne_10m_admin_0_countries_bra`), simplificado no script | Domínio público | `REAL`. Os nomes são revisados à mão, para ficarem no padrão brasileiro |
| Capital | Natural Earth, Populated Places (`Admin-0 capital`) | Domínio público | `REAL` |
| Fronteira com o Brasil e distância de Brasília | Calculadas dos contornos | Derivado | `REAL` |
| PIB (US$ e PPC), PIB per capita, crescimento real, inflação, desemprego, população, urbanização, expectativa de vida, Gini | Banco Mundial, World Development Indicators (API) | CC BY 4.0, com atribuição | `REAL` (último ano fechado, 2025) |
| Projeção de crescimento e inflação (2026–2031), dívida bruta e conta corrente (% do PIB) | FMI, World Economic Outlook (out/2026) | Uso com atribuição. **Verificar** se a redistribuição comercial é permitida | `PROJETADO` |
| IDH | PNUD, Human Development Report | CC BY 3.0 IGO | `REAL` |
| Produção e reservas de minérios (ferro, cobre, lítio, níquel, bauxita, nióbio, terras raras, ouro e outros) | USGS, Mineral Commodity Summaries | Domínio público (governo dos EUA) | `REAL` |
| Petróleo, gás e carvão (produção, reservas, saldo) e matriz elétrica | EIA, International Energy Statistics | Domínio público | `REAL` |
| Produção agropecuária (soja, milho, trigo, café, açúcar, carnes) | FAO, FAOSTAT | CC BY 4.0 | `REAL` |
| Exportações e importações por produto e por destino | CEPII, base BACI (organiza os dados da ONU) | Licence Ouverte / Etalab 2.0, que permite uso comercial com atribuição | `REAL` |
| Comércio com o Brasil (exportações, importações, saldo, principais produtos, posição entre os parceiros) | MDIC, Comex Stat | Dados abertos | `REAL` |
| Forma de governo e cargo do chefe de Estado e de governo, idiomas oficiais, moeda | CIA, World Factbook | Domínio público | `REAL` |
| Blocos (Mercosul, BRICS, G20, OCDE, UE, OTAN, OPEP, ASEAN, União Africana e outros) | Listas oficiais de cada bloco, digitadas à mão no script | Fato público | `REAL`, com a data da conferência |
| Gasto militar (% do PIB) | SIPRI, pelo indicador do Banco Mundial | **Verificar** se a licença permite uso comercial (D-P7) | `REAL` ou fora |
| Relação com o Brasil no jogo, acordo e barreira | Motor do R7 (`state.trade`), a partir de `comercio_exterior.json` | Do projeto | `PROVISORIO` (6 parceiros). Os outros países ficam sem relação |

O resultado do pipeline fica em três lugares:
- **`src/globe/data/`** (gerado e nunca editado à mão): `countries.json` com id ISO3, nome, âncora do rótulo, prioridade e área; `countryIndex.json` com o índice RLE para o toque; e as linhas de fronteira.
- **`assets/globe/`**: o atlas de nomes `countryLabels.png`. A textura de índice para pintar os países fica para a P7, que é quem precisa dela.
- **`src/data/countries/paises.json`**: a ficha completa, com versão e status, validada pelo esquema de `src/types/country.ts` e carregada por `src/content/countries.ts`. O tamanho estimado é de 150 a 250 KB.

## 5. O que entra no motor e o que fica só na interface

| Coisa | Onde | Por quê |
| --- | --- | --- |
| Fronteiras, nomes e índice do toque | `src/globe/` (camada do globo) | É desenho e toque. O motor não sabe que o globo existe |
| Dados da ficha | `src/data/countries/` (conteúdo) | São fatos do mundo real, que não mudam com a simulação |
| Valor no ano do jogo (por exemplo, o PIB de 2028) | `countryFacts.ts` puro, na interface: aplica a projeção do FMI ao ano do `monthIndex` | É uma conta determinística, sem estado novo. Leva o selo `ESTIMADO`. Depois de 2031, repete o crescimento do último ano projetado |
| Relação, acordo e barreira dos 6 parceiros | Motor (R7, já existe) | A interface só lê |
| País selecionado e seção aberta | Memória da interface, fora do save | Preferência de leitura |
| Menu de ações | Interface: botões "Em breve" | Sem efeito, como foi pedido |
| Relação com cada país, ações com efeito, guerra | **Motor, no futuro (§7)**, só com a aprovação do autor | GAME_DESIGN.md §14 põe guerra e diplomacia profunda na Fase 11 |

## 6. Fases

| Fase | O que entrega | Depende de | Motor | Tamanho |
| --- | --- | --- | --- | --- |
| P1 Nomes, fronteiras e toque | Todos os países com nome no globo e o toque que abre a folha do país (identidade) | — | — | G |
| P2 Menu de ações ("Em breve") | Os botões de guerra, transações e as outras ações na folha, sem efeito | P1 | — | P |
| P3 Economia, sociedade e governo | Seções de economia, população e governo, com a comparação com o Brasil | P1 | — | M |
| P4 Matérias-primas, energia e exportações | O que o país produz, o que tem de reserva e o que vende | P3 (mesmo JSON) | — | M |
| P5 Comércio e relação com o Brasil | Comércio bilateral e, nos 6 parceiros, relação, acordo e barreira vindos do jogo | P3. A parte do jogo depende do #65 | só lê | M |
| P6 Folha "Mundo" | Lista de países com busca, filtros e ordem, que também funciona no mapa 2D | P3 (P4 para o filtro por matéria-prima) | — | M |
| P7 Camadas do mundo | Países pintados por indicador no globo | P3, P6 | — | G |

A sequência sugerida é **P1 → P2 → P3 → P4 → P5 → P6 → P7**. A P1 e a P2 juntas já cumprem o pedido imediato: nome, toque e menu. A P5 pode esperar o #65 entrar sem atrasar as outras, porque a parte estática dela (Comex Stat) não depende do R7.

### P1. Nomes, fronteiras e toque

| Item | O que fazer |
| --- | --- |
| Pipeline | `fetch_globe_data.py` baixa o Natural Earth (países com o ponto de vista do Brasil e as capitais). `build_countries.py` gera `countries.json`, `countryIndex.json` (grade RLE de 0,2°, sem o Brasil, que continua com as UFs) e as linhas de fronteira simplificadas, e monta o atlas `countryLabels.png` com a mesma fonte do atlas das UFs. |
| Fronteiras | Uma malha de linhas só (`LineSegments`), numa única chamada de desenho, com no máximo 30 mil vértices depois da simplificação. Não mexe nos tiles (D-P2). Traço cinza-claro translúcido, desenhado antes do mapa de calor das UFs. |
| Nomes | Os rótulos dos países entram no mesmo sistema de colisão das UFs (`labelLayout.ts`). A prioridade é a área. Longe, aparecem os países grandes; perto, aparecem também os pequenos. Um rótulo de UF sempre vence um de país. |
| Toque | Em `GlobeView`, depois do marcador e da UF: `countryIndexAt(lon, lat)` → `onSelectCountry(iso3)`. Microestados que somem na grade (Vaticano, Mônaco, Singapura) são tocáveis pelo rótulo. Tocar no oceano fecha a folha. |
| Destaque | O país selecionado ganha um contorno dourado, como a UF selecionada. |
| Folha do país | `CountrySheet` sobre o globo, com o ✕. A seção **Identidade** traz nome, capital, continente e sub-região, população (Natural Earth), se faz fronteira com o Brasil e a distância de Brasília. As seções das próximas fases aparecem como "Em preparação". |

Territórios como Groenlândia e Guiana Francesa são unidades do Natural Earth. A ficha diz "território da Dinamarca" e "território da França" e mostra os números do país soberano. A França passa a aparecer entre os vizinhos do Brasil, por causa da Guiana Francesa.

Pronto quando:
- todo país tem o nome visível em algum zoom (teste em `labelLayout`);
- tocar em qualquer país abre a ficha certa (teste com Buenos Aires → ARG, Lisboa → PRT, Pretória → ZAF, oceano → nada, Brasília → DF);
- a âncora de todo rótulo cai dentro do próprio país (o script falha se não cair);
- o globo parado não pede quadro novo e o arrasto não perde fluidez (contador de desenvolvimento).

**Feito (branch `feat/paises-p1`):** pipeline em `scripts/data/build_countries.py` (`npm run build:countries`); globo em `src/globe/countries.ts`, `countryGrid.ts`, `countryLabels.ts` e `countryBorders.ts`; folha em `src/components/painel/CountryDetail.tsx` e `countryView.ts`.
- **248 unidades** (as 249 do Natural Earth menos o Brasil). Os nomes entram na mesma colisão das siglas e capitais (`layoutGlobe` com `countries: true`), sempre abaixo de qualquer rótulo de UF, e aparecem a partir do zoom em que o Natural Earth os mostra (`MIN_LABEL`). Um teste centra a câmera em cada país, no zoom mais próximo, e confere que o nome aparece.
- **Atlas de campo de distância:** 248 nomes num RGBA comum pediriam 1024×1024 (4 MiB de GPU). Cada nome virou um campo de distância num só canal (R, G ou B), três nomes por pixel, PNG opaco de 512×1024, sem mipmaps. O shader tira dali o texto cinza-azulado (as UFs seguem em branco) e o contorno escuro.
- **Toque:** marcador → nome de país (caixa do texto + 8 px) → UF → grade de 0,2°. Só São Martinho (França) fica sem célula própria na grade (divide a ilha com a metade holandesa) e é tocado pelo nome.
- **Fronteiras:** 393 polilinhas, 8.719 vértices, uma chamada de desenho. Como as linhas não testam profundidade (o relevo exagerado as cobriria), o shader descarta o lado oculto do globo. O contorno dourado do país selecionado usa o mesmo shader.
- **Folha do país:** nova folha `pais` no Painel, com o título no nome do país. Seção Identidade com situação (país, território de outro país com "Pertence a", soberania em disputa, Antártida), capital, região, população com o ano, fronteira com o Brasil e distância de Brasília; a linha das próximas seções e a fonte. Fecha ao tocar no oceano ou no ✕. Sem partida em andamento, o toque não abre nada (como na UF).
- **Fora do Brasil, só no globo.** O mapa 2D continua só com o Brasil; a lista de países do 2D é a P6.
- **Pendente:** revisar os nomes do Natural Earth um a um (`NAME_FIXES` tem 18 correções), medir no moto g20 o custo dos nomes e das fronteiras, e a decisão D-P1 (Taiwan, Kosovo e Palestina aparecem como "soberania em disputa").

### P2. Menu de ações ("Em breve")

Na folha do país, a seção **Ações** traz os botões em grupos. Todos ficam com aparência de desativado e um selo "Em breve". Tocar num deles abre uma explicação curta do que ele vai fazer (D-P5). **Nada vai para a store nem para o motor.** O catálogo fica em `countryActions.ts`, puro, com id, rótulo, grupo, descrição e base legal.

| Grupo | Ação | O que fará no futuro | Base legal / jogo |
| --- | --- | --- | --- |
| Diplomacia | Visita de Estado | Melhora a relação com o país, gera manchete e gasta uma ação de agenda | CF art. 84, VII |
| Diplomacia | Nota de protesto / convocar o embaixador | Piora a relação e agrada os blocos que pedem firmeza | CF art. 84, VII |
| Diplomacia | Romper ou reatar relações | Corta ou retoma o comércio e os acordos, com custo grande de credibilidade | CF art. 84, VII; art. 4º |
| Diplomacia | Pedir apoio num fórum internacional (ONU, OMC) | Usa a relação para ganhar uma votação ou um painel comercial | — |
| Comércio e transações | **Fazer transação** (contrato de governo a governo) | Compra ou venda de um bem (petróleo, fertilizante, alimento, aeronave) com quantidade, preço e prazo. Mexe no saldo comercial, na inflação e no setor | Tratado ou contrato, com referendo do Congresso quando gerar encargo (CF art. 49, I) |
| Comércio e transações | Missão comercial | Melhora a relação e encurta uma barreira. **O motor já tem essa ação para os 6 parceiros** (R7, `missao_comercial`) | R7 |
| Comércio e transações | Negociar acordo comercial | Rodadas, assinatura e ratificação. **O motor já tem** (R7, `negociar_acordo`) | CF art. 84, VIII; art. 49, I |
| Comércio e transações | Sobretaxa ou barreira | Tarifa sobre o país (o R7 hoje só tem a tarifa média), com risco de retaliação | CF art. 153, §1º |
| Comércio e transações | Crédito à exportação | Financia compras do país ao Brasil. Ajuda a indústria e usa o orçamento | — |
| Cooperação | Cooperação tecnológica | Abre a rota "transferir" da árvore de tecnologia com o parceiro (R7, `technologyPartner`) | R7 |
| Cooperação | Ajuda humanitária | Gasto pequeno, melhora a relação e a imagem | — |
| Defesa | Acordo de defesa / compra de equipamento | Contrato militar com efeito na indústria de defesa e no gasto | CF art. 84, VIII; art. 49, I |
| Defesa | Exercício militar na fronteira | Só para vizinhos. Pressiona o país e tem custo diplomático | — |
| Conflito | Sanções econômicas | Corta o comércio com o país, com efeito no saldo, nos preços e na relação | — |
| Conflito | **Declarar guerra** | Só depois de agressão estrangeira e com autorização ou referendo do Congresso. Exige o sistema de Forças Armadas da Fase 11 (mobilização, gasto, câmbio, risco, aprovação e comércio) | CF art. 84, XIX; art. 49, II; art. 4º, VI e VII |

Pronto quando: todas as ações aparecem como "Em breve" e têm descrição, e um teste garante que nenhuma delas chama a store (o catálogo não tem `dispatch`). O leitor de tela lê "Declarar guerra, em breve".

### P3. Economia, sociedade e governo

| Item | O que fazer |
| --- | --- |
| Dados | O pipeline ganha o Banco Mundial, o FMI, o PNUD e o World Factbook e grava `paises.json` com os metadados de cada valor. Esquema Zod em `src/types/country.ts`. |
| Economia | PIB (US$ e PPC), PIB per capita, crescimento (último ano, média de 5 anos e projeção do ano do jogo), inflação, desemprego, dívida bruta e conta corrente. Ao lado do PIB: "1,3× o do Brasil". |
| População e sociedade | População e crescimento, urbanização, expectativa de vida, IDH, Gini, idiomas oficiais e moeda. |
| Governo | Forma de governo (por exemplo, república presidencialista), cargo do chefe de Estado e do chefe de governo (sem nome) e selos dos blocos de que o país faz parte. |
| Comparar com o Brasil | Um botão põe o Brasil ao lado de cada número, com a mesma fonte e o mesmo ano (D-P4). |

Pronto quando: todo número da ficha mostra ano e fonte num toque, valor faltante aparece como "sem dado", nunca como zero, e a projeção do ano do jogo tem teste (ano dentro, depois de 2031 e sem projeção).

### P4. Matérias-primas, energia e exportações

| Item | O que fazer |
| --- | --- |
| Recursos e matérias-primas | Até 6 produtos em que o país pesa no mundo, com a posição e a fatia: "2º maior produtor de cobre (10% do mundo)". Reservas de petróleo, gás e minérios quando houver. Dados do USGS, da EIA e da FAO. |
| Energia | Matriz elétrica (fóssil, hídrica, nuclear, eólica e solar) e se o país exporta ou importa energia. |
| Exportações e importações | Total e % do PIB, os 5 principais produtos vendidos e comprados (seções do Sistema Harmonizado) e os 5 principais destinos, pela base BACI. |

Pronto quando: os rankings batem com a fonte em 5 países conferidos à mão (por exemplo, Chile e cobre, Arábia Saudita e petróleo, Austrália e minério de ferro) e todo produto tem unidade.

### P5. Comércio e relação com o Brasil

| Item | O que fazer |
| --- | --- |
| Comércio bilateral | O que o Brasil vende e compra do país, o saldo, a posição dele entre os parceiros do Brasil e os 3 principais produtos em cada sentido (Comex Stat). Também os acordos que existem de verdade (Mercosul, ALADI, Mercosul–UE e outros), como fato, sem simular. |
| No jogo | Se o país pertence a um dos 6 parceiros do R7 (por exemplo, França → União Europeia, Paraguai → Mercosul), a ficha mostra a relação de −100 a 100 com texto ("boa"), o acesso, o acordo e a barreira, lendo o `tradeView`. Os outros países mostram "sem relação simulada nesta versão". O vínculo entre país e parceiro fica em `paises.json`. |

Sem o #65 integrado, a fase entrega só o comércio bilateral, e a parte "No jogo" vira um PR pequeno depois.

Pronto quando: a relação da ficha é a mesma do cartão Comércio exterior no Gabinete, em todo parceiro, e o país de um bloco mostra o nome do bloco ("relação do Brasil com a União Europeia").

### P6. Folha "Mundo"

| Item | O que fazer |
| --- | --- |
| Folha | Botão novo no trilho direito ("o país" → "o mundo"), com a lista de todos os países. |
| Busca e filtros | Busca pelo nome, filtros por continente, bloco, vizinho do Brasil e matéria-prima ("quem produz lítio?") e ordem por PIB, crescimento, população ou comércio com o Brasil. |
| Ir até o país | No globo, tocar na linha faz a câmera voar até o país (`controller.flyTo`) e abre a ficha. No Essencial 2D, que não tem o mundo, abre só a ficha. |

Pronto quando: todo país da P1 está na lista, o filtro por matéria-prima usa os mesmos dados da P4 e a folha funciona nos dois perfis 2D.

### P7. Camadas do mundo

| Item | O que fazer |
| --- | --- |
| Camadas | Na folha Camadas do mapa, um grupo "Mundo": crescimento, PIB per capita, comércio com o Brasil, matéria-prima escolhida e relação (só os 6 parceiros). A cor vem do shader do globo base, por uma textura de índice nova (gerada pelo mesmo `build_countries.py`), numa paleta de 256 cores por camada, refeita só quando a camada muda. |
| Legenda e lista | A legenda fica na mesma folha. A folha Mundo passa a ordenar pela camada ativa, para a informação não depender da cor. |

O Brasil continua com as camadas das UFs. As do mundo pintam só os outros países.

Pronto quando: a cor de cada país bate com a posição dele na lista ordenada, a troca de camada não cria textura nova (só atualiza a paleta) e a memória nova fica abaixo de 2 MB.

## 7. Depois deste plano (não implementar sem aprovação)

Estes passos dão efeito às ações da P2. Todos mexem no motor ou na jogabilidade e ficam fora deste plano.

| Passo | O que é | Motor |
| --- | --- | --- |
| F1 | Missão comercial, acordo e cooperação tecnológica acionados pela ficha, para os 6 parceiros | Não. As ações já existem no R7: a ficha só as poria na agenda |
| F2 | Relação com cada país (não só com os 6 parceiros), com memória e efeito no comércio | Sim: `DiplomacyState` novo |
| F3 | Transações de governo a governo, com preço, prazo e efeito no saldo e nos setores | Sim |
| F4 | Sobretaxa e sanções por país, com retaliação | Sim: estende a tarifa do R7 |
| F5 | Forças Armadas, defesa e guerra | Sim, na Fase 11 (GAME_DESIGN.md §14) |
| F6 | O mundo reage ao jogo (a economia dos outros países responde a choques e acordos) | Sim |

## 8. Decisões em aberto

| Id | Pergunta | Proposta | Bloqueia |
| --- | --- | --- | --- |
| D-P1 | Fronteiras e nomes de territórios disputados (Taiwan, Palestina, Kosovo, Saara Ocidental) | Seguir o ponto de vista do Brasil do Natural Earth, que reflete o reconhecimento oficial brasileiro | P1 |
| D-P2 | Fronteiras assadas na textura ou como malha de linhas? | Malha de linhas: assar exigiria regerar os 114 tiles, o que passa de 100 arquivos por PR. O custo é uma chamada de desenho | P1 |
| D-P3 | Bandeiras na ficha? | Não por enquanto. O emoji de bandeira não aparece no Windows, e 200 imagens pesam no app. Fica para depois | P1 |
| D-P4 | Comparar com o Brasil usando os números do jogo ou os da mesma fonte? | Os da mesma fonte e do mesmo ano, para comparar igual com igual. O Brasil "ao vivo" já está no HUD | P3 |
| D-P5 | Os botões "Em breve" podem ser tocados? | Sim: abrem a explicação do que a ação vai fazer, sem efeito | P2 |
| D-P6 | O mundo muda com o tempo? | Só pela projeção do FMI até 2031, calculada na interface, com o selo `ESTIMADO`. O mundo não reage ao jogador até a F6 | P3 |
| D-P7 | Gasto militar na ficha? | Só se a licença do SIPRI permitir uso comercial. Se não permitir, a ficha mostra apenas os fatos públicos: bloco militar e se o país tem arma nuclear | P3 |
| D-P8 | Quais países entram? | Todas as unidades do Natural Earth. Os territórios mostram o país soberano | P1 |
