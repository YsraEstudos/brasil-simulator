import { createStore } from 'zustand/vanilla';

import { TEXT_SCALES, type TextScale } from '@/constants/textScale';
import {
  createCampaign,
  deleteCampaign,
  finishCampaign,
  listCampaigns,
  loadElectionResults,
  loadIndicatorHistory,
  loadLatestState,
  loadProfileHistory,
  loadRegionalHistory,
  loadReport,
  loadStateAt,
  recordMonth,
  type CampaignSummary,
  type IndicatorPoint,
  type ProfileHistory,
  type RegionalPoint,
} from '@/database/campaignRepository';
import { getSetting, setSetting } from '@/database/settingsRepository';
import type { SqlDatabase } from '@/database/types';
import { DEFAULT_PROFILE_3D, type Profile3d } from '@/globe/qualityProfiles';
import { DEFAULT_DAY_TIME, type DayTimeSetting } from '@/globe/visualClock';
import { campaignMonths, loadContent, SCENARIOS } from '@/content';
import {
  advanceMonth,
  campaignOutcome,
  createInitialState,
  inaugurationTurnIndex,
  turnIndexOf,
  PROFILE_PRESETS,
  type Decision,
  type ElectionResult,
  type GameState,
  type Indicators,
  type MonthInput,
  type MonthReport,
} from '@/engine';

import { draftInput, EMPTY_DRAFT, toggleDecision, toggleEventChoice, type AgendaDraft } from './agendaDraft';
import {
  CAMPAIGN_NAME_MAX,
  checkNewCampaignInput,
  DEFAULT_SETUP_PREFS,
  LAST_DIFFICULTY_KEY,
  LAST_SCENARIO_KEY,
  resolveSetupPrefs,
  type NewCampaignInput,
  type SetupErrors,
  type SetupPrefs,
} from './campaignSetup';
import { DEFAULT_MAP_CLOUDS, MAP_CLOUDS_KEY, resolveMapClouds } from './mapClouds';
import { MAP_DAY_TIME_KEY, resolveDayTime } from './mapDayTime';
import {
  DEFAULT_MAP_QUALITY,
  LEGACY_MAP_RENDERER_KEY,
  MAP_QUALITY_AUTO_KEY,
  MAP_QUALITY_KEY,
  isMapQualityChoice,
  resolveAutoProfile,
  resolveMapQuality,
  type MapQualityChoice,
} from './mapQuality';

/** Campanha encerrada: prazo do cenário cumprido ou condenação por impeachment (FASE_07.md). */
function isFinished(state: GameState): boolean {
  return state.monthIndex >= campaignMonths(state.scenarioId) || campaignOutcome(state) !== null;
}

export interface ActiveCampaign {
  id: string;
  name: string;
  state: GameState;
  /**
   * Estado da posse (mês 0 do mandato): a base do "na posse" no mapa. Vem do próprio save, porque o cenário embutido
   * pode ter sido recalibrado depois da criação da campanha; ausente antes da posse (partida que começa na campanha,
   * PLANO_CAMPANHA.md §2.3) e quando a retenção de snapshots apagou o turno da posse.
   */
  baseline?: GameState;
  /** Indicadores do turno anterior (para mostrar a variação). */
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
  /** Qualidade do mapa regional: Automático ou um perfil (Configurações; guardada em `settings`, fora do `GameState`). */
  mapQuality: MapQualityChoice;
  /** Último perfil 3D a que o ajuste automático chegou (guardado em `settings`; o próximo início já parte dele). */
  autoProfile: Profile3d;
  /** Hora do dia do mapa (fixa / sempre dia / real; Configurações; guardada em `settings`). Só visual. */
  dayTime: DayTimeSetting;
  /** Nuvens do mapa (sim/não; Configurações; guardada em `settings`). Só visual; o perfil de qualidade pode não as permitir. */
  mapClouds: boolean;
  reduceMotion: boolean;
  /** Agenda do mês em montagem, compartilhada pelas abas (não é salva). */
  draft: AgendaDraft;
  /** Últimas dificuldade e cenário usados em NOVO JOGO (lidos uma vez no início, gravados após criar). */
  setupPrefs: SetupPrefs;

