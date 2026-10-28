import { describe, expect, it } from 'vitest';

import { campaignTutorial } from './campaignTutorial';

// PLANO_CAMPANHA.md Fase C8.2: instruções coerentes com o percurso eleitoral disponível.
describe('tutorial da campanha', () => {
  it('explica escolhas, financiamento, pesquisa e desfecho sem prometer vitória', () => {
    const text = campaignTutorial.join(' ');
    expect(text).toMatch(/aç(ões|ão)/i);
    expect(text).toMatch(/turno seguinte/i);
    expect(text).toMatch(/estimativa/i);
    expect(text).toMatch(/derrota/i);
  });

  it('explica o limite de agenda, a margem, o reconhecimento e a diferença entre tutorial e laboratório', () => {
    const text = campaignTutorial.join(' ');
    expect(text).toMatch(/limite do turno/i);
    expect(text).toMatch(/margem de erro/i);
    expect(text).toMatch(/reconhecimento/i);
    expect(text).toMatch(/laboratório de decisões/i);
    expect(text).toMatch(/descartável/i);
  });
});
