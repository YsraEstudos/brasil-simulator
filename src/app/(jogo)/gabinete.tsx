import { CampaignView } from '@/components/campaign/CampaignView';
import { SubScreen } from '@/components/painel/SubScreen';

/** Gabinete (provisório): as decisões do mês (a antiga Presidência sem o resumo do mês), subtela do Painel. */
export default function GabineteScreen() {
  return <SubScreen title="Gabinete" render={(campaign) => <CampaignView campaign={campaign} />} />;
}
