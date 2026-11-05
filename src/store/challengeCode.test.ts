import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, SCENARIOS } from '@/content';
import { migrate } from '@/database/migrate';
import { openNodeDatabase } from '@/database/nodeDatabase';
import { loadStateAt } from '@/database/campaignRepository';
import { turnIndexOf, type Difficulty } from '@/engine';

import {
  CHALLENGE_ERRORS,
  decodeChallengeCode,
  DIFFICULTY_CODES,
  encodeChallengeCode,
  formWithChallenge,
  SCENARIO_CODES,
} from './challengeCode';
import { DIFFICULTIES, SEED_MAX, type CampaignSetupForm } from './campaignSetup';
import { createGameStore } from './gameStore';

// PLANO_SAVES_HISTORICO.md, Fase H2 (D13): código de desafio com cenário, dificuldade e semente.
describe('código de desafio (D13)', () => {
  it('todo cenário embutido tem um código, e os códigos não se repetem', () => {
    expect(Object.keys(SCENARIO_CODES).sort()).toEqual(Object.keys(SCENARIOS).sort());
    const codes = Object.values(SCENARIO_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(Object.values(DIFFICULTY_CODES)).size).toBe(DIFFICULTIES.length);
  });

  it('o formato é cenário-dificuldade-semente com o dígito verificador no fim', () => {
    expect(encodeChallengeCode({ scenarioId: 'brasil_2027_01_v080', difficulty: 'estrategica', seed: 4829 })).toBe(
      'BR27-EST-48290',
    );
    expect(encodeChallengeCode({ scenarioId: 'prototipo_ficticio', difficulty: 'casual', seed: 0 })).toMatch(
      /^PROTO-CAS-0\d$/,
    );
  });

  it('decodificar devolve o que foi codificado, em todo cenário, dificuldade e nas sementes das pontas', () => {
    for (const scenarioId of Object.keys(SCENARIO_CODES)) {
      for (const difficulty of DIFFICULTIES) {
        for (const seed of [0, 7, 4829, 2 ** 31 - 1, SEED_MAX]) {
          const code = encodeChallengeCode({ scenarioId, difficulty, seed });
          expect(code).not.toBeNull();
          expect(decodeChallengeCode(code)).toEqual({ ok: true, setup: { scenarioId, difficulty, seed } });
        }
      }
    }
  });

  it('aceita minúsculas, espaços nas pontas e travessão no lugar do hífen', () => {
    const setup = { scenarioId: DEFAULT_SCENARIO_ID, difficulty: 'realismo' as Difficulty, seed: 31337 };
    const code = encodeChallengeCode(setup)!;
    expect(decodeChallengeCode(`  ${code.toLowerCase()}\n`)).toEqual({ ok: true, setup });
    expect(decodeChallengeCode(code.replace(/-/g, ' – '))).toEqual({ ok: true, setup });
  });

  it('dígito errado é recusado com a mensagem do dígito verificador', () => {
    const code = encodeChallengeCode({ scenarioId: DEFAULT_SCENARIO_ID, difficulty: 'casual', seed: 123456 })!;
    const last = Number(code.slice(-1));
    const wrongCheck = `${code.slice(0, -1)}${(last + 1) % 10}`;
    expect(decodeChallengeCode(wrongCheck)).toEqual({ ok: false, error: CHALLENGE_ERRORS.check });
    // Um algarismo da semente trocado também.
    const wrongSeed = code.replace('-1', '-9');
    expect(decodeChallengeCode(wrongSeed)).toEqual({ ok: false, error: CHALLENGE_ERRORS.check });
    // Dois algarismos vizinhos trocados de lugar.
    const swapped = code.replace('123456', '213456');
    expect(decodeChallengeCode(swapped)).toEqual({ ok: false, error: CHALLENGE_ERRORS.check });
  });

  it('recusa formato, cenário, dificuldade e semente inválidos com mensagens próprias', () => {
    expect(decodeChallengeCode('')).toEqual({ ok: false, error: CHALLENGE_ERRORS.empty });
    expect(decodeChallengeCode(42)).toEqual({ ok: false, error: CHALLENGE_ERRORS.empty });
    expect(decodeChallengeCode('olá mundo')).toEqual({ ok: false, error: CHALLENGE_ERRORS.format });
    expect(decodeChallengeCode('BR27-EST')).toEqual({ ok: false, error: CHALLENGE_ERRORS.format });
    // Códigos com dígito certo, mas cenário, dificuldade ou semente inexistentes.
    const withCheck = (prefix: string, seed: string) => {
      for (let d = 0; d < 10; d++) {
        const code = `${prefix}-${seed}${d}`;
        const r = decodeChallengeCode(code);
        if (!r.ok && r.error === CHALLENGE_ERRORS.check) continue;
        return r;
      }
      throw new Error('sem dígito válido');
    };
    expect(withCheck('XX99-EST', '10')).toEqual({ ok: false, error: CHALLENGE_ERRORS.scenario });
    expect(withCheck('BR27-ABC', '10')).toEqual({ ok: false, error: CHALLENGE_ERRORS.difficulty });
    expect(withCheck('BR27-EST', String(SEED_MAX + 1))).toEqual({ ok: false, error: CHALLENGE_ERRORS.seed });
  });

  it('não codifica cenário sem código nem semente inválida', () => {
    expect(encodeChallengeCode({ scenarioId: 'constructor', difficulty: 'casual', seed: 1 })).toBeNull();
    expect(encodeChallengeCode({ scenarioId: DEFAULT_SCENARIO_ID, difficulty: 'casual', seed: -1 })).toBeNull();
    expect(encodeChallengeCode({ scenarioId: DEFAULT_SCENARIO_ID, difficulty: 'casual', seed: 1.5 })).toBeNull();
  });

  it('aplicar no formulário troca cenário, dificuldade e semente; nome e perfil ficam', () => {
    const form: CampaignSetupForm = {
      name: 'Minha',
      difficulty: 'casual',
      scenarioId: DEFAULT_SCENARIO_ID,
      profileId: 'centro_esquerda',
      startPoint: 'posse',
      seedText: '',
    };
    expect(formWithChallenge(form, { scenarioId: 'prototipo_ficticio', difficulty: 'realismo', seed: 99 })).toEqual({
      ...form,
      scenarioId: 'prototipo_ficticio',
      difficulty: 'realismo',
      seedText: '99',
      startPoint: 'posse',
    });
  });

  it('um código decodificado gera a mesma partida que a original (mesmo estado no mês 0)', async () => {
    const db = openNodeDatabase();
    await migrate(db);
    let i = 0;
    const app = createGameStore({ openDb: async () => db, random: () => ((i++ * 0.37) % 1) + 0.01 });
    await app.getState().init();
    const original = await app.getState().newCampaign({ name: 'Original', difficulty: 'realismo', seed: 271828 });
    if (!original.ok) throw new Error(original.error);
    const source = app.getState().campaigns.find((c) => c.id === original.campaignId)!;
    const state0 = app.getState().active!.state;

    const code = encodeChallengeCode(source)!;
    const decoded = decodeChallengeCode(code);
    if (!decoded.ok) throw new Error(decoded.error);
    const copy = await app.getState().newCampaign({ name: 'Desafio', ...decoded.setup });
    if (!copy.ok) throw new Error(copy.error);

    expect(app.getState().active!.state).toEqual(state0);
    const turn = turnIndexOf(state0);
    expect(await loadStateAt(db, copy.campaignId, turn)).toEqual(await loadStateAt(db, original.campaignId, turn));
  });
});
