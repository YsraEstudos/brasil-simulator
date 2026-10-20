import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { SANCTION_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { resolveEventsStep } from '@/engine/events/events';
import { checkInvariants } from '@/engine/invariants';
import { proposalsStep } from '@/engine/proposals/proposals';
import { populationShares, regionsOf, regionsStep } from '@/engine/regions/regions';
import { buildRegionalDecisionPreview } from '@/engine/regions/preview';
import { createRng } from '@/engine/rng';
import { createInitialState } from '@/engine/state';
import {
  STATE_SCHEMA_VERSION,
  type Decision,
  type GameContent,
  type GameState,
  type IdeologyPoint,
  type MonthInput,
  type MonthStep,
} from '@/engine/types';
import { upgradeGameState } from '@/engine/upgrade';
import { TEST_BILL, TEST_DECREE, TEST_EVENT, TEST_MP, TEST_PEC, testContent, testState } from '@/tests/fixtures';
import v2Save from '@/tests/saves/state_v2_fase02.json';
import v5Save from '@/tests/saves/state_v5_fase05.json';
import v7Save from '@/tests/saves/state_v7_fase07.json';

import { centerByPopulation, describeProfile, hasLean, medianVoterOf, nationalTermOf } from './alignment';
import { DEFAULT_PROFILE_PRESET, PROFILE_PARAMS, PROFILE_PRESETS, presetProfile, profileParam } from './calibration';
import { alignmentView, governmentProfileStep, movedProfile, previewProfilePush } from './profile';

// PLANO_GLOBO.md §5.1 e §8 (testes 1, 2, 5 e 7): perfil ideológico do governo e alinhamento por UF.
// POLITICAL_RULES.md §11.2: o perfil é média móvel das posições das decisões; o efeito regional só redistribui
// (D7, ECONOMIC_MODEL.md §5.15) e o nacional é pequeno e saturado.

const content: GameContent = loadContent(DEFAULT_SCENARIO_ID);
const contentV070: GameContent = loadContent('brasil_2027_01_v070');
const ufs = regionsOf(content);
const pop = populationShares(ufs);
const EMPTY: MonthInput = { decisions: [] };

const withProfile = (state: GameState, profile: IdeologyPoint): GameState => ({ ...state, government: { profile } });
const start = (profile?: (typeof PROFILE_PRESETS)[number]['id'], c: GameContent = content, seed = 3): GameState =>
  createInitialState({ content: c, difficulty: 'estrategica', seed, profile });
const decide = (policyId: string, agendaCost = 1): Decision => ({ policyId, agendaCost });
const dist = (a: IdeologyPoint, b: IdeologyPoint) => Math.hypot(a.economic - b.economic, a.social - b.social);

/** Congela o objeto inteiro: qualquer escrita lança erro em modo estrito (módulos ES). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe('perfil inicial do NOVO JOGO (PLANO_GLOBO.md §5.1, D-G9)', () => {
  it('o padrão é Centro (0/0) e cada preset começa na sua posição, dentro dos eixos', () => {
    expect(DEFAULT_PROFILE_PRESET).toBe('centro');
    expect(start().government.profile).toEqual({ economic: 0, social: 0 });
    expect(PROFILE_PRESETS.map((p) => p.id)).toEqual([
      'centro',
      'centro_esquerda',
      'esquerda',
      'centro_direita',
      'liberal',
      'conservador',
    ]);
    for (const preset of PROFILE_PRESETS) {
      expect(start(preset.id).government.profile, preset.id).toEqual({
        economic: preset.economic,
        social: preset.social,
      });
      expect(Math.abs(preset.economic)).toBeLessThanOrEqual(1);
      expect(Math.abs(preset.social)).toBeLessThanOrEqual(1);
      expect(preset.name.length).toBeGreaterThan(0);
    }
    expect(presetProfile(undefined)).toEqual({ economic: 0, social: 0 });
  });

  it('Liberal é mercado e Esquerda é Estado, em palavras', () => {
    expect(describeProfile(presetProfile('liberal')).economic).toBe('mercado');
    expect(describeProfile(presetProfile('esquerda')).economic).toBe('estado');
    expect(describeProfile(presetProfile('conservador')).social).toBe('conservador');
    expect(describeProfile({ economic: 0, social: 0 }).label).toBe('Centro');
  });
});

describe('determinismo e independência da semente (PLANO_GLOBO.md §8, testes 1 e 2)', () => {
  const script: MonthInput[] = [
    { decisions: [decide('contingenciamento'), decide('reforma_previdencia', 2)] },
    { decisions: [decide('transferencia_renda_ampliacao')] },
    EMPTY,
    EMPTY,
    { decisions: [decide('salario_minimo_valorizacao')] },
  ];

  function play(c: GameContent, profile: (typeof PROFILE_PRESETS)[number]['id'] | undefined, months: number) {
    let state = start(profile, c, 11);
    const reports = [];
    for (let m = 0; m < months; m++) {
      const out = advanceMonth(state, script[m] ?? EMPTY, c);
      reports.push(out.report);
      state = out.state;
    }
    return { state, reports };
  }

  it('mesma semente, perfil e decisões → mesmo estado e mesmos relatórios', () => {
    const a = play(content, 'liberal', 12);
    const b = play(content, 'liberal', 12);
    expect(b.state).toEqual(a.state);
    expect(b.reports).toEqual(a.reports);
  });

  it('em cenário sem inclinação (v0.7.0) o perfil escolhido não muda nenhum outro resultado nem sorteio', () => {
    const base = play(contentV070, undefined, 18);
    for (const preset of ['esquerda', 'liberal', 'conservador'] as const) {
      const other = play(contentV070, preset, 18);
      expect(other.state.rng, preset).toEqual(base.state.rng);
      const { government: _a, ...restA } = base.state;
      const { government: _b, ...restB } = other.state;
      expect(restB, preset).toEqual(restA);
    }
  });

  it('com inclinação (v0.8.0) o perfil muda a aprovação mas não a ordem dos sorteios nos primeiros meses', () => {
    const centro = play(content, 'centro', 3);
    const esquerda = play(content, 'esquerda', 3);
    expect(esquerda.state.rng).toEqual(centro.state.rng);
    expect(esquerda.state.indicators.approval).not.toBe(centro.state.indicators.approval);
  });

  it('a etapa do perfil não consome a semente e não altera o estado recebido', () => {
    const state = deepFreeze(start('liberal'));
    const rng = createRng(state.rng);
    const draft = { proposalChanges: [], eventsResolved: [], eventsFired: [], notes: [], copom: null, regional: null };
    const out = governmentProfileStep(state, { rng, content, decisions: [], eventChoices: [], draft });
    expect(rng.state()).toEqual(state.rng);
    expect(out.state).toBe(state);
  });
});

describe('migração do estado: perfil neutro (PLANO_GLOBO.md §8, teste 2)', () => {
  it('save da v9 (sem government) vira v10 com perfil 0/0, sem mexer nos demais campos nem no original', () => {
    let state = start('liberal', contentV070, 5);
    for (let m = 0; m < 4; m++) state = advanceMonth(state, EMPTY, contentV070).state;
    const { government: _government, ...rest } = state;
    const raw: Record<string, unknown> = { ...rest, schemaVersion: 9, engineVersion: '0.8.1' };
    const original = structuredClone(raw);
    const migrated = upgradeGameState(9, raw);
    expect(STATE_SCHEMA_VERSION).toBe(10);
    expect(migrated.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(migrated.government).toEqual({ profile: { economic: 0, social: 0 } });
    for (const key of Object.keys(raw).filter((k) => k !== 'schemaVersion' && k !== 'engineVersion')) {
      expect((migrated as unknown as Record<string, unknown>)[key]).toEqual(raw[key]);
    }
    expect(raw).toEqual(original);
  });

  it('o save v9 migrado continua jogável sem violar invariantes e igual ao jogo sem perfil no cenário v0.7.0', () => {
    let state = start(undefined, contentV070, 5);
    for (let m = 0; m < 4; m++) state = advanceMonth(state, EMPTY, contentV070).state;
    const { government: _government, ...rest } = state;
    let migrated = upgradeGameState(9, { ...rest, schemaVersion: 9, engineVersion: '0.8.1' });
    let reference = state;
    const errors: string[] = [];
    for (let m = 0; m < 12; m++) {
      const a = advanceMonth(migrated, EMPTY, contentV070);
      const b = advanceMonth(reference, EMPTY, contentV070);
      errors.push(...checkInvariants(migrated, a.state, a.report, contentV070));
      expect(a.state.indicators).toEqual(b.state.indicators);
      migrated = a.state;
      reference = b.state;
    }
    expect(errors).toEqual([]);
  });

  it('saves reais mais antigos (v2, v5, v7) também ganham o perfil neutro', () => {
    for (const [version, save] of [
      [2, v2Save],
      [5, v5Save],
      [7, v7Save],
    ] as const) {
      const state = upgradeGameState(version, structuredClone(save) as unknown);
      expect(state.government, `v${version}`).toEqual({ profile: { economic: 0, social: 0 } });
    }
  });
});

describe('movimento do perfil: média móvel com memória (POLITICAL_RULES.md §11.2)', () => {
  const lambda = profileParam('memoria_decisao');
  /** Mês com as etapas de propostas e de perfil apenas. */
  const steps: readonly MonthStep[] = [proposalsStep, governmentProfileStep];
  const mes = (state: GameState, c: GameContent, decisions: Decision[] = []) =>
    advanceMonth(state, { decisions }, c, steps);
  const fixture = testContent();

  it('ato executado pesa cheio: perfil' + "' = (1 − λ)·perfil + λ·posição", () => {
    const out = mes(testState(), fixture, [decide(TEST_DECREE.id)]);
    expect(out.state.government.profile.economic).toBeCloseTo(lambda * TEST_DECREE.position.economic, 12);
    expect(out.state.government.profile.social).toBeCloseTo(0, 12);
    expect(out.report.profileMoves?.[0]).toMatchObject({ sourceId: TEST_DECREE.id, kind: 'sancao' });
    // A memória: partindo de um perfil já deslocado, o passo é (1 − λ)·perfil + λ·posição.
    const from = withProfile(testState(), { economic: -0.5, social: 0.4 });
    const next = mes(from, fixture, [decide(TEST_DECREE.id)]).state.government.profile;
    expect(next.economic).toBeCloseTo((1 - lambda) * -0.5 + lambda * TEST_DECREE.position.economic, 12);
    expect(next.social).toBeCloseTo((1 - lambda) * 0.4, 12);
  });

  it('política de mercado sancionada move o perfil para o mercado (PLANO_GLOBO.md §8, teste 7)', () => {
    const state = start('centro');
    const out = advanceMonth(state, { decisions: [decide('contingenciamento')] }, content);
    expect(out.state.government.profile.economic).toBeGreaterThan(0);
    expect(describeProfile(presetProfile('centro')).economic).toBe('centro');
    // A seis decisões de mercado o perfil já é descrito como mercado.
    let profile = state.government.profile;
    for (let i = 0; i < 6; i++) profile = movedProfile(profile, { economic: 0.6, social: 0.3 });
    expect(describeProfile(profile).economic).toBe('mercado');
  });

  it('proposta enviada pesa pouco; sancionada, cheio; veto anda ao contrário', () => {
    const sent = mes(testState(), fixture, [decide(TEST_PEC.id, 2)]);
    const sentMove = sent.report.profileMoves?.find((m) => m.sourceId === TEST_PEC.id);
    expect(sentMove?.kind).toBe('proposta');
    expect(sent.state.government.profile.economic).toBeCloseTo(
      lambda * profileParam('peso_proposta') * TEST_PEC.position.economic,
      12,
    );
    expect(profileParam('peso_proposta')).toBeLessThan(1);

    // PL aprovado com base fiel: chega à sanção no mês 3 (mesmo roteiro de proposals.test.ts).
    const base = testState(42);
    const favoravel: GameState = {
      ...base,
      congress: { blocs: fixture.scenario.blocs.map((b) => ({ id: b.id, governmentRelation: 100 })), cabinet: [] },
      indicators: { ...base.indicators, approval: 0.9 },
    };
    let state = mes(favoravel, fixture, [decide(TEST_BILL.id)]).state;
    state = mes(state, fixture).state;
    state = mes(state, fixture).state;
    const proposal = state.proposals.find((p) => p.policyId === TEST_BILL.id);
    expect(proposal?.status).toBe('aguardando_sancao');
    const sanction = (choice: string): Decision => ({
      policyId: SANCTION_ACTION_ID,
      agendaCost: 0,
      params: { proposalId: proposal?.id ?? '', choice },
    });

    const sanctioned = mes(state, fixture, [sanction('sancionar')]);
    expect(sanctioned.report.profileMoves?.[0]).toMatchObject({ sourceId: TEST_BILL.id, kind: 'sancao' });
    expect(sanctioned.state.government.profile.economic).toBeLessThan(state.government.profile.economic);

    const vetoed = mes(state, fixture, [sanction('vetar_total')]);
    const veto = vetoed.report.profileMoves?.[0];
    expect(veto).toMatchObject({ sourceId: TEST_BILL.id, kind: 'veto' });
    // A política é estatista (−0,5): vetá-la empurra o perfil para o mercado, com o peso menor do veto.
    const before = state.government.profile.economic;
    expect(veto?.delta.economic).toBeCloseTo(lambda * profileParam('peso_veto') * (0.5 - before), 12);
    expect(vetoed.state.government.profile.economic).toBeGreaterThan(state.government.profile.economic);
  });

  it('a relevância (salience) da política multiplica o passo; padrão 1; 0 não move', () => {
    const doubled = testContent({
      policies: { ...fixture.policies, [TEST_DECREE.id]: { ...TEST_DECREE, salience: 2 } },
    });
    const normal = mes(testState(), fixture, [decide(TEST_DECREE.id)]).state.government.profile.economic;
    const twice = mes(testState(), doubled, [decide(TEST_DECREE.id)]).state.government.profile.economic;
    expect(twice).toBeCloseTo(2 * normal, 12);
    const zero = testContent({
      policies: { ...fixture.policies, [TEST_DECREE.id]: { ...TEST_DECREE, salience: 0 } },
    });
    const out = mes(testState(), zero, [decide(TEST_DECREE.id)]);
    expect(out.state.government.profile).toEqual({ economic: 0, social: 0 });
    expect(out.report.profileMoves).toEqual([]);
  });

  it('o λ efetivo é limitado e o perfil nunca sai dos eixos', () => {
    let profile: IdeologyPoint = { economic: 0, social: 0 };
    const huge = movedProfile(profile, { economic: 1, social: 1 }, 100, 3);
    expect(huge.economic).toBeCloseTo(profileParam('memoria_maxima'), 12);
    for (let i = 0; i < 200; i++) profile = movedProfile(profile, { economic: 1, social: -1 }, 1, 3);
    expect(profile.economic).toBeLessThanOrEqual(1);
    expect(profile.social).toBeGreaterThanOrEqual(-1);
    expect(profile.economic).toBeGreaterThan(0.99);
  });

  it('escolha de evento com posição move o perfil; a escolha padrão (sem resposta) e a sem posição não', () => {
    const event = {
      ...TEST_EVENT,
      choices: TEST_EVENT.choices.map((c) =>
        c.id === 'subsidiar' ? { ...c, position: { economic: -0.6, social: 0 } } : c,
      ),
    };
    const c = testContent({ events: [event] });
    const pending: GameState = {
      ...testState(),
      events: { ...testState().events, pending: [{ eventId: event.id, monthIndex: 0 }] },
    };
    const eventSteps: readonly MonthStep[] = [resolveEventsStep, governmentProfileStep];
    const chosen = advanceMonth(
      pending,
      { decisions: [], eventChoices: [{ eventId: event.id, choiceId: 'subsidiar' }] },
      c,
      eventSteps,
    );
    expect(chosen.state.government.profile.economic).toBeCloseTo(-lambda * profileParam('peso_evento') * 0.6, 12);
    expect(chosen.report.profileMoves?.[0]).toMatchObject({ sourceId: event.id, kind: 'evento' });
    const automatic = advanceMonth(pending, EMPTY, c, eventSteps);
    expect(automatic.state.government.profile).toEqual({ economic: 0, social: 0 });
    const noPosition = advanceMonth(
      pending,
      { decisions: [], eventChoices: [{ eventId: event.id, choiceId: 'absorver' }] },
      c,
      eventSteps,
    );
    expect(noPosition.state.government.profile).toEqual({ economic: 0, social: 0 });
  });

  it('o relatório guarda só as decisões que mais moveram o perfil, da maior para a menor', () => {
    const base = testState();
    const state = { ...base, resources: { ...base.resources, agendaActionsPerMonth: 10 } };
    const out = mes(state, fixture, [
      decide(TEST_MP.id),
      decide(TEST_BILL.id),
      decide(TEST_PEC.id, 2),
      decide(TEST_DECREE.id),
    ]);
    const moves = out.report.profileMoves ?? [];
    const size = (m: { delta: IdeologyPoint }) => Math.hypot(m.delta.economic, m.delta.social);
    expect(moves).toHaveLength(profileParam('movimentos_por_mes'));
    expect(moves[0].sourceId).toBe(TEST_DECREE.id);
    for (let i = 1; i < moves.length; i++) expect(size(moves[i - 1])).toBeGreaterThanOrEqual(size(moves[i]));
  });
});

