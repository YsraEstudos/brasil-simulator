import { MandateTimeline } from '@/components/history/MandateTimeline';
import { SubScreen } from '@/components/painel/SubScreen';

/** Linha do tempo do mandato (PLANO_SAVES_HISTORICO.md H6, A40): aberta pelo menu ☰ do Painel e pelo legado. */
export default function LinhaDoTempoScreen() {
  return <SubScreen title="Linha do tempo" render={(campaign) => <MandateTimeline campaign={campaign} />} />;
}
