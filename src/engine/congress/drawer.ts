import { DRAWER_ACTION_ID } from '../actions';
import { impeachmentPressure } from '../events/pressure';
import type { GameContent, GameState, ImpeachmentRequest, ScheduledEvent, StepContext } from '../types';

import { CASE_FLAGS, caseDraw } from './cases';
import { housePresident } from './congress';
import { blocRelation, RELACAO_MAX, RELACAO_MIN } from './relations';

/**
 * Gaveta do impeachment (PLANO_CAMPANHA.md Fase C6e; POLITICAL_RULES.md §10.1). Pedidos de impeachment se acumulam
 * na Câmara; a presidência da Casa (`housePresidents.camara`) decide o destino deles:
 * - **acúmulo:** um pedido por marca de escândalo gravada no mês (Fase C6b: investigação, acusação, condenação) e,
 *   por sorteio com chave, um pedido com chance `gaveta_pedido_pressao` × pressão de impeachment;
 * - **descarte:** com a presidência aliada (relação ≥ `gaveta_relacao_arquivo`), o pedido com mais de
 *   `gaveta_meses_arquivo` meses na gaveta é arquivado. O governo pode negociar o arquivamento do mais antigo;
 * - **abertura:** com a presidência hostil (relação < `gaveta_relacao_abertura`) e a pressão em pelo menos
 *   `gaveta_pressao_abertura`, a presidência pode abrir o pedido mais antigo. Abrir **só agenda o 1º evento da cadeia
 *   existente** (`fase07_inst_pedido_impeachment`) para o mês seguinte: as marcas, as votações e a condenação seguem
 *   só pela cadeia de §10, que continua a única via de condenação.
 *
 * Sorteios por chave (`gaveta`, mês): não consomem o PRNG principal. Sem `institutions.impeachmentDrawer`, desligado.
 */

export const IMPEACHMENT_REQUEST_EVENT_ID = 'fase07_inst_pedido_impeachment';
const MARK_CAUSES = [CASE_FLAGS.investigacao, CASE_FLAGS.acusacao, CASE_FLAGS.condenacao] as const;
/** Marcas que encerram o caminho do pedido (as que o próprio evento proíbe). */
const CHAIN_CLOSED_FLAGS = ['impeachment_denuncia_aceita', 'impeachment_arquivado'];

export const REQUEST_CAUSE_LABEL: Record<ImpeachmentRequest['cause'], string> = {
  escandalo_investigacao: 'investigação de escândalo',
  escandalo_acusacao: 'acusação formal em escândalo',
  escandalo_condenacao: 'condenação de indicado',
  pressao: 'pressão política',
};

export function drawerEnabled(content: GameContent): boolean {
  return content.scenario.institutions?.impeachmentDrawer === true;
}

export function drawerRequests(state: Readonly<GameState>): ImpeachmentRequest[] {
  return state.impeachmentDrawer ?? [];
}

export function pendingRequests(state: Readonly<GameState>): ImpeachmentRequest[] {
  return drawerRequests(state).filter((r) => r.status === 'na_gaveta');
}

/** Relação do bloco que preside a Câmara (0 se o cenário não define a presidência). */
export function camaraPresidentRelation(state: Readonly<GameState>, content: GameContent): number {
  const president = housePresident(content, 'camara');
  return president ? blocRelation(state, president) : 0;
}

/** O pedido ainda pode levar ao 1º evento da cadeia (não aconteceu nem foi encerrado). */
export function chainStillOpen(state: Readonly<GameState>): boolean {
  const fired = (state.events.count[IMPEACHMENT_REQUEST_EVENT_ID] ?? 0) > 0;
  const pending = state.events.pending.some((p) => p.eventId === IMPEACHMENT_REQUEST_EVENT_ID);
  const scheduled = state.events.scheduled.some((p) => p.eventId === IMPEACHMENT_REQUEST_EVENT_ID);
  return !fired && !pending && !scheduled && !CHAIN_CLOSED_FLAGS.some((f) => Object.hasOwn(state.events.flags, f));
}

/** Postura da presidência da Câmara diante da gaveta, para o jogador. */
export function drawerStance(state: Readonly<GameState>, content: GameContent): 'arquiva' | 'segura' | 'ameaca' {
  const c = content.calibration;
  const relation = camaraPresidentRelation(state, content);
  if (relation >= c.gaveta_relacao_arquivo) return 'arquiva';
  return relation < c.gaveta_relacao_abertura ? 'ameaca' : 'segura';
}

