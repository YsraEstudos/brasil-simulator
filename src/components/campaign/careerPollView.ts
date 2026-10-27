import { formatPercent } from '@/components/ui/format';
import { currentPollView, type GameContent, type GameState, type MonthReport, type RecognitionBand } from '@/engine';

import { careerTurnLabel } from './labels';

/**
 * Leitura da pesquisa para a tela (PLANO_CAMPANHA.md Fase C2, "Pesquisas e visibilidade"): só a estimativa
 * persistida, com data, abrangência e margem; o mapa de reconhecimento em faixas; e a explicação em texto, sem
 * coeficientes. Os valores internos do motor nunca aparecem aqui. Função pura: abrir a tela não muda nada.
 */

/** Faixa do reconhecimento como o jogador lê. */
export const RECOGNITION_BAND_LABEL: Record<RecognitionBand, string> = {
  desconhecido: 'Desconhecido',
  pouco_conhecido: 'Pouco conhecido',
  conhecido: 'Conhecido',
  muito_conhecido: 'Muito conhecido',
};

const BAND_ORDER: readonly RecognitionBand[] = ['muito_conhecido', 'conhecido', 'pouco_conhecido', 'desconhecido'];

export interface PollRow {
  id: string;
  label: string;
  share: string;
  player: boolean;
}

export interface CareerPollViewModel {
  title: string;
  subtitle: string;
  rows: PollRow[];
  /** Ex.: "Margem de erro: 2 pontos para mais ou para menos." */
  margin: string;
  /** Contagem de UFs por faixa, da mais conhecida para a menos. */
  bands: { band: RecognitionBand; label: string; ufs: string[] }[];
  /** "Por que mudou?" do reconhecimento, em texto, a partir do último relatório. */
  why: string[];
}

/** Frase de cada causa do reconhecimento (sem números do motor). */
const WHY_TEXT: Record<string, { up: string; down: string }> = {
  organico: {
    up: 'A exposição da campanha contribuiu para aumentar seu reconhecimento.',
    down: 'A exposição da campanha não bastou para manter seu reconhecimento.',
  },
  ostracismo: {
    up: 'Você voltou ao noticiário e deixou de ser esquecido.',
    down: 'O tempo longe do noticiário contribuiu para reduzir seu reconhecimento.',
  },
  // Ações e debate (Fase C4): só puxam para cima.
  'acao:comicio_nacional': { up: 'O comício nacional ampliou seu reconhecimento.', down: '' },
  'acao:caravana_regional': { up: 'A caravana tornou você mais conhecido no estado visitado.', down: '' },
  'acao:mobilizar_militancia': { up: 'A militância divulgou a candidatura onde o partido é forte.', down: '' },
  debate: { up: 'O debate na TV deixou você mais conhecido.', down: '' },
};

/** Monta a leitura; `null` antes da primeira pesquisa ou sem carreira. */
export function careerPollViewModel(
  state: Pick<GameState, 'career'>,
  content: Pick<GameContent, 'scenario'>,
  report?: MonthReport,
): CareerPollViewModel | null {
  const poll = currentPollView(state, content);
  if (!poll) return null;
  // Candidatos do mais ao menos citado (o jogador em destaque); indecisos e brancos/nulos no fim.
  const ranked = [...poll.intentions].sort((a, b) => b.share - a.share);
  const rows: PollRow[] = [
    ...ranked.map((i) => ({
      id: i.candidateId,
      label: poll.names[i.candidateId] ?? i.candidateId,
      share: formatPercent(i.share, 0),
      player: i.candidateId === 'jogador',
    })),
    { id: 'indecisos', label: 'Indecisos', share: formatPercent(poll.undecided, 0), player: false },
    { id: 'brancos_nulos', label: 'Brancos e nulos', share: formatPercent(poll.blankNull, 0), player: false },
  ];
  const points = Math.round(poll.margin * 100);
  const bands = BAND_ORDER.map((band) => ({
    band,
    label: RECOGNITION_BAND_LABEL[band],
    ufs: Object.entries(poll.recognitionBands)
      .filter(([, b]) => b === band)
      .map(([uf]) => uf),
  })).filter((b) => b.ufs.length > 0);
  // Só as causas que puxam na direção da variação do turno (os principais fatores, sem números).
  const pieces = (report?.contributions ?? []).filter((c) => c.indicator === 'careerRecognition');
  const net = pieces.reduce((s, c) => s + c.delta, 0);
  const why = pieces
    .filter((c) => c.delta * net > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .map((c) => WHY_TEXT[c.cause]?.[c.delta > 0 ? 'up' : 'down'])
    .filter((t): t is string => t !== undefined && t !== '');
  return {
    title: 'Pesquisa nacional',
    subtitle: `${careerTurnLabel({ from: poll.month })} · intenção de voto entre quem vai votar`,
    rows,
    margin: `Margem de erro: ${points} ${points === 1 ? 'ponto' : 'pontos'} para mais ou para menos.`,
    bands,
    why,
  };
}