describe('alinhamento regional (PLANO_GLOBO.md §5.1; ECONOMIC_MODEL.md §5.15, D7)', () => {
  const regionsOnly: readonly MonthStep[] = [regionsStep];
  const market: IdeologyPoint = { economic: 0.6, social: 0.4 };
  const statist: IdeologyPoint = { economic: -0.6, social: -0.2 };
  const base = start();
  const gap = (state: GameState, id: string) =>
    (state.regions.ufs.find((u) => u.id === id)?.approval ?? 0) - state.indicators.approval;

  it('o cenário v0.8.0 tem inclinação nas 27 UFs; o v0.7.0 não (e nada age nele)', () => {
    expect(hasLean(ufs)).toBe(true);
    expect(hasLean(regionsOf(contentV070))).toBe(false);
    expect(alignmentView(base, contentV070)).toBeNull();
    expect(previewProfilePush(base, contentV070, 'contingenciamento')?.ufs).toEqual([]);
  });

  it('perfil de mercado: UF de inclinação próxima ganha aprovação relativa, a distante perde (teste 7)', () => {
    const a = advanceMonth(withProfile(base, market), EMPTY, content, regionsOnly).state;
    const b = advanceMonth(withProfile(base, statist), EMPTY, content, regionsOnly).state;
    // SC (mercado e conservador) vai melhor com o perfil de mercado; BA (estatista) pior.
    expect(gap(a, 'SC')).toBeGreaterThan(gap(b, 'SC'));
    expect(gap(a, 'BA')).toBeLessThan(gap(b, 'BA'));
    expect(gap(a, 'SC')).toBeGreaterThan(gap(a, 'BA'));
    expect(gap(b, 'BA')).toBeGreaterThan(gap(b, 'SC'));
  });

  it('o termo regional só redistribui: a média nacional não muda e a ponderada das UFs fecha com ela', () => {
    const a = advanceMonth(withProfile(base, market), EMPTY, content, regionsOnly);
    const b = advanceMonth(withProfile(base, statist), EMPTY, content, regionsOnly);
    expect(a.state.indicators.approval).toBe(b.state.indicators.approval);
    for (const out of [a, b]) {
      const weighted = out.state.regions.ufs.reduce((s, u, i) => s + pop[i] * u.approval, 0);
      expect(weighted).toBeCloseTo(out.state.indicators.approval, 12);
      expect(checkInvariants(withProfile(base, market), out.state, out.report, content)).toEqual([]);
    }
  });

  it('a causa "Alinhamento com o perfil do governo" entra na explicação da UF e a soma continua exata', () => {
    const out = advanceMonth(withProfile(base, market), EMPTY, content, regionsOnly);
    const sc = out.report.regional?.find((x) => x.id === 'SC');
    const piece = sc?.approval.find((p) => p.cause === 'alinhamento_perfil');
    expect(piece?.label).toBe('Alinhamento com o perfil do governo');
    expect(piece?.delta).toBeGreaterThan(0);
    const ba = out.report.regional?.find((x) => x.id === 'BA');
    expect(ba?.approval.find((p) => p.cause === 'alinhamento_perfil')?.delta).toBeLessThan(0);
    for (const x of out.report.regional ?? []) {
      const u = out.state.regions.ufs.find((v) => v.id === x.id);
      const total = x.approval.reduce((s, p) => s + p.delta, 0);
      expect(total).toBeCloseTo((u?.approval ?? 0) - out.state.indicators.approval, 12);
    }
  });

  it('o desvio por alinhamento é saturado (k·tanh) e simétrico em torno da média', () => {
    const k = profileParam('alinhamento_regional_max');
    const view = alignmentView(withProfile(base, market), content);
    if (!view) throw new Error('sem inclinação');
    for (const u of view.ufs) expect(Math.abs(u.approvalDeviation)).toBeLessThanOrEqual(2 * k);
    // Média ponderada zero (leitura centrada).
    expect(view.ufs.reduce((s, u, i) => s + pop[i] * u.approvalDeviation, 0)).toBeCloseTo(0, 12);
    // Alinhamento 0–1, na ordem do cenário.
    expect(view.ufs.map((u) => u.id)).toEqual(ufs.map((u) => u.id));
    for (const u of view.ufs) {
      expect(u.alignment).toBeGreaterThanOrEqual(0);
      expect(u.alignment).toBeLessThanOrEqual(1);
    }
  });

  it('D7 e demais invariantes valem por 36 meses com perfis opostos e decisões que movem o perfil', () => {
    for (const preset of ['liberal', 'esquerda', 'conservador'] as const) {
      let state = start(preset, content, 21);
      const errors: string[] = [];
      for (let m = 0; m < 36; m++) {
        const decisions =
          m % 6 === 0
            ? [decide('contingenciamento'), decide('transferencia_renda_ampliacao')]
            : m % 6 === 3
              ? [decide('salario_minimo_valorizacao')]
              : [];
        const out = advanceMonth(state, { decisions }, content);
        errors.push(...checkInvariants(state, out.state, out.report, content));
        state = out.state;
      }
      expect(errors, preset).toEqual([]);
      expect(Math.abs(state.government.profile.economic)).toBeLessThanOrEqual(1);
    }
  });
});

