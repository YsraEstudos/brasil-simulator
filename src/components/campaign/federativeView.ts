import { formatPercent } from '@/components/ui/format';
import {
  counterpartCoverage,
  memberAdhesionProbability,
  type GameContent,
  type GameState,
  type PublicProject,
} from '@/engine';

import { monthLabel } from './labels';

/**
 * Linhas do convênio de uma obra federativa na carteira (PLANO_EXPANSAO EX-20): quem aderiu, quem recusou, quem está
 * inadimplente, vigência e com quem ainda dá para negociar. Só lê o estado; a negociação é uma ação de agenda.
 */

export interface NegotiableMember {
  uf: string;
  /** "SP · chance de aderir após a negociação: 60%". */
  text: string;
}

export interface AgreementView {
  /** "Convênio: 20 de 27 estados aderiram · 2 inadimplentes". */
  summary: string;
  /** Vigência, parcela federal e contrapartida paga; ou o prazo de decisão no planejamento. */
  detail: string;
  /** Lista curta das UFs fora do convênio ("Recusaram: SP, RJ"). */
  outside: string | null;
  negotiable: NegotiableMember[];
}

function list(ufs: readonly string[]): string {
  return ufs.join(', ');
}

export function agreementView(project: PublicProject, state: GameState, content: GameContent): AgreementView | null {
  const agreement = project.federative;
  if (!agreement) return null;
  const by = (status: string) => agreement.members.filter((m) => m.status === status).map((m) => m.uf);
  const joined = by('aderiu');
  const refused = by('recusou');
  const defaulting = by('inadimplente');
  const excluded = by('excluido');
  const signed = agreement.signedMonth !== null;
  const counts = [`${joined.length + defaulting.length} de ${agreement.members.length} estados aderiram`];
  if (defaulting.length > 0) counts.push(`${defaulting.length} inadimplente${defaulting.length === 1 ? '' : 's'}`);
  const summary = `Convênio: ${counts.join(' · ')}`;

  const detail = signed
    ? `Assinado em ${monthLabel(agreement.signedMonth!)} · vigência até ${monthLabel(agreement.expiresMonth ?? agreement.signedMonth!)} · parcela federal ${formatPercent(agreement.federalShare, 0)} · contrapartida paga ${formatPercent(counterpartCoverage(agreement, content), 0)}`
    : 'Os governadores decidem durante o planejamento; a assinatura fixa o escopo e o orçamento federal. A União não decide pelo estado.';

  const outsideParts: string[] = [];
  if (refused.length > 0) outsideParts.push(`Recusaram: ${list(refused)}`);
  if (defaulting.length > 0) outsideParts.push(`Sem pagar a contrapartida: ${list(defaulting)}`);
  if (excluded.length > 0) outsideParts.push(`Excluídos no aditivo: ${list(excluded)}`);

  const negotiable =
    !signed && project.phase === 'planejamento'
      ? agreement.members
          .filter((m) => m.status === 'recusou' && !m.negotiated)
          .map((m) => ({
            uf: m.uf,
            text: `${m.uf} · chance de aderir após a negociação: ${formatPercent(memberAdhesionProbability(state, content, m.uf, true), 0)}`,
          }))
      : [];

  return { summary, detail, outside: outsideParts.length > 0 ? outsideParts.join(' · ') : null, negotiable };
}
