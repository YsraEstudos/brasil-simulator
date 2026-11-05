import { describe, expect, it } from 'vitest';

import { normalizeNotes } from '@/store/campaignNotes';
import { CAMPAIGN_ACCENTS, CAMPAIGN_NOTES_MAX } from '@/types/campaignIdentity';

import { ACCENT_OPTIONS, accentName, accentOptionLabel, notesCounter, notesPreview } from './saveIdentity';

// PLANO_SAVES_HISTORICO.md, Fase H2: bloco de notas (D31) e cor de destaque (D44).
describe('identidade do save', () => {
  it('toda cor tem nome escrito, e "Nenhuma" fica por último', () => {
    expect(ACCENT_OPTIONS).toEqual([...CAMPAIGN_ACCENTS, null]);
    expect(ACCENT_OPTIONS.map(accentName)).toEqual(['Dourado', 'Verde', 'Azul', 'Vermelho', 'Nenhuma']);
    expect(accentOptionLabel('verde', 'Gestão X')).toBe('Cor de destaque Verde para Gestão X');
    expect(accentOptionLabel(null, 'Gestão X')).toBe('Sem cor de destaque em Gestão X');
  });

  it('normaliza as notas: quebras do Windows, espaços no fim das linhas e linhas vazias nas pontas', () => {
    expect(normalizeNotes('\r\n  Meta: reforma  \r\nCuidar do Centrão\t\n\n')).toBe(
      '  Meta: reforma\nCuidar do Centrão',
    );
    expect(normalizeNotes(42)).toBe('');
  });

  it('corta em 2.000 caracteres sem partir um emoji', () => {
    expect(normalizeNotes('a'.repeat(CAMPAIGN_NOTES_MAX + 50))).toHaveLength(CAMPAIGN_NOTES_MAX);
    const withEmoji = `${'a'.repeat(CAMPAIGN_NOTES_MAX - 1)}🇧🇷`;
    expect(normalizeNotes(withEmoji)).toBe('a'.repeat(CAMPAIGN_NOTES_MAX - 1));
  });

  it('contador e prévia de uma linha', () => {
    expect(notesCounter('abc')).toBe('3/2.000');
    expect(notesPreview('')).toBe('');
    expect(notesPreview('\n Só uma linha ')).toBe('Só uma linha');
    expect(notesPreview('Primeira\nSegunda')).toBe('Primeira…');
    expect(notesPreview('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`);
  });
});
