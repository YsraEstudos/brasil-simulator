import type { ScenarioUf } from '../../types/scenario';
import type { ClimateState, GameContent, GameState, RegionalPiece, UfClimate } from '../types';

import { climateParam } from './calibration';

/**
 * Efeitos do clima (PLANO_GLOBO.md §6.2; ECONOMIC_MODEL.md §5.18). Funções puras do estado climático e do cenário;
 * sem sorteio. Há três usos, cada um com um papel distinto para não contar nada duas vezes:
 *
 *  1. **Dano nacional** (`climateDamageOf`): agrega as UFs e entra uma vez na economia, antes dela, pela fila de
 *     impulsos (`climateEvolutionStep`). É o único que mexe no PIB, nos alimentos e na energia do agregado.
 *  2. **Distribuição regional** (`climateRegionalEffects`): usada pelo `regionsStep` dentro de `distribute`. Só
 *     redistribui: a atividade é normalizada pelo desempenho das demais UFs e a aprovação, centrada na média
 *     nacional ponderada pela população (D7), então a soma dos desvios das UFs não altera nenhum total.
 *  3. **Humor nacional** (`climateMoodTerms`): o nível nacional do humor por chuva/seca prolongada é a média dos termos
 *     das UFs ponderada pela população; entra uma vez em `aprovacao` (`opinionStep`). A distribuição regional
 *     centra os mesmos termos nessa média, então cada UF acaba com o seu termo inteiro (nacional + termo − média) e
 *     nada é contado duas vezes. Não é o efeito econômico da seca (esse vai só pelo item 1 e pelas fórmulas de opinião
 *     sobre PIB, inflação e desemprego): é humor, que só age em cheia e em seca já prolongada.
 */

/** Causas do clima (ids estáveis, usados no "Por que mudou?" e na explicação regional). */
export const CLIMATE_CAUSES = {
  /** Seca no PIB (nacional, `choque.hiato`) e na atividade da UF (regional). */
  drought: 'clima_seca',
  droughtFood: 'clima_seca_alimentos',
  droughtEnergy: 'clima_seca_energia',
  /** Chuva excessiva no PIB nacional. */
  rain: 'clima_chuvas',
  rainFood: 'clima_chuvas_alimentos',
  /** Humor regional: chuva acima do normal (cheia) e seca prolongada. */
  rainMood: 'clima_chuvas_humor',
  droughtMood: 'clima_seca_prolongada',
} as const;

/** Macrorregiões cujos reservatórios sustentam o preço da energia (proxy documentada em `dano_energia_seca_max`). */
const RESERVOIR_REGIONS: readonly string[] = ['sudeste', 'centro_oeste'];

/** Dano nacional do clima no mês (todos ≥ 0; frações; ver `CLIMATE_PARAMS`). */
export interface ClimateDamage {
  /** Perda de nível do PIB por seca (fração; estado estacionário do hiato). */
  droughtGdp: number;
  /** Perda de nível do PIB por chuva excessiva. */
  rainGdp: number;
  /** Pressão da seca sobre a inflação de alimentos (fração em 12 meses). */
  droughtFood: number;
  /** Pressão da seca sobre a inflação via energia elétrica. */
  droughtEnergy: number;
  /** Pressão da chuva excessiva sobre a inflação de alimentos. */
  rainFood: number;
}

const NO_DAMAGE: ClimateDamage = { droughtGdp: 0, rainGdp: 0, droughtFood: 0, droughtEnergy: 0, rainFood: 0 };

/** Cenário com UFs: o clima só tem peso (PIB, agropecuária, população) quando há dados regionais. */
function scenarioUfs(content: Pick<GameContent, 'scenario'>): readonly ScenarioUf[] {
  return content.scenario.regions?.ufs ?? [];
}

/** Clima de cada UF do cenário, na ordem do cenário (neutro se a sigla não estiver no estado). */
function climateByScenarioUf(climate: Readonly<ClimateState>, ufs: readonly ScenarioUf[]): UfClimate[] {
  const byId = new Map(climate.ufs.map((u) => [u.id, u]));
  return ufs.map((u) => byId.get(u.id) ?? { id: u.id, rain: 0, dryness: 0 });
}

/**
 * Vulnerabilidade a cheias de cada UF (0 < v ≤ 1): `piso + (1 − piso) × pobreza ÷ pobreza máxima`. Proxy simples e
 * documentada: a pobreza do cenário representa moradia precária em área de risco.
 */
