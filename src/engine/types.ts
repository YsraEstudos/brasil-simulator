import type { GameEvent } from '../types/event';
import type { Policy } from '../types/policy';
import type { RegionalKey, RegionalScope } from '../types/regions';
import type { Scenario } from '../types/scenario';
import type { Calibration } from './economy/calibration';
import type { Rng, RngState } from './rng';
import type { SocietyState } from './society/types';
import type { PublicPolicyState } from './publicPolicies/types';

/** Versão da estrutura do GameState. Mudou a estrutura → incrementar e escrever migração + teste (AI_INSTRUCTIONS.md §2.10). */
export const STATE_SCHEMA_VERSION = 9;

/** Versão do motor gravada nos saves (resultados podem mudar entre versões do motor). */
export const ENGINE_VERSION = '0.8.1';

export type Difficulty = 'casual' | 'estrategica' | 'realismo';

/**
 * Indicadores do protótipo (GAME_DESIGN.md §8.1). Todos em **fração decimal** (0,045 = 4,5%), nunca
 * porcentagem inteira (ECONOMIC_MODEL.md §2). Só mudam por `Contribution` (soma = variação, §7.3).
 */
export interface Indicators {
  /** Aprovação do governo, 0–1. */
  approval: number;
  /** Crescimento do PIB real em 12 meses. */
  gdpGrowth12m: number;
  /** IPCA acumulado em 12 meses. */
  inflation12m: number;
  /** Desemprego, fração da força de trabalho (0–1). */
  unemployment: number;
  /** Resultado primário acumulado em 12 meses, fração do PIB. */
  primaryBalance12m: number;
}

export type IndicatorKey = keyof Indicators;

/** Recursos do jogador (GAME_DESIGN.md §5). */
export interface Resources {
  /** 0–100 */
  politicalCapital: number;
  /** Ações de agenda por mês (GAME_DESIGN.md §4.3). */
  agendaActionsPerMonth: number;
}

/** Grupos de receita federal (ECONOMIC_MODEL.md §5.7). */
export const REVENUE_GROUPS = ['renda', 'folha', 'consumo', 'outras', 'royalties'] as const;
export type RevenueGroup = (typeof REVENUE_GROUPS)[number];

/** Grupos de despesa obrigatória indexados por regra própria (ECONOMIC_MODEL.md §5.8). */
export const MANDATORY_GROUPS = ['previdencia', 'beneficios', 'pessoal', 'outras'] as const;
export type MandatoryGroup = (typeof MANDATORY_GROUPS)[number];

/**
 * Contas do governo central por grupo (ECONOMIC_MODEL.md §5.7–5.8; POLITICAL_RULES.md §4.2–4.3).
 * Fluxos em fração do PIB anualizada. Despesa primária = obrigatórias + vinculadas + obrigatórias de políticas
 * + discricionárias livres + discricionárias de políticas + exceções + créditos extraordinários (invariante em `checkInvariants`).
 */
export interface FiscalState {
  /** Obrigatórias indexadas: previdência, BPC/abono/seguro, pessoal, demais. */
  mandatory: Record<MandatoryGroup, number>;
  /** Vinculadas à receita: mínimos de saúde e educação, emendas impositivas. */
  linked: number;
  /** Obrigatórias criadas por políticas e eventos (impulsos `gasto.obrigatoria` e `gasto.transferencia_*`). */
  policyMandatory: number;
  /** Discricionárias livres executadas (funcionamento da máquina), depois de compressão e contingenciamento. */
  discretionary: number;
  /** Discricionárias adicionais de políticas e eventos (impulsos positivos de investimento e custeio). */
  policyDiscretionary: number;
  /** Despesas fora do limite do arcabouço por regra permanente (exceções legais, LC 200/2023 art. 3º §2º). */
  exceptions: number;
  /** Créditos extraordinários do mês (calamidades; fora do limite, CF art. 167 §3º). */
  extraordinary: number;
  /** Limite de despesas primárias sujeitas ao arcabouço. */
  spendingLimit: number;
  /** Crescimento real anual do limite no ano corrente (revisto em janeiro). */
  limitRealGrowth: number;
  /** Despesa acima do limite no mês, registrada como exceção com causa (invariante §7.4). */
  limitExcess: number;
  /** Receita líquida de transferências a estados e municípios, por grupo. */
  revenueByGroup: Record<RevenueGroup, number>;
  /** Arrecadação perdida por retorno decrescente (sonegação, elisão, informalidade), líquida. */
  revenueLoss: number;
  /** Receita líquida acumulada em 12 meses (suavizada), para a revisão anual do limite. */
  revenue12m: number;
  /** `revenue12m` na última revisão do limite (janeiro). */
  revenue12mAtReview: number;
  /** Crescimento real do PIB nos dois últimos anos-calendário fechados: [ano − 2, ano − 1]. */
  gdpGrowthHistory: [number, number];
  /** Salário mínimo real, índice (1 = jan/2027). */
  minimumWageIndex: number;
  /** Postura fiscal à qual a economia já se acomodou (o impulso de demanda é a distância até ela). */
  demandRef: number;
}

