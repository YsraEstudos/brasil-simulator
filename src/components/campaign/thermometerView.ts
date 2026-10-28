import { formatNumber } from '@/components/ui/format';
import {
  BAND_LABEL,
  pronouncementGain,
  recentPronouncements,
  thermometers,
  type GameContent,
  type GameState,
  type ThermometerBand,
} from '@/engine';

/**
 * Termômetros na tela (PLANO_CAMPANHA.md Fase C6g): valor 0–100, faixa e os dois fatores que mais pesam, em texto.
 * É uma leitura dos indicadores, não uma pesquisa: o cartão diz isso.
 */

export interface ThermometerRow {
  id: string;
  label: string;
  value: number;
  band: ThermometerBand;
  bandLabel: string;
  /** Os dois fatores de maior peso, com o sinal (ex.: "Aprovação do governo +12"). */
  drivers: string[];
}

export function thermometerRows(state: GameState, content: GameContent): ThermometerRow[] {
  return thermometers(state, content).map((t) => {
    const drivers = [...t.factors]
      .filter((f) => Math.round(f.points) !== 0)
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .slice(0, 2)
      .map((f) => `${f.label} ${f.points > 0 ? '+' : '−'}${formatNumber(Math.abs(f.points))}`);
    return {
      id: t.id,
      label: t.label,
      value: Math.round(t.value),
      band: t.band,
      bandLabel: BAND_LABEL[t.band],
      drivers,
    };
  });
}

/** Efeito provável do pronunciamento neste mês, para o cartão da ação. */
export function pronouncementContext(state: GameState, content: GameContent): string {
  const gain = pronouncementGain(state, content) * 100;
  const recent = recentPronouncements(state, content);
  const fatigue =
    recent > 0
      ? ` Já houve ${formatNumber(recent)} pronunciamento${recent > 1 ? 's' : ''} nos últimos ${formatNumber(content.calibration.pronunciamento_meses)} meses: o efeito cai pela metade a cada um.`
      : '';
  return `Efeito provável: aprovação ${formatNumber(gain, 1)} ponto percentual maior neste mês.${fatigue}`;
}
