import { formatNumber, formatPercent } from '@/components/ui/format';
import {
  CAREER_ACTIONS,
  candidateIdentities,
  electedOutcome,
  isCareerAction,
  PLAYER_CANDIDATE_ID,
  type CareerElectionOutcome,
  type CareerElectionRound,
  type GameContent,
  type GameState,
} from '@/engine';

/**
 * Leitura do resultado da eleição e do resumo da campanha (PLANO_CAMPANHA.md Fase C5, tarefas C5.1 e C5.2). Mostra o
 * que é público (votos e percentuais apurados, nacional e por UF) e explica a campanha **em texto**, a partir das
 * causas acumuladas no estado: os valores internos do motor (reconhecimento, valência, coeficientes) nunca aparecem.
 * Separa o que foi escolha do jogador do que foi acontecimento externo. Função pura.
 */

export interface ElectionRow {
  id: string;
  name: string;
  /** Percentual dos válidos, ex.: "38,2%". */
  share: string;
  votes: string;
  player: boolean;
  winner: boolean;
}

export interface ElectionRoundView {
  title: string;
  rows: ElectionRow[];
  /** Ex.: "Comparecimento de 79,1%; brancos e nulos: 5,6% de quem votou." */
  turnout: string;
}

export interface CareerElectionViewModel {
  title: string;
  /** Linha explicativa do desfecho. */
  subtitle: string;
  won: boolean;
  rounds: ElectionRoundView[];
  /** Onde o jogador foi o mais votado, no 1º turno e (se houve) no 2º. */
  ufSummary: string[];
  /** Desempates aplicados, em texto (vazio quase sempre). */
  tiebreaks: string[];
  /** A última pesquisa contra as urnas, em texto. */
  pollVsResult: string | null;
}

const OUTCOME_TITLE: Record<CareerElectionOutcome, { title: string; subtitle: string }> = {
  eleito_1t: { title: 'Você venceu no 1º turno', subtitle: 'Teve mais da metade dos votos válidos.' },
  eleito_2t: { title: 'Você venceu no 2º turno', subtitle: 'Teve mais votos válidos do que a outra candidatura.' },
  derrotado_1t: {
    title: 'Derrota no 1º turno',
    subtitle: 'A candidatura não chegou ao 2º turno ou outra candidatura venceu já no 1º.',
  },
  derrotado_2t: { title: 'Derrota no 2º turno', subtitle: 'A outra candidatura teve mais votos válidos.' },
};

function roundView(
  round: CareerElectionRound,
  title: string,
  names: Record<string, string>,
  winner: string | null,
): ElectionRoundView {
  const valid = round.votes.reduce((a, b) => a + b, 0);
  const turnout = round.electorate - round.abstention;
  const rows = round.candidates
    .map((id, i) => ({
      id,
      name: names[id] ?? id,
      share: formatPercent(valid > 0 ? round.votes[i] / valid : 0, 1),
      votes: `${formatNumber(round.votes[i])} votos`,
      player: id === PLAYER_CANDIDATE_ID,
      winner: id === winner,
      order: round.votes[i],
    }))
    .sort((a, b) => b.order - a.order)
    .map(({ order: _order, ...row }) => row);
  return {
    title,
    rows,
    turnout: `Comparecimento de ${formatPercent(turnout / round.electorate, 1)}; brancos e nulos: ${formatPercent(
      turnout > 0 ? round.blankNull / turnout : 0,
      1,
    )} de quem votou.`,
  };
}

function ufLine(round: CareerElectionRound, label: string, total: number): string {
  const won = Object.values(round.ufWinners).filter((id) => id === PLAYER_CANDIDATE_ID).length;
  if (won === 0) return `${label}: você não foi a candidatura mais votada em nenhum estado.`;
  return `${label}: você foi a candidatura mais votada em ${won} de ${total} estados.`;
}

/** Resultado da eleição para a tela; `null` antes dela. */
export function careerElectionViewModel(
  state: Pick<GameState, 'career'>,
  content: Pick<GameContent, 'scenario'>,
): CareerElectionViewModel | null {
  const career = state.career;
  const election = career?.election;
  if (!career || !election) return null;
  const names = Object.fromEntries(candidateIdentities(career, content).map((c) => [c.id, c.name]));
  const total = Object.keys(election.first.ufWinners).length;
  const head = OUTCOME_TITLE[election.outcome];
  const rounds = [
    roundView(election.first, '1º turno', names, election.second ? null : election.winner),
    ...(election.second ? [roundView(election.second, '2º turno', names, election.winner)] : []),
  ];
  const ufSummary = [
    ufLine(election.first, '1º turno', total),
    ...(election.second?.candidates.includes(PLAYER_CANDIDATE_ID) ? [ufLine(election.second, '2º turno', total)] : []),
  ];
  const tiebreaks = election.tiebreaks.map((t) => {
    const who = names[t.winner] ?? t.winner;
    const what = t.place === 'segundo_lugar' ? 'a vaga no 2º turno' : 'a eleição';
    return t.rule === 'idade'
      ? `Empate: ${who} ficou com ${what} pelo critério de idade (Constituição, art. 77).`
      : `Empate com idades iguais: ${what} foi decidida por sorteio.`;
  });
  const poll = career.poll;
  const pollShare = poll?.intentions.find((i) => i.candidateId === PLAYER_CANDIDATE_ID)?.share;
  const valid = election.first.votes.reduce((a, b) => a + b, 0);
  const result = election.first.votes[election.first.candidates.indexOf(PLAYER_CANDIDATE_ID)] / valid;
  const pollVsResult =
    pollShare === undefined
      ? null
      : `A última pesquisa dava ${formatPercent(pollShare, 0)} das intenções a você, contando indecisos e brancos; nas urnas, você teve ${formatPercent(result, 1)} dos votos válidos no 1º turno.`;
  return {
    title: head.title,
    subtitle: head.subtitle,
    won: electedOutcome(election.outcome),
    rounds,
    ufSummary,
    tiebreaks,
    pollVsResult,
  };
}

