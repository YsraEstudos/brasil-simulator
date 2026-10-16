import { NewsPanel } from '@/components/tabs/NewsPanel';
import { TabScreen } from '@/components/tabs/TabScreen';

export default function NoticiasScreen() {
  return <TabScreen render={(campaign) => <NewsPanel campaign={campaign} />} />;
}