/** Pressão pública sobre o Banco Central (ECONOMIC_MODEL.md §5.4.1). */
export interface BcPressureState {
  /** Meses com pressão nos últimos 12 meses. */
  months: number[];
  /** Corte extra (fração) a aplicar na próxima reunião do Copom. */
  pendingCut: number;
}

/**
 * Variáveis econômicas que não são indicadores do protótipo (ECONOMIC_MODEL.md §3).
 * Fluxos fiscais em fração do PIB **anualizada** (o fluxo do mês × 12 / PIB anual).
 */
export interface EconomyState {
  /** Hiato do produto h = ln(Y/Ystar). */
  outputGap: number;
  /** Crescimento potencial anual (fração). */
  potentialGrowth: number;
  /** PIB potencial, índice (1 = início do cenário). */
  potentialIndex: number;
  /** Nível de preços (IPCA), índice (1 = início do cenário). */
  priceLevel: number;
  /** Selic meta anual. */
  selic: number;
  /** Juro real que já chegou à economia: média móvel do juro real ex ante com a defasagem `lagR` (§5.2). */
  effectiveRealRate: number;
  /** Expectativa de inflação 12 meses `pe` (§5.3). */
  inflationExpectation: number;
  /** Credibilidade fiscal e monetária, 0–1 (§5.3). */
  credibility: number;
  /** Prêmio de risco soberano anual (§5.5). */
  riskPremium: number;
  /** Câmbio nominal, R$ por US$ (§5.5). */
  exchangeRate: number;
  /** Depreciação nominal acumulada em 12 meses (soma dos logs mensais, suavizada). */
  depreciation12m: number;
  /** Juro externo anual (§8). */
  externalRate: number;
  /** Termos de troca, desvio em log da média (§8). */
  termsOfTrade: number;
  /** Dívida bruta do governo geral / PIB. */
  grossDebt: number;
  /** Taxa implícita anual da dívida (§5.9). */
  implicitRate: number;
  /** Receita primária líquida do mês, fração do PIB anualizada. */
  revenue: number;
  /** Despesa primária do mês, fração do PIB anualizada. */
  primarySpending: number;
  /** Resultado primário do mês = revenue − primarySpending (invariante §7.1). */
  monthlyPrimary: number;
  /** Juros nominais do mês, fração do PIB anualizada (= implicitRate × dívida anterior). */
  interest: number;
  /** Ajuste da dívida no mês: crescimento do PIB nominal e variação cambial, em fração do PIB (§7.2). */
  debtAdjustment: number;
  fiscal: FiscalState;
  bcPressure: BcPressureState;
}

