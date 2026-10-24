import { describe, expect, it } from 'vitest';
import { frameIntervals, intervalsToCsv, mergeFrames, parseLatency, percentile, summarize } from './parseLatency.mjs';

const MAX = '9223372036854775807';
const T0 = 100_000_000_000;
const ns = (t) => Math.round(t * 1e6);
const row = (t) => `${T0 + ns(t - 1)}\t${T0 + ns(t)}\t${T0 + ns(t + 1)}`;
// Amostra no formato real (CRLF do adb): refresh 16,6 ms; 5 quadros reais, uma linha zerada e duas pendentes.
const SAMPLE = [
  '16666666',
  row(0),
  row(16),
  row(33),
  row(150), // 117 ms: quadro longo
  row(1000), // 850 ms: pausa (ignorada)
  '0\t0\t0',
  `${MAX}\t${MAX}\t${MAX}`,
  `${T0}\t${MAX}\t${MAX}`,
  '',
].join('\r\n');

describe('parseLatency', () => {
  it('lê o período e ignora linhas vagas/pendentes', () => {
    const p = parseLatency(SAMPLE);
    expect(p.refreshNs).toBe(16666666);
    expect(p.frames).toHaveLength(5);
  });
  it('tolera texto vazio ou lixo', () => {
    expect(parseLatency('')).toEqual({ refreshNs: null, frames: [] });
    expect(parseLatency('error: closed\nfoo bar baz').frames).toEqual([]);
  });
});

describe('mergeFrames', () => {
  it('deduplica janelas sobrepostas e ordena', () => {
    const a = parseLatency(SAMPLE).frames;
    const merged = mergeFrames([a.slice(0, 3), a.slice(1), a]);
    expect(merged).toHaveLength(5);
    const presents = merged.map((f) => f.present);
    expect(presents).toEqual([...presents].sort((x, y) => x - y));
  });
});

describe('estatísticas', () => {
  const frames = parseLatency(SAMPLE).frames;
  it('descarta pausas > 500 ms e conta quadros longos', () => {
    const { intervals, idleGaps } = frameIntervals(frames);
    expect(idleGaps).toBe(1);
    expect(intervals.map((i) => Math.round(i.ms))).toEqual([16, 17, 117]);
    const s = summarize(frames);
    expect(s.jank).toBe(1);
    expect(s.frames).toBe(5);
    expect(s.max).toBeCloseTo(117, 5);
    expect(s.fps).toBeCloseTo(3 / 0.15, 5);
  });
  it('percentis por interpolação', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(25);
    expect(percentile([5], 99)).toBe(5);
    expect(percentile([], 50)).toBeNull();
  });
  it('repouso (sem quadros) não quebra', () => {
    const s = summarize([]);
    expect(s.frames).toBe(0);
    expect(s.fps).toBeNull();
    expect(s.p95).toBeNull();
  });
  it('CSV tem cabeçalho e uma linha por intervalo', () => {
    const lines = intervalsToCsv(frames).trim().split('\n');
    expect(lines[0]).toBe('t_ms,intervalo_ms');
    expect(lines).toHaveLength(4);
  });
});
