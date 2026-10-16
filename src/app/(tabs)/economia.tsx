import { EconomyPanel } from '@/components/tabs/EconomyPanel';
import { TabScreen } from '@/components/tabs/TabScreen';

export default function EconomiaScreen() {
  return <TabScreen render={(campaign) => <EconomyPanel campaign={campaign} />} />;
}
