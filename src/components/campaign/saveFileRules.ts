const BYTES_PER_MB = 1024 * 1024;

/**
 * Tamanho máximo de um arquivo de save aceito na importação. Um save real tem poucos KB; o teto só recusa arquivos
 * absurdos antes de serem lidos inteiros para a memória.
 */
export const MAX_SAVE_FILE_BYTES = 20 * BYTES_PER_MB;

/**
 * Mensagem para o jogador quando o arquivo passa do limite; `null` se cabe ou se o tamanho é desconhecido (nesse caso
 * a leitura segue e o pacote é validado depois, na store).
 */
export function saveFileTooLargeMessage(size: number | undefined): string | null {
  if (size === undefined || !Number.isFinite(size) || size <= MAX_SAVE_FILE_BYTES) return null;
  const sizeMb = Math.ceil(size / BYTES_PER_MB);
  const limitMb = MAX_SAVE_FILE_BYTES / BYTES_PER_MB;
  return `Este arquivo tem cerca de ${sizeMb} MB e o limite é de ${limitMb} MB. Confira se escolheu o save certo: um save do jogo é bem menor que isso.`;
}