/**
 * Alvos de impulso agendado (ECONOMIC_MODEL.md §5.11). Unidade de `delta` por alvo:
 *
 * | alvo | unidade de `delta` | quem consome |
 * | --- | --- | --- |
 * | `gasto.*` | despesa primária adicional enquanto ativo, fração do PIB anualizada (negativo = corte) | economia |
 * | `gasto.extraordinario` | idem, por crédito extraordinário: fica fora do limite do arcabouço | economia |
 * | `receita.tributaria` | carga adicional sobre os demais tributos enquanto ativo, fração do PIB anualizada | economia |
 * | `receita.renda` / `receita.consumo` | idem, sobre a renda / o consumo (sujeito a repartição e retorno decrescente) | economia |
 * | `receita.desoneracao_*` | receita **perdida** enquanto ativo, fração do PIB anualizada (positivo = perda) | economia |
 * | `demanda.credito` | impulso de demanda sem efeito fiscal, fração do PIB anualizada | economia |
 * | `oferta.potencial` | crescimento potencial anual adicional enquanto ativo (fração) | economia |
 * | `choque.hiato` | soma ao hiato em cada mês ativo (fração) | economia |
 * | `choque.inflacao` | soma ao alvo da inflação 12m enquanto ativo (fração) | economia |
 * | `choque.risco` | soma ao alvo do prêmio de risco enquanto ativo (fração) | economia |
 * | `choque.cambio` | variação do câmbio (log) em cada mês ativo | economia |
 * | `salario_minimo` | ganho real extra do salário mínimo aplicado no reajuste de janeiro (fração) | economia |
 * | `credibilidade` | variação da credibilidade em cada mês ativo (0–1) | economia |
 * | `aprovacao` | variação da aprovação em cada mês ativo (fração) | opinião |
 * | `capital_politico` | variação do capital político em cada mês ativo (pontos 0–100) | opinião |
 * | `intencao` | variação da intenção de voto em cada mês ativo (fração; Fase 08) | eleições |
 * | `relacao_congresso` | variação da relação de **todos** os blocos com o governo em cada mês ativo (−100…100) | Congresso |
 * | `regiao.atividade` | desvio da atividade (log) das UFs do escopo enquanto ativo; não muda o total nacional | regiões |
 * | `regiao.aprovacao` | desvio da aprovação (fração) nas UFs do escopo enquanto ativo; a média segue a nacional | regiões |
 * | `governadores.relacao` | variação da relação dos governadores do escopo em cada mês ativo (−100…100) | regiões |
 */
export type ImpulseTarget =
  | 'gasto.investimento'
  | 'gasto.custeio'
  | 'gasto.transferencia_baixa_renda'
  | 'gasto.transferencia_alta_renda'
  | 'gasto.obrigatoria'
  | 'gasto.extraordinario'
  | 'receita.tributaria'
  | 'receita.renda'
  | 'receita.consumo'
  | 'receita.desoneracao_consumo'
  | 'receita.desoneracao_renda'
  | 'demanda.credito'
  | 'oferta.potencial'
  | 'choque.hiato'
  | 'choque.inflacao'
  | 'choque.risco'
  | 'choque.cambio'
  | 'salario_minimo'
  | 'credibilidade'
  | 'aprovacao'
  | 'intencao'
  | 'capital_politico'
  | 'relacao_congresso'
  | 'regiao.atividade'
  | 'regiao.aprovacao'
  | 'governadores.relacao';

/**
 * Incidência regional de um impulso (ECONOMIC_MODEL.md §5.15): como o efeito se reparte entre as UFs. Sem ela,
 * o efeito é proporcional ao PIB de cada UF (nenhuma diferença regional). Nos alvos `regiao.*` e
 * `governadores.relacao` só o escopo importa (vazio = todas as UFs).
 */
export interface ImpulseRegional {
  key: RegionalKey;
  /** Regiões ou UFs que recebem; vazio = todas. */
  scope: readonly RegionalScope[];
  /** Multiplicador da chave por UF (sigla). */
  boost?: Readonly<Record<string, number>>;
}

/** Efeito futuro agendado (ECONOMIC_MODEL.md §5.11). */
export interface ScheduledImpulse {
  /** Decisão, proposta, evento ou projeto de origem (ex.: `proposta:irpf_tabela_3`, `evento:alta_petroleo_5`). */
  sourceId: string;
  /** Texto do "Por que mudou?", ex.: "Obras de infraestrutura". */
  label: string;
  target: ImpulseTarget;
  /** Efeito por mês ativo, na unidade do alvo (tabela em `ImpulseTarget`). */
  delta: number;
  /** monthIndex do primeiro mês com efeito. */
  startMonth: number;
  /** Último mês com efeito (inclusivo); `null` = permanente. */
  endMonth: number | null;
  /** Incidência regional (Fase 05); ausente = proporcional ao PIB das UFs. */
  regional?: ImpulseRegional;
}

/**
 * Estados da proposta (GAME_DESIGN.md §9). RASCUNHO, VALIDAÇÃO e ENVIADA são transitórios no mesmo mês;
 * `aprovada` também (no mesmo mês vira `aguardando_sancao` ou, para MP, `em_execucao`).
 */
export type ProposalStatus =
  | 'bloqueada'
  | 'em_tramitacao'
  | 'parada'
  | 'rejeitada'
  | 'aprovada'
  | 'aguardando_sancao'
  | 'apreciacao_veto'
  | 'vetada'
  | 'em_execucao'
  | 'concluida'
  | 'suspensa'
  | 'abandonada';

