import { describe, expect, it } from 'vitest';

import { ADVICE_PARAMS, AGENDA_POINTS, DEFAULT_CALIBRATION } from '@/engine';
import { DIFFICULTIES } from '@/store/campaignSetup';
import { campaignMonths, SCENARIOS } from '@/store/scenarios';

import {
  difficultyView,
  durationLabel,
  scenarioDataNote,
  scenarioFeatures,
  scenarioTitle,
  setupSummary,
  startLabel,
} from './campaignSetupView';

// GAME_DESIGN.md §6 descreve metas; a tela só pode prometer o que o motor faz. Os números vêm das constantes do motor.
describe('efeitos de dificuldade derivados do motor', () => {
  it('pontos de agenda iguais a AGENDA_POINTS (Realismo com 3, não 2)', () => {
    for (const id of DIFFICULTIES) {
      const view = difficultyView(id);
      expect(view.agendaPoints).toBe(AGENDA_POINTS[id]);
      expect(view.effects[0]).toBe(`${AGENDA_POINTS[id]} pontos de agenda por mês`);
    }
    expect(difficultyView('realismo').agendaPoints).toBe(3);
  });

  it('bônus do Congresso no Casual vem de bonus_casual', () => {
    const bonus = Math.round(DEFAULT_CALIBRATION.bonus_casual * 100);
    expect(difficultyView('casual').effects).toContain(
      `Congresso mais receptivo: +${bonus} pontos no apoio de cada bloco`,
    );
    for (const id of ['estrategica', 'realismo'] as const) {
      expect(difficultyView(id).effects.join(' ')).not.toMatch(/receptivo/);
    }
  });

  it('escala do ruído é a razão das calibrações (×0,5 no Casual, ×1,5 no Realismo)', () => {
    const c = DEFAULT_CALIBRATION;
    const casual = String(c.ruido_hiato_casual / c.ruido_hiato_estrategica).replace('.', ',');
    const realismo = String(c.ruido_hiato_realismo / c.ruido_hiato_estrategica).replace('.', ',');
    expect(difficultyView('casual').effects.join('\n')).toContain(`(×${casual})`);
    expect(difficultyView('realismo').effects.join('\n')).toContain(`(×${realismo})`);
  });

  it('margens e viés das previsões vêm de ADVICE_PARAMS', () => {
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    expect(difficultyView('estrategica').effects.join('\n')).toContain(`±${pct(ADVICE_PARAMS.marginEstrategica)}`);
    const realismo = difficultyView('realismo').effects.join('\n');
    expect(realismo).toContain(`±${pct(ADVICE_PARAMS.marginRealismo)}`);
    expect(realismo).toContain(`viés otimista de ${pct(ADVICE_PARAMS.biasRealismo)}`);
    expect(difficultyView('casual').effects.join('\n')).toMatch(/sem margem de erro/);
  });

  it('não promete mecânicas ainda não implementadas', () => {
    for (const id of DIFFICULTIES) {
      const text = [difficultyView(id).tagline, ...difficultyView(id).effects].join('\n').toLowerCase();
      expect(text).not.toMatch(/atraso|deputado|parlamentar individual|eventos negativos|punições/);
    }
  });

  it('cada dificuldade tem nome e frase curta', () => {
    expect(difficultyView('casual').name).toBe('Casual');
    expect(difficultyView('realismo').name).toBe('Realismo Extremo');
    for (const id of DIFFICULTIES) expect(difficultyView(id).tagline.length).toBeGreaterThan(0);
  });
});

describe('apresentação dos cenários', () => {
  it('título sem o parêntese do status dos dados, que vira selo', () => {
    const s = SCENARIOS.brasil_2027_01_v070;
    expect(scenarioTitle(s)).toBe('Brasil, janeiro de 2027');
    expect(scenarioDataNote(s)).toBe('dados provisórios');
    expect(scenarioDataNote(SCENARIOS.prototipo_ficticio)).toBe('dados fictícios');
    expect(scenarioDataNote({ ...s, name: 'Sem nota' })).toBeNull();
    expect(scenarioTitle({ ...s, name: 'Sem nota' })).toBe('Sem nota');
  });

  it('mês de início legível e entrada desconhecida devolvida como veio', () => {
    expect(startLabel('2027-01')).toBe('janeiro de 2027');
    expect(startLabel('2030-12')).toBe('dezembro de 2030');
    expect(startLabel('2027-13')).toBe('2027-13');
    expect(startLabel('jan/2027')).toBe('jan/2027');
  });

  it('duração em meses e anos', () => {
    expect(durationLabel(12)).toBe('12 meses (1 ano)');
    expect(durationLabel(96)).toBe('96 meses (8 anos)');
    expect(durationLabel(18)).toBe('18 meses');
  });

  it('características lidas dos dados do cenário', () => {
    const atual = scenarioFeatures(SCENARIOS.brasil_2027_01_v070);
    expect(atual).toContain('Eleições e reeleição');
    expect(atual).toContain(`${SCENARIOS.brasil_2027_01_v070.blocs.length} blocos no Congresso`);
    const prototipo = scenarioFeatures(SCENARIOS.prototipo_ficticio);
    expect(prototipo).toContain('Economia simplificada');
    expect(prototipo).not.toContain('Eleições e reeleição');
    expect(prototipo).not.toContain('Ministérios e instituições');
  });
});

describe('resumo da campanha', () => {
  const form = {
    name: '  Governo\nNovo  ',
    difficulty: 'casual' as const,
    scenarioId: 'brasil_2027_01_v050',
    seedText: '',
  };

  it('mostra o nome normalizado (o mesmo que será gravado) e os dados do cenário', () => {
    const s = setupSummary(form);
    expect(s.name).toBe('Governo Novo');
    expect(s.difficulty).toBe('Casual');
    expect(s.agendaPoints).toBe(AGENDA_POINTS.casual);
    expect(s.scenario).toBe('Brasil, janeiro de 2027');
    expect(s.version).toBe('v0.5.0');
    expect(s.duration).toBe(`até ${durationLabel(campaignMonths('brasil_2027_01_v050'))}`);
    expect(s.seed).toBe('Aleatória');
  });

  it('acompanha cada mudança do formulário', () => {
    expect(setupSummary({ ...form, name: '   ' }).name).toBeNull();
    expect(setupSummary({ ...form, seedText: ' 42 ' }).seed).toBe('42');
    expect(setupSummary({ ...form, seedText: '1e3' }).seed).toBe('Inválida');
    expect(setupSummary({ ...form, difficulty: 'realismo' }).difficulty).toBe('Realismo Extremo');
    expect(setupSummary({ ...form, scenarioId: 'brasil_2027_01_v070' }).duration).toBe('até 96 meses (8 anos)');
  });

  it('cenário desconhecido não quebra o resumo', () => {
    const s = setupSummary({ ...form, scenarioId: 'removido' });
    expect(s.scenario).toBe('—');
    expect(s.version).toBe('—');
    expect(s.duration).toBe('—');
  });

  it('chaves herdadas de Object ("toString", "constructor") não viram cenário', () => {
    for (const scenarioId of ['toString', 'constructor', '__proto__']) {
      const s = setupSummary({ ...form, scenarioId });
      expect(s.version).toBe('—');
      expect(s.scenario).toBe('—');
    }
  });

  it('a mesma dificuldade devolve sempre o mesmo objeto (montado uma vez)', () => {
    expect(difficultyView('casual')).toBe(difficultyView('casual'));
  });
});
