import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, PROTOTYPE_MONTHS } from '@/content';
import { runCampaign, type StrategySummary, summarizeRuns } from '@/engine/sim/campaign';
import { STRATEGIES } from '@/engine/sim/strategies';

// ECONOMIC_MODEL.md §9, `npm run sim:balance`: tabela por estratégia para ajustar fórmulas e parâmetros.
// Script de diagnóstico: usa console.log por ser um relatório, não código do motor.

const SHORT_SEEDS = Array.from({ length: 50 }, (_, i) => i + 1);
const LONG_SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const LONG_MONTHS = 48;

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Tabela de uma faixa de horizonte; colunas na ordem pedida em ECONOMIC_MODEL.md §9. */
function formatTable(title: string, rows: readonly StrategySummary[]): string {
  const header = [
    'estratégia',
    'inflação média',
    'PIB 12m final',
    'desemprego médio',
    'dívida/PIB final',
    'primário 12m final',
    'aprovação média',
    'propostas aprovadas',
    'violações',
  ];
  const body = rows.map((r) => [
    r.strategyId,
    percent(r.meanInflation),
    percent(r.meanGdpGrowthEnd),
    percent(r.meanUnemployment),
    percent(r.meanGrossDebtEnd),
    percent(r.meanPrimaryEnd),
    percent(r.meanApproval),
    r.meanApprovedProposals.toFixed(1),
    String(r.violations),
  ]);
  const table = [header, ...body];
  const widths = header.map((_, col) => Math.max(...table.map((row) => (row[col] ?? '').length)));
  const line = (row: readonly string[]) => row.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join('  ');
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  return [title, line(header), rule, ...body.map(line)].join('\n');
}

describe('balanceamento das estratégias-robô (npm run sim:balance)', () => {
  it('roda cada estratégia em 50 sementes × 12 meses e 20 sementes × 48 meses, sem violação de invariante', () => {
    const content = loadContent(DEFAULT_SCENARIO_ID);

    const short = STRATEGIES.flatMap((s) => SHORT_SEEDS.map((seed) => runCampaign(s, seed, PROTOTYPE_MONTHS, content)));
    const long = STRATEGIES.flatMap((s) => LONG_SEEDS.map((seed) => runCampaign(s, seed, LONG_MONTHS, content)));

    const shortRows = summarizeRuns(short);
    const longRows = summarizeRuns(long);

    console.log(
      `\n${formatTable(`Horizonte ${PROTOTYPE_MONTHS} meses (${SHORT_SEEDS.length} sementes por estratégia)`, shortRows)}`,
    );
    console.log(
      `\n${formatTable(`Horizonte ${LONG_MONTHS} meses (${LONG_SEEDS.length} sementes por estratégia)`, longRows)}\n`,
    );

    const violations = [...shortRows, ...longRows].reduce((n, r) => n + r.violations, 0);
    expect(violations).toBe(0);
  });
});
