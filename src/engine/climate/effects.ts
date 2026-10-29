import type { ScenarioUf } from '../../types/scenario';
import { activeImpulses } from '../impulses';
import type {
  ClimateState,
  Difficulty,
  GameContent,
  GameState,
  RegionalPiece,
  ScheduledImpulse,
  UfClimate,
} from '../types';

import { CLIMATE_EXPECTED_DAMAGE, climateParam } from './calibration';

/**
 * Efeitos do clima (PLANO_GLOBO.md §6.2; ECONOMIC_MODEL.md §5.18). Funções puras do estado climático e do cenário;
 * sem sorteio. Há três usos, cada um com um papel distinto para não contar nada duas vezes:
 *
 *  1. **Dano nacional** (`climateDamageOf`): agrega as UFs e entra uma vez na economia, antes dela, pela fila de
 *     impulsos (`climateEvolutionStep`). É o único que mexe no PIB, nos alimentos e na energia do agregado.
 *  2. **Distribuição regional** (`climateRegionalEffects`): usada pelo `regionsStep` dentro de `distribute`. Só
 *     redistribui: a atividade é normalizada pelo desempenho das demais UFs e a aprovação, centrada na média
 *     nacional ponderada pela população (D7), então a soma dos desvios das UFs não altera nenhum total.
 *  3. **Prevenção** (`preventionOf`, PR 13): a carteira de políticas (`publicPolicies`) agenda a força de cada programa
 *     como impulsos `clima.prevencao_*`; a soma por UF, saturada, vira a fração do **dano** que a UF evita. A chuva e a
 *     seca não mudam (a evolução em `evolution.ts` não lê a prevenção): só a conta do dano, nacional e regional, que usa
 *     a mesma proteção por UF — o que entra no total e o que a UF sofre continuam batendo, sem contagem dupla.
 *  4. **Humor nacional** (`climateMoodTerms`): o nível nacional do humor por chuva/seca prolongada é a média dos termos
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
  /** Dano evitado pela prevenção (PR 13): parcelas negativas (a favor), separadas do clima em si. */
  droughtPrevention: 'clima_seca_prevencao',
  droughtPricesPrevention: 'clima_seca_precos_prevencao',
  rainPrevention: 'clima_chuvas_prevencao',
  rainFoodPrevention: 'clima_chuvas_alimentos_prevencao',
  /** Resposta federal à emergência (governabilidade): relação com o governador da UF atingida. */
  response: 'clima_resposta_federal',
} as const;

/** Macrorregiões cujos reservatórios sustentam o preço da energia (proxy documentada em `dano_energia_seca_max`). */
const RESERVOIR_REGIONS: readonly string[] = ['sudeste', 'centro_oeste'];

/**
 * Dano nacional do clima no mês, **com sinal e de média zero** em torno da normal climatológica (frações; ver
 * `CLIMATE_PARAMS` e `CLIMATE_EXPECTED_DAMAGE`). Positivo = pressão adversa (perda de PIB, inflação mais alta);
 * negativo = clima melhor que o esperado (boa safra, reservatórios cheios), com piso em `−teto × esperado`.
 */
export interface ClimateDamage {
  /** Perda de nível do PIB por seca (fração; estado estacionário do hiato). Negativa = menos seca que o esperado. */
  droughtGdp: number;
  /** Perda de nível do PIB por chuva excessiva. Negativa = menos cheia que o esperado. */
  rainGdp: number;
  /** Pressão da seca sobre a inflação de alimentos (fração em 12 meses). Negativa = boa safra. */
  droughtFood: number;
  /** Pressão da seca sobre a inflação via energia elétrica. Negativa = reservatórios melhores que o esperado. */
  droughtEnergy: number;
  /** Pressão da chuva excessiva sobre a inflação de alimentos. Negativa = menos cheia que o esperado. */
  rainFood: number;
}

/** Os termos do dano como fração do teto de cada um (0–1, saída do `tanh`), antes de tirar o valor esperado. */
export interface ClimateDamageIndices {
  droughtGdp: number;
  droughtFood: number;
  droughtEnergy: number;
  rain: number;
}

const NO_DAMAGE: ClimateDamage = { droughtGdp: 0, rainGdp: 0, droughtFood: 0, droughtEnergy: 0, rainFood: 0 };

