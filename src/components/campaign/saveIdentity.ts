import { formatNumber } from '@/components/ui/format';
import { CAMPAIGN_ACCENTS, CAMPAIGN_NOTES_MAX, type CampaignAccent } from '@/types/campaignIdentity';

/**
 * Identidade do save (PLANO_SAVES_HISTORICO.md H2): textos do bloco de notas (D31) e da cor de destaque (D44).
 * Funções puras; a tela só desenha.
 */

export const ACCENT_LABEL: Readonly<Record<CampaignAccent, string>> = {
  dourado: 'Dourado',
  verde: 'Verde',
  azul: 'Azul',
  vermelho: 'Vermelho',
};

/** Opções do seletor, na ordem: as quatro cores e "Nenhuma" por último. */
export const ACCENT_OPTIONS: readonly (CampaignAccent | null)[] = [...CAMPAIGN_ACCENTS, null];

/** Nome escrito da cor (nunca só a cor, por causa do modo para daltônicos). */
export function accentName(accent: CampaignAccent | null): string {
  return accent ? ACCENT_LABEL[accent] : 'Nenhuma';
}

/** Rótulo para leitor de tela de cada opção do seletor. */
export function accentOptionLabel(accent: CampaignAccent | null, campaignName: string): string {
  return accent
    ? `Cor de destaque ${ACCENT_LABEL[accent]} para ${campaignName}`
    : `Sem cor de destaque em ${campaignName}`;
}

/** Contador do campo: "120/2.000". */
export function notesCounter(text: string): string {
  return `${formatNumber(text.length)}/${formatNumber(CAMPAIGN_NOTES_MAX)}`;
}

/** Prévia de uma linha para o cartão do save: a primeira linha, cortada em `max` com reticências; vazio = "". */
export function notesPreview(notes: string, max = 80): string {
  const first = notes.split('\n').find((l) => l.trim() !== '') ?? '';
  const chars = Array.from(first.trim());
  const more =
    chars.length > max ||
    notes
      .trim()
      .split('\n')
      .filter((l) => l.trim() !== '').length > 1;
  const cut = chars.slice(0, max).join('');
  return cut === '' ? '' : more ? `${cut.trimEnd()}…` : cut;
}
