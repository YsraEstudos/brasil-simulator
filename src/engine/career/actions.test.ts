import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { CAREER_ACTION_IDS } from '@/types/scenario';

import { advanceMonth } from '../advanceMonth';
import { checkInvariants } from '../invariants';
import { createInitialState } from '../state';
import type { Decision, Difficulty, GameState, MonthResult } from '../types';

import { attackRisk, CAREER_ACTIONS, screenCareerAction } from './actions';
import { careerParam } from './calibration';
import { DEBATE_ACTION_ID, debateOptions } from './debate';
import { alignment, nationalRecognition } from './viability';

import { careerProfile, careerSchedule } from '.';

// PLANO_CAMPANHA.md Fase C4 (tarefas C4.1 e C4.2): ações de campanha e debate.

const content = loadContent(DEFAULT_SCENARIO_ID);
const ufs = content.scenario.regions!.ufs;
const corrida = (seed = 21, difficulty: Difficulty = 'estrategica') =>
  createInitialState({ content, difficulty, seed, startPoint: 'corrida' });
const act = (policyId: string, params: Decision['params'] = {}): Decision => ({
  policyId,
  agendaCost: 0,
  params: { bolso: 'party', ...params },
});
const debate = (params: Decision['params']): Decision => ({ policyId: DEBATE_ACTION_ID, agendaCost: 0, params });

function turn(state: GameState, decisions: Decision[]): MonthResult {
  const r = advanceMonth(state, { decisions }, content);
  expect(checkInvariants(state, r.state, r.report, content)).toEqual([]);
  return r;
}
const reasons = (r: MonthResult) => r.report.rejected.map((x) => [x.decision.policyId, x.reason]);
/** Sobe ao turno do debate (setembro): um turno sem decisões. */
const atDebate = (seed = 21) => turn(corrida(seed), []).state;

describe('catálogo dos 5 arquétipos (PLANO_CAMPANHA.md Fase C4, C4.1)', () => {
  it('uma ação por arquétipo, com os ids executáveis do cenário e custo no catálogo de finanças', () => {
    const specs = Object.values(CAREER_ACTIONS);
    expect(specs.map((s) => s.id).sort()).toEqual([...CAREER_ACTION_IDS].sort());
    expect(new Set(specs.map((s) => s.archetype)).size).toBe(5);
    const costs = content.scenario.career!.finance!.costs!.map((c) => c.id);
    for (const id of CAREER_ACTION_IDS) expect(costs, id).toContain(id);
  });

  it('comício sobe o reconhecimento em todas as UFs; caravana só na UF visitada', () => {
    const s0 = corrida();
    const comicio = turn(s0, [act('comicio_nacional')]);
    const parado = turn(s0, []);
    for (const u of ufs) {
      expect(comicio.state.career!.recognition[u.id]).toBeGreaterThan(parado.state.career!.recognition[u.id]);
    }
    const caravana = turn(s0, [act('caravana_regional', { uf: 'BA' })]);
    for (const u of ufs) {
      const gained = caravana.state.career!.recognition[u.id] - parado.state.career!.recognition[u.id];
      if (u.id === 'BA') expect(gained).toBeGreaterThan(0.05);
      else expect(gained).toBe(0);
    }
    expect(caravana.report.career!.actions).toEqual([
      expect.objectContaining({ actionId: 'caravana_regional', target: 'BA' }),
    ]);
  });

  it('a mobilização só rende onde o eleitorado se parece com o bloco do partido', () => {
    const s0 = corrida();
    const bloc = content.scenario.blocs.find((b) => b.id === careerProfile(content).blocId);
    const r = turn(s0, [act('mobilizar_militancia')]);
    const parado = turn(s0, []);
    for (const u of ufs) {
      const gained = r.state.career!.recognition[u.id] - parado.state.career!.recognition[u.id];
      if (alignment(bloc, u) > 0) expect(gained).toBeGreaterThan(0);
      else expect(gained).toBe(0);
    }
  });

  it('a variação vem com causa: a ação aparece no "Por que mudou?" do reconhecimento', () => {
    const s0 = corrida();
    const r = turn(s0, [act('comicio_nacional')]);
    const piece = r.report.contributions.find((c) => c.cause === 'acao:comicio_nacional')!;
    expect(piece.indicator).toBe('careerRecognition');
    expect(piece.delta).toBeCloseTo(r.report.career!.actions![0].recognitionDelta, 12);
  });
});

