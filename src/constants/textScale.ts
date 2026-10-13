/** Escalas de texto oferecidas ao jogador (somam-se à configuração de acessibilidade do sistema). */
export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
