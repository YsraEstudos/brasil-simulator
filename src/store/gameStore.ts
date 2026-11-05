import { createStore } from 'zustand/vanilla';

import { TEXT_SCALES, type TextScale } from '@/constants/textScale';
import {
  addPlayTime,
  createCampaign,
  deleteCampaign,
  deleteFinishedCampaigns,
  renameCampaign,
  setCampaignLocked,
  setCampaignPinned,
  finishCampaign,
  listCampaigns,
  loadElectionResults,
  loadFiredEvents,
  loadIndicatorHistory,
  loadLatestState,
  loadProfileHistory,
  loadRegionalHistory,
  loadReport,
  loadStateAt,
  recordMonth,
  touchCampaign,
  type CampaignSummary,
  type FiredEvent,
  type IndicatorPoint,
  type ProfileHistory,
  type RegionalPoint,
} from '@/database/campaignRepository';
import {
  BundleError,
  bundleFileName,
  duplicateCampaign as duplicateCampaignInDb,
  exportBundle,
  importBundle,
  parseBundle,
  type CampaignBundle,
} from '@/database/campaignBundle';
import { deleteSettings, getSetting, setSetting } from '@/database/settingsRepository';
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
  type Decision,
  type ElectionResult,
  type GameState,
  type Indicators,
  type MonthInput,
  type MonthReport,
} from '@/engine';

import {
  clearAgenda,
  draftInput,
  EMPTY_DRAFT,
  pushDraftHistory,
  toggleDecision,
  toggleEventChoice,
  type AgendaDraft,
} from './agendaDraft';
import { GOVERNMENTS_KEY, resolveGovernmentCount } from './governments';
import {
  checkNewCampaignInput,
  DEFAULT_SETUP_PREFS,
  LAST_DIFFICULTY_KEY,
  LAST_SCENARIO_KEY,
  copyName,
  importedName,
  isKnownScenario,
  resolveSetupPrefs,
  restartName,
  validateCampaignName,
  type NewCampaignInput,
  type SetupErrors,
  type SetupPrefs,
} from './campaignSetup';
import { DEFAULT_MAP_CLOUDS, MAP_CLOUDS_KEY, resolveMapClouds } from './mapClouds';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  PREFERENCE_DEFS,
  PREFERENCE_KEYS,
  type PreferenceKey,
  type Preferences,
} from './preferences';
import {
  DEFAULT_SAVED_LIST_PREFS,
  resolveSavedListPrefs,
  SAVED_LIST_PREFS_KEY,
  type SavedListPrefs,
} from './savedListPrefs';
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

