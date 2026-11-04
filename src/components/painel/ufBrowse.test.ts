import { describe, expect, it } from 'vitest';

import { indicatorSpec } from './regionalMetrics';
import {
  alphabeticalUfs,
  campCounts,
  filterByCamp,
  governorCamp,
  legendStrip,
  rankingGroups,
  ufNeighbors,
} from './ufBrowse';

const row = (id: string, name: string, governorRelation = 0) => ({ uf: { id, governorRelation }, name });

const ROWS = [
  row('SP', 'São Paulo', 40),
  row('AM', 'Amazonas', -40),
  row('AC', 'Acre', 15),
  row('AP', 'Amapá', -15),
  row('TO', 'Tocantins', 5),
];

describe('ordem alfabética e vizinhas (B43, B44)', () => {
  it('ordena pelo nome sem contar acentos', () => {
    expect(alphabeticalUfs(ROWS).map((r) => r.uf.id)).toEqual(['AC', 'AP', 'AM', 'SP', 'TO']);
  });

  it('anterior e próxima dão a volta na lista', () => {
    expect(ufNeighbors(ROWS, 'AP')).toEqual({
      previous: { id: 'AC', name: 'Acre' },
      next: { id: 'AM', name: 'Amazonas' },
    });
    expect(ufNeighbors(ROWS, 'AC')?.previous.id).toBe('TO');
    expect(ufNeighbors(ROWS, 'TO')?.next.id).toBe('AC');
    expect(ufNeighbors(ROWS, 'RJ')).toBeNull();
    expect(ufNeighbors([row('AC', 'Acre')], 'AC')).toBeNull();
  });
});

describe('aliadas × oposição pelo governador (D48)', () => {
  it('usa as faixas da camada do governador', () => {
    expect(governorCamp(40)).toBe('aliada'); // aliado
    expect(governorCamp(15)).toBe('aliada'); // próximo
    expect(governorCamp(5)).toBe('neutra');
    expect(governorCamp(-15)).toBe('oposicao'); // distante
    expect(governorCamp(-40)).toBe('oposicao'); // hostil
  });

  it('filtra e conta', () => {
    expect(filterByCamp(ROWS, 'aliada').map((r) => r.uf.id)).toEqual(['SP', 'AC']);
    expect(filterByCamp(ROWS, null)).toHaveLength(5);
    expect(campCounts(ROWS)).toEqual({ aliada: 2, neutra: 1, oposicao: 2 });
  });
});

describe('legenda fixa (B42)', () => {
  it('divergente: palavras nas pontas e números para o leitor de tela', () => {
    const strip = legendStrip(indicatorSpec('governador'));
    expect(strip).toMatchObject({ title: 'Relação com o governador', low: 'hostil', high: 'aliado' });
    expect(strip.accessibilityLabel).toMatch(/^Legenda do mapa, Relação com o governador: hostil \(/);
  });

  it('sequencial: valores nas pontas', () => {
    const strip = legendStrip(indicatorSpec('seca'));
    expect(strip.low.startsWith('<')).toBe(true);
    expect(strip.high.startsWith('≥')).toBe(true);
  });
});

describe('blocos de melhores e piores', () => {
  it('só aparecem com mais de 10 UFs, para não repetir as mesmas', () => {
    const ten = Array.from({ length: 10 }, (_, i) => i);
    expect(rankingGroups(ten)).toBeNull();
    const eleven = [...ten, 10];
    expect(rankingGroups(eleven)).toEqual([
      [0, 1, 2, 3, 4],
      [10, 9, 8, 7, 6],
    ]);
  });
});
