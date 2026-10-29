import type { GameContent, GameState } from '../types';

/**
 * Efeitos de energia das tecnologias adotadas, em TWh (lidos pelo balanço de energia): capacidade de geração e de
 * transmissão por mês, estoque de armazenamento e a demanda adicional (efeito adverso). Proporcionais ao nível do
 * efeito em vigor, que segue a manutenção paga.
 */
export function researchEnergyEffects(
  state: Pick<GameState, 'research'>,
  content: Pick<GameContent, 'technology'>,
): { generation: number; transmission: number; storage: number; demand: number } {
  const out = { generation: 0, transmission: 0, storage: 0, demand: 0 };
  for (const program of state.research?.programs ?? []) {
    const node = content.technology?.nodes.find((n) => n.id === program.nodeId);
    if (!node || program.effectLevel <= 0) continue;
    if (node.effect.channel === 'geracao') out.generation += program.effectLevel * node.effect.value;
    if (node.effect.channel === 'transmissao') out.transmission += program.effectLevel * node.effect.value;
    if (node.effect.channel === 'armazenamento') out.storage += program.effectLevel * node.effect.value;
    out.demand += program.effectLevel * node.energyDemandTwh;
  }
  return out;
}
