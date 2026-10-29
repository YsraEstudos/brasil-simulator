# Brasil Simulator — Fontes de Dados

Versão 0.1 do documento • Fase 00 • 13/10/2026 • ✅ Revisado pelo autor em 13/10/2026 (cenário de 2027 com dados reais mais recentes + projeções para fechar 2026; nova versão de cenário a cada atualização)

---

## 1. Princípios

1. **Nenhum número sem origem.** Todo valor de cenário tem status e metadados (§2).
2. **Importação no desenvolvimento, não no jogo.** Os dados são baixados e tratados por scripts do repositório (`scripts/data/`) e gravados como JSON versionado em `src/data/scenarios/`. O aplicativo funciona offline.
3. **Cenários congelados.** Cada cenário publicado tem versão e checksum. Uma atualização de dados gera **nova versão de cenário** e nunca altera campanhas salvas em andamento.
4. **Real, projetado, estimado e fictício são separados** e identificáveis no próprio dado.
5. **Licenças registradas.** Cada fonte tem seus termos de uso anotados antes da primeira importação.
6. **Cenário inicial `brasil-2027-01`** (decisão de 13/10/2026): usa os dados oficiais mais recentes disponíveis (`REAL`) e fecha o restante de 2026 com projeções reconhecidas (Focus, PLOA 2027) marcadas como `PROJETADO`. Quando saírem os dados reais, publica-se nova versão do cenário.

---

## 2. Status e metadados de cada valor

### 2.1 Status
| Status | Significado | Exemplo |
| --- | --- | --- |
| `REAL` | Valor oficial publicado | IPCA de ago/2026 |
| `PROJETADO` | Projeção de fonte reconhecida (ex.: Focus, LDO) | Inflação esperada para 2027 |
| `ESTIMADO` | Calculado pelo projeto a partir de dados reais, com método documentado | PIB de dez/2026 extrapolado do último trimestre |
| `FICTICIO` | Valor de design, sem pretensão de realismo | Popularidade inicial de um personagem |
| `PROVISORIO` | Placeholder do protótipo, deve ser substituído | Parâmetros `A_CALIBRAR` do modelo |

### 2.2 Metadados (esquema Zod em `src/types/data.ts`, Fase 01)
```ts
{
  value: number,
  unit: string,               // ex.: "R$ milhões", "fração"
  status: "REAL" | "PROJETADO" | "ESTIMADO" | "FICTICIO" | "PROVISORIO",
  source?: string,            // id da fonte (§3)
  series?: string,            // código da série/tabela
  referenceDate?: string,     // período a que o dado se refere, ex.: "2026-08"
  retrievedAt?: string,       // data de acesso
  method?: string,            // transformação aplicada, se houver
  note?: string
}
```

---

## 3. Fontes

| id | Fonte | Uso no jogo | Acesso | Licença / termos |
| --- | --- | --- | --- | --- |
| `ibge` | IBGE — SIDRA, Contas Nacionais, PNAD Contínua, Censo 2022, Contas Regionais, projeções populacionais | PIB, setores, população, desemprego, renda, informalidade, dados por UF | API SIDRA (apisidra.ibge.gov.br) e servicodados.ibge.gov.br | Verificar e registrar antes da importação |
| `bcb` | Banco Central — SGS, Focus, Estatísticas Fiscais | Selic, IPCA, câmbio, crédito, dívida (DBGG/DLSP), expectativas | API SGS (api.bcb.gov.br) e Olinda | Dados abertos; verificar termos |
| `tesouro` | Tesouro Nacional — Resultado do Tesouro Nacional, Tesouro Transparente, Siconfi | Receitas, despesas, resultado primário, dívida, transferências a estados | tesourotransparente.gov.br, apidatalake.tesouro.gov.br | Dados abertos; verificar termos |
| `orcamento` | SIOP / Portal da Transparência / LOA e LDO publicadas | Dotações, despesas obrigatórias e discricionárias, emendas | Portal da Transparência (API com cadastro) e textos legais | Verificar termos e necessidade de chave |
| `camara` | Câmara dos Deputados — Dados Abertos | Deputados, partidos, bancadas, proposições, votações, tempos de tramitação | dadosabertos.camara.leg.br | Dados abertos |
| `senado` | Senado Federal — Dados Abertos | Senadores, matérias, votações | legis.senado.leg.br/dadosabertos | Dados abertos |
| `tse` | TSE — Dados Abertos | Eleitorado por UF, resultados de 2022 e 2026, partidos | dadosabertos.tse.jus.br | Dados abertos |
| `ipea` | Ipeadata | Séries históricas longas para calibração | ipeadata.gov.br | Verificar termos |
| `planalto` | Legislação compilada | Regras institucionais (POLITICAL_RULES.md) | planalto.gov.br | Texto legal público |
| `datasus` / `inep` | DataSUS, INEP | Indicadores de saúde e educação (Fase 06) | sites oficiais | Verificar termos |

