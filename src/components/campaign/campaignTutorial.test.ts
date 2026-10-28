import { describe, expect, it } from 'vitest';
import { campaignTutorial } from './campaignTutorial';

// PLANO_CAMPANHA.md Fase C8.2: instruções coerentes com o percurso eleitoral disponível.
describe('tutorial da campanha', () => {
  it('explica escolhas, financiamento, pesquisa e desfecho sem prometer vitória', () => {
    const text = campaignTutorial.join(' ');
    expect(text).toMatch(/ações/i);
    expect(text).toMatch(/turno seguinte/i);
    expect(text).toMatch(/estimativa/i);
    expect(text).toMatch(/derrota/i);
  });
});
