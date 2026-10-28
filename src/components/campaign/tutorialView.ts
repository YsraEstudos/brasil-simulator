import { formatMoneyMillions, formatPercent, formatPointsDelta } from '@/components/ui/format';
import {
  CAREER_STAGE_LABEL,
  INDICATOR_META,
  monthLabel,
  PROJECT_BOTTLENECK_LABEL,
  PROJECT_PHASE_LABEL,
  shortTurnLabel,
} from './labels';
import {
  currentCareerTurn,
  currentNominalGdpMillions,
  fiscalRoom,
  projectCommitments,
  type Contribution,
  type GameContent,
  type GameState,
  type IndicatorKey,
  type MonthReport,
} from '@/engine';
import type { PublicProject } from '@/engine/publicPolicies/types';

import { careerElectionViewModel } from './careerElectionView';
import { careerPollViewModel } from './careerPollView';

/**
 * Leitura do tutorial jogável (PLANO_CAMPANHA.md Fase C8.2). Funções puras: abrir o tutorial não muda o estado.
 *
 * O tutorial é um exercício guiado e descartável; para o jogador aprender, cada tela precisa mostrar **o que ele
 * escolheu** e **o que mudou por causa disso**, separado do que mudou por conta da economia. As contribuições do
 * motor chegam em ordem de pipeline (macro primeiro), então a tela filtra as causas do jogador e agrega repetições;
 * o resto vira uma contagem, não uma lista de ruído.
 */

export interface TutorialEffect {
  cause: string;
  indicator: string;
  label: string;
  delta: number;
}

export interface TutorialEffects {
  /** Efeitos das escolhas do jogador (ações, debate, diretriz, proposta, evento respondido por ele). */
  own: TutorialEffect[];
  /** O que mudou sem passar pela escolha: economia, clima, eventos automáticos. */
  others: TutorialEffect[];
}

/** Indicadores que não pertencem a `Indicators` mas aparecem no relatório da carreira. */
const PSEUDO_INDICATOR_LABEL: Record<string, string> = {
  careerRecognition: 'Reconhecimento',
  careerValence: 'Imagem',
  votingIntention: 'Intenção de voto',
};

/** Causas que nascem de uma decisão do jogador. Eventos só contam quando ele respondeu (não os automáticos). */
const PLAYER_CAUSE_PREFIXES = ['acao:', 'debate', 'diretriz:', 'proposta:', 'acrescimo:'];

function isPlayerCause(cause: string, answeredEvents: ReadonlySet<string>): boolean {
  if (PLAYER_CAUSE_PREFIXES.some((prefix) => cause.startsWith(prefix))) return true;
  if (cause.startsWith('evento:')) {
    // A causa do motor é `evento:<id>_<mês>`; o conjunto guarda só o id do evento respondido.
    const rest = cause.slice('evento:'.length);
    for (const eventId of answeredEvents) {
      if (rest === eventId || rest.startsWith(`${eventId}_`)) return true;
    }
  }
  return false;
}

