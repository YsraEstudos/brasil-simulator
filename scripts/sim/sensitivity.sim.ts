import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { PARAMS, type ParamName } from '@/engine/economy/calibration';
import { runCampaign, type CampaignSummary } from '@/engine/sim/campaign';
import { STRATEGIES } from '@/engine/sim/strategies';
import type { GameContent } from '@/engine/types';

// ECONOMIC_MODEL.md §6 e §9, `npm run sim:sensitivity`: cada parâmetro com faixa é levado ao mínimo e ao máximo,
// com os demais no valor padrão, em campanhas de 20 anos. Gera docs/CALIBRATION.md (fonte, faixa testada e
// resultado de sensibilidade de cada parâmetro). Script de diagnóstico: grava arquivo e usa console.log.

const SEEDS = [1, 2, 3];
const MONTHS = 240;
// A fisiológica exercita os parâmetros do Congresso e dos ministérios (Fase 04).
const STRATEGY_IDS = ['inerte', 'populista_fiscal', 'fisiologica'];
/** Faixas de explosão: acima disto a combinação é considerada instável (ECONOMIC_MODEL.md §9). */
const MAX_INFLATION = 0.3;
const MAX_DEBT = 5;

const OUTPUT = fileURLToPath(new URL('../../docs/CALIBRATION.md', import.meta.url));

interface Outcome {
  violations: number;
  debtEnd: number;
  inflation: number;
  worstInflation: number;
  worstDebt: number;
}

function evaluate(content: GameContent): Outcome {
  const runs: CampaignSummary[] = [];
  for (const id of STRATEGY_IDS) {
    const strategy = STRATEGIES.find((s) => s.id === id);
    if (!strategy) throw new Error(`estratégia ausente: ${id}`);
    for (const seed of SEEDS) runs.push(runCampaign(strategy, seed, MONTHS, content));
  }
  const mean = (pick: (r: CampaignSummary) => number) => runs.reduce((s, r) => s + pick(r), 0) / runs.length;
  return {
    violations: runs.reduce((n, r) => n + r.violations.length, 0),
    debtEnd: mean((r) => r.grossDebtEnd),
    inflation: mean((r) => r.averages.inflation),
    worstInflation: Math.max(...runs.map((r) => r.max.inflation)),
    worstDebt: Math.max(...runs.map((r) => r.max.grossDebt)),
  };
}

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace('.', ',')}%`;
const pp = (x: number) => `${x >= 0 ? '+' : '−'}${(Math.abs(x) * 100).toFixed(1).replace('.', ',')}`;
const num = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(4)))).replace('.', ',');
const cell = (text: string) => text.replace(/\|/g, '/');

describe('sensibilidade da calibração (npm run sim:sensitivity)', () => {
  it('nenhum parâmetro no extremo da faixa gera violação ou explosão em 20 anos', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const baseline = evaluate(content);
    const rows: string[] = [];
    const problems: string[] = [];

    for (const [name, spec] of Object.entries(PARAMS) as [ParamName, (typeof PARAMS)[ParamName]][]) {
      const tested = spec.min !== spec.max;
      let result = 'fixo (regra legal ou saturação)';
      if (tested) {
        const at = (value: number) => evaluate({ ...content, calibration: { ...content.calibration, [name]: value } });
        const low = at(spec.min);
        const high = at(spec.max);
        for (const [label, o] of [
          ['mín', low],
          ['máx', high],
        ] as const) {
          if (o.violations > 0) problems.push(`${name} no ${label}: ${o.violations} violações`);
          if (o.worstInflation > MAX_INFLATION) problems.push(`${name} no ${label}: inflação ${pct(o.worstInflation)}`);
          if (o.worstDebt > MAX_DEBT) problems.push(`${name} no ${label}: dívida ${pct(o.worstDebt, 0)}`);
        }
        result =
          `dívida final ${pct(low.debtEnd, 0)} → ${pct(high.debtEnd, 0)} (${pp(high.debtEnd - low.debtEnd)} p.p.); ` +
          `inflação média ${pct(low.inflation)} → ${pct(high.inflation)}; ` +
          `violações ${low.violations + high.violations}`;
      }
      rows.push(
        `| \`${name}\` | ${num(spec.value)} | ${tested ? `${num(spec.min)} – ${num(spec.max)}` : '—'} | ` +
          `${cell(spec.note)} | ${cell(spec.basis)} | ${result} |`,
      );
    }

    const doc = [
      '# Brasil Simulator — Calibração do motor',
      '',
      'Arquivo **gerado** por `npm run sim:sensitivity` (scripts/sim/sensitivity.sim.ts); não editar à mão.',
      'Fonte dos valores: `src/engine/economy/calibration.ts`. Todos os valores são `PROVISORIO` até a importação das',
      'séries oficiais ([DATA_SOURCES.md](DATA_SOURCES.md) §4); a justificativa de cada um está na coluna "Base".',
      '',
      '## Método',
      '',
      `Cada parâmetro com faixa é levado ao mínimo e ao máximo, com os demais no padrão, em campanhas de ${MONTHS}`,
      `meses das estratégias ${STRATEGY_IDS.map((s) => `\`${s}\``).join(' e ')} com as sementes ${SEEDS.join(', ')}`,
      `no cenário \`${DEFAULT_SCENARIO_ID}\`. O resultado mostra a dívida/PIB final média e a inflação média nos dois`,
      `extremos e o total de violações de invariantes. Critério de estabilidade: nenhuma violação, inflação abaixo de`,
      `${pct(MAX_INFLATION, 0)} e dívida abaixo de ${pct(MAX_DEBT, 0)} do PIB em todas as campanhas`,
      '([ECONOMIC_MODEL.md](ECONOMIC_MODEL.md) §9).',
      '',
      `Referência (todos no padrão): dívida final ${pct(baseline.debtEnd, 0)}, inflação média ${pct(baseline.inflation)},`,
      `violações ${baseline.violations}.`,
      '',
      `Resultado: ${problems.length === 0 ? 'todos os extremos estáveis.' : `${problems.length} problemas:`}`,
      ...problems.map((p) => `- ${p}`),
      '',
      '## Parâmetros',
      '',
      '| Parâmetro | Valor | Faixa testada | Significado | Base | Sensibilidade |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows,
      '',
    ].join('\n');
    writeFileSync(OUTPUT, doc, 'utf8');
    console.log(`\ndocs/CALIBRATION.md gravado: ${rows.length} parâmetros, ${problems.length} problemas.\n`);
    for (const p of problems) console.log(`  ${p}`);

    expect(problems).toEqual([]);
  });
});
