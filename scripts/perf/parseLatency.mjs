// Leitura e estatística da saída de `adb shell dumpsys SurfaceFlinger --latency "<camada>"`.
// Sem dependências; usado por medir-globo.ps1 (CLI no fim do arquivo) e testado em parseLatency.test.mjs.
// Formato: 1ª linha = período de refresh (ns); depois até 128 linhas "desired actualPresent frameReady" (ns).
// Linhas com 0, negativo ou ~INT64_MAX (9223372036854775807) são vagas/pendentes e são ignoradas.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Acima disso o valor é o marcador INT64_MAX ("ainda não apresentado"). */
const PENDING_THRESHOLD = 1e18;
/** Pausa maior que isto entre dois quadros = laço parado (renderização sob demanda), não conta. Mesmo valor de frameStats.ts. */
export const IDLE_GAP_MS = 500;
/** Quadro longo (jank). */
export const JANK_MS = 100;

/**
 * @param {string} text saída de uma consulta --latency
 * @returns {{ refreshNs: number | null, frames: { desired: number, present: number, ready: number }[] }}
 */
export function parseLatency(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let refreshNs = null;
  const frames = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length === 1 && /^\d+$/.test(parts[0])) {
      if (refreshNs === null) refreshNs = Number(parts[0]);
      continue;
    }
    if (parts.length !== 3 || !parts.every((p) => /^-?\d+$/.test(p))) continue;
    const [desired, present, ready] = parts.map(Number);
    if (!(present > 0) || present >= PENDING_THRESHOLD) continue;
    frames.push({ desired, present, ready });
  }
  return { refreshNs, frames };
}

/** Junta consultas sucessivas (janelas de 128 quadros se sobrepõem): deduplica por instante de apresentação e ordena. */
export function mergeFrames(batches) {
  const seen = new Set();
  const out = [];
  for (const batch of batches) {
    for (const f of batch) {
      if (seen.has(f.present)) continue;
      seen.add(f.present);
      out.push(f);
    }
  }
  return out.sort((a, b) => a.present - b.present);
}

/**
 * Intervalos entre apresentações consecutivas, em ms. Pausas > idleGapMs são descartadas (e contadas).
 * @returns {{ intervals: { tMs: number, ms: number }[], idleGaps: number }}
 */
export function frameIntervals(frames, idleGapMs = IDLE_GAP_MS) {
  const intervals = [];
  let idleGaps = 0;
  for (let i = 1; i < frames.length; i++) {
    const ms = (frames[i].present - frames[i - 1].present) / 1e6;
    if (ms <= 0) continue;
    if (ms > idleGapMs) {
      idleGaps++;
      continue;
    }
    intervals.push({ tMs: (frames[i].present - frames[0].present) / 1e6, ms });
  }
  return { intervals, idleGaps };
}

/** Percentil por interpolação linear (p em 0..100). Vazio → null. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (Math.min(Math.max(p, 0), 100) / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Estatísticas finais sobre os quadros já deduplicados. */
export function summarize(frames, idleGapMs = IDLE_GAP_MS) {
  const { intervals, idleGaps } = frameIntervals(frames, idleGapMs);
  const ms = intervals.map((i) => i.ms);
  const activeMs = ms.reduce((a, b) => a + b, 0);
  return {
    frames: frames.length,
    intervals: ms.length,
    idleGaps,
    activeSeconds: activeMs / 1000,
    fps: activeMs > 0 ? ms.length / (activeMs / 1000) : null,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    p99: percentile(ms, 99),
    max: ms.length ? Math.max(...ms) : null,
    jank: ms.filter((v) => v > JANK_MS).length,
  };
}

/** CSV dos intervalos brutos: instante relativo ao 1º quadro e intervalo, ambos em ms. */
export function intervalsToCsv(frames, idleGapMs = IDLE_GAP_MS) {
  const rows = frameIntervals(frames, idleGapMs).intervals.map((i) => `${i.tMs.toFixed(3)},${i.ms.toFixed(3)}`);
  return ['t_ms,intervalo_ms', ...rows].join('\n') + '\n';
}

// CLI: node parseLatency.mjs [--csv saida.csv] [--idle 500] [--lista arquivos.txt] arquivo1 [arquivo2 ...]  → JSON no stdout
function main(argv) {
  const files = [];
  let csv = null;
  let idle = IDLE_GAP_MS;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--csv') csv = argv[++i];
    else if (argv[i] === '--idle') idle = Number(argv[++i]);
    else if (argv[i] === '--lista') files.push(...readFileSync(argv[++i], 'utf8').split(/\r?\n/).filter(Boolean));
    else files.push(argv[i]);
  }
  const parsed = files.map((f) => parseLatency(readFileSync(f, 'utf8')));
  const frames = mergeFrames(parsed.map((p) => p.frames));
  if (csv) writeFileSync(csv, intervalsToCsv(frames, idle));
  const refreshNs = parsed.find((p) => p.refreshNs !== null)?.refreshNs ?? null;
  process.stdout.write(JSON.stringify({ refreshNs, ...summarize(frames, idle) }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
