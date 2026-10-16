import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { monthLabel, shortMonthLabel } from '@/components/campaign/labels';
import { Card, formatNumber, Text } from '@/components/ui';
import { loadContent } from '@/content';
import { MIN_TOUCH, Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { headlines, impeachmentPressure, type NewsItem } from '@/engine';
import type { ActiveCampaign } from '@/store';

import { activeInstitutionalMarks, pressureBand } from './institutionsView';
import {
  filterNews,
  groupNewsByMonth,
  NEWS_FILTERS,
  NEWS_FILTER_LABEL,
  NEWS_KIND_LABEL,
  NEWS_TONE_LABEL,
  NEWS_TONE_MARK,
  newsCharacterName,
  type NewsFilter,
} from './newsView';

/** Painel da aba Notícias (GAME_DESIGN.md §12–§13). Manchetes, feed e eventos são fictícios. */
export function NewsPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { state, lastReport } = campaign;
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);
  const [filter, setFilter] = useState<NewsFilter>('todas');

  const news = lastReport ? headlines(lastReport, content) : [];
  const characters = content.scenario.characters ?? [];
  const feed = state.events.news;
  const groups = groupNewsByMonth(filterNews(feed, filter));
  const pending = state.events.pending.map((p) => ({
    key: `${p.eventId}_${p.monthIndex}`,
    title: content.events.find((e) => e.id === p.eventId)?.title ?? p.eventId,
    monthIndex: p.monthIndex,
  }));

  const pressure = impeachmentPressure(state, content);
  const marks = activeInstitutionalMarks(state.events.flags);

  return (
    <>
      {lastReport ? (
        <>
          <Text variant="heading">{`Manchetes de ${monthLabel(lastReport.monthIndex)}`}</Text>
          {news.length === 0 ? (
            <Text variant="body" color="textSecondary">
              Nenhuma manchete relevante neste mês.
            </Text>
          ) : (
            news.map((headline, i) => (
              <Card key={`${i}_${headline}`}>
                <Text variant="body">{headline}</Text>
              </Card>
            ))
          )}
        </>
      ) : (
        <Card>
          <Text variant="body" color="textSecondary">
            Nenhuma notícia ainda: encerre o primeiro mês.
          </Text>
        </Card>
      )}

      <Card
        title="Instituições"
        subtitle="Simulação fictícia: pressão e marcas institucionais deste jogo, sem relação com órgãos reais.">
        <Text variant="label">{`Pressão de impeachment: ${pressureBand(pressure)}`}</Text>
        <Text variant="caption" color="textSecondary" tabular>
          {`Índice ${formatNumber(pressure, 2)} em uma escala de 0 a 1.`}
        </Text>
        {marks.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma marca institucional ativa.
          </Text>
        ) : (
          marks.map((mark) => (
            <Text key={mark.flag} variant="body">
              {`• ${mark.label} (desde ${shortMonthLabel(mark.sinceMonth)})`}
            </Text>
          ))
        )}
      </Card>

      <Card title="Feed de notícias" subtitle="As mais recentes primeiro. Cada notícia traz a causa.">
        <FilterChips value={filter} onChange={setFilter} />
        {feed.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma notícia registrada ainda. O noticiário começa depois do primeiro mês encerrado.
          </Text>
        ) : groups.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhuma notícia deste tipo até agora.
          </Text>
        ) : (
          groups.map((group) => (
            <View key={group.monthIndex} style={styles.group}>
              <Text variant="label" color="textSecondary" accessibilityRole="header">
                {group.label}
              </Text>
              {group.items.map((item) => (
                <NewsCard key={item.id} item={item} characterName={newsCharacterName(item, characters)} />
              ))}
            </View>
          ))
        )}
      </Card>

      <Card title="Caixa de entrada">
        {pending.length === 0 ? (
          <Text variant="body" color="textSecondary">
            Nenhum evento aguardando resposta.
          </Text>
        ) : (
          pending.map((item) => (
            <Card
              key={item.key}
              title={item.title}
              subtitle={`Recebido em ${shortMonthLabel(item.monthIndex)} · responda na aba Presidência`}
            />
          ))
        )}
      </Card>

      <Text variant="caption" color="textSecondary" align="center">
        Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro.
      </Text>
    </>
  );
}

/** Filtro por tipo. Escolha só de interface: não é salva nem entra no motor. */
function FilterChips({ value, onChange }: { value: NewsFilter; onChange: (filter: NewsFilter) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {NEWS_FILTERS.map((filter) => {
        const selected = filter === value;
        return (
          <Pressable
            key={filter}
            onPress={() => onChange(filter)}
            accessibilityRole="radio"
            accessibilityLabel={`Filtrar notícias: ${NEWS_FILTER_LABEL[filter]}`}
            accessibilityState={{ checked: selected }}
            style={[
              styles.chip,
              {
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accent : colors.surface,
              },
            ]}>
            <Text variant="label" color={selected ? 'onAccent' : 'text'}>
              {NEWS_FILTER_LABEL[filter]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Uma notícia: tom com marca e rótulo textual, tipo, manchete, personagem e causa. */
function NewsCard({ item, characterName }: { item: NewsItem; characterName: string | undefined }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.news, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {/* O tom vai no texto (marca e rótulo), a cor só reforça. */}
      <Text variant="caption" color={NEWS_TONE_COLOR[item.tone]}>
        {`${NEWS_TONE_MARK[item.tone]} ${NEWS_TONE_LABEL[item.tone]} · ${NEWS_KIND_LABEL[item.kind]}`}
      </Text>
      <Text variant="body">{item.headline}</Text>
      {characterName && (
        <Text variant="caption" color="textSecondary">
          {`Personagem: ${characterName}`}
        </Text>
      )}
      <Text variant="caption" color="textSecondary">
        {item.cause}
      </Text>
    </View>
  );
}

const NEWS_TONE_COLOR: Record<NewsItem['tone'], ThemeColor> = {
  positiva: 'positive',
  negativa: 'negative',
  neutra: 'textSecondary',
};

const styles = StyleSheet.create({
  group: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: MIN_TOUCH,
    minWidth: MIN_TOUCH,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
  },
  news: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.three, gap: Spacing.half },
});
