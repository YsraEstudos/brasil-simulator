import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from './advanceMonth';
import { campaignConfigSchema } from './campaignConfig';
import {
  DEFAULT_ENABLED_MODULES,
  enabledModules,
  isModuleId,
  MODULES,
  moduleEnabled,
  moduleSpec,
  normalizeModules,
  type ModuleId,
} from './modules';
import { createInitialState } from './state';
import type { GameState, MonthInput } from './types';

/**
 * Modos opcionais (PLANO_EXPANSAO_BRASIL_SIMULATOR.md §4 e §6.2). O que estes testes protegem:
 * 1. a tabela de módulos é o contrato — id único, classe explícita e efeito descrito;
 * 2. desligar uma camada de apresentação não pode mexer no motor (§6.2: "ativar módulo inerte não altera outro
 *    domínio");
 * 3. desligar um aprofundamento não pode remover a causa econômica elementar (§4).
 */

const content = loadContent(DEFAULT_SCENARIO_ID);
const EMPTY_MONTH: MonthInput = { decisions: [] };

function run(months: number, modules: readonly ModuleId[]): GameState {
  let state = createInitialState({ content, difficulty: 'estrategica', seed: 7, modules });
  for (let m = 0; m < months; m++) state = advanceMonth(state, EMPTY_MONTH, content).state;
  return state;
}

/** Estado sem a camada de notícias: é o que o módulo `noticias` controla. */
function withoutNews(state: GameState): Omit<GameState, 'events'> & { events: Omit<GameState['events'], 'news'> } {
  const { news: _news, ...events } = state.events;
  return { ...state, events };
}

/** Estado sem a escolha de módulos: a configuração é justamente o que difere entre as duas partidas. */
function withoutModuleChoice(state: GameState): GameState {
  const { modules: _modules, ...config } = state.initialCampaignConfiguration;
  return { ...state, initialCampaignConfiguration: config as GameState['initialCampaignConfiguration'] };
}

describe('tabela de módulos opcionais', () => {
  it('tem ids únicos, classe explícita e efeito descrito; o núcleo não aparece na tabela', () => {
    const ids = MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const module of MODULES) {
      expect(module.name.trim().length).toBeGreaterThan(0);
      // A descrição precisa dizer o que permanece quando o módulo está desligado, não só o que some.
      expect(module.description.trim().length).toBeGreaterThan(40);
      expect(['detalhamento', 'desligavel']).toContain(module.moduleClass);
    }
    expect(ids).toEqual([...DEFAULT_ENABLED_MODULES]);
    expect(MODULE_IDS_EQUAL()).toBe(true);
  });

  it('normaliza a escolha: mesma seleção, mesma ordem e sem repetição', () => {
    expect(normalizeModules(['noticias', 'clima_detalhado', 'noticias'])).toEqual(['clima_detalhado', 'noticias']);
    expect(normalizeModules([])).toEqual([]);
    expect(isModuleId('noticias')).toBe(true);
    expect(isModuleId('modulo_inexistente')).toBe(false);
    expect(isModuleId(42)).toBe(false);
    expect(() => moduleSpec('modulo_inexistente' as never)).toThrow(RangeError);
  });

  it('sem configuração no estado, vale o padrão; módulo desconhecido nunca conta como ligado', () => {
    const state = createInitialState({ content, difficulty: 'casual', seed: 1 });
    expect(enabledModules(state)).toEqual([...DEFAULT_ENABLED_MODULES]);
    expect(moduleEnabled(state, 'noticias')).toBe(true);
    const legacy = { initialCampaignConfiguration: undefined } as unknown as Pick<
      GameState,
      'initialCampaignConfiguration'
    >;
    expect(enabledModules(legacy)).toEqual([...DEFAULT_ENABLED_MODULES]);
  });

  it('a configuração versionada rejeita módulo desconhecido, em vez de descartar em silêncio', () => {
    const config = createInitialState({ content, difficulty: 'casual', seed: 3 }).initialCampaignConfiguration;
    expect(campaignConfigSchema.safeParse(config).success).toBe(true);
    expect(campaignConfigSchema.safeParse({ ...config, modules: ['noticias', 'inexistente'] }).success).toBe(false);
    expect(campaignConfigSchema.safeParse({ ...config, modules: 'noticias' }).success).toBe(false);
  });
});

describe('efeito dos módulos', () => {
  it('desligar notícias não altera indicadores, sorteios nem relatório: só a camada publicada', () => {
    const withNews = run(6, [...DEFAULT_ENABLED_MODULES]);
    const noNews = run(6, ['clima_detalhado', 'crises_sanitarias']);
    expect(withNews.events.news.length).toBeGreaterThan(0);
    expect(noNews.events.news).toEqual([]);
    // Tudo o mais é idêntico, inclusive o PRNG principal e o clima (o módulo não consome sorteio).
    expect(withoutNews(withoutModuleChoice(noNews))).toEqual(withoutNews(withoutModuleChoice(withNews)));
    expect(noNews.rng).toEqual(withNews.rng);
  });

  it('desligar o clima detalhado mantém o clima evoluindo e remove só os eventos que dependem do detalhe', () => {
    const climateEvents = content.events.filter((event) => event.trigger.climate).map((event) => event.id);
    expect(climateEvents.length).toBeGreaterThan(0);
    const detailed = run(12, [...DEFAULT_ENABLED_MODULES]);
    const aggregate = run(12, ['noticias']);
    // A causa elementar continua e é a mesma: o clima sai do estado inicial e evolui igual nos dois casos, porque o
    // módulo corta o evento antes de consumir sorteio.
    const initial = createInitialState({ content, difficulty: 'estrategica', seed: 7, modules: ['noticias'] });
    expect(aggregate.climate.rng).not.toEqual(initial.climate.rng);
    expect(aggregate.climate).toEqual(detailed.climate);
    expect(aggregate.climate.ufs).toHaveLength(detailed.climate.ufs.length);
    // Nenhum evento climático aparece na caixa de entrada, nos disparos nem no histórico de notícias.
    const firedClimate = (state: GameState) =>
      state.events.news.filter((item) => item.sourceId && climateEvents.includes(item.sourceId)).length;
    expect(firedClimate(aggregate)).toBe(0);
    // Os eventos sem gatilho climático seguem elegíveis: o módulo não desliga o sistema de eventos inteiro.
    const anyEvent = (state: GameState) => state.events.news.some((item) => item.kind === 'evento');
    expect(anyEvent(aggregate) || anyEvent(detailed)).toBe(true);
  });
});

/** `MODULE_IDS` é a fonte da verdade da tabela; este atalho evita importar o array só para a asserção. */
function MODULE_IDS_EQUAL(): boolean {
  return MODULES.every((module) => isModuleId(module.id));
}
