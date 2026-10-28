import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth } from '@/engine/advanceMonth';
import { checkInvariants } from '@/engine/invariants';
import { createInitialState } from '@/engine/state';
import { PLAYER_CANDIDATE_ID, ballotOptions, candidateIdentities } from '@/engine/career/opponents';
import { nationalRecognition } from '@/engine/career/viability';
import { CAREER_PARAMS } from '@/engine/career/calibration';
import type { GameContent } from '@/engine/types';

// Pré-registro: docs/DIAGNOSTICO_CAMPANHA.md, investigação do domínio central.
const original = loadContent(DEFAULT_SCENARIO_ID);
const seeds = Array.from({ length: 200 }, (_, i) => i + 301);
const blocks = original.scenario.career!.opponents.map((o) => o.blocId);
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
function synthetic(blocId: string): GameContent {
  const scenario = original.scenario;
  const career = scenario.career!;
  return {
    ...original,
    scenario: { ...scenario, career: { ...career, profiles: [{ ...career.profiles[0], blocId }] } },
  };
}
function run(content: GameContent, seed: number, mobilize = true, action = 'mobilizar_militancia') {
  let state = createInitialState({ content, difficulty: 'estrategica', seed, startPoint: 'corrida' });
  let rejected = 0,
    violations = 0;
  for (let turn = 0; turn < 3; turn++) {
    const result = advanceMonth(
      state,
      { decisions: mobilize ? [{ policyId: action, agendaCost: 0, params: { bolso: 'party' } }] : [] },
      content,
    );
    rejected += result.report.rejected.length;
    violations += checkInvariants(state, result.state, result.report, content).length;
    state = result.state;
  }
  const election = state.career!.election!;
  const first = election.first;
  const player = first.candidates.indexOf(PLAYER_CANDIDATE_ID);
  const second = election.second;
  const player2 = second?.candidates.indexOf(PLAYER_CANDIDATE_ID) ?? -1;
  return {
    won: election.winner === PLAYER_CANDIDATE_ID,
    rejected,
    violations,
    rank: 1 + first.votes.filter((votes) => votes > first.votes[player]).length,
    first: first.votes[player] / first.votes.reduce((a, b) => a + b, 0),
    runoff: player2 >= 0 ? second!.votes[player2] / second!.votes.reduce((a, b) => a + b, 0) : null,
    finalist: player2 >= 0 ? second!.candidates.find((id) => id !== PLAYER_CANDIDATE_ID)! : 'jogador ausente',
  };
}
function wilson(k: number, n: number) {
  const z = 1.96,
    p = k / n,
    d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / d;
  return `${(100 * (c - h)).toFixed(1)}–${(100 * (c + h)).toFixed(1)}%`;
}
describe('investigação eleitoral C8', () => {
  it('compara blocos sintéticos usando sementes e decisões pareadas', () => {
    for (const bloc of blocks) {
      const content = synthetic(bloc);
      const initial = createInitialState({ content, difficulty: 'estrategica', seed: 301, startPoint: 'corrida' });
      const career = initial.career!;
      const ids = candidateIdentities(career, content).map((c) => c.id);
      const ufs = content.scenario.regions!.ufs;
      const options = ufs.map((u) => ballotOptions(career, content, u.id));
      const rows = seeds.map((seed) => run(content, seed));
      expect(rows.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
      const wins = rows.filter((r) => r.won).length;
      const runoff = rows.flatMap((r) => (r.runoff === null ? [] : [r.runoff]));
      const finalists = Object.fromEntries(
        [...new Set(rows.map((r) => r.finalist))].map((id) => [id, rows.filter((r) => r.finalist === id).length]),
      );
      const weights = ids.map((id, i) => `${id}:${mean(options.map((v) => v[i].weight)).toFixed(3)}`).join(',');
      console.log(
        `${bloc}: n=${rows.length} vitórias=${wins} IC95%=${wilson(wins, rows.length)} 1t=${(100 * mean(rows.map((r) => r.first))).toFixed(2)}% posições=${JSON.stringify(Object.fromEntries([1, 2, 3, 4, 5].map((rank) => [rank, rows.filter((r) => r.rank === rank).length])))} 2t=${runoff.length ? `${(100 * mean(runoff)).toFixed(2)}% [${(100 * Math.min(...runoff)).toFixed(2)}–${(100 * Math.max(...runoff)).toFixed(2)}]` : 'ausente'} finalistas=${JSON.stringify(finalists)} R_inicial=${nationalRecognition(career.recognition, ufs).toFixed(3)} pesos_ufs=${weights}`,
      );
    }
  });
  it('isola coordenadas ideológicas do bloco do jogador mantendo adversários', () => {
    const playerBlock = original.scenario.career!.profiles[0].blocId;
    for (const bloc of blocks) {
      const ideology = original.scenario.blocs.find((b) => b.id === bloc)!.ideology;
      const content: GameContent = {
        ...original,
        scenario: {
          ...original.scenario,
          blocs: original.scenario.blocs.map((b) => (b.id === playerBlock ? { ...b, ideology } : b)),
        },
      };
      const rows = seeds.map((seed) => run(content, seed));
      expect(rows.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
      const wins = rows.filter((r) => r.won).length;
      console.log(
        `ideologia ${bloc}: n=${rows.length} vitórias=${wins} IC95%=${wilson(wins, rows.length)} 1t=${(100 * mean(rows.map((r) => r.first))).toFixed(2)}%`,
      );
      const idle = seeds.map((seed) => run(content, seed, false));
      expect(idle.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
      const idleWins = idle.filter((r) => r.won).length;
      console.log(
        `ideologia ${bloc} inerte: n=${idle.length} vitórias=${idleWins} IC95%=${wilson(idleWins, idle.length)} 1t=${(100 * mean(idle.map((r) => r.first))).toFixed(2)}%`,
      );
    }
  });
  it('mede sensibilidade ao peso do alinhamento e restaura o valor', () => {
    const spec = CAREER_PARAMS.alinhamento_peso;
    const originalValue = spec.value;
    const playerBlock = original.scenario.career!.profiles[0].blocId;
    const freshSeeds = Array.from({ length: 200 }, (_, i) => i + 501);
    try {
      for (const weight of [0, 0.25, 0.5, 0.75, 1]) {
        Object.defineProperty(spec, 'value', { value: weight, writable: true, configurable: true });
        for (const bloc of ['esquerda', 'centro', 'direita']) {
          const ideology = original.scenario.blocs.find((b) => b.id === bloc)!.ideology;
          const content: GameContent = {
            ...original,
            scenario: {
              ...original.scenario,
              blocs: original.scenario.blocs.map((b) => (b.id === playerBlock ? { ...b, ideology } : b)),
            },
          };
          const rows = freshSeeds.map((seed) => run(content, seed, false));
          expect(rows.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
          const wins = rows.filter((r) => r.won).length;
          console.log(
            `peso=${weight} ideologia=${bloc}: vitórias=${wins}/${rows.length} IC95%=${wilson(wins, rows.length)} 1t=${(100 * mean(rows.map((r) => r.first))).toFixed(2)}%`,
          );
        }
      }
    } finally {
      Object.defineProperty(spec, 'value', { value: originalValue, writable: true, configurable: true });
    }
    expect(CAREER_PARAMS.alinhamento_peso.value).toBe(originalValue);
  });
  it('valida em novas sementes a faixa provisória do perfil inerte', () => {
    const freshSeeds = Array.from({ length: 200 }, (_, i) => i + 701);
    const playerBlock = original.scenario.career!.profiles[0].blocId;
    const wins: number[] = [];
    for (const bloc of ['esquerda', 'centro', 'direita']) {
      const ideology = original.scenario.blocs.find((b) => b.id === bloc)!.ideology;
      const content: GameContent = {
        ...original,
        scenario: {
          ...original.scenario,
          blocs: original.scenario.blocs.map((b) => (b.id === playerBlock ? { ...b, ideology } : b)),
        },
      };
      const rows = freshSeeds.map((seed) => run(content, seed, false));
      expect(rows.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
      const won = rows.filter((r) => r.won).length;
      wins.push(won);
      console.log(`validação ${bloc}: ${won}/200 IC95%=${wilson(won, rows.length)}`);
    }
    expect(wins[1]).toBeGreaterThanOrEqual(80);
    expect(wins[1]).toBeLessThanOrEqual(170);
    for (const i of [0, 2]) {
      expect(wins[i]).toBeGreaterThanOrEqual(10);
      expect(wins[i]).toBeLessThanOrEqual(170);
    }
    expect(Math.max(...wins) - Math.min(...wins)).toBeLessThanOrEqual(100);
  });
  it('mede sensibilidade da mobilização e restaura o valor', () => {
    const spec = CAREER_PARAMS.acao_mobilizacao;
    const originalValue = spec.value;
    const exploratorySeeds = Array.from({ length: 200 }, (_, i) => i + 901);
    try {
      for (const value of [0.02, 0.04, 0.06, 0.08]) {
        Object.defineProperty(spec, 'value', { value, writable: true, configurable: true });
        const rows = exploratorySeeds.map((seed) => run(original, seed));
        const won = rows.filter((r) => r.won).length;
        expect(rows.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
        console.log(
          `mobilização=${value}: ${won}/200 IC95%=${wilson(won, rows.length)} 1t=${(100 * mean(rows.map((r) => r.first))).toFixed(2)}%`,
        );
      }
    } finally {
      Object.defineProperty(spec, 'value', { value: originalValue, writable: true, configurable: true });
    }
  });
  it('valida o efeito provisório da mobilização em novas sementes', () => {
    const freshSeeds = Array.from({ length: 200 }, (_, i) => i + 1101);
    const active = freshSeeds.map((seed) => run(original, seed));
    const idle = freshSeeds.map((seed) => run(original, seed, false));
    expect([...active, ...idle].reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
    const won = active.filter((r) => r.won).length;
    console.log(
      `validação mobilização: ${won}/200 IC95%=${wilson(won, active.length)} 1t=${(100 * mean(active.map((r) => r.first))).toFixed(2)}% inerte=${(100 * mean(idle.map((r) => r.first))).toFixed(2)}%`,
    );
    expect(won).toBeGreaterThanOrEqual(80);
    expect(won).toBeLessThanOrEqual(190);
    expect(mean(active.map((r) => r.first))).toBeGreaterThan(mean(idle.map((r) => r.first)));
  });
  it('mede sensibilidade dos comícios e restaura o valor', () => {
    const spec = CAREER_PARAMS.acao_nacional;
    const saved = spec.value;
    const sample = Array.from({ length: 200 }, (_, i) => i + 1301);
    try {
      for (const value of [0.01, 0.02, 0.03, 0.04]) {
        Object.defineProperty(spec, 'value', { value, writable: true, configurable: true });
        const rows = sample.map((seed) => run(original, seed, true, 'comicio_nacional'));
        expect(rows.reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
        const wins = rows.filter((r) => r.won).length;
        console.log(
          `comício=${value}: ${wins}/200 IC95%=${wilson(wins, rows.length)} 1t=${(100 * mean(rows.map((r) => r.first))).toFixed(2)}%`,
        );
      }
    } finally {
      Object.defineProperty(spec, 'value', { value: saved, writable: true, configurable: true });
    }
  });
  it('valida a faixa provisória dos comícios em novas sementes', () => {
    const sample = Array.from({ length: 200 }, (_, i) => i + 1501);
    const active = sample.map((seed) => run(original, seed, true, 'comicio_nacional'));
    const idle = sample.map((seed) => run(original, seed, false));
    expect([...active, ...idle].reduce((n, r) => n + r.rejected + r.violations, 0)).toBe(0);
    const wins = active.filter((r) => r.won).length;
    console.log(
      `validação comícios: ${wins}/200 IC95%=${wilson(wins, active.length)} 1t=${(100 * mean(active.map((r) => r.first))).toFixed(2)}% inerte=${(100 * mean(idle.map((r) => r.first))).toFixed(2)}%`,
    );
    expect(wins).toBeGreaterThanOrEqual(80);
    expect(wins).toBeLessThanOrEqual(190);
    expect(mean(active.map((r) => r.first))).toBeGreaterThan(mean(idle.map((r) => r.first)));
  });
});
