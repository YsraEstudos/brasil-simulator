import {
  ADVICE_PARAMS,
  AGENDA_ACTIONS_PER_MONTH,
  careerProfile,
  careerSchedule,
  DEFAULT_CALIBRATION,
  describeProfile,
  PROFILE_PRESETS,
  type Difficulty,
  type ProfilePresetId,
  type StartPoint,
} from '@/engine';
import {
  isKnownScenario,
  parseSeedInput,
  normalizeCampaignName,
  startPointsOf,
  type CampaignSetupForm,
  type ScenarioOption,
} from '@/store/campaignSetup';
import { campaignMonths, SCENARIOS } from '@/store/scenarios';
import type { Scenario } from '@/types/scenario';

import { DIFFICULTY } from './labels';

/**
 * Textos da tela NOVO JOGO derivados do que o motor realmente faz (não do que o design ainda planeja): ações de
 * agenda de `AGENDA_ACTIONS_PER_MONTH`, bônus e ruídos da calibração padrão e margens dos pareceres de `ADVICE_PARAMS`.
 */

const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;
const factor = (x: number) => `×${String(Math.round(x * 100) / 100).replace('.', ',')}`;

/** Escala do ruído econômico em relação à Estratégica (mesma conta do motor em `noiseScale`). */
function noiseFactor(difficulty: Difficulty): number {
  const c = DEFAULT_CALIBRATION;
  const reference = c.ruido_hiato_estrategica;
  const own = { casual: c.ruido_hiato_casual, estrategica: reference, realismo: c.ruido_hiato_realismo }[difficulty];
  return reference > 0 ? own / reference : 0;
}

export interface DifficultyView {
  id: Difficulty;
  name: string;
  tagline: string;
  actionsPerMonth: number;
  /** Diferenças implementadas no motor, em frases curtas. */
  effects: string[];
}

function buildDifficultyView(id: Difficulty): DifficultyView {
  const points = AGENDA_ACTIONS_PER_MONTH[id];
  const noise = noiseFactor(id);
  const common = [`${points} ações de agenda por mês`];
  const effects: Record<Difficulty, () => string[]> = {
    casual: () => [
      ...common,
      `Congresso mais receptivo: +${Math.round(DEFAULT_CALIBRATION.bonus_casual * 100)} pontos no apoio de cada bloco`,
      `Oscilações aleatórias da economia menores (${factor(noise)})`,
      'Anterioridade, noventena, limite de despesas e compensação da LRF não se aplicam',
      'Sem recesso de janeiro nas votações e sem vedação eleitoral',
      'Programas por convênio valem em todos os estados, sem depender de adesão',
      'Ministérios preveem as votações sem margem de erro',
    ],
    estrategica: () => [
      ...common,
      'Congresso calibrado, sem bônus de apoio',
      'Oscilações aleatórias da economia no nível de referência',
      'Regras legais completas: anterioridade, noventena, limite de despesas e LRF',
      'Recesso de janeiro e vedação eleitoral nos meses antes do pleito',
      'Programas por convênio dependem da adesão de cada governador',
      `Previsões de votação com margem de ±${pct(ADVICE_PARAMS.marginEstrategica)} dos votos`,
    ],
    realismo: () => [
      ...common,
      'Congresso calibrado, sem bônus de apoio',
      `Oscilações aleatórias da economia maiores (${factor(noise)})`,
      'Regras legais completas, como na Estratégica',
      'Recesso de janeiro e vedação eleitoral nos meses antes do pleito',
      'Programas por convênio dependem da adesão de cada governador',
      `Previsões de votação com margem de ±${pct(ADVICE_PARAMS.marginRealismo)} e viés otimista de ${pct(ADVICE_PARAMS.biasRealismo)}`,
    ],
  };
  return {
    id,
    name: DIFFICULTY[id].name,
    tagline: TAGLINES[id],
    actionsPerMonth: points,
    effects: effects[id](),
  };
}

