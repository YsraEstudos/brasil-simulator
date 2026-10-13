import {
  AMENDMENTS_ACTION_ID,
  APPOINT_ACTION_ID,
  CONCEDE_ACTION_ID,
  NEGOTIATE_ACTION_ID,
  SANCTION_ACTION_ID,
  SANCTION_CHOICES,
  URGENCY_ACTION_ID,
  type AgendaAction,
} from './actions';
import { ministriesOf, ministryOccupant } from './congress/cabinet';
import { legislativeInstrument } from './congress/congress';
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
 * gastar pontos e pela interface para mostrar só o que é possível. `null` = válida.
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
    case SANCTION_ACTION_ID: {
      const p = proposal();
      const choice = SANCTION_CHOICES.find((c) => c === params.choice);
      if (!p || p.status !== 'aguardando_sancao' || p.voteMonth !== state.monthIndex || !choice) return 'alvo_invalido';
      return choice === 'vetar_acrescimos' && p.rider <= 0 ? 'alvo_invalido' : null;
    }
    default:
      return null;
  }
}
