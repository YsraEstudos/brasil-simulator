import { MARKER_CRITICAL_SEVERITY } from '@/components/map/markersView';
import type { EventLocation } from '@/engine';

/**
 * Gravidade dos eventos para a interface (PLANO_QUICK_WINS.md, Fase Q12): a mesma regra decide o filtro da gaveta de
 * Alertas (B82) e a edição extra do jornal (B86). O conteúdo dos eventos não tem campo de gravidade; esta lista é de
 * interface e não muda nenhum resultado do motor.
 */

export type GraveKind = 'escandalo' | 'crise' | 'desastre';

/** Escândalo, crise grave e desastre. Versões novas do mesmo evento (`_v2`) entram com a mesma marca. */
export const GRAVE_EVENTS: Readonly<Record<string, GraveKind>> = {
  escandalo_ministerio: 'escandalo',
  saida_capitais: 'crise',
  fase07_eco_fuga_capitais_ruido_fiscal: 'crise',
  revisao_rating: 'crise',
  paralisacao_maquina: 'crise',
  fase07_eco_bancos_preveem_recessao: 'crise',
  seca_safra_energia: 'desastre',
  seca_safra_energia_v2: 'desastre',
  enchentes_metropole: 'desastre',
  enchentes_metropole_v2: 'desastre',
};

/**
 * O evento é grave? Desastre com local só conta com a severidade que deixa o marcador do mapa crítico
 * (`MARKER_CRITICAL_SEVERITY`): uma cheia leve não é desastre. Sem severidade gravada, vale a marca da lista.
 */
export function isGraveEvent(eventId: string | undefined, location?: EventLocation): boolean {
  if (eventId === undefined) return false;
  const kind = GRAVE_EVENTS[eventId];
  if (kind === undefined) return false;
  const severities = Object.values(location?.severityByUf ?? {});
  if (kind !== 'desastre' || severities.length === 0) return true;
  return Math.max(...severities) >= MARKER_CRITICAL_SEVERITY;
}

// ---------------------------------------------------------------------------------------------------------------
// Gravidade na gaveta de Alertas (B82)
// ---------------------------------------------------------------------------------------------------------------

export type AlertSeverity = 'critico' | 'aviso' | 'informativo';

export const ALERT_SEVERITIES: readonly AlertSeverity[] = ['critico', 'aviso', 'informativo'];

export const ALERT_SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critico: 'Críticos',
  aviso: 'Avisos',
  informativo: 'Informativos',
};

/** Evento grave é crítico; os demais pedem resposta (senão vale o padrão) e são avisos. */
export function eventSeverity(eventId: string, location?: EventLocation): AlertSeverity {
  return isGraveEvent(eventId, location) ? 'critico' : 'aviso';
}

/**
 * Sanção com acréscimos do relator é aviso (sem resposta, a despesa extra entra por sanção tácita); sem acréscimos,
 * a sanção tácita é o que o governo pediu, então é informativo.
 */
export function sanctionSeverity(rider: number): AlertSeverity {
  return rider > 0 ? 'aviso' : 'informativo';
}

export function severityCounts(severities: readonly AlertSeverity[]): Record<AlertSeverity, number> {
  const counts: Record<AlertSeverity, number> = { critico: 0, aviso: 0, informativo: 0 };
  for (const s of severities) counts[s] += 1;
  return counts;
}
