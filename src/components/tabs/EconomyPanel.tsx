import { monthLabel } from '@/components/campaign/labels';
import { Card, formatNumber, formatPercent, Text } from '@/components/ui';
import { loadContent } from '@/content';
import {
  fiscalYear,
  MANDATORY_GROUPS,
  subnationalTransitionAt,
  taxBases,
  type MandatoryGroup,
  type RevenueGroup,
  type TaxBaseRow,
} from '@/engine';
import type { ActiveCampaign } from '@/store';

import { EducationPanel } from './EducationPanel';
import { SectorInvestmentsCard } from './SectorInvestments';
import { signedPercent, StatRow } from './StatRow';
import { SocietyPanel } from './SocietyPanel';

const PER_GDP = '% do PIB, anualizado';

const REVENUE_LABEL: Record<RevenueGroup, string> = {
  renda: 'Renda (IR e CSLL)',
  folha: 'Folha (previdência)',
  consumo: 'Consumo (CBS e Seletivo)',
  outras: 'IOF, comércio exterior e outras',
  royalties: 'Royalties e dividendos',
};

const MANDATORY_LABEL: Record<MandatoryGroup, string> = {
  previdencia: 'Previdência',
  beneficios: 'BPC, abono e seguro-desemprego',
  pessoal: 'Pessoal',
  outras: 'Demais obrigatórias',
};

/** Linha de contexto de uma base: do legal ao líquido e a composição em tributos (PLANO_EXPANSAO EX-11). */
function baseContext(row: TaxBaseRow): string {
  const d = row.detail;
  const parts = [`carga legal ${formatPercent(d.base, 2)}`];
  if (d.policy !== 0) parts.push(`medidas ${signedPercent(d.policy, 2)}`);
  parts.push(`ciclo ${signedPercent(d.cycle, 2)}`);
  if (d.loss > 0) parts.push(`perda −${formatPercent(d.loss, 2)}`);
  if (d.transfers > 0) parts.push(`repasses −${formatPercent(d.transfers, 2)}`);
  const tributes = row.tributes.map((t) => `${t.name} ${formatPercent(t.share, 0)}`).join(', ');
  return tributes ? `${parts.join(' · ')}. ${tributes} da carga legal` : parts.join(' · ');
}

/** Painel da aba Economia (GAME_DESIGN.md §8). Variações só existem para indicadores do protótipo. */
export function EconomyPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { state, previous, lastReport } = campaign;
  const content = loadContent(state.scenarioId);
  const { calibration } = content;
  const bases = taxBases(state, content);
  const year = fiscalYear(state.monthIndex);
  const ibs = subnationalTransitionAt(content.scenario.taxation, year);
  const e = state.economy;
  const f = e.fiscal;
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

      <Card title="Câmbio e risco">
        <StatRow label="Câmbio" value={`R$ ${formatNumber(e.exchangeRate, 2)}`} context="Por dólar" />
        <StatRow
          label="Depreciação em 12 meses"
          value={signedPercent(e.depreciation12m, 1)}
          context="Variação do câmbio"
        />
        <StatRow
          label="Prêmio de risco"
          value={formatPercent(e.riskPremium, 2)}
          context="Juro extra que o mercado cobra do país"
        />
        <StatRow label="Juro externo" value={formatPercent(e.externalRate, 2)} context="Referência internacional" />
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

      <Card title="Limite de despesas" subtitle="Regime Fiscal Sustentável (LC 200/2023), em % do PIB">
        <StatRow
          label="Limite"
          value={formatPercent(f.spendingLimit, 1)}
          context={`Cresce ${formatPercent(f.limitRealGrowth, 1)} acima da inflação neste ano`}
        />
        {MANDATORY_GROUPS.map((g) => (
          <StatRow key={g} label={MANDATORY_LABEL[g]} value={formatPercent(f.mandatory[g], 1)} context={PER_GDP} />
        ))}
        <StatRow label="Saúde, educação e emendas" value={formatPercent(f.linked, 1)} context="Vinculadas à receita" />
        {f.policyMandatory !== 0 && (
          <StatRow label="Obrigatórias de políticas" value={signedPercent(f.policyMandatory, 2)} context={PER_GDP} />
        )}
        <StatRow
          label="Discricionárias livres"
          value={formatPercent(f.discretionary, 2)}
          context={
            f.discretionary < calibration.piso_custeio
              ? `Abaixo do piso de funcionamento (${formatPercent(calibration.piso_custeio, 1)}): serviços parando`
              : `Piso de funcionamento: ${formatPercent(calibration.piso_custeio, 1)}`
          }
        />
        {f.limitExcess > 0 && (
          <StatRow
            label="Estouro do limite"
            value={formatPercent(f.limitExcess, 2)}
            context="Registrado como exceção"
          />
        )}
        {f.extraordinary > 0 && (
          <StatRow
            label="Créditos extraordinários"
            value={formatPercent(f.extraordinary, 2)}
            context="Fora do limite"
          />
        )}
        <StatRow
          label="Salário mínimo real"
          value={formatNumber(f.minimumWageIndex * 100, 1)}
          context="Índice, jan/2027 = 100"
        />
      </Card>

      <Card
        title="Receitas por base"
        subtitle="Da carga legal ao caixa da União: medidas novas, ciclo, perda de conformidade e repasses a estados e municípios, % do PIB">
        {bases.map((row) => (
          <StatRow
            key={row.group}
            label={REVENUE_LABEL[row.group]}
            value={formatPercent(row.net, 1)}
            context={baseContext(row)}
          />
        ))}
        {ibs ? (
          <Text variant="caption" color="textSecondary">
            {`Fora do caixa da União, em ${year}: o IBS responde por ${formatPercent(ibs.ibs, 0)} do consumo de estados e municípios e ICMS/ISS pelos outros ${formatPercent(ibs.legacy, 0)} (LC 214/2025).`}
          </Text>
        ) : null}
        {f.revenueLoss > 0 && (
          <StatRow
            label="Perda de arrecadação"
            value={formatPercent(f.revenueLoss, 2)}
            context="Sonegação e elisão por carga alta"
          />
        )}
      </Card>

      <SectorInvestmentsCard state={state} content={content} />

      <Card title="Último Copom">
        <Text variant="body">{copomText}</Text>
      </Card>

      <SocietyPanel state={state} />

      <EducationPanel state={state} />
    </>
  );
}
