import { useState } from 'react';

import { Card, Text } from '@/components/ui';
import { Collapsible } from './SetupBits';
import { campaignTutorial } from './campaignTutorial';

/** Ajuda acessível e consultável durante o percurso eleitoral. */
export function CampaignTutorialCard() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Collapsible
        title="COMO JOGAR A CAMPANHA"
        hint="Orientações sobre ações, pesquisa e eleição"
        open={open}
        onToggle={() => setOpen(!open)}>
        {campaignTutorial.map((paragraph) => (
          <Text key={paragraph}>{paragraph}</Text>
        ))}
      </Collapsible>
    </Card>
  );
}