/** Situações em que a política ainda está em andamento: não pode ser enviada de novo. */
export const PROPOSAL_IN_PROGRESS: ReadonlySet<ProposalStatus> = new Set<ProposalStatus>([
  'em_tramitacao',
  'parada',
  'aprovada',
  'aguardando_sancao',
  'apreciacao_veto',
  'em_execucao',
  'suspensa',
]);

/** Situações em que a proposta está no Congresso, antes da votação final (negociação possível). */
export const PROPOSAL_IN_CONGRESS: ReadonlySet<ProposalStatus> = new Set<ProposalStatus>(['em_tramitacao', 'parada']);

/** Transição registrada na trilha de auditoria da proposta. */
export interface ProposalTransition {
  monthIndex: number;
  status: ProposalStatus;
  /** ID da causa, ex.: `votacao_camara`, `recesso`, `atraso_execucao`. */
  cause: string;
  /** Texto para o jogador, em português. */
  detail: string;
}

export type House = 'camara' | 'senado';

export interface BlocVote {
  blocId: string;
  /** Apoio calculado (POLITICAL_RULES.md §6.2), sem unidade; > limiar = bloco orienta "sim". */
  support: number;
  yes: number;
  no: number;
}

export interface VoteResult {
  monthIndex: number;
  house: House;
  /** Turno (PEC tem 2 por Casa). */
  round: number;
  yes: number;
  no: number;
  /** Votos "sim" necessários. */
  required: number;
  approved: boolean;
  blocs: BlocVote[];
}

/** Contrapartidas negociadas para uma proposta (POLITICAL_RULES.md §6.3). */
export interface ProposalNegotiation {
  /** Apoio extra por bloco obtido em negociação intensiva (sem unidade, mesma escala de `BlocVote.support`). */
  blocs: Record<string, number>;
  /** Emendas liberadas para esta votação (o pedágio foi pago). */
  amendments: boolean;
  /** O governo cedeu no texto (a escala já foi reduzida). */
  textConceded: boolean;
  /** Urgência constitucional pedida (CF art. 64 §§1º–2º). */
  urgency: boolean;
}

/** Ação no STF contra a medida (POLITICAL_RULES.md §8), sorteada quando a execução começa. */
export interface ProposalJudicial {
  /** Primeiro mês suspenso pela liminar. */
  suspendFrom: number;
  /** Último mês suspenso (o julgamento sai no mês seguinte). */
  suspendTo: number;
  /** O julgamento derruba a medida: a execução não volta. */
  struckDown: boolean;
}

/** `total`: veto ao projeto inteiro. `acrescimos`: veto parcial só aos acréscimos do relator. */
export type VetoKind = 'total' | 'acrescimos';

export interface ProposalVeto {
  kind: VetoKind;
  /** `null` enquanto o Congresso não apreciou; `true` = veto derrubado. */
  overridden: boolean | null;
}

export interface Proposal {
  /** `${policyId}_${createdMonth}` */
  id: string;
  policyId: string;
  createdMonth: number;
  status: ProposalStatus;
  /** Fração do texto original que sobreviveu (1 = original; < 1 = alterado pelo relator ou cedido pelo governo). */
  scale: number;
  /**
   * Mês da próxima etapa: votação na Casa atual (em tramitação), sanção (aguardando sanção) ou sessão do veto
   * pendente (veto total em apreciação, ou veto aos acréscimos de uma lei já em execução). `null` sem etapa marcada.
   */
  voteMonth: number | null;
  /** Índice, em `votingPlan`, da próxima etapa a votar (= número de etapas depois da votação final). */
  stage: number;
  /** Bloco do relator na Casa atual (`null` fora da tramitação). */
  rapporteur: string | null;
  /** O relator alterou o texto (uma vez por proposta; o texto alterado ganha apoio de todos os blocos). */
  textAltered: boolean;
  /** Adiamentos na etapa atual (pedágio, presidente da Casa); limitados por `max_adiamentos`. */
  postponements: number;
  negotiation: ProposalNegotiation;
  /** Acréscimos estranhos ao projeto incluídos pelo relator: despesa extra, fração do PIB ao ano (0 = nenhum). */
  rider: number;
  veto: ProposalVeto | null;
  judicial: ProposalJudicial | null;
  /** Primeiro e último mês de execução (null antes de executar; last null = permanente). */
  executionStart: number | null;
  executionEnd: number | null;
  /** UFs que aderiram ao programa (condição `adesao_estadual`, POLITICAL_RULES.md §2); `null` = sem adesão. */
  adherents: string[] | null;
  votes: VoteResult[];
  history: ProposalTransition[];
}

