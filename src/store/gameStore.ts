import { createStore } from 'zustand/vanilla';

import { TEXT_SCALES, type TextScale } from '@/constants/textScale';
import {
  createCampaign,
  deleteCampaign,
  finishCampaign,
  listCampaigns,
  loadIndicatorHistory,
  loadLatestState,
  loadReport,
  loadStateAt,
  recordMonth,
  type CampaignSummary,
  type IndicatorPoint,
} from '@/database/campaignRepository';
import { getSetting, setSetting } from '@/database/settingsRepository';
import type { SqlDatabase } from '@/database/types';
import { campaignMonths, loadContent, SCENARIOS } from '@/content';
import {
  advanceMonth,
  campaignOutcome,
  createInitialState,
  type Decision,
  type GameState,
  type Indicators,
  type MonthInput,
  type MonthReport,
} from '@/engine';

import { draftInput, EMPTY_DRAFT, toggleDecision, toggleEventChoice, type AgendaDraft } from './agendaDraft';
import {
  checkNewCampaignInput,
  DEFAULT_SETUP_PREFS,
  LAST_DIFFICULTY_KEY,
  LAST_SCENARIO_KEY,
  resolveSetupPrefs,
  type NewCampaignInput,
  type SetupErrors,
  type SetupPrefs,
} from './campaignSetup';

/** Campanha encerrada: prazo do cenário cumprido ou condenação por impeachment (FASE_07.md). */
function isFinished(state: GameState): boolean {
  return state.monthIndex >= campaignMonths(state.scenarioId) || campaignOutcome(state) !== null;
}

export interface ActiveCampaign {
  id: string;
  name: string;
  state: GameState;
  /** Indicadores do mês anterior (para mostrar a variação). */
  previous?: Indicators;
  lastReport?: MonthReport;
  finished: boolean;
}

/**
 * Resultado de NOVO JOGO. `ok: true` só depois do commit no SQLite; falhas secundárias (lista de partidas,
 * preferências) não desfazem a criação e não viram erro.
 */
export type NewCampaignResult =
  | { ok: true; campaignId: string }
  | { ok: false; reason: 'ocupado'; error: string }
  | { ok: false; reason: 'invalido'; error: string; errors: SetupErrors }
  | { ok: false; reason: 'falha'; error: string };

export interface GameStoreState {
  status: 'iniciando' | 'pronto' | 'erro';
  error?: string;
  /** Uma operação de banco em andamento (evita toque duplo em "Encerrar o mês"). */
  busy: boolean;
  campaigns: CampaignSummary[];
  active: ActiveCampaign | null;
  textScale: TextScale;
  /** Agenda do mês em montagem, compartilhada pelas abas (não é salva). */
  draft: AgendaDraft;
  /** Últimas dificuldade e cenário usados em NOVO JOGO (lidos uma vez no início, gravados após criar). */
  setupPrefs: SetupPrefs;

  init(): Promise<void>;
  /** Cria a campanha e só a torna ativa depois de gravada; a anterior continua salva no banco. */
  newCampaign(input: NewCampaignInput): Promise<NewCampaignResult>;
  /** Carrega uma campanha salva; `true` se ela ficou ativa. A já ativa é mantida como está (com o rascunho). */
  continueCampaign(id: string): Promise<boolean>;
  /** Indicadores dos últimos meses gravados (série do Painel); vazio sem partida ou leitura falha. */
  history(): Promise<IndicatorPoint[]>;
  /** Encerra o mês com a entrada dada ou, sem ela, com o rascunho da agenda (limpo se o mês avançar). */
  endMonth(input?: MonthInput): Promise<boolean>;
  toggleDecision(decision: Decision): void;
  toggleEventChoice(eventId: string, choiceId: string): void;
  clearDraft(): void;
  leaveCampaign(): Promise<boolean>;
  deleteCampaign(id: string): Promise<boolean>;
  setTextScale(scale: TextScale): Promise<boolean>;
}

export interface GameStoreDeps {
  openDb: () => Promise<SqlDatabase>;
  /** Fonte de aleatoriedade da interface (semente e id da campanha). O motor nunca a usa. */
  random: () => number;
}

