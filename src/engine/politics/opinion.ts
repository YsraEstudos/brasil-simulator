import { TERM_MONTHS } from '../calendar';
import { activeImpulses } from '../impulses';
import type { Contribution, GameState, MonthStep } from '../types';

/** Limites da escala do capital político (GAME_DESIGN.md §5: 0–100). */
const CAPITAL_MIN = 0;
const CAPITAL_MAX = 100;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Opinião pública (POLITICAL_RULES.md §11.1; ECONOMIC_MODEL.md §5.11). Roda depois da economia, então
 * `state.indicators` já traz o mês. Não altera indicadores: devolve as contribuições, e o `advanceMonth` as soma.
 */
export const opinionStep: MonthStep = (state, ctx) => {
  const c = ctx.content.calibration;
  const i = state.indicators;
  const t = state.monthIndex;
  const a = i.approval;
  // Lua de mel: nos primeiros meses do mandato, perdas de aprovação pesam menos (fator_lua_de_mel).
  const honeymoon = t % TERM_MONTHS < c.meses_lua_de_mel;
  const adj = c.ajuste_aprovacao;

  const scaled = (delta: number): number => (honeymoon && delta < 0 ? delta * c.fator_lua_de_mel : delta);

  const candidates: Contribution[] = [
    // Retorno ao nível habitual: não é reduzido pela lua de mel.
    {
      indicator: 'approval',
      cause: 'tendencia_aprovacao',
      label: 'Retorno ao nível habitual',
      delta: adj * (c.aprovacao_base - a),
    },
    {
      indicator: 'approval',
      cause: 'inflacao',
      label: 'Inflação',
      delta: scaled(adj * c.peso_inflacao * (c.meta_inflacao - i.inflation12m)),
    },
    {
      indicator: 'approval',
      cause: 'desemprego',
      label: 'Desemprego',
      delta: scaled(adj * c.peso_desemprego * (c.nairu - i.unemployment)),
    },
    {
      indicator: 'approval',
      cause: 'crescimento',
      label: 'Crescimento da economia',
      delta: scaled(adj * c.peso_crescimento * (i.gdpGrowth12m - c.g_pot_base)),
    },
  ];

  for (const impulse of activeImpulses(state.impulses, t, ['aprovacao'])) {
    candidates.push({
      indicator: 'approval',
      cause: impulse.sourceId,
      label: impulse.label,
      delta: scaled(impulse.delta),
    });
  }

  const contributions = candidates.filter((item) => item.delta !== 0);
  const sumDeltas = contributions.reduce((s, item) => s + item.delta, 0);
  const a1 = a + sumDeltas;
  // Saturação: a aprovação final fica sempre dentro de [aprovacao_min, aprovacao_max].
  if (a1 > c.aprovacao_max) {
    contributions.push({
      indicator: 'approval',
      cause: 'saturacao',
      label: 'Limite da aprovação',
      delta: c.aprovacao_max - a1,
    });
  } else if (a1 < c.aprovacao_min) {
    contributions.push({
      indicator: 'approval',
      cause: 'saturacao',
      label: 'Limite da aprovação',
      delta: c.aprovacao_min - a1,
    });
  }

  const approvalFinal = clamp(a1, c.aprovacao_min, c.aprovacao_max);

  // Capital político: recurso, sem contribuições. Vai para a meta definida pela aprovação final.
  const capitalTarget = c.capital_base + c.capital_peso_aprovacao * approvalFinal;
  const capitalImpulses = activeImpulses(state.impulses, t, ['capital_politico']).reduce((s, imp) => s + imp.delta, 0);
  const cap = state.resources.politicalCapital;
  const capital1 = clamp(cap + c.ajuste_capital * (capitalTarget - cap) + capitalImpulses, CAPITAL_MIN, CAPITAL_MAX);

  const next: GameState = {
    ...state,
    resources: { ...state.resources, politicalCapital: capital1 },
  };
  return { state: next, contributions };
};
