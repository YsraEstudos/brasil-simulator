import { createStore } from 'zustand/vanilla';

import { TEXT_SCALES, type TextScale } from '@/constants/textScale';
import {
  createCampaign,
  deleteCampaign,
  finishCampaign,
  listCampaigns,
  loadLatestState,
  loadStateAt,
  recordMonth,
  type CampaignSummary,
} from '@/database/campaignRepository';
import { getSetting, setSetting } from '@/database/settingsRepository';
import type { SqlDatabase } from '@/database/types';
import { DEFAULT_SCENARIO_ID, loadContent, PROTOTYPE_MONTHS, SCENARIOS } from '@/content';
import {
  advanceMonth,
  createInitialState,
  type Difficulty,
  type GameState,
  type Indicators,
  type MonthInput,
  type MonthReport,
} from '@/engine';

export interface ActiveCampaign {
  id: string;
  name: string;
  state: GameState;
  /** Indicadores do mês anterior (para mostrar a variação). */
  previous?: Indicators;
  lastReport?: MonthReport;
  finished: boolean;
}

export interface GameStoreState {
  status: 'iniciando' | 'pronto' | 'erro';
  error?: string;
  /** Uma operação de banco em andamento (evita toque duplo em "Encerrar o mês"). */
  busy: boolean;
  campaigns: CampaignSummary[];
  active: ActiveCampaign | null;
  textScale: TextScale;

  init(): Promise<void>;
  newCampaign(input: { name: string; difficulty: Difficulty }): Promise<void>;
  continueCampaign(id: string): Promise<void>;
  endMonth(input?: MonthInput): Promise<void>;
  leaveCampaign(): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  setTextScale(scale: TextScale): Promise<void>;
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
    /** Executa uma operação marcando `busy`; erros vão para `error` em vez de derrubar o app. */
    const run = async (op: (db: SqlDatabase) => Promise<void>) => {
      if (get().busy) return;
      set({ busy: true, error: undefined });
      try {
        await op(requireDb());
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) });
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

      async init() {
        if (db) return;
        try {
          db = await deps.openDb();
          const saved = await getSetting<number>(db, TEXT_SCALE_KEY, 1);
          const textScale = (TEXT_SCALES as readonly number[]).includes(saved) ? (saved as TextScale) : 1;
          set({ textScale, campaigns: await listCampaigns(db), status: 'pronto' });
        } catch (e) {
          set({ status: 'erro', error: e instanceof Error ? e.message : String(e) });
        }
      },

      newCampaign: ({ name, difficulty }) =>
        run(async (d) => {
          const scenario = SCENARIOS[DEFAULT_SCENARIO_ID];
          const seed = Math.floor(deps.random() * 2 ** 31);
          const id = `c_${seed.toString(36)}_${Math.floor(deps.random() * 2 ** 31).toString(36)}`;
          const state = createInitialState({ content: loadContent(scenario.id), difficulty, seed });
          const trimmed = name.trim() || 'Nova campanha';
          await createCampaign(d, { id, name: trimmed, scenarioVersion: scenario.version, state });
          set({ active: { id, name: trimmed, state, finished: false } });
          await refreshList(d);
        }),

      continueCampaign: (id) =>
        run(async (d) => {
          const summary = (await listCampaigns(d)).find((c) => c.id === id);
          const state = await loadLatestState(d, id);
          const previous =
            state.monthIndex > 0 ? (await loadStateAt(d, id, state.monthIndex - 1))?.indicators : undefined;
          // Saves anteriores à gravação atômica podem ter o último mês com status "ativa": corrige ao carregar.
          const finished = summary?.status === 'encerrada' || state.monthIndex >= PROTOTYPE_MONTHS;
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
              finished,
            },
          });
        }),

      endMonth: (input = { decisions: [] }) =>
        run(async (d) => {
          const active = get().active;
          if (!active || active.finished) return;
          const result = advanceMonth(active.state, input, loadContent(active.state.scenarioId));
          const finished = result.state.monthIndex >= PROTOTYPE_MONTHS;
          await recordMonth(d, active.id, result, { finish: finished });
          set({
            active: {
              ...active,
              state: result.state,
              previous: active.state.indicators,
              lastReport: result.report,
              finished,
            },
          });
          await refreshList(d);
        }),

      leaveCampaign: () =>
        run(async (d) => {
          set({ active: null });
          await refreshList(d);
        }),

      deleteCampaign: (id) =>
        run(async (d) => {
          await deleteCampaign(d, id);
          if (get().active?.id === id) set({ active: null });
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