**R6 — composição etária:** `scripts/data/build_demography.py` consulta o SIDRA, tabela 9514 (Censo 2022, população residente, sexo e forma de declaração totais), valida as faixas e gera `src/data/demography/census2022.json` com URL, data de recuperação, unidade e SHA-256 da resposta. O artefato contém observações de 2022; no cenário principal, suas proporções são aplicadas aos totais do cenário como estimativa inicial, não como observação de 2027. O app não consulta o IBGE em tempo de jogo. A fonte é atribuída; os [termos gerais do portal IBGE](https://www.ibge.gov.br/acesso-informacao/acoes-e-programas/politica-de-privacidade.html) estão identificados, mas as condições específicas de redistribuição da tabela SIDRA ainda precisam ser confirmadas antes de publicação.

### 3.1 Dados geográficos do globo (em uso desde 13/10/2026)

| Dado | Fonte | Uso | Licença / atribuição |
| --- | --- | --- | --- |
| Elevação (tiles Terrarium, zoom 8 no Brasil e 3 no mundo) | AWS Open Data — Terrain Tiles (`elevation-tiles-prod`), compilado de SRTM, GMTED2010, ETOPO1 e outras fontes | Relevo 3D e sombreamento | Aberta; **exige atribuição** às fontes (ver documentação do conjunto) |
| Natural Earth II, 1:50m, relevo sombreado com água | naturalearthdata.com | Textura do globo fora do Brasil | Domínio público |
| Rios e lagos 1:10m | Natural Earth (repositório nvkelso/natural-earth-vector) | Hidrografia nos tiles | Domínio público |
| Biomas 1:250.000 (2019) | IBGE | Cor da vegetação por bioma | Dados públicos do IBGE; citar a fonte |
| Malha das UFs (qualidade máxima) e lista de estados | API de malhas e de localidades do IBGE | Divisas, fronteira, seleção de UF | Dados públicos do IBGE; citar a fonte |

Pipeline: `scripts/data/fetch_globe_data.py` (download para `data-raw/`) → `scripts/data/build_globe.py` (gera `assets/globe/` e `src/globe/data/`). As cores dos biomas são **estilizadas** (status `FICTICIO` quanto à aparência); limites de biomas, UFs, rios e altitudes são `REAL`, com simplificações de escala.

### 3.2 Siglas, capitais e atlas de rótulos do globo (PR 2 do PLANO_GLOBO, 20/10/2026)

| Dado | Fonte | Uso | Status / licença |
| --- | --- | --- | --- |
| Capitais das 27 UFs (`src/globe/data/capitals.json`): nome e coordenadas da sede municipal | IBGE (localidades / sedes municipais), valores de referência públicos digitados em `scripts/data/build_labels.py` com 3 casas decimais (~100 m) | Ponto e nome da capital no globo e no mapa 2D | `PROVISORIO`: conferir contra o arquivo oficial das sedes quando ele entrar no pipeline. O script falha se alguma capital cair fora do polígono da própria UF |
| Âncora de cada sigla (`src/globe/data/labels.json`) | Calculada dos contornos de `ufs.json` (polo de inacessibilidade do maior anel, projeção com escala de longitude por cos(lat)) | Posição da sigla dentro da UF (o centroide cai fora de UFs côncavas) | Derivado; `REAL` quanto à geometria |
| Prioridade e área (`labels.json`) | Prioridade = posto de população por UF em `src/data/scenarios/brasil_2027_01_v070.json`; área aproximada do polígono | Quem vence uma colisão de rótulos | Derivado do cenário (população `ESTIMADO`) |
| Atlas de texto (`assets/globe/labels.png`) | Fonte DejaVu Sans Bold (derivada da Bitstream Vera; licença livre, permite uso e incorporação), lida do pacote `matplotlib`; os glifos entram **rasterizados** no atlas e nenhuma fonte é baixada ou distribuída com o app | 27 siglas + 27 nomes de capital + glifos dos marcadores de eventos e notícias ("!", "≡" e os números 2 … 9 e "9+" do selo de grupo, PR 11), branco com contorno escuro, desenhados em 2x o tamanho lógico | Gerado; sem restrição de uso |

Pipeline: `npm run build:labels` (`scripts/data/build_labels.py`; lê `src/globe/data/ufs.json`, gerado antes por `build_globe.py`). Dependências Python: `matplotlib` fornece a DejaVu Sans Bold; `Pillow` rasteriza os glifos e monta o atlas; `numpy` processa os canais de imagem; `scipy` calcula a transformada de distância usada no contorno do texto. Instale com `pip install matplotlib scipy Pillow numpy`. Determinístico: duas execuções geram arquivos idênticos.

### 3.3 Luzes das cidades à noite (PR 6 do PLANO_GLOBO, 21/10/2026)

| Dado | Fonte | Uso | Status / licença |
| --- | --- | --- | --- |
| 150 maiores municípios (`src/globe/data/cities.json`): nome, UF, coordenadas da sede (lon/lat, 3 casas) e população | Aproximação do Censo 2022 do IBGE (SIDRA, tabela 4709) e das sedes municipais do IBGE, **digitada de memória** em `scripts/data/build_cities.py` (sem download no pipeline), população arredondada ao milhar | Pontos de luz no lado noturno do globo (tamanho/brilho por log da população) e círculos no mapa 2D | `PROVISORIO`: a ordem de grandeza é confiável, mas as populações podem errar por alguns milhares e o corte nos 150 maiores pode trocar municípios de ~200 mil habitantes. O script falha se alguma sede cair fora do polígono da própria UF (tolerância de litoral de 5 km). Conferir contra o arquivo oficial quando o download do Censo/sedes entrar no pipeline. Dado só visual: não entra no motor nem no cenário |

Pipeline: `npm run build:cities` (`scripts/data/build_cities.py`; lê `src/globe/data/ufs.json`, gerado antes por `build_globe.py`). Determinístico. A textura de luzes noturnas (NASA Black Marble, domínio público) citada no plano para o perfil Alto **não** foi adotada neste PR.

### 3.4 Rasters do clima no globo (PR 10 do PLANO_GLOBO, 21/10/2026)

| Dado | Fonte | Uso | Status / licença |
| --- | --- | --- | --- |
| Índice de UF (`src/globe/data/ufIndex.json`, 6,7 KiB): grade 256² (0,1875° ≈ 20 km) sobre a caixa da quadtree, 1 byte por célula (0 = fora do Brasil, 1…27 = `index` de `ufs.json`), RLE | Os mesmos polígonos de UF do IBGE (`data-raw/ibge/uf.geojson`, malha de qualidade máxima) que geram os tiles; amostra central de cada célula (vizinho mais próximo, sem filtro) | Monta, na CPU, a textura de clima 128² uma vez por mês (chuva, seca, nuvem) | Derivado de dado oficial; ID de categoria, nunca interpolado |
| Máscara de água (`assets/globe/climate/water_mask.png`, 2,8 KiB): L8 256², 255 = água ou fora do Brasil, 0 = terra brasileira, com cobertura fracionária nas bordas | Lagos e represas do Natural Earth (`ne_10m_lakes.geojson`, domínio público) + ausência de UF (mar e países vizinhos) | Seca só tinge terra no sombreador dos tiles. Água **nunca** é detectada por cor | Rios não entram (linhas finas demais para 20 km). Resolução de 20 km: bordas de lago ficam suaves |
| Ruído das nuvens (`assets/globe/climate/cloud_noise.png`, 23,7 KiB): L8 256², ladrilhável | Gerado pelo script (4 oitavas de ruído branco gaussiano, semente fixa) | Forma das nuvens (2 leituras por pixel da calota) | Sem fonte externa; determinístico |

Pipeline: `npm run build:globe-climate` (`scripts/data/build_globe_climate.py [--raw data-raw]`; lê só os contornos de UF e os lagos, os mesmos insumos de `build_globe.py`, e **não** regera os tiles). Determinístico. Dado só visual: não entra no motor nem no cenário. O clima em si (chuva e seca por UF) é do motor ([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §5.18–5.19).

### 3.5 Rede ferroviária nacional (R5 do PLANO_EXPANSAO, EX-30, 28/10/2026)

| Dado | Fonte | Uso | Status |
| --- | --- | --- | --- |
| `src/data/railways/rede_ferroviaria.json` (v2026.10.1, situação de dez/2025): 21 corredores, 43 trechos, com uso, bitola, operador, UFs, conexões portuárias, extensão e grau de confiança da situação de cada trecho | Compilação manual a partir de ANTT (Declaração de Rede, relatórios das concessões), Ministério dos Transportes (Plano Nacional de Logística, Novo PAC), governos estaduais e IPHAN; a fonte de cada corredor fica no próprio registro | Camada Ferrovias do mapa (globo e 2D) e folha de lista; o motor não lê | **PROVISORIO**. Não vem de pipeline |

Regras da camada: o traçado é **esquemático** (linhas entre cidades de referência, nunca o eixo da via) e a interface
diz isso ao lado da legenda, com a versão e a data. Extensão só aparece quando a fonte a declara; sem ela, "extensão
sem dado consolidado" ou "≥ N km (só trechos com dado)". Cada trecho tem confiança `alta`, `media` ou `baixa`;
`baixa` é mostrada como "situação a confirmar". Corredor sem trecho em operação ou em obra não tem operador. Antes de
tratar a rede como dado oficial, substituir por pipeline a partir da base georreferenciada da ANTT e subir a versão.

### 3.6 Educação por coorte (R5 do PLANO_EXPANSAO, EX-19, 28/10/2026)

| Dado | Fonte | Uso | Status |
| --- | --- | --- | --- |
| Coorte de entrada, duração, evasão e transição por etapa; saída da força de trabalho | Ordens de grandeza arredondadas do Censo Escolar/INEP e da PNAD Contínua/IBGE | `EDUCATION_PARAMS` (`src/engine/education/calibration.ts`) | **PROVISORIO** |
| Aprendizagem de base (fração com proficiência adequada) | Ordem de grandeza do Saeb e do Enade/INEP | idem | **PROVISORIO** |
| Elasticidade do PIB potencial a anos de estudo (0,06) | Retorno de Mincer ~10% × participação do trabalho ~0,6 | idem | **PROVISORIO**: hipótese causal, não estimativa |

O estado inicial é o **estacionário** das taxas de base, não a matrícula observada: os estoques ficam na ordem de
grandeza do país (≈23 mi no fundamental, ≈120 mi na força de trabalho, ≈10,7 anos de estudo), mas não reproduzem o
Censo Escolar. A coorte de entrada é constante até existir demografia (EX-22). Antes de tratar como dado, trocar por
pipeline do INEP com coortes reais e calibrar o estacionário contra elas.

> **Códigos de séries:** serão levantados e conferidos na Fase 01/03. Nenhum código deve ser usado sem validação da resposta da API, porque séries são descontinuadas ou renumeradas.

---

## 4. Variáveis necessárias para o cenário jan/2027

O cenário parte do **último dado oficial disponível** na data de congelamento e completa o intervalo até dez/2026 com `ESTIMADO` ou `PROJETADO`.

### 4.1 Protótipo (0.1)
| Variável | Fonte planejada | Status esperado |
| --- | --- | --- |
| PIB nominal e real (últimos 4 trimestres) | `ibge` Contas Nacionais Trimestrais | REAL + ESTIMADO para o 4º tri/2026 |
| IPCA mensal e 12 meses | `ibge` / `bcb` | REAL |
| Expectativa de inflação 12m | `bcb` Focus | PROJETADO |
| Selic meta e calendário do Copom 2027 | `bcb` | REAL / calendário oficial |
| Câmbio R$/US$ | `bcb` PTAX | REAL |
| Taxa de desocupação | `ibge` PNAD Contínua | REAL |
| Resultado primário 12m | `tesouro` RTN / `bcb` | REAL |
| Dívida bruta (DBGG) % PIB | `bcb` | REAL |
| Receitas por grupo e despesas por grupo | `tesouro` RTN | REAL |
| LOA 2027 (totais por grupo) | `orcamento` | REAL, se publicada; senão PROJETADO a partir do PLOA |
| Meta de primário 2027 e limite de despesas | LDO 2027 | REAL |
| Composição do Congresso por blocos | `tse` resultados 2026 + agregação do projeto | REAL (cadeiras) + ESTIMADO (classificação em blocos) |
| Aprovação inicial do presidente fictício | — | FICTICIO |
| Parâmetros do modelo | ECONOMIC_MODEL.md §6 | PROVISORIO → ESTIMADO após calibração |

### 4.2 Alpha (0.5) em diante
PIB, população, renda e emprego por UF; transferências constitucionais por UF; indicadores sociais; setores; distribuição de renda por quintis; séries para calibração (2003–2026).

**Fase 05 (cenário v0.4.0):** entraram, por UF, população (Censo 2022), participação no PIB e peso de agropecuária, extrativa, demais indústrias e serviços (Contas Regionais), desemprego (PNAD Contínua) e pobreza (Síntese de Indicadores Sociais), todos `PROVISORIO` (ordens de grandeza arredondadas, a importar pelo pipeline), e os governadores, `FICTICIO`. Cada série tem um bloco de metadados (`regions.meta`, esquema `dataSeriesSchema` em `src/types/data.ts`), porque os 27 números de uma coluna têm a mesma origem e o mesmo status. Ainda faltam: FPE/FPM e transferências por UF, finanças estaduais e séries históricas por UF para calibrar as sensibilidades setoriais.

**PR 4 do PLANO_GLOBO (cenário v0.8.0):** entra, por UF, a **inclinação política** `lean: { economic, social }` (eixos −1…1, os mesmos de `Bloc.ideology` e `Policy.position`), com metadados em `regions.meta.lean`, `PROVISORIO`. **Origem e método:** aproximação de design, arredondada a 0,05 — não é importação nem estimativa estatística. Segue o padrão regional agregado dos segundos turnos das últimas eleições presidenciais (TSE, resultados agregados por UF; o jogo não usa nenhum partido nem pessoa) e o que pesquisas de opinião mostram sobre o papel do Estado na economia e sobre costumes: Nordeste mais estatista (econômico −0,25 a −0,50), Sul e Centro-Oeste mais mercado e conservadores (econômico +0,35 a +0,55; social +0,2 a +0,5), Norte misto (AM, PA e AP perto do centro; RO, AC e RR no polo de mercado e conservador), Sudeste intermediário (SP mais mercado, MG perto do centro). Os valores ficam entre −0,5 e +0,55 e o **eleitor mediano** (média ponderada pela população) em cerca de 0,08 (econômico) e 0,14 (social). Servem só para o alinhamento de cada UF com o perfil ideológico do governo ([POLITICAL_RULES.md](POLITICAL_RULES.md) §11.2); a v0.7.0 e as anteriores não têm a série. **Pendente:** importar a série real (resultados do TSE por UF e pesquisas de opinião) pelo pipeline, com o status `ESTIMADO`, em nova versão do cenário.

**PR 12 do PLANO_GLOBO (mapa eleitoral): eleitorado por UF ausente.** O cenário não traz eleitores aptos por UF (TSE, estatísticas do eleitorado) nem a parcela adulta da população. Enquanto isso, o resultado simulado por UF e a intenção estimada pesam as UFs pela **população total** (`PROVISORIO`, `electorateWeights` em `src/engine/elections/regionalResult.ts`), a mesma ponderação da aprovação regional. A diferença para o eleitorado real é de poucos pontos (estados mais jovens, como os do Norte, têm menos eleitores por habitante). **Pendente:** importar o eleitorado apto por UF (TSE) em nova versão do cenário e trocar a função de pesos.

### 4.3 Climatologia (PR 7 do PLANO_GLOBO, 21/10/2026)

Conteúdo **compartilhado** por todos os cenários (`src/data/climate/climatologia.json`, gerado por `npm run build:climate` = `scripts/data/build_climatology.py`; esquema Zod `src/types/climate.ts`). Fica fora do cenário porque a climatologia do país não depende da versão do cenário e cenários publicados não se alteram. Os dois blocos têm `meta` (`dataSeriesSchema`) e status `PROVISORIO`.

| Dado | Alvo / fonte de referência | O que foi feito de fato | Status |
| --- | --- | --- | --- |
| Normais de chuva por UF × mês (mm), `rain.ufs[].mm` | Normais Climatológicas 1991–2020 do INMET (precipitação acumulada mensal), agregadas por UF | **Não importadas.** Sem acesso de rede no pipeline, os 27 × 12 valores foram **digitados** a partir do conhecimento público da climatologia (totais típicos de capitais e do interior de cada estado e o regime sazonal de cada região), arredondados a 5 mm. Podem errar dezenas de mm num mês e ~10–15% no total anual. O que o jogo usa é o regime (quando e quanto chove) e a ordem de grandeza. | `PROVISORIO` |
| Teleconexão ENSO por macrorregião × estação (5 × 4), `enso.teleconnection` | Sinais gerais da literatura (CPTEC/INPE e NOAA/CPC sobre os impactos de El Niño e La Niña no Brasil) | Coeficientes de **design**: anomalia de chuva, em fração da normal, para ENSO = +1 (El Niño forte); La Niña inverte o sinal (simplificação linear e simétrica). Magnitudes entre 0 e 0,25; o sinal mais forte é o do Sul na primavera (+0,25), seguido do Nordeste no outono (−0,20). Não há fonte estatística para magnitudes por UF × mês; por isso 20 coeficientes, não 324. | `PROVISORIO` |

O script **valida** antes de gravar (falha se alguma checagem quebrar): 27 UFs × 12 meses, todos positivos; total anual dentro de uma faixa plausível por macrorregião (Norte 1.500–3.000 mm, Nordeste 700–1.700, Centro-Oeste 1.200–1.900, Sudeste 1.100–1.600, Sul 1.400–1.900); regimes (Amazônia chuvosa de dez a mai, semiárido do Nordeste seco de set a nov, Brasil Central chuvoso no verão e seco no inverno, Sul sem estação seca, Roraima com chuvas de mai a ago); sinais mínimos da teleconexão (El Niño seca Norte e Nordeste no outono e molha o Sul na primavera). Determinístico. **Pendente:** importar as Normais do INMET (e conferir as magnitudes de teleconexão com a literatura) pelo pipeline, em nova versão da climatologia com status `ESTIMADO`.

**Território das obras de prevenção (PR 13).** O `regional.scope` do projeto `projeto_seguranca_hidrica` lista os nove estados com municípios no Semiárido brasileiro (PI, CE, RN, PB, PE, AL, SE, BA e o norte de MG), a delimitação oficial da Sudene/Ministério da Integração (Resolução CONDEL 150/2021 e anteriores) em nível de **UF** — o jogo não distribui nada abaixo da UF, então MG e BA entram inteiras no escopo da obra mesmo que só parte do território seja semiárido. `PROVISORIO`; **conferir a lista contra a resolução vigente** antes de publicar o cenário. Forças, custos e prazos dos três programas de prevenção (`prevention` em `src/data/policies/`) são `PROVISORIO` (critério de jogo; custos por ordem de grandeza de obras hídricas e de drenagem recentes) e estão em [CALIBRATION.md](CALIBRATION.md).

---

## 5. Pipeline de dados

```
scripts/data/
├── fetch/          # baixa dados brutos → data-raw/ (fora do bundle do app, ignorado pelo git se for grande)
├── transform/      # limpa, agrega, converte unidades, aplica métodos documentados
├── build-scenario.ts   # monta src/data/scenarios/<id>/<versao>.json + checksum
└── validate.ts     # valida com Zod; falha se houver valor sem status ou metadados
```

- Scripts executados manualmente pelo desenvolvedor, nunca pelo aplicativo.
- Cada build de cenário gera um `MANIFEST.md` com fontes, datas de acesso e diferenças em relação à versão anterior.

---

## 5.1 Dados da Fase 06

O cenário `brasil_2027_01_v050` v0.5.0 herda os dados iniciais da v0.4.0 sem
alterá-la e adiciona 32 políticas com números `PROVISORIO`. Ele tem ID próprio
para que um save não receba silenciosamente o catálogo novo. As dez políticas
publicadas anteriormente permanecem inalteradas.

Participações setoriais, rendas relativas dos quintis, linha de pobreza,
incidências, custos, prazos e riscos de execução são calibração de jogo,
documentada em [SOCIETY.md](SOCIETY.md), [POLICIES.md](POLICIES.md) e
[PUBLIC_POLICIES.md](PUBLIC_POLICIES.md). Não houve importação de novas séries
oficiais nem validação jurídica adicional. A existência de um setor ou programa
no catálogo não representa uma projeção para janeiro/2027.

## 5.2 Dados da Fase 07

O cenário `brasil_2027_01_v060` v0.6.0 herda os números da v0.5.0 e acrescenta
apenas o elenco de personagens, todo `FICTICIO`: nomes, papéis e blocos são
fictícios e não correspondem a pessoas reais, eleitas ou em cargo em 2026
(GAME_DESIGN.md §13). O prestígio inicial (`initialStanding`) é de design.

Os 37 eventos da Fase 07 (`src/data/events/fase07_*.json`) são `FICTICIO` quanto
aos casos, às manchetes e aos personagens. Seus números de gatilho, probabilidade,
prazo e efeito são `PROVISORIO`, sem fonte de dados oficial: são calibração de
jogo, sujeita à revisão do autor e às campanhas-robô de
[ROADMAP.md](ROADMAP.md) §8.2. Eventos de impeachment, CPI e TCU são ficção
institucional simplificada (POLITICAL_RULES.md §9–§10); não reproduzem o rito
real nem prazos de tramitação.

Nenhum dado de notícia ou de evento vem de rede: o jogo gera as manchetes a
partir do estado (GAME_DESIGN.md §11.3.1).

## 6. Registro de verificações jurídicas e de dados

| Data | Item | Fonte consultada | Resultado | Responsável |
| --- | --- | --- | --- | --- |
| 13/10/2026 | Regime Fiscal Sustentável (70%/50%, banda 0,6–2,5%, pacote dez/2024, PEC 66/2023) | Senado — Limites LC 200/2023; Consultoria de Orçamento da Câmara (Estudo 26/2025); IFI RAF 103 | Regra confirmada; precatórios instáveis (parâmetro) | Claude (pesquisa web) |
| 13/10/2026 | Piso da saúde 15% RCL | Relatório da LOA 2026 / imprensa especializada | Confirmado (R$ 254,9 bi em 2026) | Claude (pesquisa web) |
| 13/10/2026 | Emendas impositivas 2% + 1% RCL, LC 210/2024 | EC 126/2022, EC 100/2019, Portaria GM/MS 10.297/2026 | Confirmado; parcela de bancada 2027 a reconferir na LDO | Claude (pesquisa web) |
| 13/10/2026 | Salário mínimo (Lei 15.077/2024) | Imprensa (valor 2026 R$ 1.621; PLOA 2027) | Confirmado | Claude (pesquisa web) |
| 13/10/2026 | IRPF (Lei 15.270/2025) | Imprensa e guias tributários | Confirmado: isenção até R$ 5 mil desde jan/2026, imposto mínimo acima de R$ 600 mil/ano | Claude (pesquisa web) |
| 13/10/2026 | Reforma tributária 2027 (CBS, IPI, IBS, IS) | Guias tributários e imprensa (fontes secundárias) | Confirmado em linhas gerais; reconferir LC 214/2025 compilada (LC 227/2026) na Fase 03 | Claude (pesquisa web) |
| 13/10/2026 | Reeleição (PEC 12/2022) | Imprensa (CCJ do Senado, mai/2025) | Regra atual mantida; PEC não aprovada em plenário | Claude (pesquisa web) |
| 13/10/2026 | Aprovação de diretores do BC e ministros do STF; condutas vedadas | CF arts. 52 e 101; Lei 9.504/1997 art. 73 | Confirmado pelo texto legal | Claude |
| 13/10/2026 | Mandatos da diretoria do BC (LC 179/2021 art. 4º) | Texto da lei (Planalto/Câmara) e Agência Senado | Confirmado: presidente do BC a partir de 1º/jan do 3º ano do mandato presidencial; diretores 2 a 2, em 1º/mar do 1º ano e 1º/jan do 2º, 3º e 4º anos. O motor usa anos-calendário (2, 4, 7 e 9 de 9). Alterações posteriores da lei não verificadas | Claude (pesquisa web) |
| 13/10/2026 | Cenário `brasil_2027_01` v0.2.0 | — | Estrutura fiscal (receitas por grupo, repartição, despesas por grupo), câmbio, prêmio de risco, juro externo e PIB de 2025 entram como `PROVISORIO` (ordens de grandeza do RTN 2024–2025); valores da v0.1.0 inalterados. Saves gravados com a v0.1.0 continuam carregando (o estado é atualizado pelo motor) | Claude |
| 13/10/2026 | Cenário `brasil_2027_01` v0.3.0 | — | Entram as instituições: o bloco Centro preside Câmara e Senado (`FICTICIO`, coerente com o bloco de maior bancada no centro) e 11 ministérios com áreas e pesos de jogo (`FICTICIO`), todos começando com quadro técnico. Entra a política "Reforma da previdência (parâmetros)" com economia crescente de R$ 10, 25 e 45 bi/ano após 1, 3 e 6 anos (`PROVISORIO`; ordem de grandeza menor que a da EC 103/2019, por ser uma reforma de parâmetros sobre o sistema já reformado). Valores da v0.2.0 inalterados |
| 13/10/2026 | Cenário `brasil_2027_01` v0.4.0 | — | Entram as 27 UFs (`regions`): população, participação no PIB, setores, desemprego e pobreza como `PROVISORIO` (ordens de grandeza do IBGE, arredondadas; participações somam 1, setores somam 1 por UF) e 27 governadores fictícios com bloco e relação inicial (`FICTICIO`, sem relação com os eleitos em 2026). Valores da v0.3.0 inalterados; saves com estado v4 são atualizados e a distribuição regional parte do cenário no primeiro mês jogado | Claude | Claude |
| 16/10/2026 | Cenário `brasil_2027_01_v060` v0.6.0 (Fase 07) | — | Herda a v0.5.0 sem alterá-la. Entra o elenco de 12 personagens (`characters`, `FICTICIO`, nomes e papéis fictícios, prestígio inicial de −40 a 40). Os 37 eventos novos da Fase 07 têm `onlyScenarios` restrito a este cenário e `FICTICIO` (casos e personagens); gatilhos, probabilidades, prazos e efeitos são `PROVISORIO`. Cenários v0.4.0 e v0.5.0 inalterados | Claude | Claude |
| 20/10/2026 | Cenário `brasil_2027_01_v080` (PR 4 do PLANO_GLOBO) | — | Herda a v0.7.0 sem alterá-la (verificado por teste: só mudam `id`, `version` e a inclinação). Entra a inclinação política das 27 UFs (`regions.ufs[].lean`, `regions.meta.lean`), `PROVISORIO`, aproximação de design a partir do padrão regional agregado das últimas eleições presidenciais (§4.2); sem partidos nem pessoas reais. Vira o cenário padrão de novas partidas; os eventos da Fase 07 passam a valer também nele (`onlyScenarios`). Saves em andamento nos cenários anteriores seguem iguais: o perfil do governo (neutro 0/0) não age sem inclinação | Claude |
| 17/10/2026 | Cenário `brasil_2027_01_v070`: participação no PIB das UFs recalibrada | PIB per capita por UF (Contas Regionais do IBGE) ponderado pela população do Censo 2022 do cenário | `PROVISORIO`; substitui as ordens de grandeza arredondadas da v0.4.0 — o ranking por renda segue o IBGE (DF 2,4× a MA 0,4× a média, mesmo per capita relativo = Brasil 1). Demais campos inalterados; saves em andamento mantêm as participações antigas, novas partidas usam a série recalibrada | OpenCode |

| 21/10/2026 | Climatologia compartilhada `climatologia_br` v0.1.0 (PR 7 do PLANO_GLOBO) | — | Entram as normais de chuva por UF × mês e a teleconexão ENSO por macrorregião × estação (§4.3), `PROVISORIO`, digitadas a partir do conhecimento público (INMET e CPTEC/NOAA como alvo de referência, sem importação). Nenhum cenário foi alterado; nenhum resultado de simulação muda (o motor ainda não lê o clima) | Claude |
| 22/10/2026 | Cenário `brasil_2027_01_v080`: políticas de prevenção (PR 13 do PLANO_GLOBO) | — | Entram `projeto_seguranca_hidrica`, `projeto_drenagem_contencao` e `rotina_defesa_civil` na lista de políticas **só do v0.8.0** (os cenários publicados não mudam; verificado por teste). Valores `PROVISORIO`; território do projeto hídrico em nível de UF (ver §4.3). Nenhuma outra parte do cenário muda | Claude |

| 27/10/2026 | Base da vitória e desempate (CF art. 77) — [PLANO_CAMPANHA.md](PLANO_CAMPANHA.md) §8 | [CF, texto compilado](https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm), consulta 27/10/2026 | Confirmado: 1º turno no primeiro domingo e 2º turno no último domingo de outubro (redação da EC 16/1997); eleito no 1º turno quem tem maioria absoluta dos votos, sem brancos e nulos (§2); 2º turno entre os dois mais votados, vence a maioria dos válidos (§3); desistência ou impedimento antes do 2º turno chama o próximo mais votado (§4); empate no 2º lugar: o mais idoso (§5). Simplificação proposta: brancos e nulos fora dos válidos; o §4 não é modelado no M1 | Claude (pesquisa web) |
| 27/10/2026 | Posse (CF art. 82, EC 111/2021) | [CF](https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm), consulta 27/10/2026 | Confirmado: mandato de 4 anos a partir de 5 de janeiro do ano seguinte à eleição. O jogo não modela o dia (o turno de jan/2027 é a posse) | Claude (pesquisa web) |
| 27/10/2026 | Reeleição (CF art. 14 §5º) | [CF](https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm), consulta 27/10/2026 | Confirmado: um único período subsequente (EC 16/1997). PEC 12/2022: situação do registro de 13/10/2026, não reconferida | Claude (pesquisa web) |
| 27/10/2026 | Inabilitação no impeachment (CF art. 52, parágrafo único) | [CF](https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm), consulta 27/10/2026 | Confirmado: condenação por 2/3 do Senado; perda do cargo com inabilitação por 8 anos para função pública | Claude (pesquisa web) |
| 27/10/2026 | Calendário 2026 (Lei 9.504/1997 arts. 8º e 36; CF art. 77) | [Lei 9.504/1997](https://www.planalto.gov.br/ccivil_03/leis/l9504.htm); [Agência Senado, calendário de 2026](https://www12.senado.leg.br/noticias/infomaterias/2026/03/confira-datas-e-prazos-do-calendario-eleitoral-de-2026); [TRE-SP, calendário resumido](https://www.tre-sp.jus.br/eleicoes/eleicoes-2026/arquivos/calendario-eleitoral-2026-versao-resumida), consulta 27/10/2026 | Confirmado: convenções de 20/7 a 5/8 (art. 8º, Lei 13.165/2015); registro até 15/8; propaganda depois de 15/8, ou seja, a partir de 16/8 (art. 36); 1º turno em 4/10/2026; 2º turno em 25/10/2026. A resolução do calendário (citada pela imprensa como Res. TSE 23.760/2026) não foi lida na íntegra. Fecha a tabela de turnos do PLANO_CAMPANHA §2.4: campanha oficial a partir do turno de ago/2026 | Claude (pesquisa web) |
| 27/10/2026 | HGPE (Lei 9.504/1997 art. 47) | [Lei 9.504/1997](https://www.planalto.gov.br/ccivil_03/leis/l9504.htm), consulta 27/10/2026 | Confirmado: 35 dias anteriores à antevéspera da eleição (Lei 13.165/2015); presidente às terças, quintas e sábados; divisão de 90% pela bancada na Câmara (nas coligações majoritárias, só os seis maiores partidos; Lei 14.211/2021) e de 10% em partes iguais. Os minutos por bloco não foram transcritos | Claude (pesquisa web) |
| 27/10/2026 | FEFC (Lei 9.504/1997 arts. 16-C e 16-D) e valor de 2026 | [Lei 9.504/1997](https://www.planalto.gov.br/ccivil_03/leis/l9504.htm); [Poder360, CMO aprova R$ 4,9 bi](https://www.poder360.com.br/poder-congresso/cmo-aprova-aumento-do-fundao-eleitoral-para-r-49-bilhoes/), consulta 27/10/2026 | Regra confirmada na lei: distribuição de 2% igualitária, 35% pelos votos dos partidos com deputado, 48% pelas bancadas na Câmara e 15% pelas do Senado. Valor de 2026: **cerca de R$ 4,9 bilhões, pela imprensa** (a CMO aprovou em set/2025); o valor da LOA 2026 sancionada não foi lido. `PROVISORIO` | Claude (pesquisa web) |
| 27/10/2026 | Limite de gastos para presidente (Lei 9.504/1997 art. 18) | [Lei 9.504/1997](https://www.planalto.gov.br/ccivil_03/leis/l9504.htm); [Poder360, R$ 133 milhões](https://www.poder360.com.br/poder-eleicoes-2026/tse-fixa-limite-de-r-133-milhoes-para-campanha-presidencial-em-2026/); [Conjur](https://www.conjur.com.br/?p=916115), consulta 27/10/2026 | Pela lei, os limites são definidos em lei e divulgados pelo TSE (Lei 13.488/2017). Valores de 2026 **pela imprensa**: R$ 88,9 milhões no 1º turno e mais R$ 44,4 milhões no 2º, cerca de R$ 133,3 milhões no total, iguais aos de 2022 (Portaria TSE 449/2026, que não foi lida). Excesso: multa de 100% do excedente. `PROVISORIO` | Claude (pesquisa web) |
| 27/10/2026 | Autofinanciamento e doação de pessoa física (Lei 9.504/1997 art. 23) | [Lei 9.504/1997](https://www.planalto.gov.br/ccivil_03/leis/l9504.htm), consulta 27/10/2026 | Confirmado: pessoa física doa até 10% dos rendimentos brutos do ano anterior (§1º, Lei 13.165/2015); o candidato usa recursos próprios até 10% do limite de gastos do cargo (§2º-A, Lei 13.878/2019) | Claude (pesquisa web) |
| 27/10/2026 | Doação de empresa | ADI 4650 (STF, set/2015); Lei 13.165/2015 | Proibida, pelo conhecimento público; acórdão e dispositivos revogados **não reconferidos** na fonte primária. Não muda o design: a doação de empresa não existe no jogo | Claude |
| 27/10/2026 | Cassação e inelegibilidade (LC 64/1990 arts. 1º, I, d, e 22, XIV; LC 135/2010) | [LC 64/1990](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp64.htm), consulta 27/10/2026 | Confirmado: a investigação judicial por abuso do poder econômico leva à cassação do registro ou diploma e à inelegibilidade por 8 anos (redação da LC 135/2010; antes eram 3 anos). Basta decisão de órgão colegiado | Claude (pesquisa web) |
| 27/10/2026 | Condutas vedadas (Lei 9.504/1997 art. 73, VI e §10) | [Lei 9.504/1997](https://www.planalto.gov.br/ccivil_03/leis/l9504.htm), consulta 27/10/2026 | Confirmado: as vedações do inciso VI valem nos três meses antes do pleito; o §10 (Lei 11.300/2006) proíbe distribuir bens, valores ou benefícios de graça **no ano** da eleição. O motor aplica o §10 só nos 3 meses antes do pleito ([POLITICAL_RULES.md](POLITICAL_RULES.md) §11) | Claude (pesquisa web) |
| 27/10/2026 | Comparecimento, brancos e nulos (ordens de grandeza) | Totalização do TSE do 1º turno de 2022, pela imprensa ([Metrópoles](https://www.metropoles.com/brasil/eleicoes-2022/primeiro-turno-das-eleicoes-de-2022-tem-2089-de-abstencoes); [CUT](https://www.cut.org.br/noticias/total-de-abstencoes-caiu-de-20-95-para-20-59-entre-o-1-e-o-2-turno-da-eleicao-1f2f)), consulta 27/10/2026 | 1º turno de 2022 para presidente: comparecimento de 79,05% (abstenção de 20,95%), nulos de 2,82% e brancos de 1,59%. No 2º turno, abstenção de 20,59%. Servem só como ordem de grandeza para calibração, `PROVISORIO`; o painel de estatísticas do TSE não foi consultado | Claude (pesquisa web) |
| 27/10/2026 | Custos de campanha (prestações de contas do TSE) | — | **Não verificado**: fica para a Fase C3, com o DivulgaCandContas | — |

### Complemento da pesquisa da Fase C3 — 27/10/2026

- [TSE, FEFC 2026](https://www.tse.jus.br/eleicoes/eleicoes-2026-content/prestacao-de-contas/fundo-especial-de-financiamento-de-campanha-fefc): montante de R$ 4.961.519.777,00; o repasse aos candidatos depende dos critérios do partido. Consulta em 27/10/2026, Codex. O valor total não é o repasse do jogador; os repasses de jogo continuam `FICTICIO`.
- [TSE, Resolução 23.766/2026](https://www.tse.jus.br/legislacao/compilada/res/2026/resolucao-no-23-766-de-1o-de-julho-de-2026), art. 1º e §1º: teto de 2022 para 2026 e acréscimo de 50% do teto do primeiro turno se houver segundo turno. [Portaria 449/2026](https://www.tse.jus.br/legislacao/compilada/prt/2026/portaria-no-449-de-20-de-julho-de-2026), art. 1º: divulga valores no anexo. Consulta em 27/10/2026, Codex; o anexo retornou HTTP 403 e os valores exatos ainda não foram verificados na fonte primária.
- [TSE, limites de campanha de 2022](https://www.tse.jus.br/comunicacao/noticias/2022/Julho/eleicoes-2022-tse-divulga-limites-de-gastos-nas-campanhas): o teto presidencial do primeiro turno era R$ 88.944.030,80. Combinado com a Resolução 23.766/2026, que preserva os limites de 2022, isso fundamenta uma aproximação `PROVISORIO` de R$ 88.944 mil no jogo, truncada conservadoramente em R$ 30,80 pela unidade de R$ mil. Consulta em 27/10/2026, Codex. A regra de acréscimo no segundo turno não está simulada porque o desfecho eleitoral é da C5; o anexo da Portaria 449/2026 não foi acessado diretamente.
- [STF, ADI 4650](https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=300015): o tribunal declarou inconstitucional a autorização de doações de pessoas jurídicas a campanhas e partidos. Consulta em 27/10/2026, Codex; não inserir doação empresarial como receita legal.
- [TSE, dados abertos de prestação de contas de 2026](https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-2026): há arquivos de receitas e despesas. Consulta em 27/10/2026, Codex; os arquivos não foram analisados e não fundamentam custos específicos. Custos de jogo continuam `FICTICIO`.
Itens marcados com ⚠ em [POLITICAL_RULES.md](POLITICAL_RULES.md) devem ser registrados aqui quando verificados.

---

## 7. Avisos públicos
- O jogo deve exibir na tela "Sobre" e na descrição da loja: fontes utilizadas, data de referência dos dados e o aviso de que se trata de **simulação fictícia sem afiliação governamental**.
- Logotipos e marcas de órgãos públicos não são usados.