describe('triagem das ações (PLANO_CAMPANHA.md Fase C4, testes exigidos)', () => {
  it('ação fora do estágio é recusada: comício antes da campanha oficial e qualquer ação na transição', () => {
    const career = corrida().career!;
    const pre = { stage: 'pre_campanha' as const, from: '2026-05' };
    const none = new Set<string>();
    expect(screenCareerAction(career, pre, act('comicio_nacional'), content, 0, 3, none)).toBe('fora_do_estagio');
    expect(screenCareerAction(career, pre, act('ataque_adversario', { alvo: 'direita' }), content, 0, 3, none)).toBe(
      'fora_do_estagio',
    );
    expect(screenCareerAction(career, pre, act('mobilizar_militancia'), content, 0, 3, none)).toBeNull();
    let s = corrida(11); // A transição exige uma eleição vencida.
    for (let t = 0; t < careerSchedule(content, 'corrida').length - 1; t++) s = turn(s, []).state;
    const r = turn(s, [act('mobilizar_militancia')]);
    expect(reasons(r)).toEqual([['mobilizar_militancia', 'fora_do_estagio']]);
  });

  it('alvo inválido, ação repetida e o limite de ações do turno (3; 4 no Casual)', () => {
    const r = turn(corrida(), [
      act('caravana_regional', { uf: 'XX' }),
      act('ataque_adversario', { alvo: careerProfile(content).blocId }),
      act('mobilizar_militancia'),
      act('mobilizar_militancia'),
      act('caravana_regional', { uf: 'MG' }),
      act('ataque_adversario', { alvo: 'direita' }),
      act('comicio_nacional'),
    ]);
    expect(reasons(r)).toEqual([
      ['caravana_regional', 'alvo_invalido'],
      ['ataque_adversario', 'alvo_invalido'],
      ['mobilizar_militancia', 'acao_repetida'],
      ['comicio_nacional', 'sem_acoes_de_agenda'],
    ]);
    expect(r.report.accepted.map((d) => d.policyId)).toEqual([
      'mobilizar_militancia',
      'caravana_regional',
      'ataque_adversario',
    ]);
    const casual = turn(corrida(21, 'casual'), [
      act('mobilizar_militancia'),
      act('caravana_regional', { uf: 'MG' }),
      act('ataque_adversario', { alvo: 'direita' }),
      act('comicio_nacional'),
    ]);
    expect(casual.report.rejected).toEqual([]);
  });

  it('sem dinheiro: a ação é recusada, não gasta nada e não ocupa vaga do turno', () => {
    const s0 = corrida();
    const poor: GameState = {
      ...s0,
      career: {
        ...s0.career!,
        expandedFinance: { ...s0.career!.expandedFinance!, pockets: { personal: 0, party: 3200, donations: 0 } },
      },
    };
    const r = turn(poor, [
      act('comicio_nacional'),
      act('caravana_regional', { uf: 'MG' }),
      act('mobilizar_militancia'),
      act('ataque_adversario', { alvo: 'direita' }),
    ]);
    // 3.000 do comício deixam 200: a caravana (800) não cabe; mobilização (300) também não; o ataque (500), idem.
    expect(r.report.accepted.map((d) => d.policyId)).toEqual(['comicio_nacional']);
    expect(reasons(r).map(([, reason]) => reason)).toEqual(['sem_recursos', 'sem_recursos', 'sem_recursos']);
    expect(r.state.career!.expandedFinance!.pockets.party).toBe(200);
  });
});

describe('ataque: risco observável e sorteio por chave (§4.1)', () => {
  it('o risco de bumerangue cresce com a imagem do atacado e tem teto', () => {
    expect(attackRisk(-0.5)).toBe(careerParam('ataque_risco_base'));
    expect(attackRisk(0.5)).toBeGreaterThan(attackRisk(0.1));
    expect(attackRisk(10)).toBe(careerParam('ataque_risco_max'));
  });

  it('o resultado depende da chave, não da posição: trocar a ordem de ações independentes não muda nada', () => {
    const s0 = corrida();
    const a = turn(s0, [act('ataque_adversario', { alvo: 'direita' }), act('caravana_regional', { uf: 'BA' })]);
    const b = turn(s0, [act('caravana_regional', { uf: 'BA' }), act('ataque_adversario', { alvo: 'direita' })]);
    expect(b.state.career!.valence).toBe(a.state.career!.valence);
    expect(b.state.career!.opponents).toEqual(a.state.career!.opponents);
    expect(b.state.career!.recognition).toEqual(a.state.career!.recognition);
  });

  it('sucesso desgasta o atacado; bumerangue desgasta o jogador (com causa); as duas saídas acontecem', () => {
    const results = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const s0 = corrida(seed);
      const r = turn(s0, [act('ataque_adversario', { alvo: 'esquerda' })]);
      const out = r.report.career!.actions![0];
      results.add(out.result!);
      const target = (s: GameState) => s.career!.opponents.find((o) => o.blocId === 'esquerda')!.valence;
      if (out.result === 'sucesso') {
        expect(target(r.state)).toBeCloseTo(target(s0) - careerParam('ataque_dano'), 12);
        expect(r.state.career!.valence).toBe(s0.career!.valence);
      } else {
        expect(target(r.state)).toBe(target(s0));
        expect(r.state.career!.valence).toBeCloseTo(s0.career!.valence - careerParam('ataque_bumerangue'), 12);
        expect(r.report.contributions.some((c) => c.indicator === 'careerValence')).toBe(true);
      }
    }
    expect(results).toEqual(new Set(['sucesso', 'bumerangue']));
  });
});

