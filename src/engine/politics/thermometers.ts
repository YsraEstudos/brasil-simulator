import { PRONOUNCEMENT_ACTION_ID } from '../actions';
import { openCases } from '../congress/cases';
import { camaraPresidentRelation, pendingRequests } from '../congress/drawer';
import { directorateScandalRisk } from '../congress/directorates';
import { IMPEACHMENT_PARAMS } from '../events/calibration';
import { impeachmentPressure, meanCongressRelation } from '../events/pressure';
import type { GameContent, GameState, ScheduledImpulse, StepContext } from '../types';

/**
 * Termômetros e pronunciamento (PLANO_CAMPANHA.md Fase C6g; GAME_DESIGN.md §11.3.4). Cada termômetro é uma **leitura
 * derivada** do estado, em 0–100 (mais alto = mais tensão), não uma pesquisa de opinião de grupos: 50 + a soma dos
 * fatores, limitada a [0, 100]. Cada fator diz quantos pontos soma, então a leitura é reproduzível a partir dos
 * indicadores. Calculado na hora (todo mês, sem estado próprio e sem sorteio).
 *
 * - **Congresso:** relação média dos blocos, pauta-bomba à espera de sanção ou de sessão do veto (Fase C6c) e
 *   presidência da Câmara hostil (Fase C6e).
 * - **Ruas:** aprovação, desemprego e inflação em relação às referências neutras.
 * - **Mercado:** prêmio de risco, credibilidade e despesa acima do limite.
 * - **Instituições:** pressão de impeachment, casos de escândalo abertos (C6b), pedidos na gaveta (C6e) e risco de
 *   escândalo nas diretorias (C6a).
 *
 * O pronunciamento à nação (ação de agenda) rende aprovação que cai pela metade a cada pronunciamento dos últimos
 * `pronunciamento_meses` meses e de novo pela metade com o termômetro das ruas crítico.
 */

export type ThermometerId = 'congresso' | 'ruas' | 'mercado' | 'instituicoes';
export type ThermometerBand = 'calmo' | 'normal' | 'tenso' | 'critico';

export interface ThermometerFactor {
  label: string;
  /** Pontos somados à base 50 (negativo = alivia). */
  points: number;
}

export interface Thermometer {
  id: ThermometerId;
  label: string;
  /** 0–100, mais alto = mais tensão. */
  value: number;
  band: ThermometerBand;
  factors: ThermometerFactor[];
}

const BASE = 50;
const MIN = 0;
const MAX = 100;
const PAUTA_BOMBA_CAUSE = 'pauta_bomba';

export const THERMOMETER_LABEL: Record<ThermometerId, string> = {
  congresso: 'Congresso',
  ruas: 'Ruas',
  mercado: 'Mercado',
  instituicoes: 'Instituições',
};

export const BAND_LABEL: Record<ThermometerBand, string> = {
  calmo: 'calmo',
  normal: 'normal',
  tenso: 'tenso',
  critico: 'crítico',
};

export function bandOf(value: number): ThermometerBand {
  return value < 40 ? 'calmo' : value < 60 ? 'normal' : value < 75 ? 'tenso' : 'critico';
}

function reading(id: ThermometerId, factors: ThermometerFactor[]): Thermometer {
  const value = Math.min(MAX, Math.max(MIN, BASE + factors.reduce((s, f) => s + f.points, 0)));
  return { id, label: THERMOMETER_LABEL[id], value, band: bandOf(value), factors };
}

/** Pautas-bomba esperando sanção ou sessão do veto (causa `pauta_bomba` no histórico, Fase C6c). */
function pendingFiscalBombs(state: Readonly<GameState>): number {
  return state.proposals.filter(
    (p) =>
      (p.status === 'aguardando_sancao' || p.status === 'apreciacao_veto') &&
      p.history.some((h) => h.cause === PAUTA_BOMBA_CAUSE),
  ).length;
}