/** Cenário com UFs: o clima só tem peso (PIB, agropecuária, população) quando há dados regionais. */
export function scenarioUfs(content: Pick<GameContent, 'scenario'>): readonly ScenarioUf[] {
  return content.scenario.regions?.ufs ?? [];
}

/** Clima de cada UF do cenário, na ordem do cenário (neutro se a sigla não estiver no estado). */
export function climateByScenarioUf(climate: Readonly<ClimateState>, ufs: readonly ScenarioUf[]): UfClimate[] {
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

/**
 * Fração do dano da seca e das cheias que a prevenção evita em cada UF do cenário (PR 13), na ordem do cenário, cada uma
 * em [0, `prevencao_teto`]. Nenhum programa ativo = tudo zero.
 */
export interface Prevention {
  drought: number[];
  flood: number[];
}

/** Sem prevenção: nenhuma UF evita dano. */
export function noPrevention(ufs: readonly ScenarioUf[]): Prevention {
  return { drought: ufs.map(() => 0), flood: ufs.map(() => 0) };
}

/** A UF está no escopo do impulso (vazio = todas), como `inScope` das regiões (copiado para não cruzar módulos). */
export function inImpulseScope(
  uf: Pick<ScenarioUf, 'id' | 'region'>,
  impulse: Pick<ScheduledImpulse, 'regional'>,
): boolean {
  const scope = impulse.regional?.scope ?? [];
  return scope.length === 0 || scope.includes(uf.region) || scope.includes(uf.id);
}

/** Proteção (fração do dano evitada) para uma força somada: `teto × tanh(força ÷ escala)`, sempre em [0, teto). */
export function protectionOf(strength: number): number {
  return climateParam('prevencao_teto') * Math.tanh(Math.max(0, strength) / climateParam('prevencao_escala'));
}

/**
 * Prevenção de cada UF no mês: soma a força dos impulsos `clima.prevencao_seca` e `clima.prevencao_cheia` ativos nas UFs
 * do escopo de cada um e satura a soma (`protectionOf`). Função pura da fila de impulsos: a força de cada programa já
 * chega com o atraso, o avanço da obra e a depreciação do ativo (`publicPolicies`), então aqui não há memória nem sorteio.
 * Vários programas somam com retornos decrescentes; nenhum passa do teto.
 */
export function preventionOf(
  impulses: readonly ScheduledImpulse[],
  monthIndex: number,
  ufs: readonly ScenarioUf[],
): Prevention {
  const active = activeImpulses(impulses, monthIndex, ['clima.prevencao_seca', 'clima.prevencao_cheia']);
  if (active.length === 0) return noPrevention(ufs);
  const strength = (target: ScheduledImpulse['target']) =>
    ufs.map((u) => active.filter((i) => i.target === target && inImpulseScope(u, i)).reduce((s, i) => s + i.delta, 0));
  return {
    drought: strength('clima.prevencao_seca').map(protectionOf),
    flood: strength('clima.prevencao_cheia').map(protectionOf),
  };
}

/** Soma ponderada por `weights` dividida pela soma dos pesos (0 se os pesos somam 0). */
function weightedMean(values: readonly number[], weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  return total > 0 ? values.reduce((s, v, i) => s + v * weights[i], 0) / total : 0;
}

/**
 * Termos do dano nacional como fração do teto, sem centrar (PLANO_GLOBO.md §6.2), cada um saturado por `tanh`:
 *
 *  - **PIB, seca**: soma do dano de atividade das UFs ponderada pelo PIB — `Σ pib_UF × dano_atividade_seca × agro_UF ×
 *    seca_UF`, saturada em `dano_pib_seca_max`. É o mesmo dano que cada UF sofre em `climateRegionalEffects`; aqui
 *    entra no total, lá só redistribui.
 *  - **Alimentos, seca**: seca média ponderada pelo PIB agropecuário (`pib_UF × agro_UF`).
 *  - **Energia, seca**: seca média do Sudeste e do Centro-Oeste ponderada pelo PIB.
 *  - **Chuva excessiva** (PIB e alimentos): risco de cheia médio ponderado pelo PIB.
 * `null` sem dados regionais no cenário. O peso agropecuário é o `sectors.agropecuaria` do cenário (dado por UF).
 *
 * **Prevenção (PR 13):** com `prevention`, a seca e o risco de cheia de cada UF entram multiplicados por `1 − proteção` da
 * UF (o que o clima fez continua igual; muda quanto dele vira dano). O valor esperado do centramento
 * (`CLIMATE_EXPECTED_DAMAGE`) **não** é escalado — ver `climateDamageOf`.
 */
export function climateDamageIndices(
  climate: Readonly<ClimateState>,
  content: Pick<GameContent, 'scenario'>,
  prevention?: Prevention,
): ClimateDamageIndices | null {
  const ufs = scenarioUfs(content);
  if (ufs.length === 0) return null;
  const clima = climateByScenarioUf(climate, ufs);
  const gdp = ufs.map((u) => u.gdpShare);
  const agroGdp = ufs.map((u) => u.gdpShare * u.sectors.agropecuaria);
  const dryness = clima.map((c, i) => c.dryness * (1 - (prevention?.drought[i] ?? 0)));
  const scale = climateParam('seca_escala_nacional');

  const activityLoss = ufs.reduce(
    (s, u, i) => s + u.gdpShare * climateParam('dano_atividade_seca') * u.sectors.agropecuaria * dryness[i],
    0,
  );
  const reservoir = ufs.map((u, i) => (RESERVOIR_REGIONS.includes(u.region) ? gdp[i] : 0));
  const vulnerability = floodVulnerabilities(ufs);
  const risk = clima.map((c, i) => floodRisk(c, vulnerability[i]) * (1 - (prevention?.flood[i] ?? 0)));
  return {
    droughtGdp: Math.tanh(activityLoss / climateParam('dano_pib_seca_max')),
    droughtFood: Math.tanh(weightedMean(dryness, agroGdp) / scale),
    droughtEnergy: Math.tanh(weightedMean(dryness, reservoir) / scale),
    rain: Math.tanh(weightedMean(risk, gdp) / climateParam('cheia_escala_nacional')),
  };
}

/**
 * Dano nacional do clima (agregado das UFs; PLANO_GLOBO.md §6.2): cada termo de `climateDamageIndices` menos o seu
 * valor esperado na dificuldade (`CLIMATE_EXPECTED_DAMAGE`), vezes o teto. Média zero a longo prazo: clima ruim
 * empurra preços e PIB para o lado adverso e clima bom (menos seca e menos cheia que o normal) para o favorável;
 * a assimetria fica só no teto (a boa safra vale no máximo `−teto × esperado`, a seca até `teto × (1 − esperado)`).
 *
 * **Prevenção e centramento (PR 13).** Com `prevention`, os índices saem já protegidos mas o valor esperado continua o
 * da tabela (clima **sem** prevenção). Isso é de propósito: a tabela é "o dano médio que o clima causa a uma economia
 * desprotegida", que a calibração do resto do jogo já embute como normal. Quem investe em prevenção ganha exatamente o
 * **dano médio evitado** (≈ proteção × esperado × teto, um desvio negativo permanente mas limitado pelo teto da proteção
 * e pago com obra, manutenção e ações de agenda) e, nos anos ruins, a redução do pico. Escalar o esperado junto
 * anularia o ganho médio (prevenção seria só variância menor); não escalar e deixar a proteção ilimitada seria bônus
 * grátis — por isso a proteção satura em `prevencao_teto` e depende de ativo mantido.
 */
export function climateDamageOf(
  climate: Readonly<ClimateState>,
  content: Pick<GameContent, 'scenario'>,
  difficulty: Difficulty,
  prevention?: Prevention,
): ClimateDamage {
  const index = climateDamageIndices(climate, content, prevention);
  if (!index) return NO_DAMAGE;
  const expected = CLIMATE_EXPECTED_DAMAGE[difficulty];
  const rain = index.rain - expected.rain;
  return {
    droughtGdp: climateParam('dano_pib_seca_max') * (index.droughtGdp - expected.droughtGdp),
    rainGdp: climateParam('dano_pib_chuva_max') * rain,
    droughtFood: climateParam('dano_alimentos_seca_max') * (index.droughtFood - expected.droughtFood),
    droughtEnergy: climateParam('dano_energia_seca_max') * (index.droughtEnergy - expected.droughtEnergy),
    rainFood: climateParam('dano_alimentos_chuva_max') * rain,
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
 *  - atividade: `−dano_atividade_seca × agro_UF × seca_UF` (causa "Seca": quem depende mais da agropecuária perde
 *    mais) e, com prevenção, a parcela a favor `+dano_atividade_seca × agro_UF × seca_UF × proteção_UF` (causa
 *    "Prevenção reduziu o dano da seca"); o `regionsStep` satura e normaliza pelo desempenho das demais UFs, então só
 *    redistribui. A soma das duas é o mesmo dano protegido que `climateDamageIndices` agrega no nacional;
 *  - aprovação: humor por chuva acima do normal ("Chuvas acima do normal") e por seca prolongada ("Seca
 *    prolongada"); o `regionsStep` satura e centra pela população (D7). A parte nacional dos mesmos termos é
 *    `climateMoodTerms`. O humor **não** é escalado pela prevenção: reage ao evento, não ao dano material.
 * Parcelas zero não são devolvidas (clima neutro não muda nenhuma explicação). Sem dados regionais, listas vazias.
 */
export function climateRegionalEffects(
  state: Pick<GameState, 'climate'> & Partial<Pick<GameState, 'impulses' | 'monthIndex'>>,
  content: Pick<GameContent, 'scenario'>,
): ClimateRegionalPieces {
  const ufs = scenarioUfs(content);
  const clima = climateByScenarioUf(state.climate, ufs);
  const mood = ufMoodOf(state.climate, content);
  const prevention =
    state.impulses && state.monthIndex !== undefined
      ? preventionOf(state.impulses, state.monthIndex, ufs)
      : noPrevention(ufs);
  const activity = ufs.map((u, i): RegionalPiece[] => {
    const loss = climateParam('dano_atividade_seca') * u.sectors.agropecuaria * clima[i].dryness;
    return [
      { cause: CLIMATE_CAUSES.drought, label: 'Seca', delta: -loss },
      {
        cause: CLIMATE_CAUSES.droughtPrevention,
        label: 'Prevenção reduziu o dano da seca',
        delta: loss * prevention.drought[i],
      },
    ];
  });
  const approval = ufs.map((_, i): RegionalPiece[] => [
    { cause: CLIMATE_CAUSES.rainMood, label: 'Chuvas acima do normal', delta: mood.rain[i] },
    { cause: CLIMATE_CAUSES.droughtMood, label: 'Seca prolongada', delta: mood.drought[i] },
  ]);
  const nonZero = (pieces: RegionalPiece[]) => pieces.filter((p) => p.delta !== 0);
  return { activity: activity.map(nonZero), approval: approval.map(nonZero) };
}

/**
 * Resposta federal à emergência (governabilidade, PR 13): numa UF com cheia ou seca prolongada **e** prevenção ativa,
 * a relação com o governador sobe um pouco no mês — `prevencao_relacao_max × severidade × (proteção ÷ teto)`, com
 * severidade = a maior entre as do humor de chuva e de seca (0–1). Impulso `governadores.relacao` de um mês, no escopo
 * da UF, como o da visita presidencial (`regions.ts`); a relação volta à meta sozinha, então não acumula. Sem prevenção
 * ou sem emergência, nenhum impulso. Pura e sem sorteio.
 */
export function responseImpulses(
  state: Pick<GameState, 'climate' | 'impulses' | 'monthIndex'>,
  content: Pick<GameContent, 'scenario'>,
): ScheduledImpulse[] {
  const ufs = scenarioUfs(content);
  if (ufs.length === 0) return [];
  const prevention = preventionOf(state.impulses, state.monthIndex, ufs);
  const mood = ufMoodOf(state.climate, content);
  const max = climateParam('aprovacao_clima_max');
  const ceiling = climateParam('prevencao_teto');
  return ufs.flatMap((u, i): ScheduledImpulse[] => {
    const flood = (-mood.rain[i] / max) * (prevention.flood[i] / ceiling);
    const drought = (-mood.drought[i] / max) * (prevention.drought[i] / ceiling);
    const delta = climateParam('prevencao_relacao_max') * Math.max(flood, drought);
    if (!(delta > 0)) return [];
    return [
      {
        sourceId: `${CLIMATE_CAUSES.response}:${u.id}:${state.monthIndex}`,
        label: `Resposta federal à emergência: ${u.name}`,
        target: 'governadores.relacao',
        delta,
        startMonth: state.monthIndex,
        endMonth: state.monthIndex,
        regional: { key: 'populacao', scope: [u.id] },
      },
    ];
  });
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
