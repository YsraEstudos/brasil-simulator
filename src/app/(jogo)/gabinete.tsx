import { CampaignView } from '@/components/campaign/CampaignView';
import { SubScreen } from '@/components/painel/SubScreen';

/** Gabinete (provisório): a visão da partida que era a Presidência, agora subtela do Painel. */
export default function GabineteScreen() {
  return <SubScreen title="Gabinete" render={(campaign) => <CampaignView campaign={campaign} />} />;
}
