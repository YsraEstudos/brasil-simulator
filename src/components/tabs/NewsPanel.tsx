import { monthLabel, shortMonthLabel } from '@/components/campaign/labels';
import { Card, Text } from '@/components/ui';
import { loadContent } from '@/content';
import { headlines } from '@/engine';
import type { ActiveCampaign } from '@/store';

/** Painel da aba Notícias (GAME_DESIGN.md §12–§13). Manchetes e eventos são fictícios. */
export function NewsPanel({ campaign }: { campaign: ActiveCampaign }) {
  const { state, lastReport } = campaign;
  const content = loadContent(state.scenarioId);

  const news = lastReport ? headlines(lastReport, content) : [];
  const pending = state.events.pending.map((p) => ({
    key: `${p.eventId}_${p.monthIndex}`,
    title: content.events.find((e) => e.id === p.eventId)?.title ?? p.eventId,
    monthIndex: p.monthIndex,
  }));

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