export function thermometers(state: Readonly<GameState>, content: GameContent): Thermometer[] {
  const c = content.calibration;
  const ind = state.indicators;
  const eco = state.economy;

  const congress = reading('congresso', [
    { label: 'Relação média com os blocos', points: -c.termo_congresso_relacao * meanCongressRelation(state, content) },
    { label: 'Pauta-bomba à espera de decisão', points: c.termo_congresso_pauta * pendingFiscalBombs(state) },
    {
      label: 'Presidência da Câmara hostil',
      points: camaraPresidentRelation(state, content) < c.gaveta_relacao_abertura ? c.termo_congresso_presidencia : 0,
    },
  ]);

  const streets = reading('ruas', [
    {
      label: 'Aprovação do governo',
      points: c.termo_ruas_aprovacao * (IMPEACHMENT_PARAMS.aprovacao_neutra.value - ind.approval),
    },
    {
      label: 'Desemprego',
      points: c.termo_ruas_desemprego * (ind.unemployment - IMPEACHMENT_PARAMS.desemprego_neutro.value),
    },
    { label: 'Inflação em 12 meses', points: c.termo_ruas_inflacao * (ind.inflation12m - c.meta_inflacao) },
  ]);

  const market = reading('mercado', [
    { label: 'Prêmio de risco', points: c.termo_mercado_premio * (eco.riskPremium - c.premio_base) },
    { label: 'Credibilidade da política econômica', points: c.termo_mercado_credibilidade * (0.5 - eco.credibility) },
    { label: 'Despesa acima do limite', points: c.termo_mercado_limite * Math.max(0, eco.fiscal.limitExcess) },
  ]);

  const institutions = reading('instituicoes', [
    { label: 'Pressão de impeachment', points: c.termo_inst_pressao * impeachmentPressure(state, content) },
    { label: 'Casos de escândalo abertos', points: c.termo_inst_caso * openCases(state).length },
    { label: 'Pedidos de impeachment na gaveta', points: c.termo_inst_pedido * pendingRequests(state).length },
    {
      label: 'Risco de escândalo nas diretorias',
      points: c.termo_inst_diretoria * directorateScandalRisk(state, content),
    },
  ]);

  return [congress, streets, market, institutions];
}

/** Pronunciamentos à nação nos últimos `pronunciamento_meses` meses (pelo registro de decisões). */
export function recentPronouncements(state: Readonly<GameState>, content: GameContent): number {
  const window = content.calibration.pronunciamento_meses;
  return state.decisionLog.filter(
    (r) => r.decision.policyId === PRONOUNCEMENT_ACTION_ID && r.monthIndex > state.monthIndex - window,
  ).length;
}

/** Ganho de aprovação de um pronunciamento neste mês (o que o cartão da ação mostra antes de agir). */
export function pronouncementGain(state: Readonly<GameState>, content: GameContent): number {
  const c = content.calibration;
  const streets = thermometers(state, content).find((t) => t.id === 'ruas')!;
  const fatigue = 0.5 ** recentPronouncements(state, content);
  return c.pronunciamento_aprovacao * fatigue * (streets.band === 'critico' ? 0.5 : 1);
}

/** Aplica o pronunciamento decidido no mês: impulso de aprovação de um mês e a nota do relatório. */
export function applyPronouncement(state: GameState, ctx: StepContext): GameState {
  if (!ctx.decisions.some((d) => d.policyId === PRONOUNCEMENT_ACTION_ID)) return state;
  const t = state.monthIndex;
  const gain = pronouncementGain(state, ctx.content);
  const impulse: ScheduledImpulse = {
    sourceId: `acao:${PRONOUNCEMENT_ACTION_ID}_${t}`,
    label: 'Pronunciamento à nação',
    target: 'aprovacao',
    delta: gain,
    startMonth: t,
    endMonth: t,
  };
  const recent = recentPronouncements(state, ctx.content);
  ctx.draft.notes.push(
    recent > 0
      ? `Pronunciamento à nação: o efeito foi menor porque houve ${recent} nos últimos meses.`
      : 'Pronunciamento à nação em rede nacional.',
  );
  return { ...state, impulses: [...state.impulses, impulse] };
}