export function floodVulnerabilities(ufs: readonly ScenarioUf[]): number[] {
  const floor = climateParam('cheia_vulnerabilidade_piso');
  const maxPoverty = Math.max(...ufs.map((u) => u.poverty));
  return ufs.map((u) => floor + (1 - floor) * (maxPoverty > 0 ? u.poverty / maxPoverty : 0));
}

/**
 * Risco de cheia da UF no mês, em [0, `cheia_risco_max` × vulnerabilidade]: chuva forte × solo úmido × vulnerabilidade.
 * `excesso = máx(0, chuva − limiar × (1 + absorção × seca))` — o solo seco absorve (sobe o limiar) e o úmido escoa; a
 * seca (memória hídrica da UF) faz o papel da umidade do solo, sem outro campo no estado. `risco = máx · tanh(excesso ÷
 * escala) · vulnerabilidade`. Nunca é certeza; é a probabilidade-base que o PR 9 usa para eventos de cheia.
 */
export function floodRisk(uf: Readonly<UfClimate>, vulnerability: number): number {
  const threshold = climateParam('cheia_limiar_anomalia') * (1 + climateParam('cheia_absorcao_seca') * uf.dryness);
  const excess = Math.max(0, uf.rain - threshold);
  return climateParam('cheia_risco_max') * Math.tanh(excess / climateParam('cheia_escala')) * vulnerability;
}

/** Soma ponderada por `weights` dividida pela soma dos pesos (0 se os pesos somam 0). */
function weightedMean(values: readonly number[], weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  return total > 0 ? values.reduce((s, v, i) => s + v * weights[i], 0) / total : 0;
}

/**
 * Dano nacional do clima (agregado das UFs; PLANO_GLOBO.md §6.2), cada um saturado por `tanh` no teto da calibração:
 *
 *  - **PIB, seca**: soma do dano de atividade das UFs ponderada pelo PIB — `Σ pib_UF × dano_atividade_seca × agro_UF ×
 *    seca_UF`, saturada em `dano_pib_seca_max`. É o mesmo dano que cada UF sofre em `climateRegionalEffects`; aqui
 *    entra no total, lá só redistribui.
 *  - **Alimentos, seca**: seca média ponderada pelo PIB agropecuário (`pib_UF × agro_UF`) em `dano_alimentos_seca_max`.
 *  - **Energia, seca**: seca média do Sudeste e do Centro-Oeste ponderada pelo PIB em `dano_energia_seca_max`.
 *  - **PIB e alimentos, chuva**: risco de cheia médio ponderado pelo PIB em `dano_pib_chuva_max` e
 *    `dano_alimentos_chuva_max`.
 * Zero sem dados regionais no cenário. O peso agropecuário é o `sectors.agropecuaria` do cenário (dado por UF).
 */
export function climateDamageOf(
  climate: Readonly<ClimateState>,
  content: Pick<GameContent, 'scenario'>,
): ClimateDamage {
  const ufs = scenarioUfs(content);
  if (ufs.length === 0) return NO_DAMAGE;
  const clima = climateByScenarioUf(climate, ufs);
  const gdp = ufs.map((u) => u.gdpShare);
  const agroGdp = ufs.map((u) => u.gdpShare * u.sectors.agropecuaria);
  const dryness = clima.map((c) => c.dryness);
  const scale = climateParam('seca_escala_nacional');

  const activityLoss = ufs.reduce(
    (s, u, i) => s + u.gdpShare * climateParam('dano_atividade_seca') * u.sectors.agropecuaria * dryness[i],
    0,
  );
  const gdpCap = climateParam('dano_pib_seca_max');
  const droughtGdp = gdpCap * Math.tanh(activityLoss / gdpCap);

  const droughtFood = climateParam('dano_alimentos_seca_max') * Math.tanh(weightedMean(dryness, agroGdp) / scale);
  const reservoir = ufs.map((u, i) => (RESERVOIR_REGIONS.includes(u.region) ? gdp[i] : 0));
  const droughtEnergy = climateParam('dano_energia_seca_max') * Math.tanh(weightedMean(dryness, reservoir) / scale);

  const vulnerability = floodVulnerabilities(ufs);
  const risk = clima.map((c, i) => floodRisk(c, vulnerability[i]));
  const rainIndex = Math.tanh(weightedMean(risk, gdp) / climateParam('cheia_escala_nacional'));
  return {
    droughtGdp,
    rainGdp: climateParam('dano_pib_chuva_max') * rainIndex,
    droughtFood,
    droughtEnergy,
    rainFood: climateParam('dano_alimentos_chuva_max') * rainIndex,
  };
}

