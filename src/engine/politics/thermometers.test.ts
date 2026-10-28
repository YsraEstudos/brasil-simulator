import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { PRONOUNCEMENT_ACTION_ID } from '@/engine/actions';
import { advanceMonth } from '@/engine/advanceMonth';
import { cabinetStep } from '@/engine/congress/cabinet';
import { IMPEACHMENT_PARAMS } from '@/engine/events/calibration';
import { impeachmentPressure, meanCongressRelation } from '@/engine/events/pressure';
import { createInitialState } from '@/engine/state';
import type { GameState, Proposal, ScandalCase } from '@/engine/types';

import { bandOf, pronouncementGain, recentPronouncements, thermometers, type ThermometerId } from './thermometers';

// PLANO_CAMPANHA.md Fase C6g: termômetros como leitura derivada dos indicadores, e o pronunciamento à nação.

const content = loadContent(DEFAULT_SCENARIO_ID);
const c = content.calibration;
const SAY = [{ policyId: PRONOUNCEMENT_ACTION_ID, agendaCost: 1 }];
const start = () => createInitialState({ content, difficulty: 'estrategica', seed: 2 });
const value = (s: GameState, id: ThermometerId) => thermometers(s, content).find((t) => t.id === id)!.value;

describe('termômetros (PLANO_CAMPANHA.md Fase C6g)', () => {
  it('cada valor é 50 + a soma dos fatores, limitado a [0, 100], e a faixa segue o valor', () => {
    for (const t of thermometers(start(), content)) {
      const raw = 50 + t.factors.reduce((s, f) => s + f.points, 0);
      expect(t.value).toBeCloseTo(Math.min(100, Math.max(0, raw)), 12);
      expect(t.band).toBe(bandOf(t.value));
    }
    expect([bandOf(10), bandOf(50), bandOf(65), bandOf(90)]).toEqual(['calmo', 'normal', 'tenso', 'critico']);
  });

  it('a leitura é reproduzível a partir dos indicadores (fórmulas de cada fator)', () => {
    const s = start();
    const [congress, streets, market, institutions] = thermometers(s, content);
    expect(congress.factors[0].points).toBeCloseTo(-c.termo_congresso_relacao * meanCongressRelation(s, content), 12);
    expect(streets.factors.map((f) => f.points)).toEqual([
      c.termo_ruas_aprovacao * (IMPEACHMENT_PARAMS.aprovacao_neutra.value - s.indicators.approval),
      c.termo_ruas_desemprego * (s.indicators.unemployment - IMPEACHMENT_PARAMS.desemprego_neutro.value),
      c.termo_ruas_inflacao * (s.indicators.inflation12m - c.meta_inflacao),
    ]);
    expect(market.factors[0].points).toBeCloseTo(c.termo_mercado_premio * (s.economy.riskPremium - c.premio_base), 12);
    expect(institutions.factors[0].points).toBeCloseTo(c.termo_inst_pressao * impeachmentPressure(s, content), 12);
  });

  it('é só leitura: não muda o estado nem consome sorteio, e repete para o mesmo estado', () => {
    const s = start();
    const copy = structuredClone(s);
    expect(thermometers(s, content)).toEqual(thermometers(s, content));
    expect(s).toEqual(copy);
  });

  it('sobe com o que piora: aprovação, relação, pauta-bomba, casos e pedidos na gaveta', () => {
    const s = start();
    expect(value({ ...s, indicators: { ...s.indicators, approval: 0.2 } }, 'ruas')).toBeGreaterThan(value(s, 'ruas'));
    const hostile = {
      ...s,
      congress: { ...s.congress, blocs: s.congress.blocs.map((b) => ({ ...b, governmentRelation: -50 })) },
    };
    expect(value(hostile, 'congresso')).toBeGreaterThan(value(s, 'congresso'));

    const bomb: Proposal = {
      ...({} as Proposal),
      id: 'pb_1',
      policyId: 'pauta_bomba_x',
      status: 'aguardando_sancao',
      history: [{ monthIndex: 0, status: 'aguardando_sancao', cause: 'pauta_bomba', detail: '' }],
    };
    expect(value({ ...s, proposals: [bomb] }, 'congresso') - value(s, 'congresso')).toBeCloseTo(
      Math.min(c.termo_congresso_pauta, 100 - value(s, 'congresso')),
      10,
    );

    const open: ScandalCase = {
      id: 'diretoria:x#0',
      source: 'diretoria',
      subjectId: 'x',
      blocId: 'centro',
      stage: 'investigacao',
      irregular: false,
      evidence: 0.1,
      openedMonth: 0,
      stageMonth: 0,
      exposure: 1,
    };
    const withCase = { ...s, cases: [open] };
    expect(value(withCase, 'instituicoes') - value(s, 'instituicoes')).toBeCloseTo(c.termo_inst_caso, 10);
    const withRequest = {
      ...s,
      impeachmentDrawer: [{ id: 'pedido#0#0', filedMonth: 0, cause: 'pressao' as const, status: 'na_gaveta' as const }],
    };
    expect(value(withRequest, 'instituicoes') - value(s, 'instituicoes')).toBeCloseTo(c.termo_inst_pedido, 10);
  });
});

describe('pronunciamento à nação (PLANO_CAMPANHA.md Fase C6g)', () => {
  it('rende aprovação no mês; repetido em seguida, rende a metade', () => {
    const s0 = start();
    expect(pronouncementGain(s0, content)).toBeCloseTo(c.pronunciamento_aprovacao, 12);
    const said = advanceMonth(s0, { decisions: SAY }, content);
    const quiet = advanceMonth(s0, { decisions: [] }, content);
    expect(said.report.rejected).toEqual([]);
    expect(said.state.indicators.approval).toBeGreaterThan(quiet.state.indicators.approval);
    expect(recentPronouncements(said.state, content)).toBe(1);
    expect(pronouncementGain(said.state, content)).toBeCloseTo(pronouncementGain(quiet.state, content) / 2, 12);
  });

  it('o efeito volta ao normal depois de `pronunciamento_meses` meses', () => {
    let s = advanceMonth(start(), { decisions: SAY }, content).state;
    for (let i = 0; i < c.pronunciamento_meses; i++) s = advanceMonth(s, { decisions: [] }, content).state;
    expect(recentPronouncements(s, content)).toBe(0);
  });

  it('com as ruas em nível crítico, o efeito cai à metade', () => {
    const s = start();
    const angry = { ...s, indicators: { ...s.indicators, approval: 0.05, unemployment: 0.2 } };
    expect(thermometers(angry, content).find((t) => t.id === 'ruas')!.band).toBe('critico');
    expect(pronouncementGain(angry, content)).toBeCloseTo(c.pronunciamento_aprovacao / 2, 12);
  });

  it('o impulso entra pela etapa do gabinete, com causa no relatório', () => {
    const out = advanceMonth(start(), { decisions: SAY }, content, [cabinetStep]);
    expect(out.report.notes).toContain('Pronunciamento à nação em rede nacional.');
  });
});