const TAGLINES: Record<Difficulty, string> = {
  casual: 'Para conhecer o jogo: regras simplificadas e Congresso mais aberto.',
  estrategica: 'O modo padrão: regras completas e ministérios com margem de erro.',
  realismo: 'Mais incerteza na economia e pareceres menos confiáveis.',
};

/** Montadas uma vez: tudo vem de constantes do motor, que não mudam com o app aberto. */
const DIFFICULTY_VIEWS: Readonly<Record<Difficulty, DifficultyView>> = {
  casual: buildDifficultyView('casual'),
  estrategica: buildDifficultyView('estrategica'),
  realismo: buildDifficultyView('realismo'),
};

export function difficultyView(id: Difficulty): DifficultyView {
  return DIFFICULTY_VIEWS[id];
}

export interface ProfilePresetView {
  id: ProfilePresetId;
  name: string;
  description: string;
  /** Posição nos eixos em palavras (ex.: "Mercado · Progressista"), a mesma da folha "Perfil do governo". */
  axes: string;
  economic: number;
  social: number;
}

/** Perfis iniciais do NOVO JOGO (PLANO_GLOBO.md §5.1), na ordem de exibição, com a posição descrita em palavras. */
export function profilePresetViews(): ProfilePresetView[] {
  return PROFILE_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    axes: describeProfile(p).label,
    economic: p.economic,
    social: p.social,
  }));
}

export function profilePresetView(id: ProfilePresetId | undefined): ProfilePresetView {
  const views = profilePresetViews();
  return views.find((v) => v.id === id) ?? views[0];
}

function profileSummary(id: ProfilePresetId | undefined): string {
  const view = profilePresetView(id);
  return view.axes === view.name ? view.name : `${view.name} (${view.axes})`;
}

/** O cenário traz a inclinação política das UFs (v0.8.0 em diante): só nele o perfil muda a aprovação. */
export function scenarioHasLean(scenario: Scenario | undefined): boolean {
  return scenario?.regions?.ufs.every((u) => u.lean !== undefined) ?? false;
}

/** Parêntese no fim do nome do cenário: onde começa e o que diz (sem outro ")" dentro). */
function trailingNote(name: string): { start: number; note: string } | null {
  const s = name.trimEnd();
  if (!s.endsWith(')')) return null;
  const start = s.lastIndexOf('(');
  if (start < 0) return null;
  const note = s.slice(start + 1, -1);
  return note.includes(')') ? null : { start, note };
}

/** "Brasil, janeiro de 2027 (dados provisórios)" → "Brasil, janeiro de 2027"; o status dos dados vira selo. */
export function scenarioTitle(scenario: Scenario): string {
  const found = trailingNote(scenario.name);
  return (found ? scenario.name.slice(0, found.start) : scenario.name).trim() || scenario.name;
}

/** Parênteses do nome do cenário ("dados provisórios", "dados fictícios"), se houver. */
export function scenarioDataNote(scenario: Scenario): string | null {
  return trailingNote(scenario.name)?.note || null;
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** "2027-01" → "janeiro de 2027". */
export function startLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  const month: string | undefined = MONTHS[Number(m[2]) - 1];
  return month ? `${month} de ${m[1]}` : period;
}

/** "96 meses (8 anos)", "12 meses (1 ano)". */
export function durationLabel(months: number): string {
  const years = months / 12;
  const y = Number.isInteger(years) ? ` (${years} ${years === 1 ? 'ano' : 'anos'})` : '';
  return `${months} meses${y}`;
}

/** Conteúdo presente no cenário, lido dos próprios dados (não de uma lista mantida à mão). */
export function scenarioFeatures(scenario: Scenario): string[] {
  const f: string[] = [];
  f.push(scenario.economy ? 'Economia e contas públicas detalhadas' : 'Economia simplificada');
  f.push(`${scenario.blocs.length} blocos no Congresso`);
  if (scenario.policies.length > 0) f.push(`${scenario.policies.length} políticas públicas`);
  if (scenario.institutions) f.push('Ministérios e instituições');
  if (scenario.regions) f.push('27 unidades da Federação');
  if (scenarioHasLean(scenario)) f.push('Inclinação política das UFs');
  if (scenario.characters && scenario.characters.length > 0) f.push(`${scenario.characters.length} personagens`);
  if (scenario.elections) f.push('Eleições e reeleição');
  return f;
}