const TEXT_SCALE_KEY = 'textScale';

/**
 * Estado da interface (AI_INSTRUCTIONS.md §3): única ponte entre telas, motor e banco. Toda mudança de
 * campanha é gravada antes de aparecer na tela, então fechar o app a qualquer momento não perde meses.
 */
export function createGameStore(deps: GameStoreDeps) {
  let db: SqlDatabase | null = null;
  const requireDb = () => {
    if (!db) throw new Error('banco ainda não foi aberto');
    return db;
  };

  return createStore<GameStoreState>()((set, get) => {
    /**
     * Executa uma operação marcando `busy`; erros vão para `error` em vez de derrubar o app. Devolve `true` só se a
     * operação rodou até o fim (`false` se outra estava em andamento ou se falhou).
     */
    const run = async (op: (db: SqlDatabase) => Promise<void>): Promise<boolean> => {
      if (get().busy) return false;
      set({ busy: true, error: undefined });
      try {
        await op(requireDb());
        return true;
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        set({ busy: false });
      }
    };

    const refreshList = async (d: SqlDatabase) => set({ campaigns: await listCampaigns(d) });

    return {
      status: 'iniciando',
      busy: false,
      campaigns: [],
      active: null,
      textScale: 1,
      draft: EMPTY_DRAFT,
      setupPrefs: DEFAULT_SETUP_PREFS,

      async init() {
        if (db) return;
        try {
          db = await deps.openDb();
          // Preferência corrompida ou ilegível não pode impedir o acesso às partidas salvas: valem os padrões.
          let textScale: TextScale = 1;
          let setupPrefs = DEFAULT_SETUP_PREFS;
          try {
            const saved = await getSetting<unknown>(db, TEXT_SCALE_KEY, 1);
            textScale = (TEXT_SCALES as readonly unknown[]).includes(saved) ? (saved as TextScale) : 1;
            setupPrefs = resolveSetupPrefs({
              difficulty: await getSetting<unknown>(db, LAST_DIFFICULTY_KEY, null),
              scenarioId: await getSetting<unknown>(db, LAST_SCENARIO_KEY, null),
            });
          } catch {
            // segue com os padrões
          }
          set({ textScale, setupPrefs, campaigns: await listCampaigns(db), status: 'pronto' });
        } catch (e) {
          set({ status: 'erro', error: e instanceof Error ? e.message : String(e) });
        }
      },

      async newCampaign(input) {
        // Leitura síncrona antes de qualquer espera: dois toques seguidos não criam duas campanhas.
        if (get().busy) {
          return { ok: false, reason: 'ocupado', error: 'Aguarde: outra operação ainda está em andamento.' };
        }
        const checked = checkNewCampaignInput(input);
        if (!checked.ok) {
          const error = Object.values(checked.errors)[0] ?? 'Dados inválidos.';
          return { ok: false, reason: 'invalido', error, errors: checked.errors };
        }
        // `db` já existe enquanto `init` ainda lê preferências e a lista: só cria depois do `pronto`, senão o fim do
        // `init` sobrescreveria a lista e as preferências recém-gravadas.
        if (!db || get().status !== 'pronto') {
          return { ok: false, reason: 'falha', error: 'O banco de dados ainda não está pronto.' };
        }
        const d = db;
        const { name, difficulty, scenarioId } = checked.input;
        set({ busy: true, error: undefined });

        // Um único `finally` devolve `busy` a falso: nenhuma exceção, prevista ou não, trava a store.
        try {
          let created: ActiveCampaign;
          try {
            const scenario = SCENARIOS[scenarioId];
            const seed = checked.input.seed ?? Math.floor(deps.random() * 2 ** 31);
            // O id usa sorteios próprios: não depende da semente, que o jogador pode repetir em outra campanha.
            const id = `c_${Math.floor(deps.random() * 2 ** 31).toString(36)}_${Math.floor(deps.random() * 2 ** 31).toString(36)}`;
            const state = createInitialState({ content: loadContent(scenario.id), difficulty, seed });
            await createCampaign(d, { id, name, scenarioVersion: scenario.version, state });
            created = { id, name, state, finished: false };
          } catch (e) {
            // Nada foi gravado (a transação desfaz tudo): a campanha anterior e o rascunho continuam como estavam. O
            // erro vai no resultado, para a tela de NOVO JOGO; o `error` global ficaria velho na Presidência e em
            // CARREGAR JOGO.
            return { ok: false, reason: 'falha', error: e instanceof Error ? e.message : String(e) };
          }

          // Commit confirmado: a campanha existe, e nada daqui em diante pode transformá-la em fracasso.
          set({ active: created, draft: EMPTY_DRAFT, setupPrefs: { difficulty, scenarioId } });
          try {
            await refreshList(d);
          } catch {
            // A lista se atualiza na próxima operação; a campanha já está gravada e ativa.
          }
          try {
            await setSetting(d, LAST_DIFFICULTY_KEY, difficulty);
            await setSetting(d, LAST_SCENARIO_KEY, scenarioId);
          } catch {
            // Preferência é secundária: na memória ela já vale para a próxima abertura de NOVO JOGO.
          }
          return { ok: true, campaignId: created.id };
        } finally {
          set({ busy: false });
        }
      },

      async continueCampaign(id) {
        // A partida já aberta continua exatamente como está: recarregar do banco descartaria o rascunho do mês.
        if (get().active?.id === id) return true;
        return run(async (d) => {
          const summary = (await listCampaigns(d)).find((c) => c.id === id);
          const state = await loadLatestState(d, id);
          const previous =
            state.monthIndex > 0 ? (await loadStateAt(d, id, state.monthIndex - 1))?.indicators : undefined;
          const lastReport =
            state.monthIndex > 0 ? ((await loadReport(d, id, state.monthIndex - 1)) ?? undefined) : undefined;
          // Saves anteriores à gravação atômica podem ter o último mês com status "ativa": corrige ao carregar.
          const finished = summary?.status === 'encerrada' || isFinished(state);
          if (finished && summary?.status !== 'encerrada') {
            await finishCampaign(d, id);
            await refreshList(d);
          }
          set({
            active: {
              id,
              name: summary?.name ?? id,
              state,
              previous,
              lastReport,
              finished,
            },
            draft: EMPTY_DRAFT,
          });
        });
      },

      async history() {
        const active = get().active;
        if (!active || !db) return [];
        // Leitura para um gráfico: não marca `busy` (não pode bloquear o fechamento do mês) nem inventa erro na tela.
        try {
          return await loadIndicatorHistory(db, active.id);
        } catch {
          return [];
        }
      },

      endMonth: (input) =>
        run(async (d) => {
          const active = get().active;
          if (!active || active.finished) return;
          const content = loadContent(active.state.scenarioId);
          const result = advanceMonth(active.state, input ?? draftInput(get().draft, content), content);
          const finished = isFinished(result.state);
          await recordMonth(d, active.id, result, { finish: finished });
          set({
            active: {
              ...active,
              state: result.state,
              previous: active.state.indicators,
              lastReport: result.report,
              finished,
            },
            draft: EMPTY_DRAFT,
          });
          await refreshList(d);
        }),

      toggleDecision: (decision) => set((s) => ({ draft: toggleDecision(s.draft, decision) })),
      toggleEventChoice: (eventId, choiceId) => set((s) => ({ draft: toggleEventChoice(s.draft, eventId, choiceId) })),
      clearDraft: () => set({ draft: EMPTY_DRAFT }),

      leaveCampaign: () =>
        run(async (d) => {
          set({ active: null, draft: EMPTY_DRAFT });
          await refreshList(d);
        }),

      deleteCampaign: (id) =>
        run(async (d) => {
          await deleteCampaign(d, id);
          if (get().active?.id === id) set({ active: null, draft: EMPTY_DRAFT });
          await refreshList(d);
        }),

      setTextScale: (scale) =>
        run(async (d) => {
          set({ textScale: scale });
          await setSetting(d, TEXT_SCALE_KEY, scale);
        }),
    };
  });
}

export type GameStore = ReturnType<typeof createGameStore>;
