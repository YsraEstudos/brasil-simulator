import { NEGOTIATE_ADHESION_ACTION_ID } from '../actions';
import { keyedRng } from '../career/draw';
import { RELACAO_MAX } from '../congress/relations';
import { adhesionProbability, inScope, populationShares, regionsOf, regionsView } from '../regions/regions';
import { federalismAdhesionBonus } from '../skills/skills';
import type { Policy } from '../../types/policy';
import type {
  Decision,
  DecisionRejection,
  GameContent,
  GameState,
  ImpulseRegional,
  Proposal,
  StepContext,
} from '../types';
import { federativeParam } from './federativeCalibration';
import type { FederativeAgreement, FederativeMember, PublicProject } from './types';

/**
 * Obras federativas (PLANO_EXPANSAO EX-20; F11; POLITICAL_RULES.md §2.1.1). Estende a carteira existente: o convênio
 * mora no próprio `PublicProject`, o desembolso federal continua sendo o da obra e a manutenção, a de sempre.
 *
 * - **Adesão real:** cada governador do escopo decide no início do planejamento, com a probabilidade única de convênio
 *   (`adhesionProbability`: relação com o governador + habilidade de federalismo). O presidente não decide por ele.
 * - **Compensação legítima:** com quem recusou, a União pode negociar uma vez (`negociar_adesao`): assume parte da
 *   contrapartida e o governador decide de novo. Fica mais caro para a União; não há favor pessoal.
 * - **Contrato:** a assinatura (fim do planejamento) fixa o escopo (só os estados que aderiram), o orçamento federal
 *   (valor da obra nesses estados × parcela federal) e a vigência. Ninguém sai por humor: troca de governador ou de
 *   relação muda só o risco de descumprir.
 * - **Descumprimento:** na obra, o estado em dia pode virar inadimplente (risco maior com governador hostil) e o
 *   inadimplente pode regularizar (chance maior com governador aliado). O repasse federal acompanha a contrapartida
 *   paga (`counterpartCoverage`): inadimplência atrasa a obra e aparece como gargalo `contrapartida`.
 * - **Vigência:** no fim, o aditivo renova o convênio só com os estados em dia; os inadimplentes são excluídos e a parte
 *   federal ainda não paga do território deles sai do orçamento.
 *
 * Sorteios por chave estável (`seed`, obra, UF, finalidade, mês): não consomem o PRNG compartilhado do mês.
 */

/** Parte da carteira que os estados atendidos pela obra recebem: os que aderiram e os inadimplentes. */
const SERVED = new Set<FederativeMember['status']>(['aderiu', 'inadimplente']);

/** UFs elegíveis da obra: as do escopo regional da política (vazio = todas), na ordem do cenário. */
export function eligibleUfs(policy: Pick<Policy, 'regional'>, content: Pick<GameContent, 'scenario'>): string[] {
  const scope = policy.regional?.scope ?? [];
  return regionsOf(content)
    .filter((uf) => inScope(uf, scope))
    .map((uf) => uf.id);
}

/** Peso de cada UF do convênio: participação na população das UFs elegíveis (soma 1). */
function memberWeights(agreement: FederativeAgreement, content: Pick<GameContent, 'scenario'>): Map<string, number> {
  const ufs = regionsOf(content);
  const pop = populationShares(ufs);
  const ids = new Set(agreement.members.map((m) => m.uf));
  const total = ufs.reduce((s, uf, i) => (ids.has(uf.id) ? s + pop[i] : s), 0);
  return new Map(ufs.flatMap((uf, i) => (ids.has(uf.id) && total > 0 ? [[uf.id, pop[i] / total] as const] : [])));
}

function governorRelationOf(state: Readonly<GameState>, content: GameContent, uf: string): number {
  const ufs = regionsOf(content);
  const index = ufs.findIndex((item) => item.id === uf);
  if (index < 0) return 0;
  return regionsView(state, content)[index]?.governorRelation ?? ufs[index].governor.relation;
}

function draw(state: Readonly<GameState>, parts: readonly (string | number)[], probability: number): boolean {
  return keyedRng(state.seed, ['convenio', ...parts]).chance(Math.min(1, Math.max(0, probability)));
}

/** Probabilidade de o governador aderir agora (fórmula única de convênio, mais a compensação negociada). */
export function memberAdhesionProbability(
  state: Readonly<GameState>,
  content: GameContent,
  uf: string,
  negotiated: boolean,
): number {
  const base = adhesionProbability(
    content.calibration,
    governorRelationOf(state, content, uf),
    federalismAdhesionBonus(state),
  );
  return Math.min(1, base + (negotiated ? federativeParam('convenio_adesao_negociacao') : 0));
}

