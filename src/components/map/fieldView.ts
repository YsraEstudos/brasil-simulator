import { currentPrevention, projectUfs, VISIT_ACTION_ID, type GameContent, type GameState } from '@/engine';

import { visitAgo, workStatus } from './markersView';

/**
 * Obras, visita presidencial e prevenção de uma UF para o cartão do estado (PLANO_GLOBO.md §7, PR 13). Funções puras: o
 * cartão mostra o que o mapa mostra (pins de visita e de obra) e o que o mapa não mostra (obra pronta, obra sem UF).
 *
 * - **Obras**: só as que a política cita por UF (`projectUfs`, o escopo regional do conteúdo); nenhuma coordenada. Obras
 *   nacionais ou de macrorregião não aparecem aqui nem no mapa (seguem na folha de políticas). Lista as em andamento e as
 *   em operação; a cancelada fica de fora.
 * - **Visita**: a mais recente ainda com efeito local (`meses_visita`), com os meses que faltam.
 * - **Prevenção**: fração do dano da seca e das cheias que a UF evita agora (`currentPrevention`); `null` sem programa.
 */

export interface UfWorkRow {
  /** `obra:${proposta}:${uf}`: o mesmo id do item do marcador. */
  id: string;
  name: string;
  /** "em obra, 45%", "em operação", … */
  status: string;
  /** Em operação (pronta): não tem pin no mapa. */
  operating: boolean;
}

export interface UfFieldView {
  works: UfWorkRow[];
  /** "no mês passado, com efeito local por mais 1 mês" ou `null` sem visita valendo. */
  visit: string | null;
  /** Fração (0–1) do dano evitado pela prevenção na UF. */
  prevention: { drought: number; flood: number } | null;
}

type FieldState = Pick<GameState, 'economy' | 'monthIndex' | 'decisionLog' | 'impulses' | 'publicPolicies'>;
type FieldContent = Pick<GameContent, 'scenario' | 'policies' | 'calibration'>;

/** Visita ainda valendo na UF: texto com há quanto tempo e quanto falta, ou `null`. Mesma regra do marcador. */
function visitText(ufId: string, state: FieldState, window: number): string | null {
  let latest: number | null = null;
  for (const { monthIndex, decision } of state.decisionLog) {
    const elapsed = state.monthIndex - monthIndex;
    if (decision.policyId !== VISIT_ACTION_ID || decision.params?.uf !== ufId || elapsed < 1 || elapsed >= window)
      continue;
    latest = Math.max(latest ?? -1, monthIndex);
  }
  if (latest === null) return null;
  const left = window - (state.monthIndex - latest);
  return `${visitAgo(state.monthIndex - latest)}, com efeito local por mais ${left} ${left === 1 ? 'mês' : 'meses'}`;
}

/** O que o cartão da UF mostra de obras, visita e prevenção; `null` se não há nada a dizer. */
export function buildUfFieldView(ufId: string, state: FieldState, content: FieldContent): UfFieldView | null {
  const ufs = content.scenario.regions?.ufs ?? [];
  const index = ufs.findIndex((u) => u.id === ufId);
  if (index < 0) return null;
  const ids = ufs.map((u) => u.id);
  const works = state.publicPolicies.projects.flatMap((project): UfWorkRow[] => {
    const policy = content.policies[project.policyId];
    if (!policy || project.phase === 'cancelado' || !projectUfs(policy, ids).includes(ufId)) return [];
    return [
      {
        id: `obra:${project.proposalId}:${ufId}`,
        name: policy.name,
        status: workStatus(project),
        operating: project.phase === 'operacao',
      },
    ];
  });
  const visit = visitText(ufId, state, content.calibration.meses_visita);
  const p = currentPrevention(state, content);
  const prevention =
    p.drought[index] > 0 || p.flood[index] > 0 ? { drought: p.drought[index], flood: p.flood[index] } : null;
  return works.length === 0 && visit === null && prevention === null ? null : { works, visit, prevention };
}

/** "seca −15% do dano · cheias −18% do dano" (só o que for maior que zero). */
export function preventionText(prevention: NonNullable<UfFieldView['prevention']>): string {
  const parts = [
    prevention.drought > 0 ? `seca −${Math.round(prevention.drought * 100)}% do dano` : null,
    prevention.flood > 0 ? `cheias −${Math.round(prevention.flood * 100)}% do dano` : null,
  ];
  return parts.filter((p) => p !== null).join(' · ');
}
