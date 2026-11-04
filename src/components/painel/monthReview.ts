import { HOW_TO_PLAY_SECTIONS } from '@/components/menu/howToPlay';

/** Apenas itens que o jogador ainda não resolveu e votações previstas para este mês. */
export function monthReview(input: {
  events: readonly { id: string; name: string }[];
  choices: Readonly<Record<string, string>>;
  actionsMax: number;
  actionsUsed: number;
  proposals: readonly { name: string; voteMonth: number | null; status: string }[];
  monthIndex: number;
}) {
  return {
    events: input.events.filter((event) => input.choices[event.id] === undefined).map((event) => event.name),
    actionsLeft: Math.max(0, input.actionsMax - input.actionsUsed),
    proposals: input.proposals
      .filter(
        (proposal) =>
          (proposal.status === 'em_tramitacao' ||
            proposal.status === 'parada' ||
            proposal.status === 'apreciacao_veto') &&
          proposal.voteMonth !== null &&
          proposal.voteMonth <= input.monthIndex,
      )
      .map((proposal) => proposal.name),
  };
}

/** Dicas reais da tela Como jogar, escolhidas sem alterar o estado do jogo. */
export function loadingTip(seed: number): string {
  const tips = HOW_TO_PLAY_SECTIONS.filter((section) =>
    ['mes', 'gabinete', 'congresso', 'salvar'].includes(section.id),
  ).flatMap((section) => section.paragraphs);
  return tips[((Math.trunc(seed) % tips.length) + tips.length) % tips.length];
}