export const SCENARIO_KIND_LABEL: Record<ScenarioOption['kind'], string> = {
  atual: 'Atual',
  historico: 'Versão anterior',
  experimental: 'Experimental',
};

export interface StartPointView {
  id: StartPoint;
  name: string;
  description: string;
}

const START_POINT_NAME: Record<StartPoint, string> = {
  posse: 'Posse',
  corrida: 'Corrida eleitoral',
  pre_campanha: 'Pré-campanha',
};

/**
 * Pontos de partida do cenário (PLANO_CAMPANHA.md Fase C1, entrada mínima): a posse e os da carreira, com o mês de
 * início e o perfil de candidato lidos do próprio cenário. A transição até a posse ainda é provisória.
 */
export function startPointViews(scenarioId: string): StartPointView[] {
  const scenario = isKnownScenario(scenarioId) ? SCENARIOS[scenarioId] : undefined;
  return startPointsOf(scenarioId).map((id) => {
    if (id === 'posse' || !scenario) {
      return { id, name: START_POINT_NAME[id], description: 'Começa no primeiro dia do mandato, já eleito.' };
    }
    const first = careerSchedule({ scenario }, id)[0];
    const profile = careerProfile({ scenario });
    return {
      id,
      name: START_POINT_NAME[id],
      description:
        `Começa em ${startLabel(first.from)}, como ${profile.name.toLowerCase()}, e disputa a eleição de outubro: ` +
        'vencendo, toma posse em janeiro de 2027; perdendo, a partida termina com um resumo da campanha. ' +
        (scenario.career?.finance?.expanded
          ? 'Inclui ações de campanha, um debate na TV e finanças de campanha.'
          : 'Inclui ações de campanha e um debate na TV.'),
    };
  });
}

/** Texto do botão de criar: tomar posse ou começar a campanha. */
export function createActionLabel(startPoint: StartPoint | undefined, busy: boolean): string {
  if (startPoint === undefined || startPoint === 'posse') return busy ? 'TOMANDO POSSE…' : 'TOMAR POSSE';
  return busy ? 'INICIANDO A CAMPANHA…' : 'INICIAR A CAMPANHA';
}

export interface SetupSummary {
  name: string | null;
  difficulty: string;
  actionsPerMonth: number;
  scenario: string;
  version: string;
  /** Perfil ideológico inicial do governo (nome e posição nos eixos). */
  profile: string;
  startPoint: string;
  duration: string;
  seed: string;
}

/** Resumo exibido antes de TOMAR POSSE: o nome já normalizado (o mesmo que será gravado). */
export function setupSummary(form: CampaignSetupForm): SetupSummary {
  // Busca pela chave própria: "toString" ou "constructor" não são cenários.
  const scenario = isKnownScenario(form.scenarioId) ? SCENARIOS[form.scenarioId] : undefined;
  const seed = parseSeedInput(form.seedText);
  const name = normalizeCampaignName(form.name);
  return {
    name: name.length > 0 ? name : null,
    difficulty: DIFFICULTY[form.difficulty].name,
    actionsPerMonth: AGENDA_ACTIONS_PER_MONTH[form.difficulty],
    scenario: scenario ? scenarioTitle(scenario) : '—',
    version: scenario ? `v${scenario.version}` : '—',
    profile: profileSummary(form.profileId),
    startPoint: START_POINT_NAME[form.startPoint ?? 'posse'],
    duration: scenario ? `até ${durationLabel(campaignMonths(form.scenarioId))}` : '—',
    seed: !seed.ok ? 'Inválida' : seed.value === null ? 'Aleatória' : String(seed.value),
  };
}
