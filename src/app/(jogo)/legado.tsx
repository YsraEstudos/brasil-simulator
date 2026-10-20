import { useMemo } from 'react';

import { LegacyReport } from '@/components/campaign/LegacyReport';
import { SubScreen } from '@/components/painel/SubScreen';
import { Card, Text } from '@/components/ui';
import { loadContent } from '@/content';
import type { ActiveCampaign } from '@/store';

/** Legado (GAME_DESIGN.md §7.1): subtela aberta pelo Painel ao fim da campanha; antes disso, só explica quando aparece. */
export default function LegadoScreen() {
  return <SubScreen title="Legado" render={(campaign) => <LegadoBody campaign={campaign} />} />;
}

function LegadoBody({ campaign }: { campaign: ActiveCampaign }) {
  const { state, finished } = campaign;
  const content = useMemo(() => loadContent(state.scenarioId), [state.scenarioId]);

  if (!finished) {
    return (
      <Card title="O legado aparece ao fim do mandato">
        <Text variant="body" color="textSecondary">
          Quando a campanha terminar, este relatório compara o país que você recebeu com o que entregou.
        </Text>
      </Card>
    );
  }
  return <LegacyReport state={state} content={content} />;
}
