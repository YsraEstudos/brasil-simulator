import { describe, expect, it } from 'vitest';
import { inspectIllicitTurn, type IllicitState } from './illicit';

// PLANO_CAMPANHA.md Fase C3: exposição, perigo limitado e um sorteio por turno.
const calibration = { decay: 0.5, sensitivity: 0.1, maxHazard: 0.4, monthlyLimit: 100 };
const empty: IllicitState = { exposure: 0, investigations: 0 };

describe('fiscalização de caixa 2', () => {
  it('calcula exposição acumulada e limita o perigo', () => {
    const first = inspectIllicitTurn(empty, 10, calibration, 12, 'corrida', 0);
    expect(first.hazard).toBeCloseTo(0.4);
    const noDiscovery = { exposure: 10, investigations: 0 };
    const second = inspectIllicitTurn(noDiscovery, 2, calibration, 12, 'corrida', 1);
    expect(second.exposureBeforeInspection).toBe(7);
    expect(second.hazard).toBeCloseTo(0.4);
    const falling = inspectIllicitTurn(noDiscovery, 0, { ...calibration, maxHazard: 1 }, 12, 'corrida', 1);
    expect(falling.exposureBeforeInspection).toBe(5);
    expect(falling.hazard).toBeCloseTo(1 - Math.exp(-0.5));
  });
  it('uma descoberta encerra a exposição, preserva o histórico e permite outra descoberta', () => {
    const certain = { ...calibration, sensitivity: 100, maxHazard: 1 };
    const first = inspectIllicitTurn(empty, 1, certain, 12, 'corrida', 0);
    expect(first.discovered).toBe(true);
    expect(first.state).toEqual({ exposure: 0, investigations: 1 });
    const next = inspectIllicitTurn(first.state, 1, certain, 12, 'corrida', 1);
    expect(next.discovered).toBe(true);
    expect(next.state).toEqual({ exposure: 0, investigations: 2 });
  });
  it('é determinística por turno e não permite volume acima do teto', () => {
    const a = inspectIllicitTurn(empty, 50, calibration, 123, 'corrida', 2);
    expect(inspectIllicitTurn(empty, 50, calibration, 123, 'corrida', 2)).toEqual(a);
    expect(() => inspectIllicitTurn(empty, 101, calibration, 123, 'corrida', 2)).toThrow();
    expect(() => inspectIllicitTurn(empty, -1, calibration, 123, 'corrida', 2)).toThrow();
  });
});

// PLANO_CAMPANHA.md Fase C3: trajetórias fictícias de exposição constante, crescente e decrescente.
it('perigo acompanha trajetórias fixas e nunca ultrapassa o teto', () => {
  const config = { decay: 0.5, sensitivity: 0.01, maxHazard: 0.3, monthlyLimit: 100 };
  const paths = [
    { initial: 20, volumes: [10, 10, 10], exposures: [20, 20, 20] },
    { initial: 0, volumes: [5, 10, 15], exposures: [5, 12.5, 21.25] },
    { initial: 0, volumes: [15, 5, 0], exposures: [15, 12.5, 6.25] },
  ];
  for (const path of paths) {
    let exposure = path.initial;
    for (const [turn, volume] of path.volumes.entries()) {
      const result = inspectIllicitTurn({ exposure, investigations: 0 }, volume, config, 12, 'corrida', turn);
      expect(result.exposureBeforeInspection).toBe(path.exposures[turn]);
      expect(result.hazard).toBeLessThanOrEqual(0.3);
      exposure = path.exposures[turn]; // trajetória hipotética sem descoberta, não previsão.
    }
  }
});

// PLANO_CAMPANHA.md §4: calibração de risco centralizada e com metadados.
it('usa parâmetros documentados quando o cenário não os sobrescreve', async () => {
  const { resolveIllicitCalibration, ILLICIT_PARAMS } = await import('./illicit');
  const resolved = resolveIllicitCalibration({});
  expect(resolved).toEqual({ decay: 0.5, sensitivity: 0.0002, maxHazard: 0.35, monthlyLimit: 1000 });
  expect(resolveIllicitCalibration({ decay: 0.2 }).decay).toBe(0.2);
  for (const param of Object.values(ILLICIT_PARAMS)) {
    expect(param.value).toBeGreaterThanOrEqual(param.min);
    expect(param.value).toBeLessThanOrEqual(param.max);
    expect(param.note.length).toBeGreaterThan(0);
    expect(param.basis.length).toBeGreaterThan(0);
  }
});
