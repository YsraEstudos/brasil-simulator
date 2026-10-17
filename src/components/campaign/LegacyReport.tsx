import { StyleSheet, View } from 'react-native';

import { Alert, Card, formatMoneyMillions, formatNumber, formatPercent, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import {
  campaignOutcome,
  regionalDispersion,
  regionsOf,
  regionsView,
  type GameContent,
  type GameState,
  type IndicatorKey,
  type Proposal,
} from '@/engine';
import type { PublicPolicyState } from '@/engine/publicPolicies/types';
import type { SocietyState } from '@/engine/society/types';

import { INDICATOR_META, INDICATOR_ORDER, PROPOSAL_STATUS_LABEL, monthLabel } from './labels';

/**
 * Relatório de legado (GAME_DESIGN.md §7.1): país recebido vs. entregue.
 *
 * Pontuação simples do protótipo (GDD §7.2): para cada um dos 5 indicadores, +1 se o valor final melhorou em
 * relação ao inicial (aprovação e PIB: subiu; inflação e desemprego: caiu; resultado primário: subiu), −1 se
 * piorou e 0 se ficou igual. A pontuação é a média desses 5 sinais, entre −1 e +1.
 */
export function legacyScore(
  initial: Readonly<Record<IndicatorKey, number>>,
  final: Readonly<Record<IndicatorKey, number>>,
): {
  signs: Record<IndicatorKey, -1 | 0 | 1>;
  score: number;
} {
  const signs = {} as Record<IndicatorKey, -1 | 0 | 1>;
  let total = 0;
  for (const key of INDICATOR_ORDER) {
    const delta = final[key] - initial[key];
    const better = INDICATOR_META[key].goodWhen === 'up' ? delta : -delta;
    const sign: -1 | 0 | 1 = better > 0 ? 1 : better < 0 ? -1 : 0;
    signs[key] = sign;
    total += sign;
  }
  return { signs, score: total / INDICATOR_ORDER.length };
}

export interface LegacyReportProps {
  state: GameState;
  content: GameContent;
}

/** Relatório de legado ao fim da campanha (GAME_DESIGN.md §7.1). */
export function LegacyReport({ state, content }: LegacyReportProps) {
  const initial = content.scenario.indicators;
  const initialValues = {
    approval: initial.approval.value,
    inflation12m: initial.inflation12m.value,
    unemployment: initial.unemployment.value,
    gdpGrowth12m: initial.gdpGrowth12m.value,
    primaryBalance12m: initial.primaryBalance12m.value,
  } satisfies Record<IndicatorKey, number>;
  const { signs, score } = legacyScore(initialValues, state.indicators);
  const improved = INDICATOR_ORDER.filter((k) => signs[k] === 1).length;

  const approved = state.proposals.filter((p) => ['aprovada', 'em_execucao', 'concluida'].includes(p.status));
  const rejected = state.proposals.filter((p) => p.status === 'rejeitada');
  const executed = state.proposals.filter((p) => p.status === 'em_execucao' || p.status === 'concluida');
  const phaseLabels: Record<string, string> = {
    planejamento: 'Planejamento',
    licenciamento: 'Licenciamento',
    licitacao: 'Licitação',
    obra: 'Obra',
    operacao: 'Operação',
    cancelado: 'Cancelado',
  };
  const publicState: PublicPolicyState = state.publicPolicies;
  const brands = publicState.brands;
  const projectsByProposal = new Map(publicState.projects.map((project) => [project.proposalId, project]));
  const society: SocietyState = state.society;
  const outcome = campaignOutcome(state);
  const general = state.politics?.eleicao_geral;

  return (
    <View style={styles.root}>
      {outcome === 'impeachment' && (
        <Alert
          tone="negative"
          title="Mandato encerrado por impeachment"
          message="Ficção: o Senado condenou o governo e o mandato terminou antes do prazo. O relatório abaixo mostra o país até esse mês."
        />
      )}
      {outcome === 'derrota_eleitoral' && (
        <Alert
          tone="negative"
          title="Campanha encerrada pela derrota eleitoral"
          message="Ficção: a situação perdeu a eleição geral e o mandato acabou no pleito. O relatório abaixo mostra o país até esse mês."
        />
      )}
      {outcome === 'fim_de_mandato' && (
        <Alert
          tone="info"
          title="Fim do mandato"
          message="Ficção: o mandato terminou sem candidatura à reeleição e o sucessor tomou posse. O relatório abaixo mostra o país entregue."
        />
      )}
      <Text variant="title">Relatório de legado</Text>

      {general && (
        <Card
          title="Eleição geral"
          subtitle={`${monthLabel(general.monthIndex)} · ${
            general.candidatura ? 'candidatura própria' : 'sucessor apoiado'
          }.`}>
          <Text variant="body">
            {general.venceu ? 'Vitória' : 'Derrota'} da situação{general.turno2 ? ' no 2º turno' : ' no 1º turno'}.
          </Text>
        </Card>
      )}

      <Card title="País recebido e país entregue" subtitle="Valor inicial (jan/2027) e final do mandato.">
        {INDICATOR_ORDER.map((key) => {
          const meta = INDICATOR_META[key];
          const fmt = (v: number) => formatPercent(v, meta.decimals);
          return (
            <View key={key} style={styles.row}>
              <Text variant="body" style={styles.label}>
                {meta.label}
              </Text>
              <Text variant="body" tabular color="textSecondary">
                {fmt(initialValues[key])} → <Text variant="label">{fmt(state.indicators[key])}</Text>
              </Text>
            </View>
          );
        })}
        <Text variant="caption" color="textMuted">
          Melhoraram {improved} de {INDICATOR_ORDER.length} indicadores.
        </Text>
      </Card>

      <Card title={`Pontuação: ${formatNumber(score, 2)}`} subtitle="Média dos sinais dos 5 indicadores, de −1 a +1.">
        <Text variant="body" color="textSecondary">
          Mede apenas a direção da mudança, não a magnitude nem a dificuldade do cenário.
        </Text>
      </Card>

      <RegionalCard state={state} content={content} />

      <Card title="Marcas de governo" subtitle="Projetos nomeados e seu resultado no fim da campanha.">
        {brands.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma marca de governo registrada.
          </Text>
        ) : (
          brands.map((brand) => {
            const proposal = state.proposals.find((item) => item.id === brand.proposalId);
            const project = projectsByProposal.get(brand.proposalId);
            const proposalName = proposal
              ? (content.policies[proposal.policyId]?.name ?? proposal.policyId)
              : 'Projeto removido';
            const status = proposal ? PROPOSAL_STATUS_LABEL[proposal.status] : 'Proposta não encontrada';
            const projectText = project
              ? ` · ${phaseLabels[project.phase] ?? project.phase} · ${formatPercent(project.progress, 0)} executado${project.delayMonths > 0 ? ` · atraso ${project.delayMonths} ${project.delayMonths === 1 ? 'mês' : 'meses'}` : ''}`
              : '';
            return (
              <View key={brand.proposalId} style={styles.rowBlock}>
                <Text variant="label">{brand.name}</Text>
                <Text variant="body" color="textSecondary">{`${proposalName} · ${status}${projectText}`}</Text>
                {project && (
                  <Text variant="caption" color="textSecondary">
                    {`Executado ${formatMoneyMillions(project.spentMillions)} de ${formatMoneyMillions(project.budgetMillions)} · manutenção anual ${formatMoneyMillions(project.maintenanceMillions)}`}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </Card>

      <LegacySocietyCard society={society} />

      <ProposalGroup title="Propostas aprovadas" proposals={approved} content={content} />
      <ProposalGroup title="Propostas rejeitadas" proposals={rejected} content={content} />
      <ProposalGroup title="Propostas executadas" proposals={executed} content={content} />
    </View>
  );
}

function LegacySocietyCard({ society }: { society: SocietyState }) {
  return (
    <Card title="Resultados sociais" subtitle="Informativos e PROVISÓRIOS; não entram na pontuação do legado.">
      <Text variant="body" tabular>
        Pobreza estimada: {formatPercent(society.povertyRate, 1)}
      </Text>
      {society.quintiles.map((quintile) => (
        <Text key={quintile.id} variant="caption" color="textSecondary" tabular>
          {`${quintile.id}: renda real ${formatNumber(quintile.realIncome, 3)} · ${formatPercent(quintile.incomeShare, 1)} da renda`}
        </Text>
      ))}
      <Text variant="caption" color="textMuted">
        Os setores e quintis são reconciliados pelo motor; o painel de Economia mostra a decomposição completa.
      </Text>
    </Card>
  );
}

/**
 * Desenvolvimento regional (GAME_DESIGN.md §7.2): dispersão da renda per capita entre as UFs, da posse ao fim.
 * Fica fora da pontuação do protótipo; menor dispersão = regiões mais parecidas.
 */
function RegionalCard({ state, content }: { state: GameState; content: GameContent }) {
  const ufs = regionsView(state, content);
  if (ufs.length === 0) return null;
  // Na posse: as participações do cenário.
  const start = regionalDispersion(
    regionsOf(content).map((u) => ({ share: u.gdpShare })),
    content,
  );
  const end = regionalDispersion(ufs, content);
  return (
    <Card
      title="Desenvolvimento regional"
      subtitle="Dispersão da renda per capita entre as UFs (coeficiente de variação ponderado pela população).">
      <Text variant="body" tabular color="textSecondary">
        {formatNumber(start, 3)} → <Text variant="label">{formatNumber(end, 3)}</Text>
      </Text>
      <Text variant="caption" color="textMuted">
        {end < start ? 'As regiões ficaram mais parecidas.' : 'A distância entre as regiões não diminuiu.'} Não entra na
        pontuação do protótipo.
      </Text>
    </Card>
  );
}

function ProposalGroup({
  title,
  proposals,
  content,
}: {
  title: string;
  proposals: readonly Proposal[];
  content: GameContent;
}) {
  return (
    <Card title={`${title} (${proposals.length})`}>
      {proposals.length === 0 && (
        <Text variant="body" color="textSecondary">
          Nenhuma.
        </Text>
      )}
      {proposals.map((p) => (
        <Text key={p.id} variant="body">
          • {content.policies[p.policyId]?.name ?? p.policyId}: {PROPOSAL_STATUS_LABEL[p.status]}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.two },
  label: { flexShrink: 1 },
  rowBlock: {
    gap: Spacing.half,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
    paddingTop: Spacing.one,
  },
});