/** Agrega por causa **e** indicador: a mesma causa pode mexer em aprovação e em reconhecimento. */
function aggregate(contributions: readonly Contribution[]): TutorialEffect[] {
  const byKey = new Map<string, TutorialEffect>();
  for (const contribution of contributions) {
    const key = `${contribution.cause}|${contribution.indicator}`;
    const current = byKey.get(key);
    if (current) {
      current.delta += contribution.delta;
      // A mesma causa pode chegar em partes; o rótulo legível vale mais que o id cru.
      if (contribution.label) current.label = contribution.label;
    } else
      byKey.set(key, {
        cause: contribution.cause,
        indicator: contribution.indicator,
        label: contribution.label ?? contribution.cause,
        delta: contribution.delta,
      });
  }
  return [...byKey.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Separa o que o jogador causou do que veio do resto do mês. */
export function splitEffects(report: MonthReport): TutorialEffects {
  const answered = new Set(report.eventsResolved.filter((event) => !event.automatic).map((event) => event.eventId));
  const own: Contribution[] = [];
  const others: Contribution[] = [];
  for (const contribution of report.contributions) {
    (isPlayerCause(contribution.cause, answered) ? own : others).push(contribution);
  }
  return { own: aggregate(own), others: aggregate(others) };
}

/** "Diretriz: Rotina de atenção básica · Aprovação +0,2 p.p." — sem coeficiente interno. */
export function effectLine(effect: TutorialEffect): string {
  const name =
    PSEUDO_INDICATOR_LABEL[effect.indicator] ??
    INDICATOR_META[effect.indicator as IndicatorKey]?.label ??
    effect.indicator;
  return `${effect.label} · ${name} ${formatPointsDelta(effect.delta)}`;
}

/**
 * A causa pertence à escolha atual? `diretriz:saude` casa `diretriz:saude:...`; `evento:x` casa
 * `evento:x_8`; `proposta` casa `proposta:<id>`. Evita atribuir à escolha de agora um efeito do mês anterior.
 */
export function matchesChoice(effect: TutorialEffect, cause: string | null): boolean {
  if (!cause) return false;
  return effect.cause === cause || effect.cause.startsWith(`${cause}:`) || effect.cause.startsWith(`${cause}_`);
}

export interface TutorialElection {
  title: string;
  subtitle: string;
  won: boolean;
  rounds: { title: string; lines: string[] }[];
  pollVsResult: string | null;
}

/** Resultado da eleição em texto, reutilizando a leitura da tela da carreira (Fase C5). */
export function tutorialElection(
  state: Pick<GameState, 'career'>,
  content: Pick<GameContent, 'scenario'>,
): TutorialElection | null {
  const view = careerElectionViewModel(state, content);
  if (!view) return null;
  return {
    title: view.title,
    subtitle: view.subtitle,
    won: view.won,
    rounds: view.rounds.map((round) => ({
      title: round.title,
      lines: round.rows.map((row) => `${row.name}: ${row.share}${row.winner ? ' (mais votado)' : ''}`),
    })),
    pollVsResult: view.pollVsResult,
  };
}

export interface TutorialStatus {
  /** "Corrida eleitoral · ago/2026" ou "Fevereiro de 2027". */
  when: string;
  items: string[];
}

/** Faixa compacta de situação: os números que a escolha da lição pode mover. */
export function tutorialStatus(state: GameState, content: GameContent, report?: MonthReport): TutorialStatus {
  const turn = currentCareerTurn(state, content);
  if (turn && state.career) {
    const career = state.career;
    const poll = careerPollViewModel(state, content, report);
    const player = poll?.rows.find((row) => row.player);
    const knownUfs = poll?.bands
      .filter((entry) => entry.band === 'conhecido' || entry.band === 'muito_conhecido')
      .reduce((sum, entry) => sum + entry.ufs.length, 0);
    const totalUfs = content.scenario.regions?.ufs.length;
    const party = career.expandedFinance?.pockets.party;
    const items = [
      ...(party === undefined ? [] : [`Caixa do partido: ${formatMoneyMillions(party / 1000)}`]),
      `Até ${state.resources.agendaActionsPerMonth} ações por turno`,
      player
        ? `Pesquisa: você ${player.share} · margem ${Math.round((career.poll?.margin ?? 0) * 100)} p.p.`
        : 'Pesquisa: ainda não publicada',
      knownUfs === undefined
        ? null
        : `Reconhecimento: ${knownUfs}${totalUfs ? ` de ${totalUfs}` : ''} ${knownUfs === 1 ? 'estado' : 'estados'} ao menos conhecido`,
    ].filter((item): item is string => item !== null);
    return { when: `${CAREER_STAGE_LABEL[turn.stage]} · ${shortTurnLabel(state, content)}`, items };
  }
  const gdp = currentNominalGdpMillions(state, content);
  const room = fiscalRoom(state.economy.fiscal, content.calibration).room * gdp;
  const projects = state.publicPolicies.projects;
  const items = [
    `Aprovação: ${formatPercent(state.indicators.approval, 1)}`,
    `Espaço fiscal: ${formatMoneyMillions(room)}`,
    `Até ${state.resources.agendaActionsPerMonth} ações por mês`,
    projects.length > 0
      ? `Carteira: ${projects.length} ${projects.length === 1 ? 'obra' : 'obras'} · gargalo: ${PROJECT_BOTTLENECK_LABEL[projects[0]!.bottleneck ?? 'nenhum']}`
      : null,
  ].filter((item): item is string => item !== null);
  return { when: monthLabel(state.monthIndex), items };
}

export interface TutorialProject {
  name: string;
  phase: string;
  progress: string;
  budget: string;
  bottleneck: string;
  maintenance: string;
  /** Manutenção só é cobrada em operação; antes disso, o cartão não deve sugerir custeio zerado. */
  operating: boolean;
  commitments: string | null;
}

/** A carteira como o tutorial a explica: fase, gargalo, manutenção e saldo plurianual (EX-08/EX-09). */
export function tutorialProject(state: GameState, content: GameContent, project: PublicProject): TutorialProject {
  const name = content.policies[project.policyId]?.name ?? project.policyId;
  const commitments = projectCommitments(state, content).filter((item) => item.proposalId === project.proposalId);
  const total = commitments.reduce((sum, item) => sum + item.millions, 0);
  return {
    name,
    phase: PROJECT_PHASE_LABEL[project.phase] ?? project.phase,
    progress: formatPercent(project.progress, 0),
    budget: `${formatMoneyMillions(project.spentMillions)} de ${formatMoneyMillions(project.budgetMillions)}`,
    bottleneck: PROJECT_BOTTLENECK_LABEL[project.bottleneck ?? 'nenhum'],
    maintenance: formatMoneyMillions(project.maintenanceMillions),
    operating: project.phase === 'operacao',
    commitments:
      total > 0
        ? `${formatMoneyMillions(total)} de saldo previsto em ${commitments.length} ${commitments.length === 1 ? 'ano' : 'anos'}`
        : null,
  };
}
