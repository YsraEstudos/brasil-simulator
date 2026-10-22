import { REGION_IDS, UF_IDS, type RegionId } from '../../types/regions';
import type { Climatology } from '../../types/climate';
import { toCalendar } from '../calendar';
import { createRng } from '../rng';
import type { ClimateState, Difficulty, MonthStep, ScheduledImpulse, UfClimate } from '../types';

import { CLIMATE_INTENSITY_PARAM, climateParam } from './calibration';
import { CLIMATE_CAUSES, climateDamageOf, preventionOf, responseImpulses, scenarioUfs } from './effects';
import { ensoTeleconnection, regionOfUf, seasonOf } from './climate';

/**
 * Evolução mensal do clima (PLANO_GLOBO.md §6.2; ECONOMIC_MODEL.md §5.18). Só o PRNG do clima
 * (`GameState.climate.rng`) é consumido: o PRNG principal não é tocado, então os sorteios dos demais sistemas
 * seguem na mesma ordem.
 *
 * **Ordem fixa dos sorteios** (33 normais por mês, sempre todas, qualquer dificuldade ou cenário):
 *  1. 1 normal: choque do ENSO;
 *  2. 5 normais: choque regional compartilhado, na ordem de `REGION_IDS` (norte, nordeste, centro_oeste, sudeste, sul);
 *  3. 27 normais: ruído próprio de cada UF, na ordem de `UF_IDS`.
 * Mudar essa ordem, ou a quantidade, muda o clima de toda campanha: não mudar depois de publicada.
 *
 * Fórmulas:
 *  - ENSO: `enso' = tanh((φ · enso + I · σ · z) ÷ escala)` — AR(1) saturado, sempre em (−1, 1).
 *  - Chuva da UF: `bruta = ρ · chuva + teleconexão(região, estação) · enso + I · (σ_reg · z_região + σ_uf · z_uf)`;
 *    `chuva' = máx · tanh(bruta ÷ máx)` (saturada; a anomalia é fração da normal do mês).
 *  - Seca da UF: ver `nextDryness`.
 * `I` é o multiplicador de magnitude da dificuldade: escala os choques (e portanto a amplitude do ENSO), nunca a
 * tabela de teleconexão nem os sorteios; o lugar e o sinal dos eventos continuam vindo da mesma sequência.
 */

/** Sorteios por mês: 1 (ENSO) + regiões + UFs. Documenta a ordem acima (verificado em teste). */
export const CLIMATE_DRAWS_PER_MONTH = 1 + REGION_IDS.length + UF_IDS.length;

/** Média mensal da chuva normal de uma UF (mm), base da vulnerabilidade hídrica e da escala do déficit. */
function meanMonthlyNormal(climatology: Climatology, ufId: string): number {
  const mm = climatology.rain.ufs.find((u) => u.id === ufId)?.mm;
  if (!mm) throw new RangeError(`UF sem normais de chuva: ${ufId}`);
  return mm.reduce((s, v) => s + v, 0) / mm.length;
}

/**
 * Vulnerabilidade hídrica de uma UF: (média mensal das normais de todas as UFs ÷ média mensal da UF)^expoente.
 * Acima de 1 no semiárido (pouca chuva e pouca reserva), abaixo de 1 em regiões úmidas. Só depende da climatologia.
 */
export function waterVulnerability(climatology: Climatology, ufId: string): number {
  const all = climatology.rain.ufs.map((u) => meanMonthlyNormal(climatology, u.id));
  const national = all.reduce((s, v) => s + v, 0) / all.length;
  return (national / meanMonthlyNormal(climatology, ufId)) ** climateParam('seca_expoente_aridez');
}

/**
 * Seca do mês seguinte (0–1) com memória e recuperação, dirigida pelo déficit em mm contra a normal do mês:
 *
 *  - `déficit_mm = máx(0, limiar − chuva) × normal_mm(mês)` e `excesso_mm = máx(0, chuva) × normal_mm(mês)`;
 *  - os dois entram em relação à chuva mensal média da UF (`÷ média`): perder 30% da chuva num mês chuvoso do
 *    semiárido pesa muito (a estação chuvosa é curta), e o mesmo em mês seco, ou em região úmida e regular, pesa pouco;
 *  - `seca' = clamp(memória · seca + ganho · V · tanh(déficit ÷ ref) − recuperação ÷ V · tanh(excesso ÷ ref), 0, 1)`,
 *    com `V` = `waterVulnerability` (semiárido seca mais depressa e se recupera mais devagar).
 */