  init(): Promise<void>;
  /** Cria a campanha e só a torna ativa depois de gravada; a anterior continua salva no banco. */
  newCampaign(input: NewCampaignInput): Promise<NewCampaignResult>;
  /**
   * Nova tentativa depois da derrota na eleição (PLANO_CAMPANHA.md Fase C5, D-C18): campanha nova com a mesma
   * dificuldade, o mesmo cenário e o mesmo ponto de partida, e semente nova. A partida perdida continua salva.
   */
  retryCareer(): Promise<NewCampaignResult>;
  /** Carrega uma campanha salva; `true` se ela ficou ativa. A já ativa é mantida como está (com o rascunho). */
  continueCampaign(id: string): Promise<boolean>;
  /** Indicadores dos últimos meses gravados (série do Painel); vazio sem partida ou leitura falha. */
  history(): Promise<IndicatorPoint[]>;
  /** Série por UF da partida (posse e cada mês gravado); vazia sem partida ou leitura falha. Pode ter lacunas. */
  regionalHistory(): Promise<RegionalPoint[]>;
  /** Fotografias das eleições gerais por UF, da mais antiga à mais recente; vazia antes da primeira eleição, sem partida ou com leitura falha. */
  electionResults(): Promise<ElectionResult[]>;
  /** Rastro do perfil do governo e decisões que o moveram nos últimos meses (folha Perfil); vazio sem partida ou leitura falha. */
  profileHistory(): Promise<ProfileHistory>;
  /** Encerra o mês com a entrada dada ou, sem ela, com o rascunho da agenda (limpo se o mês avançar). */
  endMonth(input?: MonthInput): Promise<boolean>;
  /** Marca/desmarca no rascunho; ignorado enquanto o mês é gravado (`busy`) ou com a campanha encerrada. */
  toggleDecision(decision: Decision): void;
  toggleEventChoice(eventId: string, choiceId: string): void;
  clearDraft(): void;
  /** Apaga o aviso de erro (o jogador fechou o aviso). */
  clearError(): void;
  leaveCampaign(): Promise<boolean>;
  deleteCampaign(id: string): Promise<boolean>;
  setTextScale(scale: TextScale): Promise<boolean>;
  /** Escolha manual (ou volta ao Automático). Um perfil fixo desliga o ajuste automático. */
  setMapQuality(choice: MapQualityChoice): Promise<boolean>;
  /** Resultado do ajuste automático: vale na hora e é gravado sem marcar `busy` (vem do laço de quadros do globo). */
  setAutoProfile(profile: Profile3d): Promise<void>;
  /** Escolha da hora do dia do mapa; vale na hora e é gravada. */
  setDayTime(setting: DayTimeSetting): Promise<boolean>;
  /** Liga ou desliga as nuvens do mapa; vale na hora e é gravada. */
  setMapClouds(on: boolean): Promise<boolean>;
  setReduceMotion(on: boolean): Promise<boolean>;
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
    const draftLocked = () => get().busy || get().active?.finished === true;

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
      reduceMotion: false,
      mapQuality: DEFAULT_MAP_QUALITY,
      autoProfile: DEFAULT_PROFILE_3D,
      dayTime: DEFAULT_DAY_TIME,
      mapClouds: DEFAULT_MAP_CLOUDS,
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
          let mapQuality = DEFAULT_MAP_QUALITY;
          let autoProfile = DEFAULT_PROFILE_3D;
          try {
            const saved = await getSetting<unknown>(db, MAP_QUALITY_KEY, null);
            const legacy = await getSetting<unknown>(db, LEGACY_MAP_RENDERER_KEY, null);
            mapQuality = resolveMapQuality(saved, legacy);
            autoProfile = resolveAutoProfile(await getSetting<unknown>(db, MAP_QUALITY_AUTO_KEY, null));
            // Migração única do valor antigo: a escolha migrada passa a viver na chave nova.
            if (!isMapQualityChoice(saved) && legacy !== null) await setSetting(db, MAP_QUALITY_KEY, mapQuality);
          } catch {
            // segue com o automático
          }
          let dayTime = DEFAULT_DAY_TIME;
          try {
            dayTime = resolveDayTime(await getSetting<unknown>(db, MAP_DAY_TIME_KEY, null));
          } catch {
            // segue com a hora fixa da tarde
          }
          let mapClouds = DEFAULT_MAP_CLOUDS;
          try {
            mapClouds = resolveMapClouds(await getSetting<unknown>(db, MAP_CLOUDS_KEY, null));
          } catch {
            // segue com as nuvens ligadas
          }
          let reduceMotion = false;
          try {
            reduceMotion = (await getSetting<unknown>(db, 'reduceMotion', false)) === true;
          } catch {
            /* Uma preferência ilegível não impede abrir a campanha. */
          }
          set({
            textScale,
            reduceMotion,
            mapQuality,
            autoProfile,
            dayTime,
            mapClouds,
            setupPrefs,
            campaigns: await listCampaigns(db),
            status: 'pronto',
          });
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
        const { name, difficulty, scenarioId, profileId, startPoint, careerProfileId } = checked.input;
        set({ busy: true, error: undefined });

