import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InfoSheet } from '@/components/painel/InfoSheet';
import { EmptyNote, SheetHeading } from '@/components/painel/HudBits';
import { Hud } from '@/components/painel/hudTheme';
import { Button, Text } from '@/components/ui';
import { campaignMonths, loadContent } from '@/content';
import {
  devAddApproval,
  devAddCapital,
  devApproveAll,
  devCongressProposals,
  devEventList,
  devFireEvent,
  devRejectAll,
  gameStore,
  useGame,
} from '@/store';

/** Mês da eleição geral no índice nacional (PoliticsState: meses 45 e 93) e atalhos ao redor dela. */
const MONTH_SHORTCUTS = [
  { label: 'Mês 38', month: 38 },
  { label: 'Mês 44 (véspera)', month: 44 },
  { label: 'Mês 46 (2º turno)', month: 46 },
];

/**
 * Painel secreto de desenvolvedor (God Mode): botão discreto no canto da tela do jogo, renderizado só em `__DEV__`
 * (no build de produção o layout do jogo não o monta). Atalhos para testar telas e mecânicas sem jogar
 * dezenas de meses: recursos, salto de meses, disparo de evento e votação forçada das leis no Congresso.
 */
export function DevPanel() {
  const insets = useSafeAreaInsets();
  const active = useGame((s) => s.active);
  const busy = useGame((s) => s.busy);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [monthText, setMonthText] = useState('');
  const [filter, setFilter] = useState('');
  const [skipping, setSkipping] = useState(false);

  const scenarioId = active?.state.scenarioId;
  const content = useMemo(() => (scenarioId ? loadContent(scenarioId) : null), [scenarioId]);
  const events = useMemo(() => (content && scenarioId ? devEventList(content, scenarioId) : []), [content, scenarioId]);

  if (!active) return null;
  const state = active.state;
  const lastMonth = campaignMonths(state.scenarioId);
  const inCongress = devCongressProposals(state).length;
  const locked = busy || skipping || active.finished;

  const run = async (label: string, transform: (s: typeof state) => typeof state) => {
    const ok = await gameStore.getState().devApply(transform);
    setStatus(ok ? `✓ ${label}` : `✗ ${label}: ${gameStore.getState().error ?? 'falhou'}`);
  };

  const skipTo = async (month: number) => {
    const target = Math.max(0, Math.min(month, lastMonth));
    setSkipping(true);
    setStatus(`Avançando até o mês ${target}…`);
    const ok = await gameStore
      .getState()
      .devSkipTo(target, (m) => setStatus(`Avançando até o mês ${target}… (mês ${m})`));
    setSkipping(false);
    const now = gameStore.getState().active;
    setStatus(
      ok
        ? `✓ Agora no mês ${now?.state.monthIndex ?? '?'}${now?.finished ? ' — campanha encerrada (Legado)' : ''}`
        : `✗ Parou no mês ${now?.state.monthIndex ?? '?'}: ${gameStore.getState().error ?? 'falhou'}`,
    );
  };

  const fire = async (eventId: string, title: string) => {
    if (!content) return;
    const result = devFireEvent(state, content, eventId);
    if (!result.ok) {
      setStatus(`✗ ${result.error}`);
      return;
    }
    await run(`Evento na caixa de entrada: ${title}`, () => result.state);
  };

  const needle = filter.trim().toLowerCase();
  const shown = needle ? events.filter((e) => e.title.toLowerCase().includes(needle) || e.id.includes(needle)) : events;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Abrir o painel de desenvolvedor"
        hitSlop={6}
        style={[styles.fab, { top: insets.top + 64, right: insets.right + 4 }]}>
        <Text style={styles.fabText}>DEV</Text>
      </Pressable>

      {open ? (
        <InfoSheet title="Painel de desenvolvedor" onClose={() => setOpen(false)}>
          <Text style={styles.dim}>
            Mês {state.monthIndex} de {lastMonth} · capital {Math.round(state.resources.politicalCapital)} · aprovação{' '}
            {(state.indicators.approval * 100).toFixed(1)}%{active.finished ? ' · encerrada' : ''}
          </Text>
          {/* Linha sempre presente: o status aparecer não empurra os botões para baixo. */}
          <Text style={styles.status} numberOfLines={2}>
            {status ?? ' '}
          </Text>

          <SheetHeading text="Recursos" />
          <View style={styles.row}>
            <Button
              label="+50 capital"
              disabled={locked}
              onPress={() => run('+50 capital político', (s) => devAddCapital(s, 50))}
            />
            <Button
              label="−50 capital"
              variant="secondary"
              disabled={locked}
              onPress={() => run('−50 capital político', (s) => devAddCapital(s, -50))}
            />
            <Button
              label="+10% aprovação"
              disabled={locked}
              onPress={() => run('+10 pontos de aprovação', (s) => devAddApproval(s, 0.1))}
            />
            <Button
              label="−10% aprovação"
              variant="secondary"
              disabled={locked}
              onPress={() => run('−10 pontos de aprovação', (s) => devAddApproval(s, -0.1))}
            />
          </View>

          <SheetHeading text="Pular meses (simula cada mês sem decisões)" />
          <View style={styles.row}>
            {MONTH_SHORTCUTS.filter((m) => m.month <= lastMonth).map((m) => (
              <Button
                key={m.month}
                label={m.label}
                variant="secondary"
                disabled={locked || state.monthIndex >= m.month}
                onPress={() => skipTo(m.month)}
              />
            ))}
            <Button label={`Fim (Legado, mês ${lastMonth})`} disabled={locked} onPress={() => skipTo(lastMonth)} />
          </View>
          <View style={styles.row}>
            <TextInput
              value={monthText}
              onChangeText={setMonthText}
              placeholder="mês"
              placeholderTextColor={Hud.textMuted}
              keyboardType="number-pad"
              style={[styles.input, styles.monthInput]}
              accessibilityLabel="Mês de destino"
            />
            <Button
              label="Ir"
              variant="secondary"
              disabled={locked || !/^\d+$/.test(monthText.trim())}
              onPress={() => skipTo(Number(monthText.trim()))}
            />
          </View>

          <SheetHeading text={`Congresso (${inCongress} em tramitação)`} />
          <View style={styles.row}>
            <Button
              label="Aprovar todas"
              disabled={locked || inCongress === 0 || !content}
              onPress={() => content && run(`${inCongress} aprovada(s)`, (s) => devApproveAll(s, content))}
            />
            <Button
              label="Rejeitar todas"
              variant="danger"
              disabled={locked || inCongress === 0 || !content}
              onPress={() => content && run(`${inCongress} rejeitada(s)`, (s) => devRejectAll(s, content))}
            />
          </View>
          <Text style={styles.dim}>
            Aprovadas vão à sanção neste mês (a MP é convertida na hora); a execução começa ao encerrar o mês.
          </Text>

          <SheetHeading text={`Disparar evento (${events.length})`} />
          <TextInput
            value={filter}
            onChangeText={setFilter}
            placeholder="Filtrar por título ou id"
            placeholderTextColor={Hud.textMuted}
            style={styles.input}
            accessibilityLabel="Filtrar eventos"
          />
          {shown.length === 0 ? <EmptyNote text="Nenhum evento com esse filtro." /> : null}
          {shown.map((e) => {
            const pending = state.events.pending.some((p) => p.eventId === e.id);
            return (
              <Pressable
                key={e.id}
                disabled={locked || pending}
                onPress={() => fire(e.id, e.title)}
                accessibilityRole="button"
                accessibilityLabel={`Disparar ${e.title}`}
                style={({ pressed }) => [
                  styles.eventRow,
                  pressed && styles.pressed,
                  (locked || pending) && styles.off,
                ]}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                <Text style={styles.eventId}>
                  {e.id}
                  {pending ? ' · já pendente' : ''}
                </Text>
              </Pressable>
            );
          })}
        </InfoSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ff4fd880',
    backgroundColor: '#2a0b24cc',
    opacity: 0.55,
  },
  fabText: { color: '#ff9fe9', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  dim: { color: Hud.textDim, fontSize: 12 },
  status: { color: Hud.titleBright, fontSize: 13, minHeight: 36 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    backgroundColor: Hud.tile,
    color: Hud.text,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
  },
  monthInput: { width: 80 },
  eventRow: {
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    backgroundColor: Hud.tile,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  eventTitle: { color: Hud.text, fontSize: 13 },
  eventId: { color: Hud.textMuted, fontSize: 11 },
  pressed: { opacity: 0.7 },
  off: { opacity: 0.4 },
});