/** Termos de humor de cada UF (≤ 0, em fração da aprovação), na ordem do cenário. */
export interface UfMood {
  /** Chuva acima do normal (cheia): `−aprovacao_clima_max × risco ÷ risco_max`. */
  rain: number[];
  /** Seca prolongada: `−aprovacao_clima_max × máx(0, seca − limiar) ÷ (1 − limiar)`. */
  drought: number[];
}

/**
 * Humor de cada UF por chuva acima do normal e por seca prolongada. Saturados por construção (cada termo fica entre
 * `−aprovacao_clima_max` e 0). Sem dados regionais, listas vazias.
 */
export function ufMoodOf(climate: Readonly<ClimateState>, content: Pick<GameContent, 'scenario'>): UfMood {
  const ufs = scenarioUfs(content);
  const clima = climateByScenarioUf(climate, ufs);
  const vulnerability = floodVulnerabilities(ufs);
  const max = climateParam('aprovacao_clima_max');
  const threshold = climateParam('seca_humor_limiar');
  return {
    rain: clima.map((c, i) => -max * (floodRisk(c, vulnerability[i]) / climateParam('cheia_risco_max'))),
    drought: clima.map((c) => -max * (Math.max(0, c.dryness - threshold) / (1 - threshold))),
  };
}

/** Parcela com cada UF na ordem do cenário (`activity` em log da atividade; `approval` em fração). */
export interface ClimateRegionalPieces {
  activity: RegionalPiece[][];
  approval: RegionalPiece[][];
}

/**
 * Efeito regional do clima (PLANO_GLOBO.md §6.2), parcela bruta de cada UF **antes** da normalização do
 * `regionsStep`:
 *
 *  - atividade: `−dano_atividade_seca × agro_UF × seca_UF` (causa "Seca"): quem depende mais da agropecuária perde
 *    mais; o `regionsStep` satura e normaliza pelo desempenho das demais UFs, então só redistribui;
 *  - aprovação: humor por chuva acima do normal ("Chuvas acima do normal") e por seca prolongada ("Seca
 *    prolongada"); o `regionsStep` satura e centra pela população (D7). A parte nacional dos mesmos termos é
 *    `climateMoodTerms`.
 * Parcelas zero não são devolvidas (clima neutro não muda nenhuma explicação). Sem dados regionais, listas vazias.
 */
export function climateRegionalEffects(
  state: Pick<GameState, 'climate'>,
  content: Pick<GameContent, 'scenario'>,
): ClimateRegionalPieces {
  const ufs = scenarioUfs(content);
  const clima = climateByScenarioUf(state.climate, ufs);
  const mood = ufMoodOf(state.climate, content);
  const activity = ufs.map((u, i): RegionalPiece[] => [
    {
      cause: CLIMATE_CAUSES.drought,
      label: 'Seca',
      delta: -climateParam('dano_atividade_seca') * u.sectors.agropecuaria * clima[i].dryness,
    },
  ]);
  const approval = ufs.map((_, i): RegionalPiece[] => [
    { cause: CLIMATE_CAUSES.rainMood, label: 'Chuvas acima do normal', delta: mood.rain[i] },
    { cause: CLIMATE_CAUSES.droughtMood, label: 'Seca prolongada', delta: mood.drought[i] },
  ]);
  const nonZero = (pieces: RegionalPiece[]) => pieces.filter((p) => p.delta !== 0);
  return { activity: activity.map(nonZero), approval: approval.map(nonZero) };
}

/**
 * Parte **nacional** do humor (pesos de população `pop`, soma 1): média ponderada dos termos das UFs, uma parcela por
 * causa, em fração da aprovação (estado estacionário). O `opinionStep` a soma uma vez a `aprovacao` (`ajuste_aprovacao ×
 * termo`, como o termo do eleitor mediano); a distribuição regional centra os mesmos termos na média, então cada UF
 * recebe o seu termo inteiro sem contar a média duas vezes.
 */
export function climateMoodTerms(
  state: Pick<GameState, 'climate'>,
  content: Pick<GameContent, 'scenario'>,
  pop: readonly number[],
): { cause: string; label: string; delta: number }[] {
  if (scenarioUfs(content).length === 0) return [];
  const mood = ufMoodOf(state.climate, content);
  const mean = (values: readonly number[]) => values.reduce((s, v, i) => s + pop[i] * v, 0);
  return [
    { cause: CLIMATE_CAUSES.rainMood, label: 'Chuvas acima do normal', delta: mean(mood.rain) },
    { cause: CLIMATE_CAUSES.droughtMood, label: 'Seca prolongada', delta: mean(mood.drought) },
  ].filter((p) => p.delta !== 0);
}
