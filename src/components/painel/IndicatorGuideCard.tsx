import { Card, Text } from '@/components/ui';

import { type GuidedIndicator, INDICATOR_GUIDE, indicatorBand, outOfBandAlert } from './indicatorGuide';

const BAND_WORD = { boa: 'Boa', atencao: 'Atenção', ruim: 'Ruim' } as const;

/**
 * Explicação de um indicador (botão "?" da gaveta de Indicadores, PLANO_QUICK_WINS.md, A18): o que o número mede, as
 * faixas em palavras e onde ele está agora. A faixa atual é texto, não só cor.
 */
export function IndicatorGuideCard({ indicator, value }: { indicator: GuidedIndicator; value: number }) {
  const guide = INDICATOR_GUIDE[indicator];
  const band = indicatorBand(indicator, value);
  const alert = outOfBandAlert(indicator, value);
  return (
    <Card title={guide.name} subtitle={`Agora: ${BAND_WORD[band]}`}>
      <Text variant="body">{guide.what}</Text>
      <Text variant="caption" color="textSecondary">
        {guide.bands}
      </Text>
      <Text variant="caption" color="textSecondary">
        {guide.arrows}
      </Text>
      {alert && (
        <Text variant="caption" color="negative">
          {`⚠ ${alert}`}
        </Text>
      )}
    </Card>
  );
}