/** Rascunho vazio e sem passos para desfazer: o começo de cada mês (e de cada campanha aberta). */
const FRESH_DRAFT = { draft: EMPTY_DRAFT, draftHistory: [] as readonly AgendaDraft[] };

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
  /** Preferências do registro (`preferences.ts`): tema, acessibilidade, unidade fiscal, globo, animações, abertura. */
  prefs: Preferences;
  /** Agenda do mês em montagem, compartilhada pelas abas (não é salva). */
  draft: AgendaDraft;
  /** Rascunhos anteriores do mês, do mais antigo ao mais recente, para o "Desfazer" (zera ao virar o mês). */
  draftHistory: readonly AgendaDraft[];
  /** Últimas dificuldade e cenário usados em NOVO JOGO (lidos uma vez no início, gravados após criar). */
  setupPrefs: SetupPrefs;
  /** Governos iniciados neste aparelho (NOVO JOGO e RECOMEÇAR; guardado em `settings`, nunca diminui). */
  governments: number;

  init(): Promise<void>;
  /** Cria a campanha e só a torna ativa depois de gravada; a anterior continua salva no banco. */
  newCampaign(input: NewCampaignInput): Promise<NewCampaignResult>;
  /**
   * Recomeçar com as mesmas opções (PLANO_MENU_SAVES_CONFIG.md M4.3): cria uma partida nova com dificuldade, cenário,
   * perfil, ponto de partida e semente da campanha `id`, com o nome "<nome> (2)" (ou o próximo número livre).
   * Partida sem opções gravadas (anterior à migração 10) recomeça com dificuldade, cenário e semente da linha.
   */
  restartCampaign(id: string): Promise<NewCampaignResult>;
  /**
   * Duplica a campanha ("Salvar como", PLANO_MENU_SAVES_CONFIG.md M5.1): cópia do que está salvo (o rascunho do mês
   * não entra), com nome "<nome> — cópia". A partida aberta não muda. Devolve o id da cópia ou `null`.
   */
  duplicateCampaign(id: string): Promise<string | null>;
  /** Pacote da campanha em JSON e nome sugerido do arquivo (M5.2); `null` se falhar (erro em `error`). */
  exportCampaign(id: string): Promise<{ fileName: string; json: string } | null>;
  /**
   * Importa o texto de um arquivo de save (M5.3) como campanha nova (id novo; nunca sobrescreve). Erros vêm com
   * mensagem para o jogador.
   */
  importCampaign(text: string): Promise<{ ok: true; campaignId: string } | { ok: false; error: string }>;
  /** Carrega uma campanha salva; `true` se ela ficou ativa. A já ativa é mantida como está (com o rascunho). */
  continueCampaign(id: string): Promise<boolean>;
  /** Indicadores dos últimos meses gravados (série do Painel); vazio sem partida ou leitura falha. */
  history(): Promise<IndicatorPoint[]>;
  /** Série por UF da partida (posse e cada mês gravado); vazia sem partida ou leitura falha. Pode ter lacunas. */
  regionalHistory(): Promise<RegionalPoint[]>;
  /** Fotografias das eleições gerais por UF, da mais antiga à mais recente; vazia antes da primeira eleição, sem partida ou com leitura falha. */
  electionResults(): Promise<ElectionResult[]>;
  /** Eventos disparados na campanha, em ordem (marcas de crise do gráfico); vazia sem partida ou leitura falha. */
  firedEvents(): Promise<FiredEvent[]>;
  /** Rastro do perfil do governo e decisões que o moveram nos últimos meses (folha Perfil); vazio sem partida ou leitura falha. */
  profileHistory(): Promise<ProfileHistory>;
  /**
   * Soma `ms` de tempo de jogo à partida (`campaignId`, por padrão a ativa) e atualiza a lista em memória. Não usa
   * `busy`: gravar o tempo não disputa com o encerramento do mês (é um UPDATE simples). Silenciosa em erro.
   */
  recordPlayTime(ms: number, campaignId?: string): Promise<void>;
  /** Encerra o mês com a entrada dada ou, sem ela, com o rascunho da agenda (limpo se o mês avançar). */
  endMonth(input?: MonthInput): Promise<boolean>;
  /** Marca/desmarca no rascunho; ignorado enquanto o mês é gravado (`busy`) ou com a campanha encerrada. */
  toggleDecision(decision: Decision): void;
  toggleEventChoice(eventId: string, choiceId: string): void;
  /** Volta o rascunho ao começo do mês: tira decisões e respostas a eventos (pode ser desfeito). */
  clearDraft(): void;
  /** Tira só as decisões e mantém as respostas a eventos (pode ser desfeito). */
  clearAgenda(): void;
  /** Desfaz a última mudança no rascunho do mês. */
  undoDraft(): void;
  /** Apaga o aviso de erro (o jogador fechou o aviso). */
  clearError(): void;
  leaveCampaign(): Promise<boolean>;
  deleteCampaign(id: string): Promise<boolean>;
  /** Renomeia (valida com `validateCampaignName`; nome inválido vira `error`). Atualiza a partida aberta. */
  renameCampaign(id: string, name: string): Promise<boolean>;
  /** Alfinete: fixa ou solta a campanha no topo da lista. */
  setCampaignPinned(id: string, pinned: boolean): Promise<boolean>;
  /** Cadeado: protege ou libera a campanha contra exclusão. */
  setCampaignLocked(id: string, locked: boolean): Promise<boolean>;
  /** Apaga as encerradas sem cadeado; `null` se a operação não rodou (ocupado ou falha). */
  deleteFinishedCampaigns(): Promise<{ deleted: number; keptLocked: number } | null>;
  /** Ordem e filtro da lista de campanhas (lembrados em `settings`). */
  savedListPrefs: SavedListPrefs;
  setSavedListPrefs(prefs: SavedListPrefs): Promise<boolean>;
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
  /**
   * Restaurar configurações padrão (M9): apaga as chaves de `RESETTABLE_SETTING_KEYS` e volta a tela aos padrões.
   * Partidas salvas e o resto das preferências não mudam.
   */
  resetSettings(): Promise<boolean>;
  /** Muda uma preferência do registro: vale na hora e é gravada (falha de gravação vira `error`, a escolha fica). */
  setPreference<K extends PreferenceKey>(key: K, value: Preferences[K]): Promise<boolean>;
}

export interface GameStoreDeps {
  openDb: () => Promise<SqlDatabase>;
  /** Fonte de aleatoriedade da interface (semente e id da campanha). O motor nunca a usa. */
  random: () => number;
}

const TEXT_SCALE_KEY = 'textScale';
const REDUCE_MOTION_KEY = 'reduceMotion';

