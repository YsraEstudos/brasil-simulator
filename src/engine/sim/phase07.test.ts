import { describe, expect, it } from 'vitest';

import { loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { eventsForScenario } from '@/engine/events/events';
import { campaignOutcome } from '@/engine/events/outcome';
import { impeachmentPressure } from '@/engine/events/pressure';
import { checkInvariants } from '@/engine/invariants';
import { NEWS_LIMIT } from '@/engine/news/calibration';
import { STRATEGIES, type Strategy } from '@/engine/sim/strategies';
import { createInitialState } from '@/engine/state';
import type { GameContent, GameState, NewsItem } from '@/engine/types';
import { upgradeGameState } from '@/engine/upgrade';

// FASE_07.md, tarefa T8: validação por simulação da Fase 07. Testes rápidos (poucos segundos); campanhas longas e
// varreduras maiores ficam em scripts/sim/events.sim.ts (`npm run sim:events`).
// Testes de regra citam a seção do documento. Quando o motor diverge do documento, o caso vira `it.fails` com a
// reprodução: passa enquanto o defeito existe e avisa quando for corrigido (AI_INSTRUCTIONS.md §5).

const content: GameContent = loadContent('brasil_2027_01_v060');
const contentV050: GameContent = loadContent('brasil_2027_01_v050');
const SEEDS = [1, 2, 3];
const MONTHS = 48;
const CHAIN_MONTHS = 240;
/** Limite PROVISORIO de plausibilidade para a pressão média de estratégias passivas (ver o script sim:events). */
const PASSIVE_MEAN_PRESSURE_MAX = 0.25;
/** Pressão acima deste valor já permite a denúncia sem nenhum erro do jogador (eventos fase07_inst_pedido_impeachment). */
const PASSIVE_PRESSURE_MAX = 0.5;

interface Campaign {
  strategyId: string;
  seed: number;
  state: GameState;
  violations: string[];
  fired: string[];
  /** Todas as notícias geradas na campanha, por id (o feed guarda só as últimas NEWS_LIMIT). */
  news: Map<string, NewsItem>;
  /** Maior tamanho do feed ao longo dos meses. */
  maxFeed: number;
  pressures: number[];
  condemnedAt: number | null;
}

/** Joga `months` meses; para na condenação (GAME_DESIGN.md §7.1), como a campanha real. */
function campaign(strategy: Strategy, seed: number, months: number, c: GameContent): Campaign {
  let state = createInitialState({ content: c, difficulty: 'estrategica', seed });
  const run: Campaign = {
    strategyId: strategy.id,
    seed,
    state,
    violations: [],
    fired: [],
    news: new Map(),
    maxFeed: 0,
    pressures: [],
    condemnedAt: null,
  };
  for (let m = 0; m < months; m++) {
    const result = advanceMonth(state, strategy.decide(state, c), c);
    for (const error of checkInvariants(state, result.state, result.report, c)) {
      run.violations.push(`mês ${state.monthIndex}: ${error}`);
    }
    run.fired.push(...result.report.eventsFired);
    for (const item of result.state.events.news) run.news.set(item.id, item);
    run.maxFeed = Math.max(run.maxFeed, result.state.events.news.length);
    run.pressures.push(impeachmentPressure(result.state, c));
    state = result.state;
    if (campaignOutcome(state) === 'impeachment') {
      run.condemnedAt = state.monthIndex;
      break;
    }
  }
  run.state = state;
  return run;
}

/** Sweep 48 meses, todas as estratégias × 3 sementes, cenário v0.6.0. Calculada uma vez e reaproveitada. */
let sweepCache: Campaign[] | undefined;
function sweep(): Campaign[] {
  sweepCache ??= STRATEGIES.flatMap((s) => SEEDS.map((seed) => campaign(s, seed, MONTHS, content)));
  return sweepCache;
}

const strategy = (id: string): Strategy => {
  const found = STRATEGIES.find((s) => s.id === id);
  if (!found) throw new Error(`estratégia desconhecida: ${id}`);
  return found;
};

describe('Fase 07: invariantes e determinismo nas campanhas-robô (FASE_07.md, critérios 2 e 4; AI_INSTRUCTIONS.md §5)', () => {
  it('todas as estratégias × 3 sementes, 48 meses, v0.6.0: nenhuma violação de invariante', () => {
    for (const run of sweep()) {
      expect(run.violations, `${run.strategyId} semente ${run.seed}`).toEqual([]);
    }
  });

  it('mesma semente gera o mesmo estado final, inclusive marcas, notícias e personagens', () => {
    for (const s of STRATEGIES) {
      const first = campaign(s, 2, MONTHS, content).state;
      const second = campaign(s, 2, MONTHS, content).state;
      expect(second, s.id).toEqual(first);
      expect(second.events.flags, s.id).toEqual(first.events.flags);
      expect(second.events.news, s.id).toEqual(first.events.news);
      expect(second.events.characters, s.id).toEqual(first.events.characters);
    }
  });
});

describe('Fase 07: cobertura de eventos (FASE_07.md, critério 2)', () => {
  it('somando estratégias e sementes, pelo menos 20 tipos de evento disparam em 48 meses', () => {
    const types = new Set(sweep().flatMap((r) => r.fired));
    expect(types.size).toBeGreaterThanOrEqual(20);
  });

  it('pelo menos 5 eventos fase07_* disparam nas mesmas campanhas', () => {
    const types = new Set(
      sweep()
        .flatMap((r) => r.fired)
        .filter((id) => id.startsWith('fase07_')),
    );
    expect(types.size).toBeGreaterThanOrEqual(5);
  });

  it('pelo menos 3 eventos encadeados (chainedOnly) chegam à caixa de entrada em uma campanha de 240 meses', () => {
    // Campanha de 240 meses (ECONOMIC_MODEL.md §9): o encadeamento depende de cadeias que levam meses para
    // se formar. Para numa condenação, como a campanha real.
    const chained = new Set(content.events.filter((e) => e.chainedOnly).map((e) => e.id));
    const found = STRATEGIES.some((s) =>
      SEEDS.slice(0, 2).some((seed) => {
        const run = campaign(s, seed, CHAIN_MONTHS, content);
        return new Set(run.fired.filter((id) => chained.has(id))).size >= 3;
      }),
    );
    expect(found).toBe(true);
  });
});

describe('Fase 07: notícias (FASE_07.md, critério 3; GAME_DESIGN.md §11.3)', () => {
  it('toda notícia tem causa não vazia, no formato "Causa: ..."', () => {
    for (const run of sweep()) {
      for (const item of run.news.values()) {
        expect(item.cause, `${run.strategyId} s${run.seed} ${item.id}`).toMatch(/^Causa: .+/);
      }
    }
  });

  it('o feed nunca passa de NEWS_LIMIT e é cortado nesse limite quando há mais manchetes', () => {
    for (const run of sweep()) {
      expect(run.maxFeed, `${run.strategyId} s${run.seed}`).toBeLessThanOrEqual(NEWS_LIMIT);
      expect(run.state.events.news.length).toBeLessThanOrEqual(NEWS_LIMIT);
      if (run.news.size > NEWS_LIMIT) expect(run.state.events.news.length).toBe(NEWS_LIMIT);
    }
  });

  it('uma campanha de 48 meses tem manchetes de pelo menos 3 tipos (kind)', () => {
    const kindsOf = (run: Campaign) => new Set([...run.news.values()].map((n) => n.kind));
    expect(sweep().some((run) => kindsOf(run).size >= 3)).toBe(true);
  });

  // FASE_07.md, critério 3: causa rastreável também para encadeado com atraso de 1 mês (a origem está no relatório).
  it('causa de evento encadeado com atraso de 1 mês aponta a escolha que o originou', () => {
    const run = campaign(strategy('fisiologica'), 2, 6, content);
    const cpi = [...run.news.values()].find((n) => n.sourceId === 'fase07_inst_cpi_instalada' && n.kind === 'evento');
    expect(cpi?.cause).toMatch(/consequência de/);
  });
});

describe('Fase 07: persistência de marcas (FASE_07.md, estado v7; AI_INSTRUCTIONS.md §3)', () => {
  it('marcas gravadas numa campanha sobrevivem a JSON e a upgradeGameState(7, ...)', () => {
    const run = campaign(strategy('fisiologica'), 1, MONTHS, content);
    const flags = run.state.events.flags;
    expect(Object.keys(flags).length).toBeGreaterThan(0);

    const saved = JSON.parse(JSON.stringify(run.state)) as unknown;
    expect((saved as GameState).events.flags).toEqual(flags);

    const upgraded = upgradeGameState(7, saved);
    expect(upgraded.events.flags).toEqual(flags);
    expect(upgraded.events.characters).toEqual(run.state.events.characters);
    expect(upgraded.events.news).toEqual(run.state.events.news);
  });
});

describe('Fase 07: isolamento do cenário v0.5.0 (AI_INSTRUCTIONS.md §8)', () => {
  it('no cenário brasil_2027_01_v050, nenhum evento fase07_* dispara em 48 meses', () => {
    for (const s of STRATEGIES) {
      for (const seed of SEEDS) {
        const run = campaign(s, seed, MONTHS, contentV050);
        expect(run.fired.length, `${s.id} s${seed} dispara algum evento`).toBeGreaterThan(0);
        expect(
          run.fired.filter((id) => id.startsWith('fase07_')),
          `${s.id} s${seed}`,
        ).toEqual([]);
        expect(run.violations, `${s.id} s${seed}`).toEqual([]);
      }
    }
  });
});

describe('Fase 08: herança de eventos do cenário padrão v0.7.0 (achado da revisão do PR #9)', () => {
  it('o v0.7.0 recebe exatamente o conjunto de eventos do v0.6.0, inclusive os fase07_*', () => {
    const contentV070: GameContent = loadContent('brasil_2027_01_v070');
    const ids = (scenarioId: string) => eventsForScenario(contentV070.events, scenarioId).map((e) => e.id);
    expect(ids('brasil_2027_01_v070')).toEqual(ids('brasil_2027_01_v060'));
    expect(ids('brasil_2027_01_v070').filter((id) => id.startsWith('fase07_')).length).toBeGreaterThanOrEqual(37);
  });
});

describe('Fase 07: pressão de impeachment (POLITICAL_RULES.md §10; FASE_07.md)', () => {
  it('em estratégias passivas, a pressão média e a máxima de 48 meses ficam em faixa plausível', () => {
    for (const id of ['inerte', 'populista_fiscal']) {
      for (const seed of SEEDS) {
        const run = sweep().find((r) => r.strategyId === id && r.seed === seed);
        if (!run) throw new Error(`campanha ausente: ${id} s${seed}`);
        const mean = run.pressures.reduce((a, b) => a + b, 0) / run.pressures.length;
        const max = Math.max(...run.pressures);
        expect(mean, `${id} s${seed} média`).toBeLessThanOrEqual(PASSIVE_MEAN_PRESSURE_MAX);
        expect(max, `${id} s${seed} máxima`).toBeLessThanOrEqual(PASSIVE_PRESSURE_MAX);
        expect(max, `${id} s${seed} máxima`).toBeLessThanOrEqual(1);
        expect(max, `${id} s${seed} máxima`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
