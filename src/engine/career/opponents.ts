import type { CareerProfile } from '../../types/scenario';
import type { CareerCandidateState, CareerState, GameContent } from '../types';

import { alignment, ballotWeight, eligibilityCeiling, initialRecognition, utility } from './viability';
import type { BallotOption } from './electorate';

/**
 * Adversários simples (PLANO_CAMPANHA.md Fase C2, tarefa C2.3; D-C17 opção a): a identidade vem de
 * `elections.candidatos` (nome por bloco) e os dados de campanha do bloco `career.opponents`. O jogador ocupa a vaga
 * do bloco do seu partido: o adversário desse bloco não entra, para não haver dois candidatos no mesmo papel.
 */

/** Id do jogador nas pesquisas e nas listas de candidatos (os adversários usam o id do bloco). */
export const PLAYER_CANDIDATE_ID = 'jogador';

/** Estado inicial dos adversários do perfil, na ordem do cenário. */
export function createOpponents(
  content: Pick<GameContent, 'scenario'>,
  profile: Pick<CareerProfile, 'blocId'>,
): CareerCandidateState[] {
  const ufs = content.scenario.regions?.ufs ?? [];
  return (content.scenario.career?.opponents ?? [])
    .filter((o) => o.blocId !== profile.blocId)
    .map((o) => ({
      blocId: o.blocId,
      recognition: initialRecognition(ufs, o.recognition, o.territorialBase),
      valence: o.valence,
    }));
}

/** Candidato na disputa, com o que a interface pode mostrar (nome e bloco; nunca os valores internos). */
export interface CandidateIdentity {
  id: string;
  blocId: string;
  name: string;
  player: boolean;
}

/** Candidatos na ordem das pesquisas: o jogador primeiro, depois os adversários na ordem do estado. */
export function candidateIdentities(
  career: Pick<CareerState, 'profileId' | 'opponents'>,
  content: Pick<GameContent, 'scenario'>,
): CandidateIdentity[] {
  const profile = content.scenario.career?.profiles.find((p) => p.id === career.profileId);
  const blocName = (blocId: string) => content.scenario.blocs.find((b) => b.id === blocId)?.name ?? blocId;
  const names = content.scenario.elections?.candidatos ?? [];
  return [
    { id: PLAYER_CANDIDATE_ID, blocId: profile?.blocId ?? '', name: 'Você', player: true },
    ...career.opponents.map((o) => ({
      id: o.blocId,
      blocId: o.blocId,
      name: names.find((c) => c.blocId === o.blocId)?.name ?? blocName(o.blocId),
      player: false,
    })),
  ];
}

/** Candidato com bloco, reconhecimento por UF e valência (jogador ou adversário), na ordem das pesquisas. */
export function candidatesOf(
  career: CareerState,
  content: Pick<GameContent, 'scenario'>,
): { blocId: string; recognition: Record<string, number>; valence: number }[] {
  const profile = content.scenario.career?.profiles.find((p) => p.id === career.profileId);
  return [
    { blocId: profile?.blocId ?? '', recognition: career.recognition, valence: career.valence },
    ...career.opponents,
  ];
}

/** Opções da cédula numa UF (peso e teto de cada candidato), na ordem das pesquisas. */
export function ballotOptions(
  career: CareerState,
  content: Pick<GameContent, 'scenario'>,
  ufId: string,
): BallotOption[] {
  const uf = content.scenario.regions?.ufs.find((u) => u.id === ufId);
  if (!uf) throw new RangeError(`UF desconhecida: ${ufId}`);
  return candidatesOf(career, content).map((c) => {
    const bloc = content.scenario.blocs.find((b) => b.id === c.blocId);
    const u = utility(c.valence, alignment(bloc, uf));
    const r = c.recognition[ufId] ?? 0;
    return { weight: ballotWeight(r, u), ceiling: eligibilityCeiling(r, u) };
  });
}
