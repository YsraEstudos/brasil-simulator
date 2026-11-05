import { View } from 'react-native';

import { shortMonthLabel } from '@/components/campaign/labels';
import { Text } from '@/components/ui';
import type { GameState } from '@/engine';

import { Hud } from './hudTheme';
import { activeEffects, impulseTimeline, TIMELINE_MONTHS } from './impulseTimeline';

const ROW_HEIGHT = 10;

/**
 * "O que vem por aí" (H7): os efeitos temporários valendo agora, com quanto falta (D6), e a esteira dos próximos 12
 * meses, com o que começa e o que acaba (C2). Só nomes e datas; os valores ficam no "Por que mudou?".
 */
export function EffectsPanel({
  state,
  honeymoonMonths,
}: {
  state: Pick<GameState, 'monthIndex' | 'impulses'>;
  honeymoonMonths: number;
}) {
  const effects = activeEffects(state, honeymoonMonths);
  const timeline = impulseTimeline(state);
  const last = timeline.firstMonth + TIMELINE_MONTHS - 1;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: Hud.textDim, fontSize: 11.5, fontWeight: '700' }}>Efeitos temporários valendo</Text>
        {effects.length === 0 ? (
          <Text style={{ color: Hud.textMuted, fontSize: 11, fontStyle: 'italic' }}>
            Nenhum efeito temporário em andamento.
          </Text>
        ) : (
          effects.map((e) => (
            <View
              key={e.key}
              accessible
              accessibilityLabel={`${e.label}, ${e.remainingText}.${e.detail ? ` ${e.detail}` : ''}`}
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Hud.text, fontSize: 12 }}>{e.label}</Text>
                {e.detail ? <Text style={{ color: Hud.textMuted, fontSize: 10.5 }}>{e.detail}</Text> : null}
              </View>
              <Text tabular style={{ color: e.remaining <= 1 ? Hud.warning : Hud.title, fontSize: 12 }}>
                {e.remainingText}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ color: Hud.textDim, fontSize: 11.5, fontWeight: '700' }}>Próximos 12 meses</Text>
        {timeline.rows.length === 0 ? (
          <Text style={{ color: Hud.textMuted, fontSize: 11, fontStyle: 'italic' }}>
            Nada agendado para começar ou acabar nos próximos 12 meses.
          </Text>
        ) : (
          <>
            {timeline.rows.map((row) => (
              <View key={row.key} accessible accessibilityLabel={row.text} style={{ gap: 2 }}>
                <Text style={{ color: Hud.text, fontSize: 11.5 }} numberOfLines={1}>
                  {row.label}
                </Text>
                <View style={{ flexDirection: 'row', height: ROW_HEIGHT, gap: 2 }}>
                  {Array.from({ length: TIMELINE_MONTHS }, (_, i) => {
                    const on = i >= row.from && i <= row.to;
                    const edgeStart = on && i === row.from && row.startsLater;
                    const edgeEnd = on && i === row.to && row.endsInside;
                    return (
                      <View
                        key={i}
                        style={{
                          flex: 1,
                          borderRadius: 2,
                          backgroundColor: on ? Hud.info : Hud.track,
                          borderLeftWidth: edgeStart ? 3 : 0,
                          borderRightWidth: edgeEnd ? 3 : 0,
                          borderColor: Hud.titleBright,
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: Hud.textMuted, fontSize: 9.5 }}>{shortMonthLabel(timeline.firstMonth)}</Text>
              <Text style={{ color: Hud.textMuted, fontSize: 9.5 }}>
                borda dourada à esquerda: começa · à direita: acaba
              </Text>
              <Text style={{ color: Hud.textMuted, fontSize: 9.5 }}>{shortMonthLabel(last)}</Text>
            </View>
            {timeline.more > 0 && (
              <Text style={{ color: Hud.textMuted, fontSize: 10.5 }}>e mais {timeline.more} efeitos agendados.</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}