/**
 * Chaves apagadas por "Restaurar configurações padrão" (PLANO_MENU_SAVES_CONFIG.md M9): só preferências do jogador
 * nas Configurações. Ficam fora, de propósito: partidas salvas, a última dificuldade e o último cenário do Novo Jogo,
 * a ordem da lista de campanhas e o perfil medido pelo ajuste automático do globo (medição do aparelho, não escolha).
 * A chave antiga do renderizador entra para a migração dela não trazer a escolha de volta.
 */
export const RESETTABLE_SETTING_KEYS: readonly string[] = [
  ...PREFERENCE_KEYS.map((k) => PREFERENCE_DEFS[k].key),
  TEXT_SCALE_KEY,
  REDUCE_MOTION_KEY,
  MAP_QUALITY_KEY,
  LEGACY_MAP_RENDERER_KEY,
  MAP_DAY_TIME_KEY,
  MAP_CLOUDS_KEY,
];

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

    /** Id de campanha com sorteios próprios: não depende da semente, que o jogador pode repetir. */
    const newCampaignId = () =>
      `c_${Math.floor(deps.random() * 2 ** 31).toString(36)}_${Math.floor(deps.random() * 2 ** 31).toString(36)}`;
    const refreshList = async (d: SqlDatabase) => set({ campaigns: await listCampaigns(d) });

    return {
      status: 'iniciando',
      busy: false,
      campaigns: [],
      active: null,
      textScale: 1,
      reduceMotion: false,
      prefs: DEFAULT_PREFERENCES,
      savedListPrefs: DEFAULT_SAVED_LIST_PREFS,
      mapQuality: DEFAULT_MAP_QUALITY,
      autoProfile: DEFAULT_PROFILE_3D,
      dayTime: DEFAULT_DAY_TIME,
      mapClouds: DEFAULT_MAP_CLOUDS,
      ...FRESH_DRAFT,
      setupPrefs: DEFAULT_SETUP_PREFS,
      governments: 0,

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
          let savedListPrefs = DEFAULT_SAVED_LIST_PREFS;
          try {
            savedListPrefs = resolveSavedListPrefs(await getSetting<unknown>(db, SAVED_LIST_PREFS_KEY, null));
          } catch {
            // segue com a ordem padrão
          }
          let prefs = DEFAULT_PREFERENCES;
          try {
            prefs = await loadPreferences((key) => getSetting<unknown>(db as SqlDatabase, key, null));
          } catch {
            // segue com os padrões
          }
          let reduceMotion = false;
          try {
            reduceMotion = (await getSetting<unknown>(db, REDUCE_MOTION_KEY, false)) === true;
          } catch {
            /* Uma preferência ilegível não impede abrir a campanha. */
          }
          let governments = 0;
          try {
            governments = resolveGovernmentCount(await getSetting<unknown>(db, GOVERNMENTS_KEY, 0));
          } catch {
            /* O contador é só informativo: sem leitura, começa em zero. */
          }
          set({
            textScale,
            reduceMotion,
            governments,
            prefs,
            savedListPrefs,
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
        const { name, difficulty, scenarioId, profileId, startPoint } = checked.input;
        set({ busy: true, error: undefined });

        // Um único `finally` devolve `busy` a falso: nenhuma exceção, prevista ou não, trava a store.
        try {
          let created: ActiveCampaign;
          try {
            const scenario = SCENARIOS[scenarioId];
            const seed = checked.input.seed ?? Math.floor(deps.random() * 2 ** 31);
            // O id usa sorteios próprios: não depende da semente, que o jogador pode repetir em outra campanha.
            const id = newCampaignId();
            const state = createInitialState({
              content: loadContent(scenario.id),
              difficulty,
              seed,
              profile: profileId,
              startPoint,
            });
            await createCampaign(d, {
              id,
              name,
              scenarioVersion: scenario.version,
              state,
              content: loadContent(scenario.id),
              setup: {
                difficulty,
                scenarioId,
                ...(profileId ? { profileId } : {}),
                ...(startPoint ? { startPoint } : {}),
                seed,
              },
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
          set({ active: created, ...FRESH_DRAFT, setupPrefs: { difficulty, scenarioId } });
          // Partida recém-criada conta como jogada agora; falha aqui não desfaz a criação.
          try {
            await touchCampaign(d, created.id);
          } catch {
            // createCampaign já gravou a última jogada: nada a fazer.
          }
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
          // Governo iniciado (NOVO JOGO e RECOMEÇAR): o contador vale para sempre, mesmo se o save for apagado depois.
          const governments = get().governments + 1;
          set({ governments });
          try {
            await setSetting(d, GOVERNMENTS_KEY, governments);
          } catch {
            // Só o contador da lista de saves; na memória ele já está certo até fechar o app.
          }
          return { ok: true, campaignId: created.id };
        } finally {
          set({ busy: false });
        }
      },

      async duplicateCampaign(id) {
        const source = get().campaigns.find((c) => c.id === id);
        if (!source) {
          set({ error: 'Campanha não encontrada.' });
          return null;
        }
        const copyId = newCampaignId();
        const ok = await run(async (d) => {
          await duplicateCampaignInDb(d, id, {
            id: copyId,
            name: copyName(
              source.name,
              get().campaigns.map((c) => c.name),
            ),
          });
          await refreshList(d);
        });
        return ok ? copyId : null;
      },

      async exportCampaign(id) {
        if (!db) return null;
        try {
          const bundle = await exportBundle(db, id);
          return { fileName: bundleFileName(bundle), json: JSON.stringify(bundle) };
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          return null;
        }
      },

      async importCampaign(text) {
        let bundle: CampaignBundle;
        try {
          bundle = parseBundle(JSON.parse(text));
        } catch (e) {
          return {
            ok: false,
            error: e instanceof BundleError ? e.message : 'Este arquivo não é um save do Brasil Simulator.',
          };
        }
        // Chave própria do cenário (`constructor` não é cenário); o nome vem do arquivo, então passa pela normalização.
        if (!isKnownScenario(bundle.campaign.scenario_id)) {
          return { ok: false, error: 'Este save usa um cenário que não existe nesta versão do jogo.' };
        }
        const taken = get().campaigns.map((c) => c.name);
        const name = importedName(bundle.campaign.name, taken);
        const campaignId = newCampaignId();
        let failure = null as string | null;
        const ok = await run(async (d) => {
          try {
            await importBundle(d, bundle, { id: campaignId, name });
          } catch (e) {
            failure = e instanceof BundleError ? e.message : e instanceof Error ? e.message : String(e);
            return;
          }
          await refreshList(d);
        });
        if (failure) return { ok: false, error: failure };
        if (!ok) return { ok: false, error: get().error ?? 'Não foi possível importar agora. Tente de novo.' };
        return { ok: true, campaignId };
      },

      async restartCampaign(id) {
        const source = get().campaigns.find((c) => c.id === id);
        if (!source) return { ok: false, reason: 'falha', error: 'Campanha não encontrada.' };
        const setup = source.setup ?? {
          difficulty: source.difficulty,
          scenarioId: source.scenarioId,
          seed: source.seed,
        };
        // As opções gravadas são strings do banco: `newCampaign` passa tudo pelo `checkNewCampaignInput`, que recusa
        // dificuldade, cenário, perfil ou ponto de partida desconhecidos com mensagem clara.
        const input = {
          name: restartName(
            source.name,
            get().campaigns.map((c) => c.name),
          ),
          difficulty: setup.difficulty,
          scenarioId: setup.scenarioId,
          ...(setup.profileId ? { profileId: setup.profileId } : {}),
          ...(setup.startPoint ? { startPoint: setup.startPoint } : {}),
          seed: setup.seed,
        } as NewCampaignInput;
        return get().newCampaign(input);
      },

      async continueCampaign(id) {
        // A partida já aberta continua exatamente como está: recarregar do banco descartaria o rascunho do mês.
        if (get().active?.id === id) return true;
        return run(async (d) => {
          const summary = (await listCampaigns(d)).find((c) => c.id === id);
          const state = await loadLatestState(d, id);
          // Turno anterior pelo índice do turno (PLANO_CAMPANHA.md §2.3), não pelo mês do mandato.
          const turn = turnIndexOf(state);
          const previous = turn > 0 ? (await loadStateAt(d, id, turn - 1))?.indicators : undefined;
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
            ...FRESH_DRAFT,
          });
          // Abrir a partida conta como jogada (`last_played_at`) e atualiza o cartão; falha aqui não impede abrir.
          try {
            await touchCampaign(d, id);
            await refreshList(d);
          } catch {
            // A lista do cartão fica com a data antiga até a próxima operação.
          }
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

      async firedEvents() {
        const active = get().active;
        if (!active || !db) return [];
        // Como `history`: leitura para o gráfico, sem `busy` e sem erro na tela.
        try {
          return await loadFiredEvents(db, active.id);
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
              previous: active.state.indicators,
              lastReport: result.report,
              finished,
            },
            ...FRESH_DRAFT,
          });
          await refreshList(d);
        }),

      async recordPlayTime(ms, campaignId) {
        const id = campaignId ?? get().active?.id;
        // Sem campanha ou com o banco ainda não aberto, não há onde gravar.
        if (!id || !db) return;
        try {
          const added = await addPlayTime(db, id, ms);
          if (added > 0) {
            set((s) => ({
              campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, playTimeMs: c.playTimeMs + added } : c)),
            }));
          }
        } catch {
          // Tempo de jogo é secundário: uma falha de gravação não aparece para o jogador.
        }
      },

      // O rascunho fica parado durante o fechamento do mês: o motor já leu a agenda e a gravação zera o rascunho no
      // fim, então uma escolha feita nesse meio se perderia. Campanha encerrada não tem próximo mês para decidir.
      toggleDecision: (decision) => {
        if (draftLocked()) return;
        set((s) => withDraft(s, toggleDecision(s.draft, decision)));
      },
      toggleEventChoice: (eventId, choiceId) => {
        if (draftLocked()) return;
        set((s) => withDraft(s, toggleEventChoice(s.draft, eventId, choiceId)));
      },
      clearDraft: () => {
        if (draftLocked()) return;
        set((s) => withDraft(s, EMPTY_DRAFT));
      },
      clearAgenda: () => {
        if (draftLocked()) return;
        set((s) => withDraft(s, clearAgenda(s.draft)));
      },
      undoDraft: () => {
        if (draftLocked()) return;
        set((s) => {
          const previous = s.draftHistory[s.draftHistory.length - 1];
          return previous ? { draft: previous, draftHistory: s.draftHistory.slice(0, -1) } : s;
        });
      },
      clearError: () => set({ error: undefined }),

      leaveCampaign: () =>
        run(async (d) => {
          set({ active: null, ...FRESH_DRAFT });
          await refreshList(d);
        }),

      deleteCampaign: (id) =>
        run(async (d) => {
          await deleteCampaign(d, id);
          if (get().active?.id === id) set({ active: null, ...FRESH_DRAFT });
          await refreshList(d);
        }),

      renameCampaign: (id, raw) =>
        run(async (d) => {
          const name = validateCampaignName(raw);
          if (!name.ok) throw new Error(name.error);
          await renameCampaign(d, id, name.value);
          const active = get().active;
          if (active?.id === id) set({ active: { ...active, name: name.value } });
          await refreshList(d);
        }),

      setCampaignPinned: (id, pinned) =>
        run(async (d) => {
          await setCampaignPinned(d, id, pinned);
          await refreshList(d);
        }),

      setCampaignLocked: (id, locked) =>
        run(async (d) => {
          await setCampaignLocked(d, id, locked);
          await refreshList(d);
        }),

      async deleteFinishedCampaigns() {
        let outcome: { deleted: number; keptLocked: number } | null = null;
        const ok = await run(async (d) => {
          outcome = await deleteFinishedCampaigns(d);
          await refreshList(d);
          // A partida aberta pode ter sido uma das apagadas (encerrada e sem cadeado).
          const active = get().active;
          if (active && !get().campaigns.some((c) => c.id === active.id)) set({ active: null, ...FRESH_DRAFT });
        });
        return ok ? outcome : null;
      },

      setSavedListPrefs: (prefs) =>
        run(async (d) => {
          set({ savedListPrefs: prefs });
          await setSetting(d, SAVED_LIST_PREFS_KEY, prefs);
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

      async setPreference(key, value) {
        set({ prefs: { ...get().prefs, [key]: value } });
        if (!db) return false;
        try {
          await setSetting(db, PREFERENCE_DEFS[key].key, value);
          return true;
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          return false;
        }
      },

      resetSettings: () =>
        run(async (d) => {
          await deleteSettings(d, RESETTABLE_SETTING_KEYS);
          set({
            prefs: DEFAULT_PREFERENCES,
            textScale: 1,
            reduceMotion: false,
            mapQuality: DEFAULT_MAP_QUALITY,
            dayTime: DEFAULT_DAY_TIME,
            mapClouds: DEFAULT_MAP_CLOUDS,
          });
        }),

      setReduceMotion: (on) =>
        run(async (db) => {
          await setSetting(db, REDUCE_MOTION_KEY, on);
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

/** Troca o rascunho guardando o anterior para o "Desfazer". */
function withDraft(
  s: { draft: AgendaDraft; draftHistory: readonly AgendaDraft[] },
  next: AgendaDraft,
): { draft: AgendaDraft; draftHistory: readonly AgendaDraft[] } {
  if (next === s.draft) return s;
  return { draft: next, draftHistory: pushDraftHistory(s.draftHistory, s.draft, next) };
}
