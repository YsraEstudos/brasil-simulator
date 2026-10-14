import { describe, expect, it } from 'vitest';

import { EVENTS } from './events';
import { SCENARIOS, DEFAULT_SCENARIO_ID } from './scenarios';
import { parseGameEvent, type EventEffect } from '@/types/event';

const UFS = SCENARIOS[DEFAULT_SCENARIO_ID].regions?.ufs.map((u) => u.id) ?? [];

/**
 * Limites de magnitude por alvo (tarefa de conteúdo de eventos; unidades em src/engine/types.ts). Eventos não
 * criam efeitos permanentes: mudanças permanentes passam por políticas. Fase 03: gastos e receitas aceitam
 * cortes e remanejamentos (sinal negativo) e até 24 meses; alvos novos de risco, câmbio e potencial. Fase 05:
 * alvos regionais, que só redistribuem entre as UFs (não mudam o total nacional).
 */
interface Limit {
  min: number;
  max: number;
  duration: [number, number] | 'one-shot';
}

function limitFor(target: string): Limit | undefined {
  if (target === 'choque.inflacao') return { min: -0.004, max: 0.012, duration: [3, 9] };
  if (target === 'choque.risco') return { min: 0.001, max: 0.015, duration: [1, 6] };
  if (target === 'choque.cambio') return { min: -0.05, max: 0.05, duration: [1, 3] };
  if (target === 'oferta.potencial') return { min: -0.002, max: 0.002, duration: [6, 24] };
  if (target === 'choque.hiato') return { min: -0.004, max: 0.002, duration: [1, 6] };
  if (target === 'aprovacao') return { min: -0.03, max: 0.02, duration: 'one-shot' };
  if (target.startsWith('gasto.') || target.startsWith('receita.')) {
    return { min: -0.003, max: 0.005, duration: [3, 24] };
  }
  if (target === 'credibilidade') return { min: -0.05, max: 0.03, duration: 'one-shot' };
  if (target === 'capital_politico') return { min: -10, max: 6, duration: 'one-shot' };
  if (target === 'relacao_congresso') return { min: -15, max: 10, duration: 'one-shot' };
  if (target === 'demanda.credito') return { min: 0.001, max: 0.003, duration: [3, 6] };
  // Fase 05 (ECONOMIC_MODEL.md §5.15): choques regionais e relação com os governadores.
  if (target === 'regiao.atividade') return { min: -0.015, max: 0.006, duration: [1, 12] };
  if (target === 'regiao.aprovacao') return { min: -0.03, max: 0.02, duration: [1, 6] };
  if (target === 'governadores.relacao') return { min: -15, max: 15, duration: 'one-shot' };
  return undefined;
}

function checkEffect(effect: EventEffect, where: string): string[] {
  const limit = limitFor(effect.target);
  if (!limit) return [`${where}: alvo sem limite definido (${effect.target})`];
  const problems: string[] = [];
  if (effect.delta < limit.min || effect.delta > limit.max) {
    problems.push(`${where}: delta ${effect.delta} fora de [${limit.min}, ${limit.max}]`);
  }
  const d = effect.durationMonths;
  if (d === null) {
    problems.push(`${where}: duração permanente não é permitida para ${effect.target}`);
  } else if (limit.duration === 'one-shot') {
    if (d !== 1) problems.push(`${where}: ${effect.target} deve durar 1 mês (tem ${d})`);
  } else if (d < limit.duration[0] || d > limit.duration[1]) {
    problems.push(`${where}: duração ${d} fora de [${limit.duration[0]}, ${limit.duration[1]}] para ${effect.target}`);
  }
  return problems;
}

describe('eventos (GAME_DESIGN.md §11.3)', () => {
  it('todos os eventos são válidos pelo esquema Zod', () => {
    for (const event of EVENTS) {
      const r = parseGameEvent(event);
      expect(r.ok, `${event.id}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
    }
  });

  it('há os 10 eventos do protótipo, os 5 de 2027 e o das dívidas estaduais, com ids únicos', () => {
    expect(EVENTS).toHaveLength(16);
    const ids = EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada escolha padrão custa 0 pontos de agenda', () => {
    for (const event of EVENTS) {
      const def = event.choices.find((c) => c.id === event.defaultChoice);
      expect(def, `${event.id}: escolha padrão ausente`).toBeDefined();
      expect(def?.agendaCost, `${event.id}: escolha padrão com custo`).toBe(0);
    }
  });

  it('efeitos regionais citam regiões ou UFs que existem (ECONOMIC_MODEL.md §5.15)', () => {
    const scope = new Set(['norte', 'nordeste', 'centro_oeste', 'sudeste', 'sul', ...UFS]);
    for (const event of EVENTS) {
      const effects = [...event.onFire, ...event.choices.flatMap((c) => c.effects)];
      for (const e of effects) for (const r of e.regions ?? []) expect(scope.has(r), `${event.id}: ${r}`).toBe(true);
    }
  });

  it('todo efeito respeita os limites de magnitude e duração', () => {
    const problems: string[] = [];
    for (const event of EVENTS) {
      event.onFire.forEach((e, i) => problems.push(...checkEffect(e, `${event.id}.onFire[${i}]`)));
      for (const choice of event.choices) {
        choice.effects.forEach((e, i) => problems.push(...checkEffect(e, `${event.id}.${choice.id}[${i}]`)));
      }
    }
    expect(problems).toEqual([]);
  });
});
