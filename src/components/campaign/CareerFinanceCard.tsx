import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { MIN_TOUCH, Radius, Spacing } from '@/constants/theme';
import type { Decision, GameContent, GameState, MonthReport } from '@/engine/types';
import { CAREER_ACTIONS, isCareerAction } from '@/engine/career/actions';
import { DEBT_CHARGE } from '@/engine/career/commitments';
import { resolveIllicitCalibration } from '@/engine/career/illicit';
import { useTheme } from '@/hooks/use-theme';
import type { AgendaDraft } from '@/store/agendaDraft';

import { careerFinanceView, simpleFinanceView } from './careerFinanceView';

const money = (amount: number) => `R$ ${amount.toLocaleString('pt-BR')} mil`;
const amountOf = (value: string) => (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0);

/** Finanças são decisões do rascunho; só o motor altera os saldos ao fechar o turno. */
export function CareerFinanceCard({
  state,
  content,
  report,
  draft,
  onToggle,
}: {
  state: GameState;
  content: GameContent;
  report?: MonthReport;
  draft: AgendaDraft;
  onToggle: (decision: Decision) => void;
}) {
  const [amount, setAmount] = useState('100');
  const { colors } = useTheme();
  const view = careerFinanceView(state, content);
  if (!view) {
    const simple = simpleFinanceView(state);
    if (!simple) return null;
    const fundraiser = content.scenario.career?.finance?.costs?.find((item) => item.id === 'arrecadar_doacoes');
    const profile = content.scenario.career?.profiles.find((item) => item.id === state.career?.profileId);
    const marked = draft.decisions.some((decision) => decision.policyId === 'arrecadar_doacoes');
    return (
      <Card title="Finanças da campanha" subtitle="Valores de simulação em milhares de reais">
        <Text>
          Saldo: {money(simple.balance)} · Gastos contratados: {money(simple.spent)} de {money(simple.spendingLimit)}
        </Text>
        {(simple.scheduled ?? []).map((receipt, index) => (
          <Text key={`${receipt.turn}-${index}`}>
            Recebimento de {money(receipt.amount)} previsto para o turno {receipt.turn + 1}.
          </Text>
        ))}
        <Text color="textSecondary">As ações são pagas na ordem da lista. Arrecadações entram no turno seguinte.</Text>
        {fundraiser && profile && state.career?.stage !== 'transicao' && (
          <>
            <Text>
              Arrecadação: custo {money(fundraiser.cost)}; recebimento previsto {money(profile.fundraisingCapacity)} no
              turno seguinte.
            </Text>
            <Button
              label={marked ? 'Desmarcar arrecadação' : 'Marcar arrecadação'}
              variant="secondary"
              onPress={() => onToggle({ policyId: 'arrecadar_doacoes', agendaCost: 0 })}
            />
          </>
        )}
      </Card>
    );
  }
  const value = amountOf(amount);
  const profile = content.scenario.career?.profiles.find((item) => item.id === state.career?.profileId);
  const fundraiser = content.scenario.career?.finance?.costs?.find((item) => item.id === 'arrecadar_doacoes');
  const expanded = content.scenario.career?.finance?.expanded;
  const editable = view.stage !== 'transicao';
  const selected = (id: string) => draft.decisions.find((d) => d.policyId === id);
  const choose = (policyId: string, params: Decision['params']) => onToggle({ policyId, agendaCost: 0, params });
  return (
    <Card title="Finanças da campanha" subtitle="Valores de simulação em milhares de reais">
      <Text>
        Partido: {money(view.party)} · Doações: {money(view.donations)} · Pessoal: {money(view.personal)}
      </Text>
      <Text>
        Gastos contratados: {money(view.spent)} de {money(view.limit)}
      </Text>
      <Text>
        Patrimônio disponível: {money(view.personalAvailable)} · Limite restante de aporte:{' '}
        {money(view.personalRemainingLimit)}
      </Text>
      <Text>
        Dívida contratada: {money(view.debt)} de {money(view.debtLimit)}
      </Text>
      {view.pending.map((receipt, index) => (
        <Text key={`${receipt.turn}-${index}`} color="textSecondary">
          Parcela de {money(receipt.amount)} prevista para o turno {receipt.turn + 1}.
        </Text>
      ))}
      <Text color="textSecondary">As ações são pagas na ordem da lista. Arrecadações entram no turno seguinte.</Text>
      {draft.decisions.length > 0 && (
        <View style={styles.section}>
          <Text variant="label">Ordem das escolhas marcadas</Text>
          {draft.decisions.map((decision, index) => {
            const names: Record<string, string> = {
              aportar_campanha: 'Aporte pessoal',
              arrecadar_doacoes: 'Arrecadação',
              usar_caixa_dois: 'Caixa 2',
            };
            return (
              <Text key={`${decision.policyId}-${index}`}>
                {index + 1}.{' '}
                {names[decision.policyId] ??
                  (isCareerAction(decision.policyId) ? CAREER_ACTIONS[decision.policyId].name : 'Outra decisão')}
              </Text>
            );
          })}
        </View>
      )}
      {editable && (
        <>
          <Text variant="label">Valor a aportar ou receber, em R$ mil</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            accessibilityLabel="Valor em milhares de reais"
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          {fundraiser && profile && (
            <Text>
              Arrecadação: custo {money(fundraiser.cost)}; recebimento previsto {money(profile.fundraisingCapacity)} no
              turno seguinte.
            </Text>
          )}
          <Button
            label={selected('aportar_campanha') ? 'Alterar ou desmarcar aporte' : 'Marcar aporte pessoal'}
            variant="secondary"
            disabled={value <= 0}
            onPress={() => choose('aportar_campanha', { valor: value })}
          />
          <Button
            label={
              selected('arrecadar_doacoes')
                ? 'Alterar ou desmarcar arrecadação'
                : 'Marcar arrecadação com verba do partido'
            }
            variant="secondary"
            onPress={() => choose('arrecadar_doacoes', { bolso: 'party' })}
          />
          <Button
            label="Marcar arrecadação com doações"
            variant="secondary"
            onPress={() => choose('arrecadar_doacoes', { bolso: 'donations' })}
          />
          {view.illicitBalance !== undefined && fundraiser?.pockets?.includes('illicit') && (
            <Button
              label="Marcar arrecadação com caixa 2"
              variant="danger"
              onPress={() => choose('arrecadar_doacoes', { bolso: 'illicit' })}
            />
          )}
          <Button
            label="Contratar arrecadação integralmente por dívida"
            variant="secondary"
            onPress={() => choose('arrecadar_doacoes', { bolso: 'party', divida: 'integral' })}
          />
          {state.difficulty === 'casual' ? (
            <Text color="textSecondary">No Casual, a dívida é encerrada sem cobrança na posse.</Text>
          ) : (
            expanded && (
              <Text color="textSecondary">
                A dívida vira compromisso pessoal até o mês {expanded.debtDeadline + 1} do governo. Se não for paga no
                prazo, a cobrança reduz o capital político em até {DEBT_CHARGE.value} pontos.
              </Text>
            )
          )}
          {selected('aportar_campanha') && (
            <Text color="textSecondary">
              Aporte marcado: {money(Number(selected('aportar_campanha')?.params?.valor))}.
            </Text>
          )}
          {selected('arrecadar_doacoes') && (
            <Text color="textSecondary">
              Arrecadação marcada:{' '}
              {selected('arrecadar_doacoes')?.params?.divida === 'integral'
                ? 'por dívida'
                : selected('arrecadar_doacoes')?.params?.bolso === 'party'
                  ? 'com verba do partido'
                  : selected('arrecadar_doacoes')?.params?.bolso === 'illicit'
                    ? 'com caixa 2'
                    : 'com doações'}
              . Consulte as recusas no relatório após encerrar o turno.
            </Text>
          )}
        </>
      )}
      {view.illicitBalance !== undefined && (
        <View style={styles.section}>
          <Text variant="heading">Caixa 2 — ficção</Text>
          <Text>
            Saldo: {money(view.illicitBalance)}. A operação pode gerar investigação; investigação não é condenação.
          </Text>
          {expanded?.illicit && (
            <Text>Limite de entrada: {money(resolveIllicitCalibration(expanded.illicit).monthlyLimit)} por mês.</Text>
          )}
          <Text>
            Risco atual: {view.risk ?? 'indisponível'} · Investigações: {view.investigations}
          </Text>
          {report?.career?.illicit?.discovered && (
            <Text color="negative">Uma investigação começou no último turno.</Text>
          )}
          {view.illicitPending.map((receipt, index) => (
            <Text key={`${receipt.turn}-${index}`}>
              Recebimento de {money(receipt.amount)} previsto para o próximo turno.
            </Text>
          ))}
          {editable && (
            <Button
              label={selected('usar_caixa_dois') ? 'Alterar ou desmarcar caixa 2' : 'Marcar caixa 2'}
              variant="danger"
              disabled={value <= 0}
              onPress={() => choose('usar_caixa_dois', { valor: value })}
            />
          )}
          {selected('usar_caixa_dois') && (
            <Text color="textSecondary">
              Caixa 2 marcado: {money(Number(selected('usar_caixa_dois')?.params?.valor))}. A entrada será no próximo
              turno.
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

/** Compromisso após a posse: pagamento sai do patrimônio pessoal. */
export function CareerDebtCard({
  state,
  draft,
  onToggle,
}: {
  state: GameState;
  draft: AgendaDraft;
  onToggle: (decision: Decision) => void;
}) {
  const career = state.career;
  if (!career || career.stage !== 'governo' || !career.commitments?.length) return null;
  return (
    <Card title="Compromissos de campanha" subtitle="Pagamentos usam recursos pessoais">
      {career.commitments.map((item, index) => {
        const available = career.expandedFinance?.personalAvailable ?? 0;
        const payment = Math.min(available, item.remaining);
        const chosen = draft.decisions.some(
          (d) => d.policyId === 'pagar_divida_campanha' && d.params?.indice === index,
        );
        return (
          <View key={`${item.origin}-${index}`} style={styles.section}>
            <Text>
              Dívida: {money(item.remaining)} · situação: {item.status} · prazo: mês {item.deadline + 1} do mandato.
            </Text>
            {item.status === 'pendente' && state.monthIndex <= item.deadline && payment > 0 && (
              <Button
                label={chosen ? 'Desmarcar pagamento' : `Marcar pagamento de ${money(payment)}`}
                variant="secondary"
                onPress={() =>
                  onToggle({
                    policyId: 'pagar_divida_campanha',
                    agendaCost: 0,
                    params: { indice: index, valor: payment },
                  })
                }
              />
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: MIN_TOUCH, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two },
  section: { gap: Spacing.two, paddingTop: Spacing.two },
});