describe('termo nacional: distância do eleitor médio (D-G10)', () => {
  const median = medianVoterOf(ufs, pop) as IdeologyPoint;
  const teto = profileParam('eleitor_mediano_teto');
  const neutral = profileParam('eleitor_mediano_distancia_neutra');
  const unit = (d: number) => d * (2 * Math.SQRT2);

  it('o eleitor mediano é a média das inclinações ponderada pela população', () => {
    const manual = ufs.reduce(
      (m, u, i) => ({
        economic: m.economic + pop[i] * (u.lean?.economic ?? 0),
        social: m.social + pop[i] * (u.lean?.social ?? 0),
      }),
      { economic: 0, social: 0 },
    );
    expect(median.economic).toBeCloseTo(manual.economic, 12);
    expect(median.social).toBeCloseTo(manual.social, 12);
    expect(nationalTermOf({ economic: 0, social: 0 }, null)).toBe(0);
  });

  it('é saturado: nunca passa do teto, em nenhum ponto dos eixos', () => {
    let max = 0;
    for (let e = -1; e <= 1; e += 0.1) {
      for (let s = -1; s <= 1; s += 0.1)
        max = Math.max(max, Math.abs(nationalTermOf({ economic: e, social: s }, median)));
    }
    expect(max).toBeLessThanOrEqual(teto);
    expect(max).toBeGreaterThan(0.5 * teto);
  });

  it('é simétrico em torno da distância neutra: a mesma distância a mais vale o oposto da mesma a menos', () => {
    const x = 0.1;
    const farther = nationalTermOf({ economic: median.economic + unit(neutral + x), social: median.social }, median);
    const closer = nationalTermOf({ economic: median.economic + unit(neutral - x), social: median.social }, median);
    expect(farther + closer).toBeCloseTo(0, 12);
    expect(farther).toBeLessThan(0);
    expect(closer).toBeGreaterThan(0);
    expect(nationalTermOf({ economic: median.economic + unit(neutral), social: median.social }, median)).toBeCloseTo(
      0,
      12,
    );
  });

  it('nenhum lado dos eixos é premiado em si: mesma distância do mediano, mesmo efeito (espelho)', () => {
    const d = 0.4;
    const east = nationalTermOf({ economic: median.economic + d, social: median.social }, median);
    const west = nationalTermOf({ economic: median.economic - d, social: median.social }, median);
    const north = nationalTermOf({ economic: median.economic, social: median.social + d }, median);
    const south = nationalTermOf({ economic: median.economic, social: median.social - d }, median);
    expect(west).toBeCloseTo(east, 12);
    expect(north).toBeCloseTo(east, 12);
    expect(south).toBeCloseTo(east, 12);
  });

  it('entra na aprovação com a causa "Distância do eleitor médio" e respeita o teto mensal', () => {
    const adj = content.calibration.ajuste_aprovacao;
    for (const profile of [presetProfile('centro'), presetProfile('esquerda'), presetProfile('liberal')]) {
      const out = advanceMonth(withProfile(start(), profile), EMPTY, content);
      const term = out.report.contributions.find((c) => c.cause === 'eleitor_mediano');
      expect(term?.indicator).toBe('approval');
      expect(term?.label).toBe('Distância do eleitor médio');
      expect(Math.abs(term?.delta ?? 0)).toBeLessThanOrEqual(adj * teto);
    }
    const near = advanceMonth(withProfile(start(), median), EMPTY, content);
    const far = advanceMonth(withProfile(start(), { economic: -0.9, social: -0.9 }), EMPTY, content);
    const delta = (r: typeof near) => r.report.contributions.find((c) => c.cause === 'eleitor_mediano')?.delta ?? 0;
    expect(delta(near)).toBeGreaterThan(0);
    expect(delta(far)).toBeLessThan(0);
  });

  it('não age em cenário sem inclinação (v0.7.0): nenhuma contribuição e nenhum desvio regional', () => {
    const out = advanceMonth(start('esquerda', contentV070), EMPTY, contentV070);
    expect(out.report.contributions.some((c) => c.cause === 'eleitor_mediano')).toBe(false);
    for (const x of out.report.regional ?? []) {
      expect(x.approval.some((p) => p.cause === 'alinhamento_perfil')).toBe(false);
    }
  });
});

