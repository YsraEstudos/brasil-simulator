import { monthLabel, shortMonthLabel } from '@/components/campaign/labels';
import {
  discretionaryFloorAlert,
  interestShareOfRevenue,
  minimumWageReais,
  monetaryStance,
  nextCopom,
  nextCopomWhen,
  rigidityShare,
  shareTone,
} from '@/components/economy/economyInsights';
import {
  Alert,
  Card,
  formatFiscalShare,
  formatNumber,
  formatPercent,
  type FiscalDisplayUnit,
  Text,
} from '@/components/ui';
import { loadContent } from '@/content';
import {
  currentNominalGdpMillions,
  MANDATORY_GROUPS,
  REVENUE_GROUPS,
  type MandatoryGroup,
  type RevenueGroup,
} from '@/engine';
import { useGame, type ActiveCampaign } from '@/store';

import { signedPercent, StatRow } from './StatRow';
import { SocietyPanel } from './SocietyPanel';

/** Contexto dos fluxos anualizados, conforme a unidade de exibição (`prefs.fiscalUnit`). */
const FLOW_CONTEXT: Record<FiscalDisplayUnit, string> = {
  pib: '% do PIB, anualizado',
  reais: 'R$, anualizado',
};

/** Subtítulo dos cartões fiscais, conforme a unidade. */
const FLOW_SUBTITLE: Record<FiscalDisplayUnit, string> = {
  pib: 'Fluxos em % do PIB, anualizados, salvo indicação',
  reais: 'Fluxos em R$, anualizados, salvo indicação',
};

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

