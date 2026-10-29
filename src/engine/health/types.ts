import type { HealthLeverId, MacroRegion, MeasureId } from '../../types/health';
import type { JsonObject, Publication } from '../information/publication';

/**
 * Saúde regional, surtos e resposta pública (PLANO_EXPANSAO F08, EX-26/EX-27). Estado do país, não do governo: a rede
 * de saúde e o surto atravessam as trocas de administração. Pessoas em **milhares**, como a demografia.
 */

/** Capacidade sanitária de uma UF. `beds` é a rede permanente; `emergencyBeds`, o que a resposta federal instalou. */
export interface HealthUf {
  id: string;
  region: MacroRegion;
  /** Leitos de internação SUS (milhares). */
  beds: number;
  /** Leitos de emergência ativos no mês (milhares). */
  emergencyBeds: number;
  /** Cobertura da atenção básica (fração da população). */
  primary: number;
  /** Índice de vigilância epidemiológica (0–1). */
  surveillance: number;
  /** Fração da população que a rede consegue vacinar por mês. */
  vaccination: number;
  /** Prevenção estrutural contra vetores (fração da transmissão vetorial evitada). */
  prevention: number;
  /** Leitos ocupados em média no mês (milhares): rotina e surto. */
  routineDemand: number;
  outbreakDemand: number;
}

/** Compartimentos do modelo (milhares de pessoas). */
export interface Compartments {
  /** Suscetíveis. */
  s: number;
  /** Expostos (infectados, ainda sem transmitir). */
  e: number;
  /** Infecciosos. */
  i: number;
  /** Internados. */
  h: number;
  /** Recuperados ou imunizados. */
  r: number;
}

export interface OutbreakUf {
  id: string;
  c: Compartments;
  /** População da UF no início do mês (milhares): `s+e+i+h+r + mortes do mês = population`. */
  population: number;
  /** Fluxos do mês (milhares). */
  monthInfections: number;
  monthHospital: number;
  monthDeaths: number;
  monthVaccinated: number;
  /** Já vacinados nesta crise (milhares de pessoas). */
  vaccinated: number;
  /** Acumulados reais da crise (verdade do motor, nunca mostrada como fato). */
  infections: number;
  deaths: number;
  /** Meses com ocupação acima da capacidade. */
  overCapacityMonths: number;
}

/** Verdade de um surto, sorteada no início dentro das faixas da doença. O jogador nunca a vê. */
export interface OutbreakTruth {
  r0: number;
  hospitalRate: number;
  /** Mês em que a vacina passa a existir. */
  vaccineMonth: number;
}

/** `silencioso`: ninguém sabe; `alerta`: notificações sem agente; `identificado`: agente conhecido. */
export type OutbreakPhase = 'silencioso' | 'alerta' | 'identificado';

/** Critério de distribuição do lote nacional de leitos de emergência. */
export type BedCriterion = 'ocupacao' | 'populacao' | 'pedidos' | 'aliados';
export const BED_CRITERIA: readonly BedCriterion[] = ['ocupacao', 'populacao', 'pedidos', 'aliados'];

export interface ActiveMeasure {
  id: MeasureId;
  startMonth: number;
  criterion?: BedCriterion;
}

export type RequestStatus = 'pendente' | 'atendido' | 'expirado';

/** Pedido de apoio de um governador quando a ocupação notificada passa do limite. */
export interface GovernorRequest {
  uf: string;
  month: number;
  /** Leitos pedidos (milhares), pela ocupação notificada. */
  bedsNeeded: number;
  status: RequestStatus;
  closedMonth?: number;
}

/** Estimativa do governo (faixas), recalculada a cada mês a partir das notificações. */
export interface OutbreakEstimate {
  month: number;
  /** Número de reprodução efetivo do mês. */
  r: [number, number];
  /** Fração das infecções que interna. */
  hospitalRate: [number, number];
}

/** Livro-caixa da crise para o balanço: o que foi gasto e o que se observou. */
export interface OutbreakLedger {
  /** Gasto federal da resposta (R$ milhões correntes). */
  fiscalMillions: number;
  /** Soma das perdas de atividade (pontos do PIB-mês, estimativa do modelo). */
  activityLoss: number;
  /** Soma dos efeitos sobre a aprovação (fração). */
  approval: number;
  measureMonths: Partial<Record<MeasureId, number>>;
  observedCases: number;
  observedDeaths: number;
  peakObservedOccupancy: number;
  peakUf: string | null;
  /** Maior número de infecções num mês (verdade do motor; só decide o fim da crise). */
  peakInfections: number;
  trustAtDetection: number | null;
}

export interface Outbreak {
  id: string;
  diseaseId: string;
  originUf: string;
  startMonth: number;
  phase: OutbreakPhase;
  detectedMonth?: number;
  identifiedMonth?: number;
  investigatedMonth?: number;
  truth: OutbreakTruth;
  ufs: OutbreakUf[];
  measures: ActiveMeasure[];
  estimate?: OutbreakEstimate;
  requests: GovernorRequest[];
  ledger: OutbreakLedger;
  /** Meses seguidos com poucos casos ativos (encerra a crise). */
  quietMonths: number;
  /** Ocupação notificada por UF no último boletim. */
  observedOccupancy: Record<string, number>;
  /** Boletim completo do mês, publicado como revisão no mês seguinte (atraso de notificação). */
  pendingRevision?: JsonObject;
}

/** Balanço de uma crise encerrada: observados, estimativas (faixas) e contas. */
export interface CrisisReport {
  outbreakId: string;
  diseaseId: string;
  diseaseName: string;
  detectedMonth: number | null;
  identifiedMonth: number | null;
  endMonth: number;
  observed: {
    cases: number;
    deaths: number;
    peakOccupancy: number;
    peakUf: string | null;
    ufsOverCapacity: string[];
    fiscalMillions: number;
    requestsServed: number;
    requestsExpired: number;
    measures: { id: MeasureId; months: number }[];
  };
  estimated: {
    infections: [number, number];
    deaths: [number, number];
    activityLossPp: number;
    approvalPp: number;
  };
  trustChange: number | null;
}

export interface HealthState {
  ufs: HealthUf[];
  outbreaks: Outbreak[];
  /** Boletins epidemiológicos (publicações com revisão), os mais recentes por último. */
  bulletins: Publication[];
  history: CrisisReport[];
  /** Mortes do mês por UF e faixa etária (milhares), consumidas pela demografia. */
  monthDeaths: { id: string; young: number; working: number; older: number }[];
  /** Nível da perda de atividade no mês anterior (para o hiato em nível). */
  activityGap: { illness: number; restrictions: number };
  /** Último mês em que cada doença terminou (intervalo até um novo surto). */
  lastEnded: Record<string, number>;
}

export type HealthLevers = Record<HealthLeverId, number>;
