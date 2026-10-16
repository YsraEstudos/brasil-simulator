# Catálogo de políticas

Este catálogo é conteúdo de calibração do jogo. Os números e efeitos adicionados na Fase 06 estão marcados como
`PROVISORIO`; eles servem para testar decisões, custos, atrasos e riscos e não são projeções oficiais nem afirmações
sobre uma política pública real.

## Versões do cenário

`brasil_2027_01` v0.4.0 continua disponível para campanhas e saves legados. O cenário padrão é
`brasil_2027_01_v050` v0.5.0, que copia os dados iniciais publicados e amplia o catálogo para a campanha completa.
O cenário novo usa 48 meses; o protótipo `prototipo_ficticio` continua com 12 meses.

## Contrato da política

Toda política tem custo em R$ milhões por ano, perfil de desembolso, fontes de financiamento, prazos, impactos,
riscos e incidência. O esquema em `src/types/policy.ts` valida a estrutura antes de o conteúdo chegar ao motor.

`delivery` é opcional. Quando ausente, a política conserva o fluxo legado. Quando vale `rotina`, a política precisa:

- usar somente atos executivos (`decreto_regulamentar`, `decreto_aliquota`, `decreto_programacao`, `portaria` ou
  `ato_execucao`);
- ter custo anual positivo e finito;
- ter exatamente um impacto `custeio` positivo e, opcionalmente, um impacto `aprovacao`;
- não usar impactos de capital, tributos ou transferências, instrumento legislativo ou a condição
  `adesao_estadual`.

Quando vale `projeto`, a política precisa de `project` com `licensingMonths`, `procurementMonths`, `efficiency` e
`annualMaintenanceRate`. O custo é positivo e finito, existe impacto `investimento_publico` positivo e não existe
impacto `capital_publico`. `timeline.executionMonths` representa a duração da obra; licenciamento e licitação ficam
nos metadados do projeto. A obra precisa durar pelo menos um mês. `cost.disbursementProfile` é uma curva anual de
frações que soma 1 e tem `ceil(executionMonths / 12)` posições; assim, obras de 24 meses têm duas posições e obras
de 30 ou 36 meses têm três. A carteira pode calcular o orçamento total como o custo anual proporcional ao número de
anos de execução e aplicar essa curva às fases anuais.

## Catálogo da Fase 06

O cenário v0.5.0 reúne 42 políticas: as 10 legadas, 22 rotinas e 10 projetos. Há duas rotinas para cada um dos 11
ministérios do cenário.

### Rotinas

| Ministério | Políticas |
| --- | --- |
| Fazenda | `rotina_execucao_orcamentaria`, `rotina_compras_publicas` |
| Gestão e Serviços Públicos | `rotina_servicos_digitais`, `rotina_avaliacao_contratos` |
| Previdência Social | `rotina_atendimento_previdenciario`, `rotina_pericia_previdenciaria` |
| Desenvolvimento Social | `rotina_busca_ativa_social`, `rotina_qualificacao_cadastros` |
| Transportes e Infraestrutura | `rotina_manutencao_rodovias`, `rotina_seguranca_viaria` |
| Saúde | `rotina_atencao_basica`, `rotina_vigilancia_epidemiologica` |
| Educação | `rotina_alfabetizacao`, `rotina_formacao_docente` |
| Justiça e Segurança Pública | `rotina_integracao_criminal`, `rotina_prevencao_violencia` |
| Cidades | `rotina_regularizacao_urbanistica`, `rotina_eficiencia_saneamento` |
| Agricultura | `rotina_assistencia_tecnica_rural`, `rotina_defesa_agropecuaria` |
| Minas e Energia | `rotina_eficiencia_energetica`, `rotina_monitoramento_mineral` |

### Projetos e reformas

`projeto_hospitais_regionais`, `projeto_escolas_tempo_integral`, `projeto_saneamento_resiliente`,
`projeto_corredores_logisticos`, `projeto_transmissao_energia`, `projeto_habitacao_interesse_social`,
`projeto_conectividade_publica`, `projeto_armazenagem_agropecuaria`, `projeto_mobilidade_urbana` e
`projeto_requalificacao_portuaria`.

Os projetos usam `investimento_publico` como desembolso de obra. O estoque de capital e sua manutenção pertencem à
carteira explícita que será implementada na tarefa de execução pública; por isso o catálogo não agenda
`capital_publico` em paralelo.

## Setores afetados

As políticas novas usam os IDs setoriais `agropecuaria`, `extrativa`, `industria`, `construcao`, `energia` e
`servicos`. Os dez registros legados permanecem byte a byte inalterados e podem conter IDs históricos diferentes;
essa compatibilidade é intencional.

As validações automatizadas da Fase 06 estão em `src/content/phase06.test.ts` e cobrem contratos de entrega,
catálogo, ministérios e versionamento do cenário.
