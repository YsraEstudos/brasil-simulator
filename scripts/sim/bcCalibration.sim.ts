import { expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { runCampaign } from '@/engine/sim/campaign';
import { STRATEGIES } from '@/engine/sim/strategies';

it('diagnóstico de sensibilidade: pressão trimestral no BC por 240 meses', () => {
  const content = loadContent(DEFAULT_SCENARIO_ID);
  const pressure = STRATEGIES.find((s) => s.id === 'inerte_pressao_bc')!;
  const quiet = STRATEGIES.find((s) => s.id === 'inerte')!;
  const variants = [
    { label: 'anterior: custo 0.05', calibration: { ...content.calibration, custo_cred_pressao: 0.05 } },
    { label: 'PR14: custo 0.01', calibration: content.calibration },
    ...[0.005, 0.015].map((value) => ({
      label: `sensibilidade: custo ${value}`,
      calibration: { ...content.calibration, custo_cred_pressao: value },
    })),
  ];
  const rows = variants.flatMap((v) =>
    [1, 2, 3, 4, 5, 17, 2027].map((seed) => {
      const run = runCampaign(pressure, seed, 240, { ...content, calibration: v.calibration });
      expect(run.violations).toEqual([]);
      return {
        variant: v.label,
        seed,
        debt: run.grossDebtEnd,
        maxDebt: run.max.grossDebt,
        inflation: run.final.inflation12m,
        risk: run.riskPremiumEnd,
        selic: run.selicEnd,
      };
    }),
  );
  rows.push(
    ...[1, 2, 3, 4, 5, 17, 2027].map((seed) => {
      const run = runCampaign(quiet, seed, 240, content);
      return {
        variant: 'sem pressão',
        seed,
        debt: run.grossDebtEnd,
        maxDebt: run.max.grossDebt,
        inflation: run.final.inflation12m,
        risk: run.riskPremiumEnd,
        selic: run.selicEnd,
      };
    }),
  );
  for (const label of [...variants.map((v) => v.label), 'sem pressão']) {
    const group = rows.filter((r) => r.variant === label);
    console.log(
      JSON.stringify({
        label,
        maxDebt: Math.max(...group.map((r) => r.maxDebt)),
        meanDebt: group.reduce((sum, r) => sum + r.debt, 0) / group.length,
      }),
    );
  }
});
