# Expansão sistêmica — calibração provisória

## R6: demografia e energia

Os parâmetros dinâmicos abaixo são **hipóteses de jogo**, não previsões ou resultados de calibração com jogadores. As populações totais iniciais das UFs vêm do cenário escolhido. No cenário principal, proporções etárias do Censo 2022 são aplicadas aos totais do cenário como aproximação para 2027; o estado resultante é provisório, não uma observação oficial de 2027. Outros cenários usam o fallback uniforme. As constantes executáveis estão em `src/engine/demography/calibration.ts` e `src/engine/energy/calibration.ts`. Faixas abaixo são limites de interpretação e não uma análise de sensibilidade já executada.

| Parâmetro | Valor e unidade | Papel e limites |
| --- | --- | --- |
| Faixas iniciais | Censo 2022 por UF; fallback: 27% de 0–19 anos e 11% de 65+ | O restante tem 20–64 anos. No cenário principal, as proporções censitárias são reescaladas ao total de cada UF do cenário; não são projeções para 2027. |
| Nascimentos | 0,012 por pessoa/ano | Taxa nacional constante aplicada às UFs; não é fecundidade por mulher nem taxa observada. Não negativa. |
| Mortalidade | 0,0005, 0,003 e 0,035 por pessoa/ano, por faixa | Taxas médias simplificadas, sem sexo nem mortalidade por causa. Não negativas e menores que 12 para que o fluxo mensal não ultrapasse o estoque. |
| Migração | Interna 0,006 e externa 0,0002 por pessoa em idade ativa/ano | A saída interna é redistribuída por uma regra provisória entre UFs; soma nacional zero. Não modela fluxos origem–destino reais. Taxas não negativas. |
| Envelhecimento | Faixas de 20 e 45 anos; saída mensal proporcional ao estoque | Aproximação agregada sem idade individual. Durações positivas; não confundir com uma tábua real de sobrevivência. |
| Previdência | Sensibilidade 0,4; ajuste mensal limitado a ±0,01 | Aplica somente o desvio de crescimento da população idosa em relação à tendência inicial à despesa previdenciária existente. A sensibilidade é provisória e não mede o número de beneficiários. |
| Demanda e geração | Demanda-base 60; geração firme 25; capacidade hidrelétrica 40 TWh/mês | Ordens de grandeza de jogo, sem série EPE vinculada. A demanda do mês evolui com o índice de PIB potencial; antes do primeiro mês não há fluxo registrado. Valores não negativos. |
| Reservatório | Inicial 100; capacidade 140 TWh; entrada normal 35 TWh/mês | Estoque expressa energia potencial equivalente, não volume de água. Seca reduz a entrada em até 65%; estoque não pode ser negativo ou ultrapassar a capacidade. |
| Transmissão | 62 TWh/mês inicialmente | Limite agregado, não representa a rede elétrica por estado. Não negativo. |
| Projetos | Geração e transmissão: 0,0001 TWh/mês por R$ milhão de ativo; armazenamento: 0,001 TWh por R$ milhão | Conversões fictícias aplicadas apenas ao ativo líquido em operação; dependem de licenciamento, financiamento e manutenção da carteira. Não são custos de engenharia. |
| Eficiência | Até 20% de redução da demanda; força saturada por `tanh` | Depende da dotação executada e do prazo de maturação. Não gera energia; percentual de redução em 0–1. |
| Escassez | Perda máxima no hiato 0,04 multiplicada pela fração não atendida | Canal produtivo limitado a 0–4% do nível de atividade. A inflação climática existente continua separada; a escassez não cria um segundo choque de preços. |

Antes de considerar estes números calibrados, comparar sementes e estratégias independentes, explorar extremos e executar sessões observadas com jogadores e medições em Android. A simulação de 240 meses é um teste de estresse, não uma previsão nem uma promessa de duração da campanha.

**Regressão local após importar o Censo (29/10/2026):** `npm run sim:balance` terminou com código 0. As nove estratégias existentes foram executadas em 12 meses (50 sementes cada), 48 meses (20 sementes) e 240 meses (10 sementes); o relatório registrou zero violações de invariantes. No horizonte de 240 meses, as médias da dívida final entre estratégias ficaram entre 165,9% e 197,9% do PIB, e as aprovações médias entre 39,7% e 42,9%. São resultados do simulador, não metas nem evidência de equilíbrio para jogadores; essas estratégias não constituem teste específico de todas as ações energéticas, e não houve validação humana ou Android.

### Referências externas para futura calibração

