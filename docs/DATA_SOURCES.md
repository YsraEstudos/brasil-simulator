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

### 3.1 Dados geográficos do globo (em uso desde 13/10/2026)

| Dado | Fonte | Uso | Licença / atribuição |
| --- | --- | --- | --- |
| Elevação (tiles Terrarium, zoom 8 no Brasil e 3 no mundo) | AWS Open Data — Terrain Tiles (`elevation-tiles-prod`), compilado de SRTM, GMTED2010, ETOPO1 e outras fontes | Relevo 3D e sombreamento | Aberta; **exige atribuição** às fontes (ver documentação do conjunto) |
| Natural Earth II, 1:50m, relevo sombreado com água | naturalearthdata.com | Textura do globo fora do Brasil | Domínio público |
| Rios e lagos 1:10m | Natural Earth (repositório nvkelso/natural-earth-vector) | Hidrografia nos tiles | Domínio público |
| Biomas 1:250.000 (2019) | IBGE | Cor da vegetação por bioma | Dados públicos do IBGE; citar a fonte |
| Malha das UFs (qualidade máxima) e lista de estados | API de malhas e de localidades do IBGE | Divisas, fronteira, seleção de UF | Dados públicos do IBGE; citar a fonte |

Pipeline: `scripts/data/fetch_globe_data.py` (download para `data-raw/`) → `scripts/data/build_globe.py` (gera `assets/globe/` e `src/globe/data/`). As cores dos biomas são **estilizadas** (status `FICTICIO` quanto à aparência); limites de biomas, UFs, rios e altitudes são `REAL`, com simplificações de escala.

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

Itens marcados com ⚠ em [POLITICAL_RULES.md](POLITICAL_RULES.md) devem ser registrados aqui quando verificados.

---

## 7. Avisos públicos
- O jogo deve exibir na tela "Sobre" e na descrição da loja: fontes utilizadas, data de referência dos dados e o aviso de que se trata de **simulação fictícia sem afiliação governamental**.
- Logotipos e marcas de órgãos públicos não são usados.
