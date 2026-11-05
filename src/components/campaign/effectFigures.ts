import { formatMoneyMillions, formatNumber, type FiscalDisplayUnit } from '@/components/ui/format';
import { createRng, seedRng, type Difficulty, type ImpulseTarget, type PolicyEffectForecast } from '@/engine';
import type { EventChoiceDefinition } from '@/types/event';

/**
 * Números nos cartões de evento e de política (PLANO_SAVES_HISTORICO.md, H9/D3). Segue a regra da mesa de despacho
 * (`voteEstimate`, GAME_DESIGN.md §6 "Previsões dos ministérios"): valor exato no Casual; faixa na Estratégica;
 * faixa mais larga e com viés otimista da pasta no Realismo Extremo. O centro da faixa é deslocado por um sorteio
 * fixo (semente da partida, mês e id), como nos votos: o meio da faixa não entrega o valor exato.
 *
 * Só mostra o que o conteúdo declara: efeitos das escolhas de evento (`choice.effects`) e, nas políticas, o custo
 * fiscal e o efeito na aprovação que a própria mesa de despacho calcula (`policyEffectForecast`). Riscos
 * (probabilidades de escândalo, atraso…) e cadeias de eventos não têm número para o jogador e ficam de fora.
 */

/**
 * Meia-largura da faixa, em fração do valor, e viés do Realismo (fração do valor, no sentido "bom"). São da
 * qualidade da previsão mostrada, não da economia: por isso ficam aqui, como `ADVICE_PARAMS` na mesa de despacho.
 */
export const FIGURE_RANGE = {
  marginEstrategica: 0.5,
  marginRealismo: 0.8,
  biasRealismo: 0.25,
} as const;

const MINUS = '−';
const HASH_OFFSET_BASIS = 2166136261;
const HASH_PRIME = 16777619;

export interface FigureContext {
  difficulty: Difficulty;
  /** Semente da partida (`state.seed`) e mês (`state.monthIndex`): a faixa muda de mês para mês, como os votos. */
  seed: number;
  monthIndex: number;
}

export type FigureTone = 'positive' | 'negative' | 'neutral';

export interface EffectFigure {
  key: string;
  /** "Aprovação +1,2 p.p." ou "Aprovação +0,6 a +1,8 p.p.". */
  text: string;
  tone: FigureTone;
  /** Valor exato (Casual) ou faixa. */
  exact: boolean;
}

/** Faixa em passos de exibição (inteiros). `low === high` no Casual. */
export interface StepRange {
  low: number;
  high: number;
  exact: boolean;
}

function hashKey(ctx: FigureContext, key: string): number {
  let h = Math.imul((ctx.seed >>> 0) ^ HASH_OFFSET_BASIS, HASH_PRIME) >>> 0;
  h = Math.imul(h ^ ctx.monthIndex, HASH_PRIME) >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), HASH_PRIME) >>> 0;
  return h;
}

/**
 * `value` já em passos de exibição (ex.: 12 = 1,2 p.p. com uma casa). Casual: o valor arredondado. Fora dele:
 * faixa com o centro sorteado em ±margem, arredondada para fora e sem cruzar o zero (o sentido do efeito já está
 * na descrição da escolha). `goodWhen` dá o sentido do viés otimista do Realismo.
 */
export function figureRange(value: number, goodWhen: 'up' | 'down', ctx: FigureContext, key: string): StepRange {
  if (ctx.difficulty === 'casual') {
    const exact = Math.round(value);
    return { low: exact, high: exact, exact: true };
  }
  const realismo = ctx.difficulty === 'realismo';
  const margin = Math.max(
    1,
    Math.abs(value) * (realismo ? FIGURE_RANGE.marginRealismo : FIGURE_RANGE.marginEstrategica),
  );
  const bias = realismo ? Math.abs(value) * FIGURE_RANGE.biasRealismo * (goodWhen === 'up' ? 1 : -1) : 0;
  const rng = createRng(seedRng(hashKey(ctx, key)));
  const center = value + (rng.float() * 2 - 1) * margin + bias;
  let low = Math.floor(center - margin);
  let high = Math.ceil(center + margin);
  if (value > 0) low = Math.max(low, 0);
  if (value < 0) high = Math.min(high, 0);
  if (low === high) {
    if (value >= 0) high += 1;
    else low -= 1;
  }
  return { low, high, exact: false };
}

