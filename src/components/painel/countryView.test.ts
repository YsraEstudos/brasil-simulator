import { describe, expect, it } from 'vitest';

import { countryById } from '@/globe/countries';

import { buildCountryView, countryStatusText, formatPopulation, regionText } from './countryView';

// PLANO_PAISES.md §6, P1: a folha do país traz a seção Identidade (nome, capital, região, população, fronteira e
// distância), com a fonte, e anuncia as próximas seções.

describe('folha do país', () => {
  it('Argentina: capital, região, vizinho do Brasil e distância até a capital', () => {
    const view = buildCountryView(countryById('ARG')!);
    expect(view.title).toBe('Argentina');
    expect(view.status).toBe('País');
    const byLabel = Object.fromEntries(view.rows.map((r) => [r.label, r]));
    expect(byLabel.Capital.value).toBe('Buenos Aires');
    expect(byLabel['Região'].value).toBe('América do Sul');
    expect(byLabel['Fronteira com o Brasil'].value).toBe('Sim');
    expect(byLabel['Distância de Brasília'].value).toMatch(/^2\.\d{3} km$/);
    expect(byLabel['Distância de Brasília'].note).toBe('em linha reta até a capital');
    expect(byLabel['População'].note).toMatch(/^estimativa de \d{4}$/);
  });

  it('território diz a quem pertence', () => {
    const view = buildCountryView(countryById('GRL')!);
    expect(view.status).toBe('Território de outro país');
    expect(view.rows[0]).toEqual({ label: 'Pertence a', value: 'Dinamarca' });
  });

  it('sem capital no dado: traço e o porquê, e a distância vai até o centro', () => {
    const nauru = countryById('NRU')!;
    const view = buildCountryView(nauru);
    const byLabel = Object.fromEntries(view.rows.map((r) => [r.label, r]));
    expect(byLabel.Capital).toEqual({ label: 'Capital', value: '—', note: 'sem capital no dado' });
    expect(byLabel['Distância de Brasília'].note).toBe('em linha reta até o centro');
  });

  it('situações em texto', () => {
    expect(countryStatusText({ status: 'pais' })).toBe('País');
    expect(countryStatusText({ status: 'disputa' })).toBe('Soberania em disputa');
    expect(countryStatusText({ status: 'antartida' })).toContain('Tratado da Antártida');
  });

  it('a região junta sub-região e continente só quando diferem', () => {
    expect(regionText({ continent: 'América do Sul', subregion: 'América do Sul' })).toBe('América do Sul');
    expect(regionText({ continent: 'América do Norte', subregion: 'Caribe' })).toBe('Caribe · América do Norte');
  });

  it('população na unidade que se lê melhor', () => {
    expect(formatPopulation(1_397_715_000)).toBe('1,40 bilhão');
    expect(formatPopulation(44_938_712)).toBe('44,9 milhões');
    expect(formatPopulation(1_300_000)).toBe('1,3 milhão');
    expect(formatPopulation(38_019)).toBe('38 mil');
    expect(formatPopulation(825)).toBe('825 habitantes');
    expect(formatPopulation(0)).toBe('Sem população permanente');
  });

  it('o leitor de tela ouve o nome, a situação e cada linha, e a fonte é citada', () => {
    const view = buildCountryView(countryById('ARG')!);
    expect(view.accessibilityLabel).toContain('Argentina. País.');
    expect(view.accessibilityLabel).toContain('Capital: Buenos Aires');
    expect(view.source).toContain('Natural Earth');
    expect(view.upcoming).toContain('próximas fases');
  });
});
