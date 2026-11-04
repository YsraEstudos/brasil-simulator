/**
 * Sorteio de uma partida completa no NOVO JOGO (PLANO_QUICK_WINS.md, D45). Só escolhe os valores do formulário: quem
 * confirma é o jogador, pelo botão de sempre. Vem de `Math.random` na interface, nunca do motor.
 */

export interface RandomSetupOptions<D extends string, S extends string, P extends string> {
  difficulties: readonly D[];
  scenarioIds: readonly S[];
  profileIds: readonly P[];
}

export interface RandomSetupPick<D extends string, S extends string, P extends string> {
  difficulty: D;
  scenarioId: S;
  profileId: P;
  /** Semente como o campo de texto a guarda: inteiro de 0 a 4.294.967.295. */
  seedText: string;
}

const SEED_SPACE = 4294967296;

function pickOne<T>(random: () => number, options: readonly T[], label: string): T {
  const index = Math.min(options.length - 1, Math.floor(random() * options.length));
  const item = options[index];
  if (options.length === 0 || item === undefined) throw new Error(`Sem opções para sortear: ${label}.`);
  return item;
}

/** Escolhe dificuldade, cenário, perfil e semente. `random` devolve um número em [0, 1). */
export function pickRandomSetup<D extends string, S extends string, P extends string>(
  random: () => number,
  options: RandomSetupOptions<D, S, P>,
): RandomSetupPick<D, S, P> {
  const difficulty = pickOne(random, options.difficulties, 'dificuldade');
  const scenarioId = pickOne(random, options.scenarioIds, 'cenário');
  const profileId = pickOne(random, options.profileIds, 'perfil');
  const seed = Math.min(SEED_SPACE - 1, Math.floor(random() * SEED_SPACE));
  return { difficulty, scenarioId, profileId, seedText: String(seed) };
}