describe('prévia: para onde a política empurra o perfil (PLANO_GLOBO.md §5.2)', () => {
  const state = start('centro');

  it('mostra o perfil depois da sanção, em palavras, e as UFs que tendem a ganhar e a perder', () => {
    const p = previewProfilePush(state, content, 'reforma_previdencia');
    if (!p) throw new Error('prévia ausente');
    expect(p.estimate).toBe(true);
    expect(p.shift.economic).toBeGreaterThan(0);
    expect(p.after.economic).toBeCloseTo(profileParam('memoria_decisao') * p.position.economic, 12);
    expect(p.ufs).toHaveLength(27);
    // Política de mercado: o Sul tende a ganhar relativamente, o Nordeste a perder.
    expect(p.gainers.length).toBeGreaterThan(0);
    expect(p.losers.length).toBeGreaterThan(0);
    expect(p.gainers).toEqual(expect.arrayContaining(['RS']));
    expect(p.losers).toEqual(expect.arrayContaining(['BA']));
    const near = p.ufs.find((u) => u.id === 'SC');
    const far = p.ufs.find((u) => u.id === 'PI');
    expect(near?.deviationDelta).toBeGreaterThan(0);
    expect(far?.deviationDelta).toBeLessThan(0);
    // Só redistribui: a soma ponderada das mudanças é zero.
    expect(p.ufs.reduce((s, u, i) => s + pop[i] * u.deviationDelta, 0)).toBeCloseTo(0, 12);
    expect(p.nationalTerm).not.toBeNull();
  });

  it('é pura: não altera o estado congelado nem a semente, e repete o mesmo resultado', () => {
    const frozen = deepFreeze(start('liberal'));
    const first = previewProfilePush(frozen, content, 'transferencia_renda_ampliacao');
    expect(previewProfilePush(frozen, content, 'transferencia_renda_ampliacao')).toEqual(first);
    expect(frozen.rng).toEqual(start('liberal').rng);
    expect(previewProfilePush(frozen, content, 'nao_existe')).toBeNull();
  });

  it('política de Estado empurra o perfil no sentido oposto e inverte quem ganha', () => {
    const p = previewProfilePush(state, content, 'transferencia_renda_ampliacao');
    expect(p?.shift.economic).toBeLessThan(0);
    expect(p?.gainers).toEqual(expect.arrayContaining(['BA']));
    expect(p?.losers).toEqual(expect.arrayContaining(['RS']));
    expect(p?.ufs.find((u) => u.id === 'PI')?.deviationDelta).toBeGreaterThan(0);
    expect(p?.ufs.find((u) => u.id === 'SC')?.deviationDelta).toBeLessThan(0);
  });

  it('entra no resultado de buildRegionalDecisionPreview', () => {
    const p = buildRegionalDecisionPreview(state, content, 'reforma_previdencia');
    expect(p?.profilePush?.policyId).toBe('reforma_previdencia');
    expect(p?.profilePush?.after).toEqual(previewProfilePush(state, content, 'reforma_previdencia')?.after);
  });

  it('a prévia concorda com o motor: sancionar de fato aproxima o perfil do que foi previsto', () => {
    const out = advanceMonth(state, { decisions: [decide('contingenciamento')] }, content);
    const p = previewProfilePush(state, content, 'contingenciamento');
    expect(out.state.government.profile.economic).toBeCloseTo(p?.after.economic ?? 0, 12);
    expect(out.state.government.profile.social).toBeCloseTo(p?.after.social ?? 0, 12);
  });
});

