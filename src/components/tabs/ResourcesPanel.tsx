import { useState } from 'react';
import { Button, Card, formatNumber, formatPercent, Text } from '@/components/ui';
import type { GameState } from '@/engine';
import { StatRow } from './StatRow';
import { energyAdvice } from './resourcesView';

/** Leituras derivadas dos estoques, sem executar o turno ou alterar a campanha. */
export function ResourcesPanel({ state }: { state: GameState }) {
  const [showUfs, setShowUfs] = useState(false);
  const { demography, energy } = state;
  const ages = demography.ufs.reduce(
    (sum, uf) => ({
      young: sum.young + uf.ages.young,
      working: sum.working + uf.ages.working,
      older: sum.older + uf.ages.older,
    }),
    { young: 0, working: 0, older: 0 },
  );
  const population = ages.young + ages.working + ages.older;
  const twh = (value: number) => `${formatNumber(value, 1)} TWh`;
  const monthlyFlow = (value: number) => (state.monthIndex > 0 ? twh(value) : 'Aguardando primeiro mês');
  return (
    <>
      <Card
        title="População e envelhecimento"
        subtitle={
          state.scenarioId === 'brasil_2027_01_v080'
            ? 'Pessoas em milhares. Composição do Censo 2022 como aproximação inicial; fluxos PROVISÓRIOS, não projeções oficiais.'
            : 'Pessoas em milhares. Faixas e fluxos são hipóteses PROVISÓRIAS, não projeções oficiais.'
        }>
        <StatRow label="População" value={demography.ufs.length ? `${formatNumber(population, 0)} mil` : 'Sem dados'} />
        <StatRow
          label="Até 19 anos"
          value={formatPercent(population ? ages.young / population : 0, 1)}
          context="Influencia a entrada no sistema escolar"
        />
        <StatRow
          label="65 anos ou mais"
          value={formatPercent(population ? ages.older / population : 0, 1)}
          context="Mudanças podem alterar a despesa previdenciária"
        />
        <StatRow
          label="Dependência de idosos"
          value={formatPercent(ages.working ? ages.older / ages.working : 0, 1)}
          context="Idosos em relação à população de 20 a 64 anos"
        />
        {demography.ufs.length > 0 ? (
          <Button
            variant="ghost"
            label={showUfs ? 'Ocultar detalhes por UF' : 'Ver detalhes por UF'}
            onPress={() => setShowUfs(!showUfs)}
          />
        ) : null}
        {showUfs &&
          demography.ufs.map((uf) => (
            <Text key={uf.id} variant="caption" color="textSecondary">
              {`${uf.id}: ${formatNumber(uf.ages.young + uf.ages.working + uf.ages.older, 0)} mil · 0–19 anos ${formatNumber(uf.ages.young, 0)} · 20–64 anos ${formatNumber(uf.ages.working, 0)} · 65+ ${formatNumber(uf.ages.older, 0)} mil. ${state.monthIndex > 0 ? `No mês: nascimentos ${formatNumber(uf.flows.births, 1)} · mortes ${formatNumber(uf.flows.deaths, 1)} · migração interna ${formatNumber(uf.flows.internal, 1)} · externa ${formatNumber(uf.flows.external, 1)} mil.` : 'Fluxos disponíveis após o primeiro mês.'}`}
            </Text>
          ))}
      </Card>
      <Card
        title="Eletricidade e reservatórios"
        subtitle="Balanço simplificado PROVISÓRIO em TWh no último mês; o reservatório é um estoque em TWh.">
        {state.monthIndex === 0 ? (
          <Text variant="caption" color="textSecondary">
            Os fluxos serão calculados ao encerrar o primeiro mês de governo.
          </Text>
        ) : null}
        <StatRow
          label="Demanda"
          value={monthlyFlow(energy.demand)}
          context="Eficiência reduz consumo após a maturação do programa"
        />
        <StatRow
          label="Energia entregue"
          value={monthlyFlow(energy.delivered)}
          context="Limitada por geração e transmissão"
        />
        <StatRow
          label="Capacidade de geração"
          value={twh(energy.generationCapacity)}
          context="TWh por mês, antes da limitação hídrica"
        />
        <StatRow label="Capacidade de transmissão" value={twh(energy.transmissionCapacity)} context="TWh por mês" />
        <StatRow
          label="Demanda não atendida"
          value={monthlyFlow(energy.shortage)}
          context="A escassez física restringe a atividade econômica"
        />
        <StatRow
          label="Geração hidrelétrica"
          value={monthlyFlow(energy.hydro)}
          context={state.monthIndex > 0 ? `Outras fontes: ${twh(energy.otherGeneration)}` : undefined}
        />
        <StatRow
          label="Reserva hídrica"
          value={twh(energy.reservoir)}
          context={`Capacidade ${twh(energy.reservoirCapacity)}${state.monthIndex > 0 ? ` · entrada ${twh(energy.inflow)} · vertimento ${twh(energy.spill)}` : ''}`}
        />
        <Text variant="caption" color="textSecondary">
          A seca reduz a entrada de água e pode pressionar os preços. Investimentos exigem tempo e financiamento.
        </Text>
        <Text variant="body">{energyAdvice(energy, state.monthIndex > 0)}</Text>
      </Card>
    </>
  );
}