/** Painel da aba Economia (GAME_DESIGN.md §8). Variações só existem para indicadores do protótipo. */
export function EconomyPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { state, previous, lastReport } = campaign;
  const content = loadContent(state.scenarioId);
  const { calibration } = content;
  const unit = useGame((s) => s.prefs.fiscalUnit);
  const gdp = currentNominalGdpMillions(state, content);
  const e = state.economy;
  const f = e.fiscal;
  const ind = state.indicators;
  const change = (key: keyof typeof ind) => (previous ? ind[key] - previous[key] : undefined);
  // Valores fiscais em fração do PIB no motor; `formatFiscalShare` mostra em R$ (com o PIB do mês) ou em % do PIB.
  const flow = (fraction: number, decimals = 1) => formatFiscalShare(fraction, gdp, unit, { decimals });
  const signedFlow = (fraction: number, decimals = 1) =>
    formatFiscalShare(fraction, gdp, unit, { decimals, signed: true });
  const flowContext = FLOW_CONTEXT[unit];

  // Leituras da Fase Q10 (economyInsights.ts): postura do BC, próximo Copom, piso, engessamento e juros.
  const stance = monetaryStance(e.effectiveRealRate, calibration.juro_neutro);
  const copom = nextCopom(state.monthIndex, content.scenario.copomMonths);
  const floorAlert = discretionaryFloorAlert(f.discretionary, calibration.piso_custeio);
  const rigidity = rigidityShare(f);
  const interestShare = interestShareOfRevenue(e.interest, e.revenue);
  const wageBase = content.scenario.fiscal?.minimumWage?.value;
  const otherUnit: FiscalDisplayUnit = unit === 'pib' ? 'reais' : 'pib';
  const debtOther = formatFiscalShare(e.grossDebt, gdp, otherUnit, { decimals: 1 });

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
        <StatRow
          label="Selic"
          value={formatPercent(e.selic, 2)}
          context={`Meta anual · juro real ${formatPercent(e.effectiveRealRate, 2)}`}
        />
        <StatRow label="Postura do Banco Central" value={stance.label} context={stance.text} />
        {copom ? (
          <StatRow
            label="Próxima reunião do Copom"
            value={shortMonthLabel(copom.monthIndex)}
            context={nextCopomWhen(copom)}
          />
        ) : null}
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
        <StatRow
          label="Juro real efetivo"
          value={formatPercent(e.effectiveRealRate, 2)}
          context={`Média dos últimos meses; neutro: ${formatPercent(calibration.juro_neutro, 1)}`}
        />
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

      <Card title="Contas públicas" subtitle={FLOW_SUBTITLE[unit]}>
        <StatRow label="Receita primária" value={flow(e.revenue)} context={flowContext} />
        <StatRow label="Despesa primária" value={flow(e.primarySpending)} context={flowContext} />
        <StatRow label="Resultado primário do mês" value={signedFlow(e.monthlyPrimary)} context={flowContext} />
        <StatRow
          label="Resultado primário em 12 meses"
          value={signedFlow(ind.primaryBalance12m)}
          delta={change('primaryBalance12m')}
          goodWhen="up"
          context={unit === 'pib' ? '% do PIB, acumulado em 12 meses' : 'R$, acumulado em 12 meses'}
        />
        <StatRow label="Juros nominais" value={flow(e.interest)} context={flowContext} />
        {interestShare !== null ? (
          <StatRow
            label="Juros sobre a receita"
            value={formatPercent(interestShare, 0)}
            context={`De cada R$ 100 arrecadados, R$ ${formatNumber(interestShare * 100, 0)} pagariam os juros da dívida`}
            contextColor={shareTone(interestShare, 0.25, 0.4)}
          />
        ) : null}
        <StatRow
          label="Dívida bruta"
          value={flow(e.grossDebt)}
          context={unit === 'pib' ? `% do PIB · cerca de ${debtOther}` : `Saldo acumulado · ${debtOther}`}
        />
        <StatRow label="Credibilidade" value={formatNumber(e.credibility * 100, 0)} context="Índice de 0 a 100" />
      </Card>

      {floorAlert ? (
        <Alert
          tone={floorAlert.level === 'abaixo' ? 'negative' : 'warning'}
          title={floorAlert.level === 'abaixo' ? 'Discricionárias abaixo do piso' : 'Discricionárias perto do piso'}
          message={
            floorAlert.level === 'abaixo'
              ? `Abaixo de ${flow(calibration.piso_custeio)}, serviços param e a aprovação cai todo mês.`
              : `Faltam ${flow(floorAlert.room, 2)} para o piso de funcionamento (${flow(calibration.piso_custeio)}). Novas despesas obrigatórias ou perda de receita podem levar a paralisações.`
          }
        />
      ) : null}

      <Card
        title="Limite de despesas"
        subtitle={
          unit === 'pib'
            ? 'Regime Fiscal Sustentável (LC 200/2023), em % do PIB'
            : 'Regime Fiscal Sustentável (LC 200/2023), em R$ anualizados'
        }>
        <StatRow
          label="Limite"
          value={flow(f.spendingLimit)}
          context={`Cresce ${formatPercent(f.limitRealGrowth, 1)} acima da inflação neste ano`}
        />
        <StatRow
          label="Engessamento"
          value={formatPercent(rigidity, 0)}
          context={`Obrigatórias e vinculadas sobre a despesa: só ${formatPercent(1 - rigidity, 0)} é de livre escolha`}
          contextColor={shareTone(rigidity, 0.9, 0.93)}
        />
        {MANDATORY_GROUPS.map((g) => (
          <StatRow key={g} label={MANDATORY_LABEL[g]} value={flow(f.mandatory[g])} context={flowContext} />
        ))}
        <StatRow label="Saúde, educação e emendas" value={flow(f.linked)} context="Vinculadas à receita" />
        {f.policyMandatory !== 0 && (
          <StatRow label="Obrigatórias de políticas" value={signedFlow(f.policyMandatory, 2)} context={flowContext} />
        )}
        <StatRow
          label="Discricionárias livres"
          value={flow(f.discretionary, 2)}
          context={
            f.discretionary < calibration.piso_custeio
              ? `Abaixo do piso de funcionamento (${flow(calibration.piso_custeio)}): serviços parando`
              : `Piso de funcionamento: ${flow(calibration.piso_custeio)}`
          }
        />
        {f.limitExcess > 0 && (
          <StatRow label="Estouro do limite" value={flow(f.limitExcess, 2)} context="Registrado como exceção" />
        )}
        {f.extraordinary > 0 && (
          <StatRow label="Créditos extraordinários" value={flow(f.extraordinary, 2)} context="Fora do limite" />
        )}
        {wageBase !== undefined ? (
          <StatRow
            label="Salário mínimo"
            value={`R$ ${formatNumber(minimumWageReais(wageBase, f.minimumWageIndex, e.priceLevel), 0)}`}
            context={`Por mês · índice real ${formatNumber(f.minimumWageIndex * 100, 1)} (jan/2027 = 100)`}
          />
        ) : (
          <StatRow
            label="Salário mínimo real"
            value={formatNumber(f.minimumWageIndex * 100, 1)}
            context="Índice, jan/2027 = 100"
          />
        )}
      </Card>

      <Card
        title="Receitas por grupo"
        subtitle={
          unit === 'pib'
            ? 'Líquidas de repasses a estados e municípios, % do PIB'
            : 'Líquidas de repasses a estados e municípios, em R$ anualizados'
        }>
        {REVENUE_GROUPS.map((g) => (
          <StatRow key={g} label={REVENUE_LABEL[g]} value={flow(f.revenueByGroup[g])} context={flowContext} />
        ))}
        {f.revenueLoss > 0 && (
          <StatRow
            label="Perda de arrecadação"
            value={flow(f.revenueLoss, 2)}
            context="Sonegação e elisão por carga alta"
          />
        )}
      </Card>

      <Card title="Último Copom">
        <Text variant="body">{copomText}</Text>
      </Card>

      <SocietyPanel state={state} />
    </>
  );
}
