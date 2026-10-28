import {
  AMENDMENTS_ACTION_ID,
  APPOINT_ACTION_ID,
  CONCEDE_ACTION_ID,
  DECLARE_CANDIDACY_ACTION_ID,
  DIRECTIVE_ACTION_ID,
  DIRECTORATE_ACTION_ID,
  DEFEND_CASE_ACTION_ID,
  DRAWER_ACTION_ID,
  NOMINATE_JUSTICE_ACTION_ID,
  BRAND_ACTION_ID,
  NEGOTIATE_ACTION_ID,
  SANCTION_ACTION_ID,
  SANCTION_CHOICES,
  SUPPORT_CANDIDATE_ACTION_ID,
  URGENCY_ACTION_ID,
  VISIT_ACTION_ID,
  type AgendaAction,
} from './actions';
import { monthOfTerm, termOf } from './calendar';
import { ministriesOf, ministryOccupant } from './congress/cabinet';
import { openCases } from './congress/cases';
import { directorateOccupant, directoratesOf } from './congress/directorates';
import { legislativeInstrument } from './congress/congress';
import { declarationInTermWindow } from './elections/elections';
import { validatePublicAction } from './publicPolicies/publicPolicies';
import {
  PROPOSAL_IN_CONGRESS,
  TECHNICAL_OCCUPANT,
  type Decision,
  type DecisionRejection,
  type GameContent,
  type GameState,
  type Proposal,
} from './types';

/**
 * Validação do alvo das ações de agenda (proposta, bloco, ministério). Usada pelo `advanceMonth` antes de
 * gastar ações e pela interface para mostrar só o que é possível. `null` = válida.
 */
export function validateActionTarget(
  action: AgendaAction,
  decision: Decision,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  const params = decision.params ?? {};
  const proposal = (): Proposal | undefined =>
    typeof params.proposalId === 'string' ? state.proposals.find((p) => p.id === params.proposalId) : undefined;
  const inCongress = (p: Proposal | undefined): p is Proposal => p !== undefined && PROPOSAL_IN_CONGRESS.has(p.status);

  switch (action.id) {
    case DIRECTIVE_ACTION_ID:
    case BRAND_ACTION_ID:
      return validatePublicAction(decision, state, content);
    case NEGOTIATE_ACTION_ID: {
      const p = proposal();
      const blocOk = content.scenario.blocs.some((b) => b.id === params.blocId);
      return inCongress(p) && blocOk ? null : 'alvo_invalido';
    }
    case AMENDMENTS_ACTION_ID: {
      const p = proposal();
      return inCongress(p) && !p.negotiation.amendments ? null : 'alvo_invalido';
    }
    case CONCEDE_ACTION_ID: {
      const p = proposal();
      return inCongress(p) && !p.negotiation.textConceded ? null : 'alvo_invalido';
    }
    case URGENCY_ACTION_ID: {
      const p = proposal();
      if (!inCongress(p) || p.negotiation.urgency) return 'alvo_invalido';
      const policy = content.policies[p.policyId];
      const instrument = policy ? legislativeInstrument(policy) : null;
      // CF art. 64 §1º: urgência só para projetos de lei de iniciativa do Presidente.
      return instrument === 'projeto_lei' || instrument === 'projeto_lei_complementar' ? null : 'alvo_invalido';
    }
    case APPOINT_ACTION_ID: {
      const ministry = ministriesOf(content).find((m) => m.id === params.ministryId);
      const occupant = params.occupant;
      const occupantOk = occupant === TECHNICAL_OCCUPANT || content.scenario.blocs.some((b) => b.id === occupant);
      if (!ministry || !occupantOk) return 'alvo_invalido';
      return ministryOccupant(state, ministry) === occupant ? 'alvo_invalido' : null;
    }
    case DIRECTORATE_ACTION_ID: {
      const directorate = directoratesOf(content).find((d) => d.id === params.directorateId);
      const occupant = params.occupant;
      const occupantOk = occupant === TECHNICAL_OCCUPANT || content.scenario.blocs.some((b) => b.id === occupant);
      if (!directorate || !occupantOk) return 'alvo_invalido';
      return directorateOccupant(state, directorate) === occupant ? 'alvo_invalido' : null;
    }
    case DEFEND_CASE_ACTION_ID:
      return openCases(state).some((c) => c.id === params.caseId && c.openedMonth <= state.monthIndex)
        ? null
        : 'alvo_invalido';
    case DRAWER_ACTION_ID:
      return (state.impeachmentDrawer ?? []).some((r) => r.status === 'na_gaveta') ? null : 'alvo_invalido';
    case NOMINATE_JUSTICE_ACTION_ID: {
      const vacancy = state.court?.vacancies.find((v) => v.id === params.vacancyId);
      const profileOk = params.profile === 'jurista' || params.profile === 'aliado';
      return vacancy?.status === 'aberta' && profileOk ? null : 'alvo_invalido';
    }
    case SANCTION_ACTION_ID: {
      const p = proposal();
      const choice = SANCTION_CHOICES.find((c) => c === params.choice);
      if (!p || p.status !== 'aguardando_sancao' || p.voteMonth !== state.monthIndex || !choice) return 'alvo_invalido';
      return choice === 'vetar_acrescimos' && p.rider <= 0 ? 'alvo_invalido' : null;
    }
    case VISIT_ACTION_ID:
      return content.scenario.regions?.ufs.some((u) => u.id === params.uf) ? null : 'alvo_invalido';
    case DECLARE_CANDIDACY_ACTION_ID: {
      const elections = content.scenario.elections;
      if (!elections || termOf(state.monthIndex) !== 0 || !elections.reeleicaoPermitida) return 'alvo_invalido';
      const month = monthOfTerm(state.monthIndex);
      if (month < elections.janelaDeclaracao.inicio || month > elections.janelaDeclaracao.fim) return 'alvo_invalido';
      // Uma declaração por campanha: a já feita nesta janela bloqueia nova declaração.
      const declared = state.politics?.declaracao;
      return declared !== null &&
        declared !== undefined &&
        declarationInTermWindow(declared, state.monthIndex, elections)
        ? 'alvo_invalido'
        : null;
    }
    case SUPPORT_CANDIDATE_ACTION_ID: {
      const elections = content.scenario.elections;
      if (!elections || !content.scenario.blocs.some((b) => b.id === params.blocId)) return 'alvo_invalido';
      const month = monthOfTerm(state.monthIndex);
      if (month < elections.janelaDeclaracao.inicio || month > elections.janelaDeclaracao.fim) return 'alvo_invalido';
      // Um apoio por campanha (o campo `apoio` é zerado quando a eleição acontece).
      return state.politics?.apoio ? 'alvo_invalido' : null;
    }
    default:
      return null;
  }
}