/**
 * Etapa mensal da gaveta, chamada pelo gabinete depois dos casos: negociação do governo, novos pedidos,
 * arquivamento e abertura. Sem o sistema ligado, devolve o mesmo estado.
 */
export function advanceDrawer(state: GameState, ctx: StepContext): GameState {
  const content = ctx.content;
  if (!drawerEnabled(content)) return state;
  const t = state.monthIndex;
  const c = content.calibration;
  const requests: ImpeachmentRequest[] = drawerRequests(state).map((r) => ({ ...r }));
  const before = JSON.stringify(requests);
  let relations = state.congress.blocs;
  let capital = state.resources.politicalCapital;
  const scheduled: ScheduledEvent[] = [...state.events.scheduled];
  const president = housePresident(content, 'camara');

  // Negociação do governo: arquiva o pedido mais antigo e melhora a relação com a presidência.
  if (ctx.decisions.some((d) => d.policyId === DRAWER_ACTION_ID)) {
    const oldest = requests.find((r) => r.status === 'na_gaveta');
    if (oldest) {
      oldest.status = 'arquivado';
      oldest.decidedMonth = t;
      capital += c.capital_negociar_gaveta;
      if (president) {
        const current = blocRelation(state, president);
        const next = Math.min(RELACAO_MAX, Math.max(RELACAO_MIN, current + c.relacao_negociar_gaveta));
        relations = [...relations.filter((b) => b.id !== president.id), { id: president.id, governmentRelation: next }];
      }
      ctx.draft.notes.push('A presidência da Câmara arquivou o pedido de impeachment mais antigo, depois de negociar.');
    }
  }

  // Novos pedidos: um por marca de escândalo gravada neste mês, mais um pela pressão (sorteio por chave).
  let order = requests.filter((r) => r.filedMonth === t).length;
  const file = (cause: ImpeachmentRequest['cause']) => {
    requests.push({ id: `pedido#${t}#${order}`, filedMonth: t, cause, status: 'na_gaveta' });
    order += 1;
    ctx.draft.notes.push(`Novo pedido de impeachment protocolado na Câmara (${REQUEST_CAUSE_LABEL[cause]}).`);
  };
  for (const flag of MARK_CAUSES) if (state.events.flags[flag] === t) file(flag);
  const pressure = impeachmentPressure(state, content);
  if (caseDraw(state.seed, ['gaveta', 'pedido', t]) < c.gaveta_pedido_pressao * pressure) file('pressao');

  // Presidência aliada arquiva os pedidos antigos.
  const relation = camaraPresidentRelation({ ...state, congress: { ...state.congress, blocs: relations } }, content);
  if (relation >= c.gaveta_relacao_arquivo) {
    for (const r of requests) {
      if (r.status !== 'na_gaveta' || t - r.filedMonth < c.gaveta_meses_arquivo) continue;
      r.status = 'arquivado';
      r.decidedMonth = t;
      ctx.draft.notes.push('A presidência da Câmara arquivou um pedido de impeachment antigo.');
    }
  }

  // Presidência hostil, com pressão alta, pode abrir o pedido mais antigo: agenda o 1º evento da cadeia.
  const oldest = requests.find((r) => r.status === 'na_gaveta');
  const canOpen =
    oldest !== undefined &&
    relation < c.gaveta_relacao_abertura &&
    pressure >= c.gaveta_pressao_abertura &&
    chainStillOpen(state);
  if (canOpen && caseDraw(state.seed, ['gaveta', 'abertura', t]) < c.gaveta_chance_abertura) {
    oldest.status = 'aberto';
    oldest.decidedMonth = t;
    scheduled.push({
      eventId: IMPEACHMENT_REQUEST_EVENT_ID,
      monthIndex: t + 1,
      causeEventId: 'gaveta_impeachment',
      causeChoiceId: 'abertura',
    });
    ctx.draft.notes.push(
      'A presidência da Câmara tirou da gaveta um pedido de impeachment: a admissibilidade chega no mês seguinte.',
    );
  }

  if (JSON.stringify(requests) === before && capital === state.resources.politicalCapital) return state;
  return {
    ...state,
    impeachmentDrawer: requests,
    congress: { ...state.congress, blocs: relations },
    resources: { ...state.resources, politicalCapital: Math.min(100, Math.max(0, capital)) },
    events: { ...state.events, scheduled },
  };
}
