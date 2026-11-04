import { describe, expect, it } from 'vitest';

import { HOW_TO_PLAY_SECTIONS } from './howToPlay';

/** Aviso de ficção exato (GAME_DESIGN.md §13: tela inicial e loja). */
const FICTION_NOTICE = 'Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro.';

/** Limite de leitura por parágrafo, em caracteres (a tela é lida no celular). */
const MAX_PARAGRAPH_LENGTH = 320;

describe('Como jogar (conteúdo da tela de instruções básicas)', () => {
  it('tem de 5 a 8 seções', () => {
    expect(HOW_TO_PLAY_SECTIONS.length).toBeGreaterThanOrEqual(5);
    expect(HOW_TO_PLAY_SECTIONS.length).toBeLessThanOrEqual(8);
  });

  it('tem ids únicos', () => {
    const ids = HOW_TO_PLAY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tem títulos não vazios', () => {
    for (const section of HOW_TO_PLAY_SECTIONS) {
      expect(section.title.trim(), `título da seção "${section.id}"`).not.toBe('');
    }
  });

  it('tem parágrafos não vazios em cada seção', () => {
    for (const section of HOW_TO_PLAY_SECTIONS) {
      expect(section.paragraphs.length, `parágrafos da seção "${section.id}"`).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) {
        expect(paragraph.trim(), `parágrafo da seção "${section.id}"`).not.toBe('');
      }
    }
  });

  it('inclui o aviso de ficção com o texto exato', () => {
    const paragraphs = HOW_TO_PLAY_SECTIONS.flatMap((s) => s.paragraphs);
    expect(paragraphs).toContain(FICTION_NOTICE);
  });

  it('não tem parágrafo acima de 320 caracteres', () => {
    for (const section of HOW_TO_PLAY_SECTIONS) {
      for (const paragraph of section.paragraphs) {
        expect(paragraph.length, `"${paragraph.slice(0, 40)}…" (seção "${section.id}")`).toBeLessThanOrEqual(
          MAX_PARAGRAPH_LENGTH,
        );
      }
    }
  });
});