describe('geometria do alinhamento', () => {
  it('centerByPopulation zera a média ponderada', () => {
    const centered = centerByPopulation(
      ufs.map((_, i) => i),
      pop,
    );
    expect(centered.reduce((s, v, i) => s + pop[i] * v, 0)).toBeCloseTo(0, 12);
  });

  it('o perfil mais perto de uma UF a alinha melhor do que um mais longe', () => {
    const sc = ufs.find((u) => u.id === 'SC')?.lean as IdeologyPoint;
    const near = dist(presetProfile('centro_direita'), sc);
    const far = dist(presetProfile('esquerda'), sc);
    expect(near).toBeLessThan(far);
    const viewNear = alignmentView(withProfile(start(), presetProfile('centro_direita')), content);
    const viewFar = alignmentView(withProfile(start(), presetProfile('esquerda')), content);
    const alignment = (v: typeof viewNear) => v?.ufs.find((u) => u.id === 'SC')?.alignment ?? 0;
    expect(alignment(viewNear)).toBeGreaterThan(alignment(viewFar));
  });

  it('a calibração tem faixa e justificativa para cada parâmetro', () => {
    for (const [name, spec] of Object.entries(PROFILE_PARAMS)) {
      expect(spec.value, name).toBeGreaterThanOrEqual(spec.min);
      expect(spec.value, name).toBeLessThanOrEqual(spec.max);
      expect(spec.note.length, name).toBeGreaterThan(0);
      expect(spec.basis.length, name).toBeGreaterThan(0);
    }
  });
});
