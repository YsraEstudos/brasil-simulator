import { describe, expect, it } from 'vitest';

import { governmentSummaryLine, playTimeLabel, relativePlayedLabel, savedCardActivityLine } from './saveCardView';

// Datas montadas em hora local: o resultado não depende do fuso da máquina que roda o teste.
// 15/10/2025 é quarta-feira.
const NOW = new Date(2025, 9, 15, 14, 30);
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m, d, h, min).toISOString();

describe('relativePlayedLabel', () => {
  it('menos de 1 minuto e datas no futuro viram "Agora mesmo"', () => {
    expect(relativePlayedLabel(new Date(2025, 9, 15, 14, 29, 40).toISOString(), NOW)).toBe('Agora mesmo');
    expect(relativePlayedLabel(at(2025, 9, 15, 15, 0), NOW)).toBe('Agora mesmo');
  });

  it('minutos no mesmo intervalo de uma hora', () => {
    expect(relativePlayedLabel(at(2025, 9, 15, 14, 29), NOW)).toBe('Há 1 minuto');
    expect(relativePlayedLabel(at(2025, 9, 15, 14, 0), NOW)).toBe('Há 30 minutos');
    expect(relativePlayedLabel(at(2025, 9, 15, 13, 31), NOW)).toBe('Há 59 minutos');
  });

  it('horas no mesmo dia', () => {
    expect(relativePlayedLabel(at(2025, 9, 15, 13, 30), NOW)).toBe('Há 1 hora');
    expect(relativePlayedLabel(at(2025, 9, 15, 12, 30), NOW)).toBe('Há 2 horas');
    expect(relativePlayedLabel(at(2025, 9, 15, 0, 5), NOW)).toBe('Há 14 horas');
  });

  it('dia anterior: "Ontem às" com minutos só quando diferentes de zero', () => {
    expect(relativePlayedLabel(at(2025, 9, 14, 21, 0), NOW)).toBe('Ontem às 21h');
    expect(relativePlayedLabel(at(2025, 9, 14, 21, 5), NOW)).toBe('Ontem às 21h05');
    expect(relativePlayedLabel(at(2025, 9, 14, 23, 30), new Date(2025, 9, 15, 1, 0))).toBe('Ontem às 23h30');
  });

  it('até 6 dias: dia da semana capitalizado', () => {
    const now = new Date(2025, 9, 20, 10, 0); // segunda-feira
    expect(relativePlayedLabel(at(2025, 9, 14, 14, 0), now)).toBe('Terça às 14h');
    expect(relativePlayedLabel(at(2025, 9, 15, 14, 0), now)).toBe('Quarta às 14h');
  });

  it('mais antigo: dd/mm às HHh, com ano só quando é de outro ano', () => {
    const now = new Date(2025, 9, 20, 10, 0);
    expect(relativePlayedLabel(at(2025, 9, 13, 14, 0), now)).toBe('13/10 às 14h');
    expect(relativePlayedLabel(at(2025, 0, 5, 9, 5), new Date(2025, 2, 1, 10, 0))).toBe('05/01 às 9h05');
    expect(relativePlayedLabel(at(2024, 9, 12, 14, 0), now)).toBe('12/10/2024 às 14h');
  });

  it('ISO inválido vira texto vazio', () => {
    expect(relativePlayedLabel('não é data', NOW)).toBe('');
  });
});

describe('playTimeLabel', () => {
  const MIN = 60_000;

  it('formata minutos, horas e horas com minutos sem "0m"', () => {
    expect(playTimeLabel(45 * MIN)).toBe('45m jogados');
    expect(playTimeLabel(105 * MIN)).toBe('1h 45m jogados');
    expect(playTimeLabel(120 * MIN)).toBe('2h jogados');
  });

  it('menos de 1 minuto tem rótulo próprio e zero não mostra nada', () => {
    expect(playTimeLabel(30_000)).toBe('Menos de 1 min jogado');
    expect(playTimeLabel(0)).toBe('');
    expect(playTimeLabel(NaN)).toBe('');
  });
});

describe('governmentSummaryLine', () => {
  const card = { approval: 0.42, gdpGrowth12m: 0.018, monthIndex: 5 };

  it('mostra aprovação e PIB quando já está no governo', () => {
    expect(governmentSummaryLine(card, null)).toBe('Aprovação 42% · PIB +1,8% em 12 meses');
    expect(governmentSummaryLine(card, 'governo')).toBe('Aprovação 42% · PIB +1,8% em 12 meses');
    expect(governmentSummaryLine({ ...card, gdpGrowth12m: -0.0234 }, null)).toBe(
      'Aprovação 42% · PIB −2,3% em 12 meses',
    );
  });

  it('sem resumo ou antes da posse não mostra linha', () => {
    expect(governmentSummaryLine(null, null)).toBe('');
    expect(governmentSummaryLine(card, 'pre_campanha')).toBe('');
  });
});

describe('savedCardActivityLine', () => {
  const base = { updatedAt: at(2025, 9, 1, 9, 0), playTimeMs: 105 * 60_000 };

  it('junta última vez e tempo jogado com " · "', () => {
    expect(savedCardActivityLine({ ...base, lastPlayedAt: at(2025, 9, 14, 21, 0) }, NOW)).toBe(
      'Última vez: Ontem às 21h · 1h 45m jogados',
    );
  });

  it('usa updatedAt quando não há lastPlayedAt', () => {
    expect(savedCardActivityLine({ ...base, lastPlayedAt: null, playTimeMs: 0 }, NOW)).toBe('Última vez: 01/10 às 9h');
  });

  it('sem dados de tempo nem datas válidas devolve texto vazio', () => {
    expect(savedCardActivityLine({ updatedAt: 'x', lastPlayedAt: null, playTimeMs: 0 }, NOW)).toBe('');
  });
});
