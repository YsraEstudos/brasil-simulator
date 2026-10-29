import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { COMMUNICATE_ACTION_ID, PRESS_RESPONSE_ACTION_ID } from '../actions';
import { advanceMonth } from '../advanceMonth';
import { createOutbreak, diseaseOf, healthOf } from '../health/health';
import { checkInvariants } from '../invariants';
import { createInitialState } from '../state';
import type { Decision, GameState } from '../types';
import { pressOf } from './effects';
import type { PressItem } from './types';

const content = loadContent(DEFAULT_SCENARIO_ID);

function crisis(seed = 3): GameState {
  const s = createInitialState({ content, difficulty: 'estrategica', seed, modules: ['clima_detalhado', 'noticias'] });
  const outbreak = createOutbreak(s, diseaseOf(content, 'respiratorio_novo')!, content.scenario.regions!.ufs, 'SP', {
    r0: 1.9,
    hospitalRate: 0.02,
    vaccineMonth: 99,
  });
  outbreak.phase = 'identificado';
  outbreak.detectedMonth = 0;
  outbreak.identifiedMonth = 0;
  return { ...s, health: { ...s.health, outbreaks: [outbreak] } };
}

function rumor(state: GameState, truthful: boolean, patch: Partial<PressItem> = {}): GameState {
  const item: PressItem = {
    id: `imprensa:teste:${truthful ? 'v' : 'f'}`,
    month: state.monthIndex,
    outletId: 'corrente_zap',
    category: 'rumor',
    headline: 'Receita caseira curaria a doença, garante corrente',
    stance: -0.5,
    rumorId: 'cura_caseira',
    truthful,
    status: 'circulando',
    resolveMonth: state.monthIndex + 2,
    circulation: 1,
    ...patch,
  };
  return { ...state, press: { ...state.press, items: [...state.press.items, item] } };
}

function run(state: GameState, months: number, plan: (s: GameState) => Decision[] = () => []): GameState {
  let current = state;
  for (let m = 0; m < months; m++) {
    const r = advanceMonth(current, { decisions: plan(current) }, content);
    expect(checkInvariants(current, r.state, r.report, content)).toEqual([]);
    current = r.state;
  }
  return current;
}

const respond = (itemId: string, response: 'desmentir' | 'esclarecer'): Decision => ({
  policyId: PRESS_RESPONSE_ACTION_ID,
  agendaCost: 1,
  params: { itemId, response },
});

describe('imprensa interpretativa (EX-28)', () => {
  it('fatos, estimativas e interpretações saem dos boletins e das faixas do governo; itens não são reescritos', () => {
    const end = run(crisis(), 6);
    const categories = new Set(pressOf(end).items.map((i) => i.category));
    expect(categories.has('fato')).toBe(true);
    expect(categories.has('estimativa')).toBe(true);
    expect(categories.has('interpretacao')).toBe(true);
    for (const item of pressOf(end).items.filter((i) => i.category !== 'rumor')) {
      expect(item.truthful).toBeUndefined();
      expect(item.status).toBeUndefined();
    }
  });

  it('tom tranquilizador fecha os boletins para a imprensa; repetir o tom é recusado', () => {
    const calm: Decision = { policyId: COMMUNICATE_ACTION_ID, agendaCost: 1, params: { tone: 'tranquilizador' } };
    const after = run(crisis(), 2, (s) => (s.monthIndex === 0 ? [calm] : []));
    expect(pressOf(after).tone).toBe('tranquilizador');
    const last = healthOf(after).bulletins.at(-1)!;
    expect(last.revisions[0].payload.public).toBe(false);
    expect(pressOf(after).items.filter((i) => i.category === 'fato' && i.month > 0)).toEqual([]);
    const repeat = advanceMonth(after, { decisions: [calm] }, content);
    expect(repeat.report.rejected.map((r) => r.reason)).toEqual(['ja_em_andamento']);
  });

  it('comunicar não dá aprovação: nenhum impulso de aprovação nasce da imprensa', () => {
    const a = run(crisis(), 3, (s) =>
      s.monthIndex === 0 ? [{ policyId: COMMUNICATE_ACTION_ID, agendaCost: 1, params: { tone: 'transparente' } }] : [],
    );
    expect(a.impulses.some((i) => i.sourceId.startsWith('imprensa'))).toBe(false);
    expect(pressOf(a).trust).toBeGreaterThan(0.5);
  });

  it('desmentir um rumor verdadeiro custa confiança na checagem; desmentir um falso rende confiança', () => {
    const base = crisis();
    const trueRumor = rumor(base, true);
    const falseRumor = rumor(base, false);
    const plan = (id: string) => (s: GameState) => (s.monthIndex === 0 ? [respond(id, 'desmentir')] : []);
    const afterTrue = run(trueRumor, 3, plan('imprensa:teste:v'));
    const afterFalse = run(falseRumor, 3, plan('imprensa:teste:f'));
    const silent = run(falseRumor, 3);
    expect(pressOf(afterTrue).items.find((i) => i.id === 'imprensa:teste:v')!.status).toBe('confirmado');
    expect(pressOf(afterFalse).items.find((i) => i.id === 'imprensa:teste:f')!.status).toBe('desmentido');
    expect(pressOf(afterTrue).trust).toBeLessThan(pressOf(silent).trust);
    expect(pressOf(afterFalse).trust).toBeGreaterThan(pressOf(silent).trust);
    // A checagem julga o veículo: o boato falso derruba a confiabilidade da corrente.
    const outlet = (s: GameState) => pressOf(s).outlets.find((o) => o.id === 'corrente_zap')!.reliability;
    expect(outlet(silent)).toBeLessThan(outlet(crisis()));
  });

  it('esclarecer com dados confirma na hora o rumor verdadeiro e nunca contradiz os fatos', () => {
    const s = rumor(crisis(), true);
    const after = run(s, 1, () => [respond('imprensa:teste:v', 'esclarecer')]);
    const item = pressOf(after).items.find((i) => i.id === 'imprensa:teste:v')!;
    expect(item.status).toBe('confirmado');
    expect(item.response).toBe('esclarecer');
  });

  it('desinformação muda comportamento, não a realidade: sem medidas, o surto é idêntico com ou sem boato', () => {
    const clean = run(crisis(), 4);
    const rumored = run(rumor(crisis(), false, { resolveMonth: 99 }), 4);
    // Sem medidas em vigor a adesão não entra na transmissão: compartimentos e verdade não mudam.
    expect(healthOf(rumored).outbreaks[0].ufs).toEqual(healthOf(clean).outbreaks[0].ufs);
    expect(healthOf(rumored).outbreaks[0].truth).toEqual(healthOf(clean).outbreaks[0].truth);
    expect(rumored.indicators).toEqual(clean.indicators);
  });
});
