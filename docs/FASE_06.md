# Fase 06 — Sociedade e políticas públicas

Escopo aprovado em 15/10/2026. Referências: GAME_DESIGN §9.1–9.2,
ECONOMIC_MODEL §3, §5.10–5.12; POLITICAL_RULES §12. A execução ocorre no
checkout atual, em branch própria, sem publicação nem alterações nas fases futuras.

## Contratos e desenho

- Catálogo com pelo menos 30 políticas JSON validadas. Custos, canais, atrasos,
  financiamento, riscos e incidência documentados; números PROVISORIO. Cenário
  novo `brasil_2027_01_v050` v0.5.0 preserva o cenário `brasil_2027_01`
  v0.4.0 para campanhas antigas.
- `GameState.society: SocietyState` (módulo `engine/society/types.ts`): seis
  setores repartem o agregado, cinco quintis com renda real e participação,
  pobreza estimada. Efeitos vêm de impulsos realmente ativos; não criam PIB
  adicional ao somar setores. Explicações por causa no próprio bloco social.
- `GameState.publicPolicies: PublicPolicyState` (módulo
  `engine/publicPolicies/types.ts`): diretrizes anuais por ministério, carteira
  de projetos e marcas de governo. Estado v6, motor 0.6.0; migração sequencial
  v5 → v6 preserva campanhas, propostas, impulsos e histórico existentes.
- Política pode ter `delivery: 'rotina' | 'projeto'` (opcional; ausente conserva
  o fluxo anterior). Projetos têm metadados `project` com meses por fase,
  eficiência e manutenção anual. Nunca duplicar os impulsos de investimento
  ou oferta que o fluxo antigo já agendava. Projetos legados continuam no
  fluxo antigo; apenas novas políticas marcadas usam a carteira explícita.
- Diretriz usa política de rotina da área da pasta e orçamento anual em R$
  milhões. A ação `definir_diretriz` recebe `ministryId`, `policyId`,
  `annualMillions`; custa 1 ponto. Orçamentos alocam discricionárias livres,
  sem criar dotação nem contornar a tramitação de políticas legislativas.
  Só atos executivos elegíveis entram na rotina. A alocação vale até dezembro;
  janeiro renova a diretriz dentro da disponibilidade corrente, explicitando
  cortes no relatório. Nunca gastar novamente uma dotação já consumida.
- `marcar_governo` recebe `proposalId`, `name`, custa 1 ponto; máximo de três
  escolhas por mandato, sem liberar vaga por cancelamento. Só propostas
  próprias elegíveis em tramitação (inclusive paradas por falta de pauta),
  execução ou concluídas; nome sem vazio
  e até 60 caracteres. A marca acompanha progresso, atrasos, conclusão ou
  cancelamento no relatório mensal e no legado.
- Projetos: planejamento → licenciamento → licitacao → obra → operacao.
  Desembolso em curva S e execução limitada pelo orçamento; demora, risco,
  suspensão e cancelamento são rastreáveis. Capital só entra na operação,
  deprecia, exige manutenção e afeta o potencial por canal único. Não replicar
  o mesmo capital no agregado e em cada UF.
- Interface nas telas atuais: catálogo filtrável/agrupado por área, diretrizes
  e marcas na Presidência, setores e quintis na Economia. Seleção só prepara
  a agenda; executar exige encerrar o mês pela store. Nenhuma dependência nova.

## Plano de implementação

1. **Catálogo e cenário** — `types/policy.ts`, novos JSON, registro no conteúdo,
   cenário v0.5.0 e documentação do catálogo. Testes: >=30 IDs únicos, todos
   disponíveis no novo cenário, validação de metadados e custos/prazos.
2. **Sociedade** — módulo puro `engine/society/`, tipos e calibração explícita.
   Testes de sentido para transferências/tributos, reconciliação dos setores,
   determinismo, limites e campanhas longas. O controlador liga ao pipeline,
   estado inicial, migração e invariantes.
3. **Execução pública** — módulo `engine/publicPolicies/`, ações/validação,
   diretrizes, carteira e marcas. Testes RED→GREEN de orçamento, renovação,
   fases, atrasos, manutenção, limite de três, suspensão e save v5 real.