/** Resumo da campanha depois da derrota (D-C18): resultado, fatores, escolhas e o que foi externo. */
export interface CareerCampaignSummary {
  election: CareerElectionViewModel;
  /** Como terminou o reconhecimento e a imagem, em texto. */
  factors: string[];
  /** Duas ou três escolhas com efeito relevante (do jogador). */
  choices: string[];
  /** O que não dependeu do jogador. */
  external: string[];
}

/** Nome de uma causa do jogador ("acao:<id>", "debate", "debate:<postura>"); `null` = causa externa. */
function playerCauseName(cause: string): string | null {
  if (cause.startsWith('acao:')) {
    const id = cause.slice('acao:'.length);
    return isCareerAction(id) ? CAREER_ACTIONS[id].name : id;
  }
  if (cause === 'debate' || cause.startsWith('debate:')) return 'Debate na TV';
  return null;
}

/** Tamanho de uma variação, sem número. */
function size(x: number): string {
  const a = Math.abs(x);
  if (a < 0.01) return 'quase nada';
  if (a < 0.04) return 'um pouco';
  return 'bastante';
}

/** Resumo para a tela da derrota (ou do fim da campanha); `null` antes da eleição. */
export function careerCampaignSummary(
  state: Pick<GameState, 'career'>,
  content: Pick<GameContent, 'scenario'>,
): CareerCampaignSummary | null {
  const election = careerElectionViewModel(state, content);
  const career = state.career;
  if (!election || !career) return null;
  const totals = career.causeTotals ?? { recognition: {}, valence: {} };
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const recognition = sum(totals.recognition);
  const valence = sum(totals.valence);
  const factors = [
    recognition >= 0
      ? `Ao longo da campanha, seu nome ficou ${size(recognition)} mais conhecido no país.`
      : `Ao longo da campanha, seu nome ficou ${size(recognition)} menos lembrado no país.`,
    Math.abs(valence) < 0.01
      ? 'Sua imagem entre quem conhece você quase não mudou.'
      : valence > 0
        ? `Sua imagem melhorou ${size(valence)} entre quem conhece você.`
        : `Sua imagem piorou ${size(valence)} entre quem conhece você.`,
  ];

  // Escolhas do jogador: soma do efeito no reconhecimento e na imagem por ação, das maiores para as menores.
  const byChoice = new Map<string, { recognition: number; valence: number }>();
  for (const [kind, bucket] of [
    ['recognition', totals.recognition],
    ['valence', totals.valence],
  ] as const) {
    for (const [cause, delta] of Object.entries(bucket)) {
      const name = playerCauseName(cause);
      if (!name) continue;
      const entry = byChoice.get(name) ?? { recognition: 0, valence: 0 };
      entry[kind] += delta;
      byChoice.set(name, entry);
    }
  }
  const choices = [...byChoice.entries()]
    .sort(
      (a, b) =>
        Math.abs(b[1].recognition) + Math.abs(b[1].valence) - Math.abs(a[1].recognition) - Math.abs(a[1].valence),
    )
    .slice(0, 3)
    .map(([name, e]) => {
      const parts = [
        ...(Math.abs(e.recognition) >= 0.001 ? [`deixou seu nome ${size(e.recognition)} mais conhecido`] : []),
        ...(e.valence > 0.001 ? [`melhorou ${size(e.valence)} a sua imagem`] : []),
        ...(e.valence < -0.001 ? [`desgastou ${size(e.valence)} a sua imagem`] : []),
      ];
      return parts.length > 0 ? `${name}: ${parts.join(' e ')}.` : `${name}: quase não mudou a disputa.`;
    });
  // O debate acontece mesmo sem escolha (postura padrão); ações de campanha, só as marcadas.
  if (![...Object.keys(totals.recognition), ...Object.keys(totals.valence)].some((c) => c.startsWith('acao:'))) {
    choices.push('Você não fez ações de campanha: fora o debate, a disputa correu só com a exposição natural.');
  }

  const decay = totals.recognition.ostracismo ?? 0;
  const organic = totals.recognition.organico ?? 0;
  const external = [
    ...(organic > 0 ? [`A exposição natural da campanha deixou seu nome ${size(organic)} mais conhecido.`] : []),
    ...(decay < 0 ? [`O esquecimento entre um turno e outro tirou ${size(decay)} do seu reconhecimento.`] : []),
    'As outras candidaturas também ganharam exposição com a campanha.',
    'O humor do eleitor no dia da eleição tem uma parcela de imprevisto que a pesquisa não capta.',
  ];
  return { election, factors, choices, external };
}
