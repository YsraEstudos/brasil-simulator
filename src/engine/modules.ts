import type { GameState } from './types';

/**
 * Modos opcionais (PLANO_EXPANSAO_BRASIL_SIMULATOR.md §4 e §6.2). Cada módulo é classificado como núcleo,
 * detalhamento/fallback ou totalmente desligável. A regra do plano vale para todos: desligar o aprofundamento não
 * remove a causa econômica elementar — o clima continua evoluindo sem os eventos detalhados, por exemplo.
 *
 * O núcleo não entra nesta lista: o que não está registrado aqui é núcleo e está sempre ligado. Um módulo só existe
 * nesta tabela se tiver efeito verificável; opção decorativa invisível é proibida pelo plano (§5, EX-03).
 */
export const MODULE_IDS = ['clima_detalhado', 'noticias'] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/**
 * `detalhamento` troca um modelo detalhado por um fallback agregado; `desligavel` remove uma camada de
 * apresentação/interpretação sem tocar no motor. Nenhum dos dois pode remover um canal econômico.
 */
export type ModuleClass = 'detalhamento' | 'desligavel';

export interface ModuleSpec {
  id: ModuleId;
  name: string;
  /** O que muda quando o módulo está desligado; sempre em termos do que permanece. */
  description: string;
  moduleClass: ModuleClass;
  /** Valor do módulo em uma campanha nova. */
  defaultEnabled: boolean;
}

export const MODULES: readonly ModuleSpec[] = [
  {
    id: 'clima_detalhado',
    name: 'Clima detalhado',
    description:
      'Eventos climáticos com local e severidade. Desligado, o clima continua evoluindo e alimentando a economia; só os eventos que dependem do detalhe regional deixam de disparar.',
    moduleClass: 'detalhamento',
    defaultEnabled: true,
  },
  {
    id: 'noticias',
    name: 'Notícias do mês',
    description:
      'Manchetes com causa rastreável no relatório do mês. Desligado, o relatório e os indicadores não mudam; só a camada de notícias deixa de ser publicada.',
    moduleClass: 'desligavel',
    defaultEnabled: true,
  },
];

/** Módulos ligados em uma campanha nova, na ordem da tabela. */
export const DEFAULT_ENABLED_MODULES: readonly ModuleId[] = MODULES.filter((module) => module.defaultEnabled).map(
  (module) => module.id,
);

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && (MODULE_IDS as readonly string[]).includes(value);
}

export function moduleSpec(id: ModuleId): ModuleSpec {
  const spec = MODULES.find((module) => module.id === id);
  if (!spec) throw new RangeError(`módulo desconhecido: ${id}`);
  return spec;
}

/** Ordena e remove repetições: a mesma escolha gera sempre a mesma configuração serializada. */
export function normalizeModules(ids: readonly ModuleId[]): ModuleId[] {
  return MODULE_IDS.filter((id) => ids.includes(id));
}

/**
 * Módulos ligados na partida. Estado sem configuração (cenário antigo ou save de desenvolvimento) usa o padrão;
 * módulo fora da tabela nunca é considerado ligado.
 */
export function enabledModules(state: Pick<GameState, 'initialCampaignConfiguration'>): readonly ModuleId[] {
  const configured = state.initialCampaignConfiguration?.modules;
  return normalizeModules(configured ?? DEFAULT_ENABLED_MODULES);
}

/** Verdadeiro só para módulo conhecido e ligado nesta partida. */
export function moduleEnabled(state: Pick<GameState, 'initialCampaignConfiguration'>, id: ModuleId): boolean {
  return enabledModules(state).includes(id);
}
