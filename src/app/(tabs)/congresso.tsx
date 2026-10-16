import { CongressPanel } from '@/components/tabs/CongressPanel';
import { TabScreen } from '@/components/tabs/TabScreen';

export default function CongressoScreen() {
  return <TabScreen render={(campaign) => <CongressPanel campaign={campaign} />} />;
}
