import { describe, expect, it } from 'vitest';

import { buildAboutRows, DATA_SOURCES_TEXT, FICTION_DETAIL, FICTION_NOTICE } from './aboutInfo';

const base = {
  appVersion: '1.0.0',
  engineVersion: '0.9.0',
  stateSchemaVersion: 13,
  dbVersion: 7,
  scenarios: [
    { id: 'brasil_2027_01_v080', title: 'Brasil, janeiro de 2027', version: '0.8.0' },
    { id: 'prototipo_ficticio', title: 'Protótipo', version: '0.1.0' },
  ],
};

describe('buildAboutRows (PLANO_MENU_SAVES_CONFIG.md §3 Fase M1, item 4)', () => {
  it('lista app, motor, esquema do estado e banco, nesta ordem', () => {
    const rows = buildAboutRows(base);
    expect(rows.slice(0, 4)).toEqual([
      { label: 'Aplicativo', value: '1.0.0' },
      { label: 'Motor de simulação', value: '0.9.0' },
      { label: 'Esquema do estado', value: '13' },
      { label: 'Banco de dados', value: '7' },
    ]);
  });

  it('acrescenta uma linha por cenário, com o título e a versão do cenário e o id', () => {
    const rows = buildAboutRows(base);
    expect(rows.slice(4)).toEqual([
      { label: 'Cenário: Brasil, janeiro de 2027', value: '0.8.0 · brasil_2027_01_v080' },
      { label: 'Cenário: Protótipo', value: '0.1.0 · prototipo_ficticio' },
    ]);
  });

  it('sem cenários, devolve só as quatro linhas de versão', () => {
    const rows = buildAboutRows({ ...base, scenarios: [] });
    expect(rows).toHaveLength(4);
  });

  it('converte números inteiros em texto sem alterar o valor (esquema 0 é "0", não vazio)', () => {
    const rows = buildAboutRows({ ...base, stateSchemaVersion: 0, dbVersion: 0 });
    expect(rows[2]).toEqual({ label: 'Esquema do estado', value: '0' });
    expect(rows[3]).toEqual({ label: 'Banco de dados', value: '0' });
  });

  it('não repete a lista de entrada nem muda os valores recebidos', () => {
    const input = { ...base, scenarios: [...base.scenarios] };
    buildAboutRows(input);
    expect(input).toEqual(base);
  });
});

describe('textos fixos da tela Sobre (GAME_DESIGN.md §13)', () => {
  it('aviso de ficção com o texto exato do documento', () => {
    expect(FICTION_NOTICE).toBe(
      'Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro.',
    );
    expect(FICTION_DETAIL).toBe(
      'Personagens, partidos e notícias são fictícios. Nenhuma conduta é atribuída a pessoas reais.',
    );
  });

  it('fontes de dados não trazem links de rede', () => {
    expect(DATA_SOURCES_TEXT).not.toMatch(/https?:\/\/|www\./);
  });
});