4. **Interface** — componentes novos e integração nas telas existentes,
   passando por store/agenda; custos e atrasos visíveis e listas acessíveis.
5. **Integração e validação** — testes do turno completo, campanhas de
   48/240 meses, `npm run check`, verificação web quando disponível e revisão
   independente. Atualizar ROADMAP, modelo econômico, design e dados.

## Interfaces entre tarefas

| Tarefas | Interface | Regra |
| --- | --- | --- |
| 1 → 3 | Policy.delivery/project | Schema opcional mantém políticas e saves legados |
| 2 → integração | initialSociety, societyStep, checkSociety | Estado social não altera diretamente o agregado |
| 3 → 4 | ações e PublicPolicyState | UI prepara Decision; motor valida novamente |
| 1 → todas | cenário versionado | Campanhas antigas conservam catálogo e dados anteriores |

## Verificação e limites

Testes devem falhar antes da implementação correspondente. Verificar contas
fiscais e soma das contribuições junto aos novos invariantes. Dados sociais,
setoriais e efeitos são calibração de jogo, sem pretensão de projeção oficial.
Testes web não substituem homologação no moto g20/iPhone. Eleições, imprensa
ampliada e personagens pertencem às fases 07–08.

## Progresso

- Preparação: checkout limpo na Fase 05; escopo aprovado pelo autor.
- Decisão: conservar o checkout e usar branch `codex/fase-06-sociedade`;
  não criar cópia de trabalho desnecessária. Nenhum push ou commit automático.
- Decisão: aprovação recebida autoriza detalhar e implementar o escopo em
  sequência; o plano registra as escolhas reversíveis sem novas interrupções.
- Decisão: o cenário novo permite 48 meses para que a carteira de projetos seja
  jogável; legados continuam com 12 meses. Eleições e conteúdo ampliado de
  eventos não são antecipados. Custo se revisto: mudar a duração do cenário novo.
- Tarefa 1: implementada e revisada; 42 políticas (10 legadas, 22 rotinas,
  10 projetos). Revisão corrigiu duração zero e perfil anual incompatível
  com a duração da obra. Cenário antigo preservado.
- Tarefa 2: implementada; transferência constante converge, término reverte
  o componente temporário; setores e quintis reconciliados. Parser das fontes
  reais de diretrizes e projetos coberto por teste.
- Tarefa 3: implementada; revisão de orçamento, suspensão, desembolso parcial,
  perfil anual, capacidade ministerial, custos operacionais e incidência regional.
- Tarefa 4: implementada; painel de pastas recolhíveis, carteira, marcas,
  sociedade e legado. Correção verificada do ano civil na exibição da diretriz
  (2027 na tela corresponde ao índice persistido 0).
- Tarefa 5: validação integrada e revisão final concluídas. Campanhas com
  obra, diretriz e marca exercitam 48/240 meses e retomada determinística;
  extremos dos quatro parâmetros novos são exercitados por 240 meses.
- Revisão final: UI e motor compartilham os estados elegíveis para marca;
  projeto parado na pauta continua em tramitação e pode receber uma marca.
  Decisão: permitir também na UI, mantendo o limite de três escolhas;
  custo se revisto: retirar essa opção antes do envio à pauta.
- Revisão final: desembolso parcial gera avanço físico proporcional ao dinheiro
  executado, mas só muda o marcador de parcela (`phaseMonth`) ao quitá-la.
  Essa distinção foi explicitada no contrato, sem mudar o avanço já testado.
- Verificação: 496 testes/31 arquivos; tipos, lint e formatação. Fixture v5
  real migra sem alterar os campos antigos; novas campanhas têm 48 meses,
  antigas continuam com 12. Export web e conferência em 390 px cobrem
  diretriz, execução ao encerrar, retomada e sociedade. Dispositivos físicos
  e calibração pelo autor continuam pendentes. Sem commit/push/publicação.
- Limite do ambiente de teste: algumas execuções da CLI permaneceram abertas
  depois do resumo de 496 testes aprovados e foram encerradas na limpeza. A
  execução diagnóstica com o reporter `hanging-process` retornou código 0;
  o resumo verde não foi usado como prova de homologação em aparelho físico.