        // Um único `finally` devolve `busy` a falso: nenhuma exceção, prevista ou não, trava a store.
        try {
          let created: ActiveCampaign;
          try {
            const scenario = SCENARIOS[scenarioId];
            const seed = checked.input.seed ?? Math.floor(deps.random() * 2 ** 31);
            // O id usa sorteios próprios: não depende da semente, que o jogador pode repetir em outra campanha.
            const id = `c_${Math.floor(deps.random() * 2 ** 31).toString(36)}_${Math.floor(deps.random() * 2 ** 31).toString(36)}`;
            const state = createInitialState({
              content: loadContent(scenario.id),
              difficulty,
              seed,
              profile: profileId,
              startPoint,
              careerProfileId,
            });
            await createCampaign(d, {
              id,
              name,
              scenarioVersion: scenario.version,
              state,
              content: loadContent(scenario.id),
            });
            const baseline = inaugurationTurnIndex(state) === null ? undefined : state;
            created = { id, name, state, baseline, finished: false };
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

      async retryCareer() {
        const active = get().active;
        const career = active?.state.career;
        if (!active || !career)
          return { ok: false, reason: 'falha', error: 'Não há campanha eleitoral para recomeçar.' };
        const suffix = ' · nova tentativa';
        const profileId = PROFILE_PRESETS.find(
          (preset) =>
            preset.economic === active.state.government.profile.economic &&
            preset.social === active.state.government.profile.social,
        )?.id;
        return get().newCampaign({
          name: `${active.name.slice(0, CAMPAIGN_NAME_MAX - suffix.length)}${suffix}`,
          difficulty: active.state.difficulty,
          scenarioId: active.state.scenarioId,
          profileId,
          startPoint: career.startPoint,
          careerProfileId: career.profileId,
        });
      },

      async continueCampaign(id) {
        // A partida já aberta continua exatamente como está: recarregar do banco descartaria o rascunho do mês.
        if (get().active?.id === id) return true;
        return run(async (d) => {
          const summary = (await listCampaigns(d)).find((c) => c.id === id);
          const state = await loadLatestState(d, id);
          // Turno anterior pelo índice do turno (PLANO_CAMPANHA.md §2.3), não pelo mês do mandato.
          const turn = turnIndexOf(state);
          // Comparação com o mês anterior só dentro do mandato: na posse e antes dela não há mês anterior de governo.
          const previous = state.monthIndex > 0 ? (await loadStateAt(d, id, turn - 1))?.indicators : undefined;
          const lastReport = turn > 0 ? ((await loadReport(d, id, turn - 1)) ?? undefined) : undefined;
          // A posse vem do snapshot do turno da posse no save, e não do cenário embutido (que pode ter sido
          // recalibrado) nem do primeiro turno da partida, que pode ser da campanha. Antes da posse não há base.
          const posse = inaugurationTurnIndex(state);
          const baseline =
            posse === null ? undefined : posse === turn ? state : ((await loadStateAt(d, id, posse)) ?? undefined);
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
              baseline,
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

      async regionalHistory() {
        const active = get().active;
        if (!active || !db) return [];
        // Como `history`: leitura para o cartão do estado, sem `busy` e sem erro na tela.
        try {
          return await loadRegionalHistory(db, active.id);
        } catch {
          return [];
        }
      },

      async electionResults() {
        const active = get().active;
        if (!active || !db) return [];
        // Como `history`: leitura para a camada Resultado do mapa, sem `busy` e sem erro na tela.
        try {
          return await loadElectionResults(db, active.id);
        } catch {
          return [];
        }
      },

      async profileHistory() {
        const active = get().active;
        if (!active || !db) return { trail: [], moves: [] };
        // Como `history`: leitura para a folha do perfil, sem `busy` e sem erro na tela.
        try {
          return await loadProfileHistory(db, active.id);
        } catch {
          return { trail: [], moves: [] };
        }
      },

      endMonth: (input) =>
        run(async (d) => {
          const active = get().active;
          if (!active || active.finished) return;
          const content = loadContent(active.state.scenarioId);
          const result = advanceMonth(active.state, input ?? draftInput(get().draft, content), content);
          const finished = isFinished(result.state);
          await recordMonth(d, active.id, result, { finish: finished, content });
          // O turno que acabou de começar é a posse: ele passa a ser a base do "na posse".
          const justInaugurated = inaugurationTurnIndex(result.state) === turnIndexOf(result.state);
          set({
            active: {
              ...active,
              state: result.state,
              baseline: active.baseline ?? (justInaugurated ? result.state : undefined),
              previous: result.state.monthIndex > 0 ? active.state.indicators : undefined,
              lastReport: result.report,
              finished,
            },
            draft: EMPTY_DRAFT,
          });
          await refreshList(d);
        }),

      // O rascunho fica parado durante o fechamento do mês: o motor já leu a agenda e a gravação zera o rascunho no
      // fim, então uma escolha feita nesse meio se perderia. Campanha encerrada não tem próximo mês para decidir.
      toggleDecision: (decision) => {
        if (draftLocked()) return;
        set((s) => ({ draft: toggleDecision(s.draft, decision) }));
      },
      toggleEventChoice: (eventId, choiceId) => {
        if (draftLocked()) return;
        set((s) => ({ draft: toggleEventChoice(s.draft, eventId, choiceId) }));
      },
      clearDraft: () => set({ draft: EMPTY_DRAFT }),
      clearError: () => set({ error: undefined }),

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

      setMapQuality: (choice) =>
        run(async (d) => {
          set({ mapQuality: choice });
          await setSetting(d, MAP_QUALITY_KEY, choice);
        }),

      setDayTime: (setting) =>
        run(async (d) => {
          set({ dayTime: setting });
          await setSetting(d, MAP_DAY_TIME_KEY, setting);
        }),

      setMapClouds: (on) =>
        run(async (d) => {
          set({ mapClouds: on });
          await setSetting(d, MAP_CLOUDS_KEY, on);
        }),

      setReduceMotion: (on) =>
        run(async (db) => {
          await setSetting(db, 'reduceMotion', on);
          set({ reduceMotion: on });
        }),

      async setAutoProfile(profile) {
        if (get().autoProfile === profile) return;
        set({ autoProfile: profile });
        try {
          if (db) await setSetting(db, MAP_QUALITY_AUTO_KEY, profile);
        } catch {
          // não gravar o perfil medido só faz o próximo início partir do Equilibrado de novo
        }
      },
    };
  });
}

export type GameStore = ReturnType<typeof createGameStore>;
