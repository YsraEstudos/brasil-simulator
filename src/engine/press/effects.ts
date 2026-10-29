import type { MacroRegion } from '../../types/health';
import type { PressCatalog } from '../../types/press';
import type { GameState } from '../types';
import { pressParam } from './calibration';
import type { PressState } from './types';

/**
 * Leituras da imprensa usadas por outras etapas (a saúde lê confiança, tom e boatos). Só leitura, sem sorteio.
 */

export function initialPress(catalog: PressCatalog | undefined): PressState {
  return {
    trust: pressParam('confianca_inicial'),
    tone: 'rotina',
    toneMonth: null,
    outlets: (catalog?.outlets ?? []).map((o) => ({ id: o.id, reliability: o.reliability, confirmed: 0, refuted: 0 })),
    items: [],
    trustLog: [],
  };
}

export function pressOf(state: Pick<GameState, 'press'>): PressState {
  return state.press ?? initialPress(undefined);
}

/**
 * Pressão dos rumores em circulação sobre o comportamento numa macrorregião: queda da adesão às medidas e da procura
 * por vacina. Ponderada pela audiência e pelo alcance do veículo e pela fração que ainda circula. Rumor verdadeiro
 * também pesa (medo ou revolta mudam comportamento), conforme o modelo do catálogo.
 */
export function rumorPressure(
  press: PressState,
  catalog: PressCatalog | undefined,
  region: MacroRegion,
): { adherence: number; vaccine: number } {
  let adherence = 0;
  let vaccine = 0;
  if (!catalog) return { adherence, vaccine };
  for (const item of press.items) {
    if (item.category !== 'rumor' || item.status !== 'circulando') continue;
    const spec = catalog.rumors.find((r) => r.id === item.rumorId);
    const outlet = catalog.outlets.find((o) => o.id === item.outletId);
    if (!spec || !outlet) continue;
    if (outlet.reach !== 'nacional' && outlet.reach !== region) continue;
    const weight = outlet.audience * (item.circulation ?? 1);
    adherence += spec.adherenceHit * weight;
    vaccine += spec.vaccineHit * weight;
  }
  return { adherence: Math.tanh(adherence), vaccine: Math.tanh(vaccine) };
}

/** Os boletins são públicos, exceto quando o governo adota o tom tranquilizador (guarda os números para si). */
export function bulletinsArePublic(press: PressState): boolean {
  return press.tone !== 'tranquilizador';
}