function signed(steps: number, decimals: number): string {
  const body = formatNumber(Math.abs(steps) / 10 ** decimals, decimals);
  return steps > 0 ? `+${body}` : steps < 0 ? `${MINUS}${body}` : body;
}

function rangeText(r: StepRange, decimals: number, format: (steps: number) => string = (s) => signed(s, decimals)) {
  return r.exact ? format(r.low) : `${format(r.low)} a ${format(r.high)}`;
}

/** Como cada alvo de evento vira número no cartão: fator para a unidade de exibição, casas e sufixo. */
interface TargetSpec {
  label: string;
  factor: number;
  decimals: number;
  suffix: string;
  goodWhen: 'up' | 'down';
  /** Somado em cada mês ativo (a escolha vale `delta × meses`); `false` = nível enquanto ativo. */
  perMonth: boolean;
}

const POINTS = ' pontos';
const PP = ' p.p.';

/** Alvos com unidade que o jogador lê direto. Os demais (hiato, câmbio, regiões…) ficam no "Por que mudou?". */
const EVENT_TARGETS: Partial<Record<ImpulseTarget, TargetSpec>> = {
  aprovacao: { label: 'Aprovação', factor: 100, decimals: 1, suffix: PP, goodWhen: 'up', perMonth: true },
  intencao: { label: 'Intenção de voto', factor: 100, decimals: 1, suffix: PP, goodWhen: 'up', perMonth: true },
  capital_politico: {
    label: 'Capital político',
    factor: 1,
    decimals: 0,
    suffix: POINTS,
    goodWhen: 'up',
    perMonth: true,
  },
  relacao_congresso: { label: 'Congresso', factor: 1, decimals: 0, suffix: POINTS, goodWhen: 'up', perMonth: true },
  'governadores.relacao': {
    label: 'Governadores',
    factor: 1,
    decimals: 0,
    suffix: POINTS,
    goodWhen: 'up',
    perMonth: true,
  },
  credibilidade: { label: 'Credibilidade', factor: 100, decimals: 1, suffix: POINTS, goodWhen: 'up', perMonth: true },
  'choque.inflacao': { label: 'Inflação', factor: 100, decimals: 1, suffix: PP, goodWhen: 'down', perMonth: false },
};

/** Gasto (e receita perdida) contra receita extra, como na Fazenda da mesa de despacho (`adviseEventChoice`). */
const EVENT_SPENDING: ReadonlySet<ImpulseTarget> = new Set<ImpulseTarget>([
  'gasto.investimento',
  'gasto.custeio',
  'gasto.transferencia_baixa_renda',
  'gasto.transferencia_alta_renda',
  'gasto.obrigatoria',
  'gasto.extraordinario',
  'receita.desoneracao_consumo',
  'receita.desoneracao_renda',
]);
const EVENT_REVENUE: ReadonlySet<ImpulseTarget> = new Set<ImpulseTarget>([
  'receita.tributaria',
  'receita.renda',
  'receita.consumo',
]);

const FISCAL_DECIMALS = 2;
const FISCAL_STEP = 10 ** -(FISCAL_DECIMALS + 2);

function toneOf(steps: number, goodWhen: 'up' | 'down'): FigureTone {
  if (steps === 0) return 'neutral';
  return steps > 0 === (goodWhen === 'up') ? 'positive' : 'negative';
}

/**
 * Custo (ou economia) fiscal ao ano, fração do PIB: "Custo 0,20% do PIB/ano" ou, em R$, "Custo R$ 24,0 bi/ano".
 * A faixa é feita sobre o valor absoluto, em passos de 0,01% do PIB.
 */
