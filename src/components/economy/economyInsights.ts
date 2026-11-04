import { toCalendar, type MandatoryGroup } from '@/engine';

/**
 * Leituras da aba Economia (PLANO_QUICK_WINS.md, Fase Q10): próxima reunião do Copom, postura do Banco Central,
 * piso das discricionárias, engessamento do orçamento, peso dos juros na receita, sensibilidade dos setores e
 * salário mínimo em R$. Puro: recebe números do estado, da calibração e do cenário e devolve texto e tom.
 */

export type InsightTone = 'textSecondary' | 'positive' | 'warning' | 'negative';

const months = (n: number) => `${n} ${n === 1 ? 'mês' : 'meses'}`;

// ---------------------------------------------------------------------------------------------------------------
// Próxima reunião do Copom (B40)
// ---------------------------------------------------------------------------------------------------------------

export interface NextCopom {
  /** Mês (monthIndex) da próxima reunião; o mês atual conta, porque a decisão sai ao encerrá-lo. */
  monthIndex: number;
  /** 0 = reunião neste mês. */
  inMonths: number;
}

/**
 * O motor decide a Selic ao encerrar um mês cujo número no ano (1–12) está em `copomMonths` do cenário. A
 * próxima reunião é o primeiro mês, a partir do atual, que cai nessa lista. `null` se a lista estiver vazia.
 */
export function nextCopom(monthIndex: number, copomMonths: readonly number[]): NextCopom | null {
  if (copomMonths.length === 0) return null;
  for (let ahead = 0; ahead < 12; ahead += 1) {
    const m = monthIndex + ahead;
    if (copomMonths.includes(toCalendar(m).month)) return { monthIndex: m, inMonths: ahead };
  }
  return null;
}

/** "Neste mês: a decisão sai ao encerrar o mês" ou "Em 2 meses". */
export function nextCopomWhen(next: NextCopom): string {
  return next.inMonths === 0 ? 'Neste mês: a decisão sai ao encerrar o mês' : `Daqui a ${months(next.inMonths)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Postura do Banco Central (B71)
// ---------------------------------------------------------------------------------------------------------------

export type StanceKind = 'contracionista' | 'neutra' | 'expansionista';

export interface MonetaryStance {
  kind: StanceKind;
  label: string;
  /** Juro real menos o juro neutro, em fração (0,02 = 2 p.p. acima). */
  gap: number;
  text: string;
}

/** Folga em torno do juro neutro dentro da qual a postura conta como neutra (0,5 p.p.). */
export const STANCE_BAND = 0.005;

const STANCE_LABEL: Record<StanceKind, string> = {
  contracionista: 'Contracionista',
  neutra: 'Neutra',
  expansionista: 'Expansionista',
};

/**
 * Compara o juro real que chega à economia com o juro neutro da calibração (`juro_neutro`): acima, o BC freia a
 * atividade; abaixo, estimula. É o mesmo termo que o motor usa no hiato do produto.
 */
export function monetaryStance(realRate: number, neutralRate: number, band = STANCE_BAND): MonetaryStance {
  const gap = realRate - neutralRate;
  const kind: StanceKind = gap > band ? 'contracionista' : gap < -band ? 'expansionista' : 'neutra';
  const pp = (Math.abs(gap) * 100).toFixed(1).replace('.', ',');
  const text =
    kind === 'neutra'
      ? 'Juro real perto do neutro: o BC nem freia nem estimula a atividade.'
      : kind === 'contracionista'
        ? `Juro real ${pp} p.p. acima do neutro: freia a atividade e a inflação.`
        : `Juro real ${pp} p.p. abaixo do neutro: estimula a atividade e pode pressionar a inflação.`;
  return { kind, label: STANCE_LABEL[kind], gap, text };
}

// ---------------------------------------------------------------------------------------------------------------
// Discricionárias perto do piso (B72)
// ---------------------------------------------------------------------------------------------------------------

/** A partir de quanto acima do piso o alerta acende: até 25% acima (`piso × 1,25`). */
export const FLOOR_ALERT_MARGIN = 0.25;

export type FloorAlert = { level: 'abaixo' } | { level: 'perto'; room: number };

/**
 * `abaixo`: já abaixo do piso de funcionamento (serviços parando, o motor cobra aprovação). `perto`: a menos de
 * `FLOOR_ALERT_MARGIN` do piso; `room` é a folga em fração do PIB. `null`: longe do piso.
 */
export function discretionaryFloorAlert(
  discretionary: number,
  floor: number,
  margin = FLOOR_ALERT_MARGIN,
): FloorAlert | null {
  if (discretionary < floor) return { level: 'abaixo' };
  if (discretionary < floor * (1 + margin)) return { level: 'perto', room: discretionary - floor };
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Engessamento e juros (B73, B74)
// ---------------------------------------------------------------------------------------------------------------

export interface SpendingMix {
  mandatory: Readonly<Record<MandatoryGroup, number>>;
  linked: number;
  policyMandatory: number;
  discretionary: number;
}

/**
 * Parte da despesa primária que o governo não escolhe no mês: obrigatórias por lei, vinculadas à receita (saúde,
 * educação e emendas) e obrigatórias criadas por políticas, sobre a soma delas com as discricionárias livres.
 */
export function rigidityShare(mix: SpendingMix): number {
  const fixed =
    Object.values(mix.mandatory).reduce((sum, v) => sum + v, 0) + mix.linked + Math.max(0, mix.policyMandatory);
  const total = fixed + Math.max(0, mix.discretionary);
  return total > 0 ? fixed / total : 0;
}

/** Juros nominais da dívida sobre a receita primária (as duas em fração do PIB, anualizadas). */
export function interestShareOfRevenue(interest: number, revenue: number): number | null {
  return revenue > 0 ? interest / revenue : null;
}

/** Tom das razões: até `warn` é neutro, até `bad` é atenção, acima é ruim. */
export function shareTone(share: number, warn: number, bad: number): InsightTone {
  return share > bad ? 'negative' : share > warn ? 'warning' : 'textSecondary';
}

// ---------------------------------------------------------------------------------------------------------------
// Sensibilidade dos setores (B75)
// ---------------------------------------------------------------------------------------------------------------

export type SensitivityLevel = 'alta' | 'media' | 'baixa';

export interface SectorSensitivity {
  level: SensitivityLevel;
  label: string;
}

/**
 * Só existe na calibração da sociedade a sensibilidade aos termos de troca (preço das exportações, que anda com o
 * câmbio e as commodities). Juros e crédito chegam a todos os setores pelo mesmo PIB, então não ganham etiqueta.
 */
export function sectorSensitivity(termsOfTrade: number): SectorSensitivity {
  if (termsOfTrade >= 0.4) return { level: 'alta', label: 'Câmbio e commodities: sensibilidade alta' };
  if (termsOfTrade >= 0.15) return { level: 'media', label: 'Câmbio e commodities: sensibilidade média' };
  return { level: 'baixa', label: 'Câmbio e commodities: sensibilidade baixa' };
}

// ---------------------------------------------------------------------------------------------------------------
// Salário mínimo em R$ (A64, D-Q4)
// ---------------------------------------------------------------------------------------------------------------

/**
 * O motor guarda o salário mínimo como índice real (jan/2027 = 1). O valor nominal é o valor-base do cenário ×
 * o índice × o nível de preços acumulado desde a posse (também 1 em jan/2027).
 */
export function minimumWageReais(baseReais: number, realIndex: number, priceLevel: number): number {
  return baseReais * realIndex * priceLevel;
}