/** Parte dinâmica de cada bloco; o resto (cadeiras, ideologia, coesão) vem do cenário. */
export interface BlocState {
  id: string;
  /** −100 … 100 */
  governmentRelation: number;
}

/** Ocupante de ministério: quadro técnico/aliado ou indicação de bloco (POLITICAL_RULES.md §6.3.1). */
export const TECHNICAL_OCCUPANT = 'tecnico';

export interface MinistryState {
  id: string;
  /** `TECHNICAL_OCCUPANT` ou o id do bloco que indicou o ministro. */
  occupant: string;
  /** Mês da nomeação (o risco de escândalo cresce com o tempo no cargo). */
  since: number;
}

export interface CongressState {
  blocs: BlocState[];
  /** Ministérios cujo ocupante mudou desde o início; os demais seguem o cenário. */
  cabinet: MinistryState[];
}

/** Evento à espera de resposta do jogador (GAME_DESIGN.md §4.2, caixa de entrada). */
export interface PendingEvent {
  eventId: string;
  /** Mês em que apareceu. Sem resposta até o fim do mês seguinte → escolha padrão. */
  monthIndex: number;
}

/** Evento encadeado já sorteado, à espera do mês de chegada (FASE_07.md). */
export interface ScheduledEvent {
  eventId: string;
  /** Mês em que chega à caixa de entrada. */
  monthIndex: number;
  /** Evento e escolha que o originaram (rastro de causa para as notícias). */
  causeEventId: string;
  causeChoiceId: string;
}

/** Tom editorial de uma notícia. */
export type NewsTone = 'positiva' | 'negativa' | 'neutra';
export type NewsKind = 'economia' | 'congresso' | 'evento' | 'personagem' | 'institucional';

/** Notícia persistida do mês, com a causa identificável (FASE_07.md). Texto fictício, em português. */
export interface NewsItem {
  /** `${monthIndex}_${ordem}` */
  id: string;
  monthIndex: number;
  kind: NewsKind;
  tone: NewsTone;
  headline: string;
  /** Frase curta de causa, ex.: "Causa: o Copom subiu a Selic". */
  cause: string;
  /** Evento, proposta ou política de origem, quando houver. */
  sourceId?: string;
  characterId?: string;
}

export interface EventsState {
  pending: PendingEvent[];
  /** Último mês em que cada evento disparou (para o intervalo mínimo entre ocorrências). */
  lastFired: Record<string, number>;
  /** Quantas vezes cada evento já disparou. */
  count: Record<string, number>;
  /** Memória persistente: marca → mês em que foi gravada (FASE_07.md). */
  flags: Record<string, number>;
  /** Eventos encadeados agendados. */
  scheduled: ScheduledEvent[];
  /** Prestígio atual dos personagens (id → −100…100); ausente = `initialStanding` do cenário. */
  characters: Record<string, number>;
  /** Notícias mais recentes, da mais antiga para a mais nova, limitadas a `NEWS_LIMIT`. */
  news: NewsItem[];
}

/**
 * Uma escolha do jogador no mês. Escolher nunca altera indicadores diretamente: a decisão vira uma proposta
 * que o motor processa (GAME_DESIGN.md §9).
 */
export interface Decision {
  /** ID de conteúdo em português: política (`infraestrutura_credito_adicional`) ou ação de agenda (`actions.ts`). */
  policyId: string;
  /** Custo em ações de agenda. O motor usa o custo do catálogo quando a política existe. */
  agendaCost: number;
  params?: Readonly<Record<string, number | string | boolean>>;
}

/** Resposta a um evento pendente. */
export interface EventChoice {
  eventId: string;
  choiceId: string;
}

/** Entrada do jogador num mês. */
export interface MonthInput {
  decisions: readonly Decision[];
  eventChoices?: readonly EventChoice[];
}

