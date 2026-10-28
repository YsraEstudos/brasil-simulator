import { LearningLabScreen } from '@/components/campaign/LearningLabScreen';
import { SubScreen } from '@/components/painel/SubScreen';

export default function LaboratorioScreen() {
  return (
    <SubScreen title="Laboratório" render={(campaign) => <LearningLabScreen key={campaign.id} campaign={campaign} />} />
  );
}
