import { GabineteView } from '@/components/campaign/GabineteView';
import { SubScreen } from '@/components/painel/SubScreen';

/** Gabinete: a agenda presidencial do mês (decisões, políticas públicas e ações de agenda), subtela do Painel. */
export default function GabineteScreen() {
  return <SubScreen title="Gabinete" render={(campaign) => <GabineteView campaign={campaign} />} />;
}
