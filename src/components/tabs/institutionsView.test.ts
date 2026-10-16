import { describe, expect, it } from 'vitest';

import { activeInstitutionalMarks, pressureBand } from './institutionsView';

describe('faixa de pressão de impeachment', () => {
  it('limites: Baixa < 0,15 / Moderada < 0,35 / Alta < 0,6 / Crítica', () => {
    expect(pressureBand(0)).toBe('Baixa');
    expect(pressureBand(0.149)).toBe('Baixa');
    expect(pressureBand(0.15)).toBe('Moderada');
    expect(pressureBand(0.349)).toBe('Moderada');
    expect(pressureBand(0.35)).toBe('Alta');
    expect(pressureBand(0.599)).toBe('Alta');
    expect(pressureBand(0.6)).toBe('Crítica');
    expect(pressureBand(1)).toBe('Crítica');
  });
});

describe('marcas institucionais ativas', () => {
  it('sem marcas, lista vazia', () => {
    expect(activeInstitutionalMarks({})).toEqual([]);
  });

  it('lista as marcas gravadas com o mês em que surgiram, na ordem do quadro', () => {
    const marks = activeInstitutionalMarks({ tcu_alerta: 4, cpi_instalada: 2, escandalo_denuncia: 1 });
    expect(marks).toEqual([
      { flag: 'cpi_instalada', label: 'CPI instalada', sinceMonth: 2 },
      { flag: 'tcu_alerta', label: 'Alerta do TCU sobre as contas', sinceMonth: 4 },
    ]);
  });

  it('CPI encerrada deixa de contar como CPI instalada', () => {
    const marks = activeInstitutionalMarks({ cpi_instalada: 2, cpi_encerrada: 5 });
    expect(marks.map((m) => m.flag)).toEqual([]);
  });
});