/** Convênio de uma obra recém-chegada à carteira: cada governador elegível decide (sorteio por chave). */
export function createAgreement(
  policy: Policy,
  proposalId: string,
  state: Readonly<GameState>,
  content: GameContent,
): FederativeAgreement | undefined {
  if (!policy.federative) return undefined;
  const members = eligibleUfs(policy, content).map((uf): FederativeMember => {
    const joined = draw(state, [proposalId, uf, 'adesao'], memberAdhesionProbability(state, content, uf, false));
    return {
      uf,
      status: joined ? 'aderiu' : 'recusou',
      counterpartShare: policy.federative!.counterpartShare,
      negotiated: false,
    };
  });
  return { members, signedMonth: null, expiresMonth: null, federalShare: 1 - policy.federative.counterpartShare };
}

/**
 * Fração da contrapartida estadual paga no mês (1 sem contrapartida). O repasse federal da obra acompanha essa fração:
 * a União não paga a parte de quem não pagou a sua.
 */
export function counterpartCoverage(
  agreement: FederativeAgreement | undefined,
  content: Pick<GameContent, 'scenario'>,
): number {
  if (!agreement || agreement.signedMonth === null) return 1;
  const weights = memberWeights(agreement, content);
  let due = 0;
  let paid = 0;
  for (const m of agreement.members) {
    if (!SERVED.has(m.status)) continue;
    const part = (weights.get(m.uf) ?? 0) * m.counterpartShare;
    due += part;
    if (m.status === 'aderiu') paid += part;
  }
  return due > 0 ? paid / due : 1;
}

/** UFs atendidas pela obra (aderiram, em dia ou não). Vazio antes da assinatura. */
export function servedUfs(agreement: FederativeAgreement | undefined): string[] {
  if (!agreement || agreement.signedMonth === null) return [];
  return agreement.members.filter((m) => SERVED.has(m.status)).map((m) => m.uf);
}

/**
 * Incidência regional da obra: depois da assinatura, só nos estados atendidos (com a chave da política). Antes, ou sem
 * convênio, a da própria política.
 */
export function agreementRegional(
  agreement: FederativeAgreement | undefined,
  fallback: ImpulseRegional | undefined,
): ImpulseRegional | undefined {
  const served = servedUfs(agreement);
  if (!agreement || agreement.signedMonth === null) return fallback;
  return { key: fallback?.key ?? 'populacao', scope: served, ...(fallback?.boost ? { boost: fallback.boost } : {}) };
}

/** Peso federal (Σ peso × (1 − contrapartida)) e peso total dos membros com o status pedido. */
function weightsOf(agreement: FederativeAgreement, content: GameContent, statuses: ReadonlySet<string>) {
  const weights = memberWeights(agreement, content);
  let federal = 0;
  let total = 0;
  for (const m of agreement.members) {
    if (!statuses.has(m.status)) continue;
    const w = weights.get(m.uf) ?? 0;
    federal += w * (1 - m.counterpartShare);
    total += w;
  }
  return { federal, total };
}

const JOINED = new Set(['aderiu']);

/** Valida `negociar_adesao`: obra federativa em planejamento, UF que recusou e ainda não negociada. */
export function validateAdhesionNegotiation(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
): DecisionRejection | null {
  const project = state.publicPolicies.projects.find((p) => p.proposalId === params.proposalId);
  const agreement = project?.federative;
  if (!project || !agreement || project.phase !== 'planejamento' || agreement.signedMonth !== null)
    return 'alvo_invalido';
  const member = agreement.members.find((m) => m.uf === params.uf);
  return member && member.status === 'recusou' && !member.negotiated ? null : 'alvo_invalido';
}

/** Cancela a obra por falta de convênio (o projeto fica `cancelado` pela regra da carteira). */
function cancelForAgreement(proposal: Proposal | undefined, state: Readonly<GameState>, cause: string, detail: string) {
  if (!proposal || (proposal.status !== 'em_execucao' && proposal.status !== 'suspensa')) return;
  const record = { monthIndex: state.monthIndex, status: 'abandonada' as const, cause, detail };
  proposal.status = 'abandonada';
  proposal.history = [...proposal.history, record];
  return record;
}

/**
 * Convênio no mês, antes do processamento da obra (muta o projeto e a proposta, cópias da etapa): negociações,
 * assinatura, cumprimento da contrapartida e vigência. Notas e transições vão para o relatório.
 */