function fiscalFigure(
  fraction: number,
  ctx: FigureContext,
  key: string,
  unit: FiscalDisplayUnit,
  gdpMillions: number,
): EffectFigure | null {
  const steps = Math.abs(fraction) / FISCAL_STEP;
  if (Math.round(steps) === 0) return null;
  const cost = fraction > 0;
  const r = figureRange(steps, cost ? 'down' : 'up', ctx, key);
  const format = (s: number) =>
    unit === 'reais'
      ? formatMoneyMillions(s * FISCAL_STEP * gdpMillions)
      : `${formatNumber(s / 10 ** FISCAL_DECIMALS, FISCAL_DECIMALS)}%`;
  const body = rangeText(r, FISCAL_DECIMALS, format);
  const text = `${cost ? 'Custo' : 'Economia'} ${body}${unit === 'reais' ? '/ano' : ' do PIB/ano'}`;
  return { key: 'fiscal', text, tone: cost ? 'negative' : 'positive', exact: r.exact };
}

/**
 * Números de uma escolha de evento, na ordem dos alvos acima e com o custo fiscal no fim. Efeito permanente de
 * alvo mensal ganha "/mês". `ownerId` (id do evento) entra no sorteio da faixa.
 */
export function eventChoiceFigures(
  ownerId: string,
  choice: Pick<EventChoiceDefinition, 'id' | 'effects'>,
  ctx: FigureContext,
  unit: FiscalDisplayUnit,
  gdpMillions: number,
): EffectFigure[] {
  const out: EffectFigure[] = [];
  for (const [target, spec] of Object.entries(EVENT_TARGETS) as [ImpulseTarget, TargetSpec][]) {
    const hits = choice.effects.filter((e) => e.target === target);
    if (hits.length === 0) continue;
    const permanent = spec.perMonth && hits.some((e) => e.durationMonths === null);
    const total = hits.reduce(
      (n, e) => n + e.delta * (spec.perMonth && e.durationMonths !== null && !permanent ? e.durationMonths : 1),
      0,
    );
    const steps = total * spec.factor * 10 ** spec.decimals;
    if (Math.round(steps) === 0) continue;
    const r = figureRange(steps, spec.goodWhen, ctx, `${ownerId}:${choice.id}:${target}`);
    out.push({
      key: target,
      text: `${spec.label} ${rangeText(r, spec.decimals)}${spec.suffix}${permanent ? '/mês' : ''}`,
      tone: toneOf(Math.round(steps), spec.goodWhen),
      exact: r.exact,
    });
  }
  const sum = (targets: ReadonlySet<ImpulseTarget>) =>
    choice.effects.filter((e) => targets.has(e.target)).reduce((n, e) => n + e.delta, 0);
  const fiscal = fiscalFigure(
    sum(EVENT_SPENDING) - sum(EVENT_REVENUE),
    ctx,
    `${ownerId}:${choice.id}:fiscal`,
    unit,
    gdpMillions,
  );
  if (fiscal) out.push(fiscal);
  return out;
}

/** Números de uma política no catálogo: efeito na aprovação e custo fiscal, os mesmos da mesa de despacho. */
export function policyFigures(
  policyId: string,
  forecast: PolicyEffectForecast,
  ctx: FigureContext,
  unit: FiscalDisplayUnit,
): EffectFigure[] {
  const out: EffectFigure[] = [];
  const spec = EVENT_TARGETS.aprovacao!;
  const steps = forecast.approvalImpact * spec.factor * 10 ** spec.decimals;
  if (Math.round(steps) !== 0) {
    const r = figureRange(steps, 'up', ctx, `${policyId}:aprovacao`);
    out.push({
      key: 'aprovacao',
      text: `${spec.label} ${rangeText(r, spec.decimals)}${spec.suffix}`,
      tone: toneOf(Math.round(steps), 'up'),
      exact: r.exact,
    });
  }
  const fiscal = fiscalFigure(forecast.annualFiscalImpact, ctx, `${policyId}:fiscal`, unit, forecast.gdpMillions);
  if (fiscal) out.push(fiscal);
  return out;
}

/** Frase única para o leitor de tela: "Estimativa: Aprovação +0,6 a +1,8 p.p.; Custo …". */
export function figuresA11y(figures: readonly EffectFigure[]): string | undefined {
  if (figures.length === 0) return undefined;
  const prefix = figures.every((f) => f.exact) ? 'Efeitos' : 'Estimativa';
  return `${prefix}: ${figures.map((f) => f.text).join('; ')}`;
}