describe('debate (PLANO_CAMPANHA.md Fase C4, C4.2)', () => {
  it('fora do turno do debate a decisão é recusada', () => {
    const r = turn(corrida(), [debate({ postura: 'propositiva' })]);
    expect(reasons(r)).toEqual([[DEBATE_ACTION_ID, 'fora_do_estagio']]);
    expect(r.report.career!.debate).toBeUndefined();
  });

  it('escolha padrão: sem postura marcada, vale a propositiva, registrada como automática e avisada', () => {
    const r = turn(atDebate(), []);
    expect(r.report.career!.debate).toMatchObject({ posture: 'propositiva', automatic: true });
    expect(r.report.notes.some((n) => n.includes('sem postura marcada'))).toBe(true);
    expect(r.report.career!.debate!.valenceDelta).toBeCloseTo(careerParam('debate_propositivo'), 12);
  });

  it('tabela de vantagens: a técnica rende mais para quem é conhecido; o ataque mostra o risco por adversário', () => {
    const career = atDebate().career!;
    const options = debateOptions(career, content);
    const tecnica = options.find((o) => o.posture === 'tecnica')!;
    expect(tecnica.expectedValence).toBeCloseTo(
      careerParam('debate_tecnico') * nationalRecognition(career.recognition, ufs),
      12,
    );
    const famous = { ...career, recognition: Object.fromEntries(ufs.map((u) => [u.id, 0.9])) };
    expect(debateOptions(famous, content).find((o) => o.posture === 'tecnica')!.expectedValence).toBeGreaterThan(
      tecnica.expectedValence,
    );
    const attacks = options.filter((o) => o.posture === 'ataque');
    expect(attacks.map((o) => o.target)).toEqual(career.opponents.map((o) => o.blocId));
    for (const o of attacks) {
      const valence = career.opponents.find((x) => x.blocId === o.target)!.valence;
      expect(o.risk).toBe(attackRisk(valence));
    }
    // A exposição do debate é a mesma em todas as posturas.
    expect(new Set(options.map((o) => o.recognitionGain)).size).toBe(1);
  });

  it('postura escolhida vale; postura inválida e debate repetido são recusados; sem custo nem vaga de ação', () => {
    const s = atDebate();
    const r = turn(s, [
      debate({ postura: 'grito' }),
      debate({ postura: 'tecnica' }),
      debate({ postura: 'propositiva' }),
      act('mobilizar_militancia'),
      act('caravana_regional', { uf: 'MG' }),
      act('comicio_nacional'),
    ]);
    expect(reasons(r)).toEqual([
      [DEBATE_ACTION_ID, 'escolha_invalida'],
      [DEBATE_ACTION_ID, 'acao_repetida'],
    ]);
    expect(r.report.career!.debate).toMatchObject({ posture: 'tecnica', automatic: false });
    expect(r.report.accepted).toHaveLength(4);
  });

  it('o mesmo debate com a mesma semente dá o mesmo resultado (sorteio do ataque por chave)', () => {
    const s = atDebate(8);
    const choice = [debate({ postura: 'ataque', alvo: 'direita' })];
    expect(turn(s, choice).state.career).toEqual(turn(s, choice).state.career);
  });

  it('a invariante acusa valência mudada sem causa', () => {
    const s0 = corrida();
    const r = advanceMonth(s0, { decisions: [] }, content);
    const broken: GameState = { ...r.state, career: { ...r.state.career!, valence: r.state.career!.valence + 0.1 } };
    expect(checkInvariants(s0, broken, r.report, content).some((e) => e.startsWith('careerValence'))).toBe(true);
  });
});
