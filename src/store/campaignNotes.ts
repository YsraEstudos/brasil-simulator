import { CAMPAIGN_NOTES_MAX } from '@/types/campaignIdentity';

/**
 * Notas como serão gravadas: quebras de linha do Windows viram `\n`, espaços no fim de cada linha e linhas vazias nas
 * pontas somem, e o texto é cortado em `CAMPAIGN_NOTES_MAX` sem partir um emoji. Valor que não é texto vira vazio.
 */
export function normalizeNotes(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
  let out = '';
  for (const ch of text) {
    if (out.length + ch.length > CAMPAIGN_NOTES_MAX) break;
    out += ch;
  }
  return out;
}
