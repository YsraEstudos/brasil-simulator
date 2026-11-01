import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, SCENARIOS } from '@/content/scenarios';
import type { Scenario } from '@/types/scenario';

import {
  CAMPAIGN_NAME_MAX,
  checkNewCampaignInput,
  checkSetupForm,
  DEFAULT_SETUP_PREFS,
  DIFFICULTIES,
  isDifficulty,
  isKnownScenario,
  isValidSeed,
  normalizeCampaignName,
  NAME_ERRORS,
  parseSeedInput,
  resolveSetupPrefs,
  scenarioOptions,
  SEED_ERRORS,
  SEED_MAX,
  validateCampaignName,
} from './campaignSetup';

describe('nome da campanha', () => {
  it('vazio, só espaços ou valor que não é texto é erro de obrigatório', () => {
    for (const raw of ['', '   ', undefined, null, 42, {}, []]) {
      expect(validateCampaignName(raw)).toEqual({ ok: false, error: NAME_ERRORS.empty });
    }
  });

  it('aceita um caractere e exatamente o limite de 60 unidades', () => {
    expect(validateCampaignName('A')).toEqual({ ok: true, value: 'A' });
    expect(validateCampaignName('a'.repeat(60))).toEqual({ ok: true, value: 'a'.repeat(60) });
  });

  it('61 unidades é erro de tamanho e o nome não é truncado', () => {
    const result = validateCampaignName('a'.repeat(61));
    expect(result).toEqual({ ok: false, error: NAME_ERRORS.tooLong });
    expect(result.ok).toBe(false);
    expect(CAMPAIGN_NAME_MAX).toBe(60);
  });

  it('preserva acentos e emojis simples e compostos', () => {
    expect(normalizeCampaignName('Ação São João')).toBe('Ação São João');
    expect(normalizeCampaignName('🇧🇷 Brasil')).toBe('🇧🇷 Brasil');
    expect(normalizeCampaignName('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    expect(validateCampaignName('👨‍👩‍👧')).toEqual({ ok: true, value: '👨‍👩‍👧' });
  });

  it('conta emojis em unidades UTF-16: 30 emojis cabem, 31 não', () => {
    expect(validateCampaignName('😀'.repeat(30))).toEqual({ ok: true, value: '😀'.repeat(30) });
    expect(validateCampaignName('😀'.repeat(31))).toEqual({ ok: false, error: NAME_ERRORS.tooLong });
  });

  it('descarta metades soltas de pares substitutos', () => {
    expect(normalizeCampaignName('abc\uD83D')).toBe('abc');
    expect(normalizeCampaignName('\uDE00x')).toBe('x');
  });

  it('quebras de linha e tabulações viram um espaço', () => {
    expect(normalizeCampaignName('Governo\r\nde\nunião')).toBe('Governo de união');
    expect(normalizeCampaignName('\tNome\t')).toBe('Nome');
  });

  it('espaços em volta de quebras coladas não se repetem', () => {
    expect(normalizeCampaignName('Governo \n de \r\n união')).toBe('Governo de união');
    expect(normalizeCampaignName('A  \t  B')).toBe('A B');
    expect(normalizeCampaignName('A  B')).toBe('A  B');
  });

  it('texto enorme sem quebra é tratado em tempo linear', () => {
    const raw = `A${' '.repeat(50_000)}B`;
    const start = performance.now();
    expect(normalizeCampaignName(raw)).toBe(raw);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('remove caracteres de controle (nulo, C1) do nome gravado', () => {
    const c = String.fromCharCode;
    expect(normalizeCampaignName(`Gov${c(0)}erno${c(0x1b)}`)).toBe('Governo');
    expect(normalizeCampaignName(`A${c(0x85)}B${c(0x7f)}`)).toBe('AB');
  });

  it('nome só com caracteres invisíveis conta como vazio', () => {
    const c = String.fromCharCode;
    for (const invisible of [
      c(0x200b),
      c(0x2800),
      `${c(0x200b)} ${c(0xfeff)}`,
      c(0x3164),
      c(0x2060),
      c(0x034f),
      `${c(0x17b4)}${c(0x17b5)}`,
    ]) {
      expect(normalizeCampaignName(invisible)).toBe('');
      expect(validateCampaignName(invisible)).toEqual({ ok: false, error: NAME_ERRORS.empty });
    }
    // Emoji composto com ZWJ continua inteiro: o teste de invisível vale para o nome todo, não remove nada.
    const family = '👨‍👩‍👧';
    expect(normalizeCampaignName(family)).toBe(family);
    expect(normalizeCampaignName(`${c(0x200b)}Nome`)).toBe(`${c(0x200b)}Nome`);
  });

  it('remove espaços nas pontas e mantem os do meio', () => {
    expect(normalizeCampaignName('  Governo Teste  ')).toBe('Governo Teste');
  });

  it('HTML é mantido literalmente (o escape fica para a tela)', () => {
    expect(normalizeCampaignName('<b>Nome</b>')).toBe('<b>Nome</b>');
  });

  it('texto colado de 200 caracteres é rejeitado por tamanho', () => {
    expect(validateCampaignName('x'.repeat(200))).toEqual({ ok: false, error: NAME_ERRORS.tooLong });
  });

  it('normaliza para NFC: e + acento combinante vira é', () => {
    const name = normalizeCampaignName('é');
    expect(name).toBe('é');
    expect(name.length).toBe(1);
  });

  it('o valor validado é igual ao normalizado (o que aparece é o que é gravado)', () => {
    const inputs = ['  Governo\r\nde\tteste  ', 'é campanha', '\uDE00Nome'];
    for (const input of inputs) {
      const result = validateCampaignName(input);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(normalizeCampaignName(input));
    }
  });
});

describe('semente digitada', () => {
  it('campo vazio ou ausente é semente automática (null)', () => {
    for (const raw of [undefined, null, '', '   ']) {
      expect(parseSeedInput(raw)).toEqual({ ok: true, value: null });
    }
  });

  it('aceita zero, um e os limites inteiros', () => {
    expect(parseSeedInput('0')).toEqual({ ok: true, value: 0 });
    expect(parseSeedInput('1')).toEqual({ ok: true, value: 1 });
    expect(parseSeedInput('2147483647')).toEqual({ ok: true, value: 2147483647 });
    expect(parseSeedInput('2147483648')).toEqual({ ok: true, value: 2147483648 });
    expect(parseSeedInput('4294967295')).toEqual({ ok: true, value: SEED_MAX });
  });

  it('acima de SEED_MAX é erro de faixa', () => {
    expect(parseSeedInput('4294967296')).toEqual({ ok: false, error: SEED_ERRORS.range });
    expect(parseSeedInput('99999999999999999999')).toEqual({ ok: false, error: SEED_ERRORS.range });
  });

  it('zeros à esquerda não contam para o tamanho', () => {
    expect(parseSeedInput('0004294967295')).toEqual({ ok: true, value: 4294967295 });
  });

  it('sinal, decimal, notação, hexadecimal, texto e algarismos não ASCII são erro de dígitos', () => {
    const invalid = ['-1', '1.5', '123abc', 'NaN', 'Infinity', '0x10', '1e3', '1 2', '+5', '١٢', '１２'];
    for (const raw of invalid) {
      expect(parseSeedInput(raw)).toEqual({ ok: false, error: SEED_ERRORS.digits });
    }
  });

  it('espaços nas pontas são ignorados', () => {
    expect(parseSeedInput('  42  ')).toEqual({ ok: true, value: 42 });
  });

  it('valor não textual (número) não é aceito', () => {
    expect(parseSeedInput(42).ok).toBe(false);
  });
});

describe('isValidSeed', () => {
  it('aceita 0 e SEED_MAX', () => {
    expect(isValidSeed(0)).toBe(true);
    expect(isValidSeed(SEED_MAX)).toBe(true);
  });

  it('recusa negativo, acima do máximo, decimal, NaN, Infinity e string', () => {
    expect(isValidSeed(-1)).toBe(false);
    expect(isValidSeed(SEED_MAX + 1)).toBe(false);
    expect(isValidSeed(1.5)).toBe(false);
    expect(isValidSeed(NaN)).toBe(false);
    expect(isValidSeed(Infinity)).toBe(false);
    expect(isValidSeed('5')).toBe(false);
  });
});

describe('dificuldades', () => {
  it('lista as três na ordem de exibição', () => {
    expect(DIFFICULTIES).toEqual(['casual', 'estrategica', 'realismo']);
  });

  it('reconhece só as dificuldades válidas', () => {
    expect(isDifficulty('casual')).toBe(true);
    expect(isDifficulty('estrategica')).toBe(true);
    expect(isDifficulty('realismo')).toBe(true);
    for (const raw of ['facil', '', null, 1, {}]) {
      expect(isDifficulty(raw)).toBe(false);
    }
  });
});

describe('cenários conhecidos', () => {
  it('aceita o cenário padrão e o protótipo', () => {
    expect(isKnownScenario(DEFAULT_SCENARIO_ID)).toBe(true);
    expect(isKnownScenario('prototipo_ficticio')).toBe(true);
  });

  it('recusa ids removidos e chaves herdadas do objeto', () => {
    for (const raw of ['removido', 'constructor', '__proto__', 'toString', null, 5]) {
      expect(isKnownScenario(raw)).toBe(false);
    }
  });
});

describe('resolveSetupPrefs', () => {
  it('mantém valores válidos', () => {
    expect(resolveSetupPrefs({ difficulty: 'casual', scenarioId: 'prototipo_ficticio' })).toEqual({
      difficulty: 'casual',
      scenarioId: 'prototipo_ficticio',
    });
  });

  it('dificuldade desconhecida volta para estrategica e cenário removido para o padrão', () => {
    expect(resolveSetupPrefs({ difficulty: 'dificil', scenarioId: 'removido' })).toEqual({
      difficulty: 'estrategica',
      scenarioId: DEFAULT_SCENARIO_ID,
    });
  });

  it('valores de tipo errado voltam aos padrões', () => {
    expect(resolveSetupPrefs({ difficulty: null, scenarioId: null })).toEqual(DEFAULT_SETUP_PREFS);
    expect(resolveSetupPrefs({ difficulty: {}, scenarioId: {} })).toEqual(DEFAULT_SETUP_PREFS);
    expect(resolveSetupPrefs({ difficulty: 1, scenarioId: 2 })).toEqual(DEFAULT_SETUP_PREFS);
  });

  it('sem campos volta a DEFAULT_SETUP_PREFS', () => {
    expect(resolveSetupPrefs({})).toEqual(DEFAULT_SETUP_PREFS);
  });
});

describe('scenarioOptions', () => {
  const options = scenarioOptions();

  it('o cenário atual vem primeiro, marcado como atual', () => {
    expect(options[0]?.id).toBe(DEFAULT_SCENARIO_ID);
    expect(options[0]?.kind).toBe('atual');
  });

  it('contém cada cenário do registro exatamente uma vez', () => {
    const ids = options.map((o) => o.id).sort();
    expect(ids).toEqual(Object.keys(SCENARIOS).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('o protótipo fictício vem por último, como experimental', () => {
    const last = options[options.length - 1];
    expect(last?.id).toBe('prototipo_ficticio');
    expect(last?.kind).toBe('experimental');
  });

  it('versões anteriores vêm como históricas, da mais nova para a mais antiga', () => {
    const ids = options.map((o) => o.id);
    expect(ids.indexOf('brasil_2027_01_v060')).toBeLessThan(ids.indexOf('brasil_2027_01_v050'));
    expect(ids.indexOf('brasil_2027_01_v050')).toBeLessThan(ids.indexOf('brasil_2027_01'));
    expect(options.find((o) => o.id === 'brasil_2027_01')?.kind).toBe('historico');
    expect(options.find((o) => o.id === 'brasil_2027_01_v050')?.kind).toBe('historico');
  });

  it('a duração em meses vem de campaignMonths de cada cenário', () => {
    const monthsOf = (id: string) => options.find((o) => o.id === id)?.months;
    expect(monthsOf('brasil_2027_01_v070')).toBe(96);
    expect(monthsOf('prototipo_ficticio')).toBe(12);
    expect(monthsOf('brasil_2027_01_v050')).toBe(48);
  });

  it('ordena versões semânticas numericamente (0.10.0 antes de 0.9.0)', () => {
    const base = SCENARIOS.brasil_2027_01 as Scenario;
    const registry: Record<string, Scenario> = {
      antigo: { ...base, version: '0.9.0' } as Scenario,
      novo: { ...base, version: '0.10.0' } as Scenario,
    };
    const ids = scenarioOptions(registry, 'outro_padrao').map((o) => o.id);
    expect(ids).toEqual(['novo', 'antigo']);
  });
});

describe('checkNewCampaignInput', () => {
  it('entrada válida devolve o nome normalizado, o padrão de cenário e semente nula', () => {
    expect(checkNewCampaignInput({ name: '  Campanha  ', difficulty: 'casual' })).toEqual({
      ok: true,
      input: {
        name: 'Campanha',
        difficulty: 'casual',
        scenarioId: DEFAULT_SCENARIO_ID,
        profileId: 'centro',
        startPoint: 'posse',
        seed: null,
      },
    });
  });

  it('mantém a semente explícita e o cenário informado', () => {
    expect(
      checkNewCampaignInput({
        name: 'Campanha',
        difficulty: 'realismo',
        scenarioId: 'prototipo_ficticio',
        seed: 7,
      }),
    ).toEqual({
      ok: true,
      input: {
        name: 'Campanha',
        difficulty: 'realismo',
        scenarioId: 'prototipo_ficticio',
        profileId: 'centro',
        startPoint: 'posse',
        seed: 7,
      },
    });
  });

  it('cada campo inválido gera a chave de erro correspondente', () => {
    const name = checkNewCampaignInput({ name: '', difficulty: 'casual' });
    expect(name).toEqual({ ok: false, errors: { name: NAME_ERRORS.empty } });

    const difficulty = checkNewCampaignInput({ name: 'X', difficulty: 'facil' });
    expect(difficulty.ok).toBe(false);
    if (!difficulty.ok) expect(Object.keys(difficulty.errors)).toEqual(['difficulty']);

    const scenario = checkNewCampaignInput({ name: 'X', difficulty: 'casual', scenarioId: 'removido' });
    expect(scenario.ok).toBe(false);
    if (!scenario.ok) expect(Object.keys(scenario.errors)).toEqual(['scenario']);

    const seed = checkNewCampaignInput({ name: 'X', difficulty: 'casual', seed: SEED_MAX + 1 });
    expect(seed).toEqual({ ok: false, errors: { seed: SEED_ERRORS.range } });
  });

  // PLANO_GLOBO.md §5.1 (D-G9): perfil inicial escolhido no NOVO JOGO; padrão Centro; id desconhecido é erro.
  it('perfil inicial: padrão Centro, valor informado é mantido e id desconhecido gera erro próprio', () => {
    const explicit = checkNewCampaignInput({ name: 'X', difficulty: 'casual', profileId: 'liberal' });
    expect(explicit.ok && explicit.input.profileId).toBe('liberal');
    const unknown = checkNewCampaignInput({ name: 'X', difficulty: 'casual', profileId: 'partido_real' });
    expect(unknown).toEqual({ ok: false, errors: { profile: expect.any(String) } });
    const viaForm = checkSetupForm({
      name: 'X',
      difficulty: 'casual',
      scenarioId: DEFAULT_SCENARIO_ID,
      profileId: 'esquerda',
      seedText: '',
    });
    expect(viaForm.ok && viaForm.input.profileId).toBe('esquerda');
  });

  it('vários erros são reportados de uma vez', () => {
    const result = checkNewCampaignInput({ name: '  ', difficulty: 'x', scenarioId: 'y', seed: -3 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual({
        name: NAME_ERRORS.empty,
        difficulty: expect.any(String),
        scenario: expect.any(String),
        seed: SEED_ERRORS.range,
      });
    }
  });
});

describe('checkSetupForm', () => {
  const form = { name: 'Campanha', difficulty: 'estrategica' as const, scenarioId: DEFAULT_SCENARIO_ID, seedText: '' };

  it('semente com letras gera erro de dígitos mesmo com nome válido', () => {
    expect(checkSetupForm({ ...form, seedText: 'abc' })).toEqual({
      ok: false,
      errors: { seed: SEED_ERRORS.digits },
    });
  });

  it('semente vazia é automática (null)', () => {
    const result = checkSetupForm({ ...form, seedText: '' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.seed).toBeNull();
  });

  it('semente digitada vira número', () => {
    const result = checkSetupForm({ ...form, seedText: '123' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.seed).toBe(123);
  });

  it('nome vazio e semente inválida geram os dois erros', () => {
    expect(checkSetupForm({ ...form, name: '', seedText: '1.5' })).toEqual({
      ok: false,
      errors: { name: NAME_ERRORS.empty, seed: SEED_ERRORS.digits },
    });
  });
});
