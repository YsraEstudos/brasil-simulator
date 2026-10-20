import { SubScreen } from '@/components/painel/SubScreen';
import { EconomyPanel } from '@/components/tabs/EconomyPanel';

export default function EconomiaScreen() {
  return <SubScreen title="Economia" render={(campaign) => <EconomyPanel campaign={campaign} />} />;
}
