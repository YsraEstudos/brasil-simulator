import { useState } from 'react';
import { router } from 'expo-router';

import { Button, Card, Text } from '@/components/ui';
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
      <Button label="Abrir tutorial jogável" variant="secondary" onPress={() => router.push('/tutorial')} block />
      <Button
        label="Abrir laboratório de decisões"
        variant="secondary"
        onPress={() => router.push('/laboratorio')}
        block
      />
    </Card>
  );
}
