import { SubScreen } from '@/components/painel/SubScreen';
import { CongressPanel } from '@/components/tabs/CongressPanel';

export default function CongressoScreen() {
  return <SubScreen title="Congresso" render={(campaign) => <CongressPanel campaign={campaign} />} />;
}