export type DecisionRejection =
  | 'alvo_invalido'
  | 'sem_acoes_de_agenda'
  | 'custo_invalido'
  | 'politica_desconhecida'
  | 'acao_repetida'
  | 'ja_em_andamento'
  /** MP rejeitada ou caducada não pode ser reeditada na mesma sessão legislativa (CF art. 62 §10). */
  | 'reedicao_vedada'
  /** Novo benefício na janela de vedação eleitoral, sem quebra declarada (Lei 9.504/97 art. 73 §10; Fase 08). */
  | 'vedacao_eleitoral'
  | 'evento_nao_pendente'
  | 'escolha_invalida';

/** Parcela de uma variação, com causa, para o "Por que mudou?" (ECONOMIC_MODEL.md §1.6). */
export interface Contribution {
  /**
   * Indicador `Indicators` de destino ou o pseudo-indicador `'votingIntention'` (Fase 08): a intenção de voto
   * não pertence ao `Indicators`; contribuições para ela servem apenas ao relatório ("Por que mudou?").
   */
  indicator: IndicatorKey | 'votingIntention';
  /** ID da causa: proposta, choque, Banco Central, tendência… */
  cause: string;
  delta: number;
  /** Texto curto para o jogador (ex.: "Juros do Banco Central"). */
  label?: string;
}

/** Registro permanente de uma decisão aceita (trilha de auditoria). */
export interface DecisionRecord {
  monthIndex: number;
  decision: Decision;
}

/** Resultado de uma eleição geral para o jogador: registro permanente (Fase 08). */
export interface PresidentialElection {
  monthIndex: number;
  /** O jogador declarou candidatura nessa eleição. */
  candidatura: boolean;
  /** Candidatura do governo venceu a eleição (jogador ou sucessor apoiado). */
  venceu: boolean;
  /** Decidida no 2º turno. */
  turno2: boolean;
}

/**
 * Estado eleitoral (FASE_08.md): só existe quando o cenário tem o bloco `elections`. A migração não o cria; o
 * `electionsStep` cria no primeiro mês processado com um cenário de eleições e de lá em diante mantém.
 */
export interface PoliticsState {
  /** Intenção de voto na candidatura do governo, 0–1 (com candidatura ou sucessor apoiado; 0–1 pela base). */
  votingIntention: number;
  /** Clima mensal do governo (−1…1), do mais antigo para o mais novo; até 12 entradas. */
  memoria: number[];
  /** Mês da declaração de candidatura aprovada (`null` sem declaração). */
  declaracao: number | null;
  /** Bloco apoiado para a sucessão (`apoiar_candidato`); `null` = sem apoio escolhido. */
  apoio: string | null;
  /** Última eleição geral processada (mês 45 ou 93 do índice nacional). */
  eleicao_geral?: PresidentialElection;
  /** Última eleição municipal processada (mês 21 ou 69). */
  eleicao_municipal?: { monthIndex: number };
}

export interface GameState {
  schemaVersion: typeof STATE_SCHEMA_VERSION;
  engineVersion: string;
  scenarioId: string;
  difficulty: Difficulty;
  seed: number;
  rng: RngState;
  /** Mês que está para ser jogado (0 = jan/2027). */
  monthIndex: number;
  indicators: Indicators;
  resources: Resources;
  economy: EconomyState;
  congress: CongressState;
  proposals: Proposal[];
  /** Fila de efeitos futuros (ECONOMIC_MODEL.md §5.11). Impulsos vencidos saem da fila. */
  impulses: ScheduledImpulse[];
  events: EventsState;
  decisionLog: DecisionRecord[];
  /** Distribuição do agregado às UFs (ECONOMIC_MODEL.md §5.12, §5.15). */
  regions: RegionsState;
  society: SocietyState;
  publicPolicies: PublicPolicyState;
  /** Eleições e intenção de voto (Fase 08); cenários sem eleições e saves antigos ficam sem o campo. */
  politics?: PoliticsState;
}

/**
 * Situação de uma UF no mês processado (ECONOMIC_MODEL.md §5.15). Participação, desemprego e aprovação são uma
 * distribuição dos números nacionais: as médias ponderadas reproduzem o total (invariante §7.9).
 */