- [IBGE, Censo Demográfico 2022 — população por idade e sexo](https://www.ibge.gov.br/estatisticas/sociais/populacao/22827-censo-demografico-2022.html?edicao=38166&t=resultados): tabela SIDRA 9514; sexo total, declaração de idade total e faixas quinquenais agregadas para as três faixas do jogo. `scripts/data/build_demography.py` verifica as UFs e as somas, e grava fonte, consulta, data e SHA-256 no artefato `src/data/demography/census2022.json`. O recorte censitário de 2022 não é automaticamente uma estimativa para janeiro de 2027.
- [EPE, Balanço Energético Nacional 2026, ano-base 2025, capítulo 1](https://dashboard.epe.gov.br/apps/livro-ben/livro/pt/capitulo_1.html): registra consumo final de eletricidade de 667,8 TWh em 2025, equivalente a uma média aritmética de 55,65 TWh por mês. É uma referência histórica agregada, não a demanda instantânea do modelo: o balanço também distingue oferta, perdas e autoprodução. Não usar essa média como substituição automática de `demand` nem inferir dela a capacidade de geração, transmissão ou armazenamento.

## R7: tecnologia, comércio e habilidades avançadas

Hipóteses de jogo `PROVISORIO`, não estimativas. Regras comuns em `src/engine/research/calibration.ts`,
`src/engine/trade/calibration.ts` e `src/engine/skills/calibration.ts`; nós e parceiros em `src/data/technology/` e
`src/data/trade/`. Referências de escala usadas no desenho: PIB nominal inicial do cenário ≈ R$ 13,6 trilhões; capital
humano inicial ≈ 10,7 anos efetivos de estudo (estacionário da educação, R5).

| Parâmetro | Valor e unidade | Papel e limites |
| --- | --- | --- |
| Custos dos nós | R$ 0,2 bi a R$ 9 bi por ano e estágio, preços de jan/2027 | Ordens de grandeza para comparar rotas; importar concentra o gasto e paga em moeda estrangeira (70–85%). Não são orçamentos de engenharia. |
| Prazos dos nós | 12 a 30 meses por estágio | Desenvolver soma quatro estágios (4 a 9,5 anos); importar só a adoção (1 a 2,5 anos). |
| Efeitos | Potencial +0,03% a +0,12% do PIB; transmissão +1 TWh/mês; armazenamento +3 TWh | Efeitos pequenos diante do agregado: tecnologia não substitui o resto da política. Faixa a explorar com sementes e estratégias. |
| Risco de falha | 15% a 30% por estágio (desenvolver), 15% a 20% (transferir) | Falha parcial refaz 40% do estágio; três falhas encerram o programa. |
| Ritmo pelo capital humano | Elasticidade 1,5; ritmo entre 0,5 e 1,3 | Educação muda devagar; o efeito aparece em anos. |
| Tarifa média | Base 8%, faixa 4–14%, passo 1 p.p. | Ordem de grandeza da tarifa efetiva; a faixa representa o espaço do decreto e das exceções à TEC. |
| Elasticidade das importações à tarifa | 1,2 | Literatura entre 0,5 e 2; sem estimação própria. |
| Repasse de preço de importação | 0,35 × importações/PIB, por 12 meses | Um passo de tarifa sobe a inflação de 12 meses em ~0,04 p.p. durante um ano. |
| Saldo externo → hiato | 0,6 por ponto do PIB, como nível | Barreira de 15% da China ≈ −0,6 p.p. do PIB de exportações e ~−0,35 p.p. de hiato no longo prazo. |
| Choques | Barreira 0,3%/mês por parceiro (9 meses, −15% de acesso); cadeia 0,5%/mês (6 meses, +10% no preço de importação) | Esperança de uma barreira a cada ~4–5 anos no total, antes de relação, tarifa e acordos. |
| Acordo | 4 rodadas, ratificação em 3 meses, vigência 10 anos; +8% de acesso, +10% de importações do parceiro, 50% da tarifa sem cobrança | Ganho e contrapartida explícitos; a ratificação depende do Congresso. |
| Habilidades avançadas | Ciência −15% do risco por nível; diplomacia +0,25 rodada por nível | O nível 3 ainda deixa risco e exige mais de uma rodada e a ratificação. |

**Verificação local (29/10/2026):** os testes do R7 cobrem rotas, pré-requisitos, gargalos de orçamento, infraestrutura
e parceiro, falha parcial por chave, efeito gradual com soma exata no potencial, energia, certificação, tarifa, missão,
acordo aprovado e rejeitado, choques por chave e 48 meses do pipeline completo com invariantes. Não houve exploração de
sensibilidade, robôs específicos para as ações novas, sessões com jogadores nem medição em Android.