export function nextDryness(
  climatology: Climatology,
  ufId: string,
  month: number,
  rain: number,
  dryness: number,
): number {
  const normal = climatology.rain.ufs.find((u) => u.id === ufId)?.mm[month - 1];
  if (normal === undefined) throw new RangeError(`UF sem normais de chuva: ${ufId}`);
  const reference = climateParam('seca_deficit_referencia');
  const mean = meanMonthlyNormal(climatology, ufId);
  const vulnerability = waterVulnerability(climatology, ufId);
  const deficit = (Math.max(0, climateParam('seca_limiar_anomalia') - rain) * normal) / mean;
  const excess = (Math.max(0, rain) * normal) / mean;
  const gain = climateParam('seca_ganho') * vulnerability * Math.tanh(deficit / reference);
  const recovery = (climateParam('seca_recuperacao') / vulnerability) * Math.tanh(excess / reference);
  return Math.min(1, Math.max(0, climateParam('seca_memoria') * dryness + gain - recovery));
}

/**
 * Evolui o clima um mês (função pura; devolve o novo `ClimateState` com o PRNG avançado). `month` é o mês do
 * calendário (1–12), que escolhe a estação da teleconexão e a normal de cada UF.
 */
export function evolveClimate(
  climate: Readonly<ClimateState>,
  month: number,
  difficulty: Difficulty,
  climatology: Climatology,
): ClimateState {
  const rng = createRng(climate.rng);
  const intensity = climateParam(CLIMATE_INTENSITY_PARAM[difficulty]);

  // Sorteios, na ordem documentada (sempre todos).
  const ensoDraw = rng.normal();
  const regionDraws = REGION_IDS.map(() => rng.normal());
  const ufDraws = UF_IDS.map(() => rng.normal());

  const phi = climateParam('enso_persistencia');
  const enso = Math.tanh(
    (phi * climate.enso + intensity * climateParam('enso_choque') * ensoDraw) / climateParam('enso_saturacao'),
  );

  const season = seasonOf(month);
  const max = climateParam('chuva_anomalia_max');
  const persistence = climateParam('chuva_persistencia');
  const sigmaRegion = climateParam('chuva_choque_regional');
  const sigmaUf = climateParam('chuva_choque_uf');

  const ufs = climate.ufs.map((u, i): UfClimate => {
    const region = regionOfUf(climatology, u.id) as RegionId | undefined;
    if (!region) throw new RangeError(`UF sem macrorregião na climatologia: ${u.id}`);
    const raw =
      persistence * u.rain +
      ensoTeleconnection(climatology, region, season) * enso +
      intensity * (sigmaRegion * regionDraws[REGION_IDS.indexOf(region)] + sigmaUf * ufDraws[i]);
    const rain = max * Math.tanh(raw / max);
    return { id: u.id, rain, dryness: nextDryness(climatology, u.id, month, rain, u.dryness) };
  });

  return { enso, ufs, rng: rng.state() };
}

/**
 * Etapa do clima (antes de `economyStep`; PLANO_GLOBO.md §6.2): evolui ENSO, chuva e seca e calcula o dano
 * **agregado** que entra no nacional, uma única vez, pela fila de impulsos que a economia já lê. O dano tem **média
 * zero** em torno da normal climatológica (`CLIMATE_EXPECTED_DAMAGE`): clima pior que o esperado pesa a favor da
 * inflação e contra o PIB, clima melhor (boa safra, reservatórios cheios) pesa ao contrário.
 *
 *  - PIB: `choque.hiato` com o impulso `−(L − ρ_h · L_anterior)`, que mantém o hiato em `−L` (L = perda de nível do
 *    PIB do mês, com a persistência `rho_h` do hiato; negativa = ganho); quando a seca acaba o impulso devolve a
 *    perda, sem dano permanente. Passa, pelas fórmulas da economia, para o crescimento, o desemprego e a inflação,
 *    cada um com a sua causa ("Seca", "Chuvas acima do normal", ou a versão favorável);
 *  - alimentos e energia: `choque.inflacao` (nível enquanto ativo, com sinal), causas "Seca (alimentos)" / "Boa
 *    safra (alimentos)", "Seca (energia elétrica)" / "Reservatórios em bom nível (energia elétrica)" e
 *    "Chuvas acima do normal (alimentos)".
 *
 * **Prevenção (PR 13).** O clima acima (chuva, seca, ENSO) é calculado sem olhar a prevenção — a chuva não é desligada. O
 * dano é calculado duas vezes sobre o mesmo clima: sem prevenção (as causas acima, como sempre) e com a proteção por UF
 * (`preventionOf`, da fila de impulsos `clima.prevencao_*`). A diferença, sempre a favor, entra como impulsos próprios
 * ("Prevenção reduziu o dano da seca", "… das chuvas", "… a pressão da seca nos preços", "… nos alimentos"), com a mesma
 * persistência do hiato; a soma dos dois conjuntos é o dano protegido. O valor esperado do centramento não é escalado
 * (ver `climateDamageOf`). Com prevenção ativa e emergência numa UF, entra também a resposta federal
 * (`responseImpulses`: relação com o governador).
 *
 * Os impulsos valem só neste mês (`startMonth = endMonth`) e são recriados a cada mês a partir do clima, então não
 * ficam na fila (a fila é podada ao fim do mês). Sem dados regionais no cenário não há pesos para agregar: o clima
 * evolui, mas não há dano.
 */