export function advanceAgreement(
  project: PublicProject,
  proposal: Proposal | undefined,
  policy: Policy,
  state: Readonly<GameState>,
  ctx: StepContext,
): void {
  const agreement = project.federative;
  const federative = policy.federative;
  if (!agreement || !federative || project.phase === 'cancelado' || state.monthIndex < project.startMonth) return;
  const t = state.monthIndex;
  const content = ctx.content;

  if (agreement.signedMonth === null) {
    for (const decision of negotiationsFor(ctx.decisions, project.proposalId)) {
      const member = agreement.members.find((m) => m.uf === decision.params?.uf);
      if (!member || member.status !== 'recusou' || member.negotiated || project.phase !== 'planejamento') continue;
      member.negotiated = true;
      member.counterpartShare = federative.counterpartShare * federativeParam('convenio_contrapartida_negociada');
      const joined = draw(
        state,
        [project.proposalId, member.uf, 'negociacao'],
        memberAdhesionProbability(state, content, member.uf, true),
      );
      if (joined) member.status = 'aderiu';
      ctx.draft.notes.push(
        `${policy.name}: negociação com o governo de ${member.uf} — ${joined ? 'o estado aderiu ao convênio' : 'o governador recusou outra vez'}.`,
      );
    }
    if (project.phase === 'planejamento') return;

    // Assinatura: o planejamento acabou e o escopo, o orçamento federal e a vigência ficam fixos.
    const joined = weightsOf(agreement, content, JOINED);
    if (joined.total <= 0) {
      const record = cancelForAgreement(
        proposal,
        state,
        'sem_adesao',
        'Nenhum governador aderiu ao convênio; a obra não pode começar.',
      );
      if (record && proposal) {
        ctx.draft.proposalChanges.push({ proposalId: proposal.id, policyId: proposal.policyId, transition: record });
      }
      ctx.draft.notes.push(`${policy.name}: nenhum estado aderiu ao convênio; obra cancelada.`);
      return;
    }
    project.budgetMillions *= joined.federal;
    agreement.federalShare = joined.federal / joined.total;
    agreement.signedMonth = t;
    agreement.expiresMonth = t + federative.termMonths - 1;
    const count = agreement.members.filter((m) => m.status === 'aderiu').length;
    ctx.draft.notes.push(
      `${policy.name}: convênio assinado com ${count} de ${agreement.members.length} estados; parcela federal de ${Math.round(agreement.federalShare * 100)}% da obra.`,
    );
    return;
  }

  if (project.phase === 'operacao') return;

  // Cumprimento da contrapartida durante a obra.
  if (project.phase === 'obra') {
    for (const member of agreement.members) {
      const relation = governorRelationOf(state, content, member.uf) / RELACAO_MAX;
      if (member.status === 'aderiu' && member.counterpartShare > 0) {
        const p =
          federativeParam('convenio_inadimplencia_base') +
          federativeParam('convenio_inadimplencia_hostil') * Math.max(0, -relation);
        if (draw(state, [project.proposalId, member.uf, 'inadimplencia', t], p)) {
          member.status = 'inadimplente';
          ctx.draft.notes.push(
            `${policy.name}: ${member.uf} deixou de pagar a contrapartida; o repasse federal ali para.`,
          );
        }
      } else if (member.status === 'inadimplente') {
        const p =
          federativeParam('convenio_regularizacao_base') +
          federativeParam('convenio_regularizacao_aliado') * Math.max(0, relation);
        if (draw(state, [project.proposalId, member.uf, 'regularizacao', t], p)) {
          member.status = 'aderiu';
          ctx.draft.notes.push(`${policy.name}: ${member.uf} regularizou a contrapartida.`);
        }
      }
    }
  }

  // Fim da vigência: aditivo só com os estados em dia; a parte federal não paga dos excluídos sai do orçamento.
  if (agreement.expiresMonth !== null && t > agreement.expiresMonth) {
    const before = weightsOf(agreement, content, SERVED);
    const after = weightsOf(agreement, content, JOINED);
    const excluded = agreement.members.filter((m) => m.status === 'inadimplente');
    for (const m of excluded) m.status = 'excluido';
    if (after.total <= 0) {
      const record = cancelForAgreement(
        proposal,
        state,
        'convenio_encerrado',
        'A vigência do convênio acabou sem nenhum estado em dia; a obra foi encerrada.',
      );
      if (record && proposal) {
        ctx.draft.proposalChanges.push({ proposalId: proposal.id, policyId: proposal.policyId, transition: record });
      }
      ctx.draft.notes.push(`${policy.name}: convênio encerrado sem estados em dia; obra cancelada.`);
      return;
    }
    if (before.federal > 0) {
      const unpaid = Math.max(0, project.budgetMillions - project.spentMillions);
      project.budgetMillions = project.spentMillions + (unpaid * after.federal) / before.federal;
    }
    agreement.federalShare = after.federal / after.total;
    agreement.expiresMonth = t + federative.termMonths - 1;
    ctx.draft.notes.push(
      excluded.length > 0
        ? `${policy.name}: aditivo do convênio renovado; ${excluded.map((m) => m.uf).join(', ')} excluído(s) por inadimplência.`
        : `${policy.name}: aditivo do convênio renovado com todos os estados.`,
    );
  }
}

function negotiationsFor(decisions: readonly Decision[], proposalId: string): Decision[] {
  return decisions.filter((d) => d.policyId === NEGOTIATE_ADHESION_ACTION_ID && d.params?.proposalId === proposalId);
}