export interface UfState {
  /** Sigla da UF. */
  id: string;
  /** Participação no PIB nacional (soma 1). */
  share: number;
  /** Participação de tendência, sem o ciclo, o gasto federal e os choques do mês (soma 1). */
  structuralShare: number;
  /** Crescimento do PIB da UF em 12 meses menos o nacional (suavizado, como o PIB 12m nacional). */
  growthGap12m: number;
  /** Desemprego da UF (média ponderada pela população = nacional). */
  unemployment: number;
  /** Aprovação do governo na UF (média ponderada pela população = nacional). */
  approval: number;
  /** Relação do governador com o governo, −100…100. */
  governorRelation: number;
}

/** UFs na ordem do cenário. Vazio = cenário sem dados regionais ou save antigo ainda não processado. */
export interface RegionsState {
  ufs: UfState[];
}

/** Parcela de uma diferença regional em relação à média nacional, com causa (ECONOMIC_MODEL.md §5.15). */
export interface RegionalPiece {
  cause: string;
  label: string;
  /** Na unidade da diferença explicada (fração). */
  delta: number;
}

/**
 * "Por que esta UF está diferente da média?" no mês: decomposições exatas (a soma das parcelas é a diferença).
 * `activity`: participação ÷ participação de tendência − 1. `unemployment` e `approval`: UF − nacional.
 */
export interface UfExplanation {
  id: string;
  activity: RegionalPiece[];
  unemployment: RegionalPiece[];
  approval: RegionalPiece[];
}

/** Mudança de estado de uma proposta no mês, para o relatório. */
export interface ProposalChange {
  proposalId: string;
  policyId: string;
  transition: ProposalTransition;
}

export interface CopomDecision {
  previous: number;
  next: number;
  /** Corte extra obtido por pressão do governo nesta reunião (ECONOMIC_MODEL.md §5.4.1); ausente = nenhum. */
  pressureCut?: number;
}

export interface MonthReport {
  /** Mês processado. */
  monthIndex: number;
  accepted: Decision[];
  rejected: { decision: Decision; reason: DecisionRejection }[];
  /** Variação de cada indicador no mês, decomposta por causa. */
  contributions: Contribution[];
  proposalChanges: ProposalChange[];
  /** Escolhas aplicadas a eventos (do jogador ou automáticas, quando o prazo venceu). */
  eventsResolved: { eventId: string; choiceId: string; automatic: boolean }[];
  /** Eventos que apareceram neste mês e aguardam resposta. */
  eventsFired: string[];
  /** Reunião do Copom no mês, se houve. */
  copom: CopomDecision | null;
  /** Avisos curtos para o jogador (ex.: gasto acima do limite). */
  notes: string[];
  /**
   * Diferenças de cada UF em relação à média nacional, por causa (Fase 05). `null` sem dados regionais;
   * relatórios gravados antes da Fase 05 não têm o campo.
   */
  regional: UfExplanation[] | null;
}

export interface MonthResult {
  state: GameState;
  report: MonthReport;
}

/** Conteúdo do jogo usado pelo motor (validado fora dele; o motor não lê arquivos). */
export interface GameContent {
  scenario: Scenario;
  policies: Readonly<Record<string, Policy>>;
  events: readonly GameEvent[];
  calibration: Calibration;
}

/** Partes do relatório que as etapas preenchem (o resto é montado pelo `advanceMonth`). */
export type ReportDraft = Pick<MonthReport, 'proposalChanges' | 'eventsResolved' | 'eventsFired' | 'notes'> & {
  copom: CopomDecision | null;
  regional: UfExplanation[] | null;
};

export interface StepContext {
  rng: Rng;
  content: GameContent;
  /** Decisões aceitas neste mês (já descontadas as ações de agenda), na ordem enviada. */
  decisions: readonly Decision[];
  /** Respostas a eventos aceitas neste mês. */
  eventChoices: readonly EventChoice[];
  /** Coletor do relatório: as etapas acrescentam itens aqui. */
  draft: ReportDraft;
}

export interface StepOutput {
  /**
   * Novo estado. **Indicadores são ignorados**: o `advanceMonth` os recalcula somando `contributions`
   * (garante o invariante §7.3). As demais partes do estado são usadas como devolvidas.
   */
  state: GameState;
  contributions: Contribution[];
}

/**
 * Etapa do processamento mensal. Recebe o estado já atualizado pelas etapas anteriores do mês e devolve o
 * novo estado e as contribuições. Função pura: não altera `state` (copie o que mudar).
 * `state.monthIndex` é o mês sendo processado.
 */
export type MonthStep = (state: Readonly<GameState>, ctx: StepContext) => StepOutput;