export const climateEvolutionStep: MonthStep = (input, ctx) => {
  const { climatology } = ctx.content;
  const month = toCalendar(input.monthIndex).month;
  const previous = input.climate;
  const climate = evolveClimate(previous, month, input.difficulty, climatology);

  const before = climateDamageOf(previous, ctx.content, input.difficulty);
  const after = climateDamageOf(climate, ctx.content, input.difficulty);
  const rho = ctx.content.calibration.rho_h;
  const t = input.monthIndex;
  // Prevenção: o mesmo clima, com o dano protegido. `before` usa a proteção de hoje (a mudança de nível entra com a
  // persistência do hiato, sem salto).
  const prevention = preventionOf(input.impulses, t, scenarioUfs(ctx.content));
  const protectedBefore = climateDamageOf(previous, ctx.content, input.difficulty, prevention);
  const protectedAfter = climateDamageOf(climate, ctx.content, input.difficulty, prevention);

  const impulses: ScheduledImpulse[] = [];
  const push = (sourceId: string, label: string, target: ScheduledImpulse['target'], delta: number) => {
    if (delta !== 0) impulses.push({ sourceId, label, target, delta, startMonth: t, endMonth: t });
  };
  // O rótulo acompanha o sinal: dano positivo é o lado adverso do clima; negativo, o favorável (média zero).
  const label = (damage: number, bad: string, good: string) => (damage > 0 ? bad : good);
  push(
    CLIMATE_CAUSES.drought,
    label(after.droughtGdp, 'Seca', 'Menos seca que o normal'),
    'choque.hiato',
    -(after.droughtGdp - rho * before.droughtGdp),
  );
  push(
    CLIMATE_CAUSES.rain,
    label(after.rainGdp, 'Chuvas acima do normal', 'Chuvas dentro do normal'),
    'choque.hiato',
    -(after.rainGdp - rho * before.rainGdp),
  );
  push(
    CLIMATE_CAUSES.droughtFood,
    label(after.droughtFood, 'Seca (alimentos)', 'Boa safra (alimentos)'),
    'choque.inflacao',
    after.droughtFood,
  );
  push(
    CLIMATE_CAUSES.droughtEnergy,
    label(after.droughtEnergy, 'Seca (energia elétrica)', 'Reservatórios em bom nível (energia elétrica)'),
    'choque.inflacao',
    after.droughtEnergy,
  );
  push(
    CLIMATE_CAUSES.rainFood,
    label(after.rainFood, 'Chuvas acima do normal (alimentos)', 'Chuvas dentro do normal (alimentos)'),
    'choque.inflacao',
    after.rainFood,
  );
  // Dano evitado (≤ 0): protegido − sem prevenção, termo a termo.
  const saved = (key: keyof typeof after) => protectedAfter[key] - after[key];
  const savedBefore = (key: keyof typeof before) => protectedBefore[key] - before[key];
  push(
    CLIMATE_CAUSES.droughtPrevention,
    'Prevenção reduziu o dano da seca',
    'choque.hiato',
    -(saved('droughtGdp') - rho * savedBefore('droughtGdp')),
  );
  push(
    CLIMATE_CAUSES.rainPrevention,
    'Prevenção reduziu o dano das chuvas',
    'choque.hiato',
    -(saved('rainGdp') - rho * savedBefore('rainGdp')),
  );
  push(
    CLIMATE_CAUSES.droughtPricesPrevention,
    'Prevenção reduziu a pressão da seca nos preços',
    'choque.inflacao',
    saved('droughtFood') + saved('droughtEnergy'),
  );
  push(
    CLIMATE_CAUSES.rainFoodPrevention,
    'Prevenção reduziu a pressão das chuvas nos alimentos',
    'choque.inflacao',
    saved('rainFood'),
  );
  impulses.push(...responseImpulses({ climate, impulses: input.impulses, monthIndex: t }, ctx.content));
  return {
    state: { ...input, climate, impulses: impulses.length > 0 ? [...input.impulses, ...impulses] : input.impulses },
    contributions: [],
  };
};
