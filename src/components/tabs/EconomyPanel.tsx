import { monthLabel } from '@/components/campaign/labels';
import { Card, formatNumber, formatPercent, Text } from '@/components/ui';
import { loadContent } from '@/content';
import type { ActiveCampaign } from '@/store';

import { signedPercent, StatRow } from './StatRow';

const PER_GDP = '% do PIB, anualizado';

/** Painel da aba Economia (GAME_DESIGN.md §8). Variações só existem para indicadores do protótipo. */
export function EconomyPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { state, previous, lastReport } = campaign;
  const { calibration } = loadContent(state.scenarioId);
  const e = state.economy;
  const ind = state.indicators;
  const change = (key: keyof typeof ind) => (previous ? ind[key] - previous[key] : undefined);

  const copomText = (() => {
    if (!lastReport) return 'Nenhum mês encerrado ainda.';
    if (!lastReport.copom) return 'Sem reunião do Copom no último mês encerrado.';
    const { previous: before, next } = lastReport.copom;
    const month = monthLabel(lastReport.monthIndex);
    if (next === before) return `${month}: Copom manteve a Selic em ${formatPercent(next, 2)}.`;
    return `${month}: Copom ${next < before ? 'cortou' : 'elevou'} a Selic de ${formatPercent(before, 2)} para ${formatPercent(next, 2)}.`;
  })();

  return (
    <>
      <Text variant="caption" color="textSecondary">
        Valores provisórios: o cenário ainda não usa dados oficiais importados.
      </Text>

      <Card title="Juros e preços">
        <StatRow label="Selic" value={formatPercent(e.selic, 2)} context="Meta anual" />
        <StatRow
          label="Expectativa de inflação"
          value={formatPercent(e.inflationExpectation, 1)}
          context="Próximos 12 meses"
        />
        <StatRow
          label="Inflação em 12 meses"
          value={formatPercent(ind.inflation12m, 1)}
          delta={change('inflation12m')}
          goodWhen="down"
          context={`meta ${formatPercent(calibration.meta_inflacao, 1)} ± ${formatNumber(calibration.tolerancia_meta * 100, 1)} p.p.`}
        />
        <StatRow label="Juro real efetivo" value={formatPercent(e.effectiveRealRate, 2)} />
      </Card>

      <Card title="Atividade">
        <StatRow
          label="PIB em 12 meses"
          value={formatPercent(ind.gdpGrowth12m, 1)}
          delta={change('gdpGrowth12m')}
          goodWhen="up"
        />
        <StatRow label="Hiato do produto" value={signedPercent(e.outputGap, 1)} context="Em relação ao PIB potencial" />
        <StatRow label="Crescimento potencial" value={formatPercent(e.potentialGrowth, 1)} context="Ao ano" />
        <StatRow
          label="Desemprego"
          value={formatPercent(ind.unemployment, 1)}
          delta={change('unemployment')}
          goodWhen="down"
          context="Fração da força de trabalho"
        />
      </Card>

      <Card title="Contas públicas" subtitle="Fluxos em % do PIB, anualizados, salvo indicação">
        <StatRow label="Receita primária" value={formatPercent(e.revenue, 1)} context={PER_GDP} />
        <StatRow label="Despesa primária" value={formatPercent(e.primarySpending, 1)} context={PER_GDP} />
        <StatRow label="Resultado primário do mês" value={signedPercent(e.monthlyPrimary, 1)} context={PER_GDP} />
        <StatRow
          label="Resultado primário em 12 meses"
          value={signedPercent(ind.primaryBalance12m, 1)}
          delta={change('primaryBalance12m')}
          goodWhen="up"
          context="% do PIB, acumulado em 12 meses"
        />
        <StatRow label="Juros nominais" value={formatPercent(e.interest, 1)} context={PER_GDP} />
        <StatRow label="Dívida bruta" value={formatPercent(e.grossDebt, 1)} context="% do PIB" />
        <StatRow label="Credibilidade" value={formatNumber(e.credibility * 100, 0)} context="Índice de 0 a 100" />
      </Card>

      <Card title="Último Copom">
        <Text variant="body">{copomText}</Text>
      </Card>
    </>
  );
}
