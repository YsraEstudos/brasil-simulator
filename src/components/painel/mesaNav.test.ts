import { describe, expect, it } from 'vitest';

import { actionsCaption, endMonthControl, LEFT_RAIL, monthAdvanced, RIGHT_RAIL } from './mesaNav';

const playing = { hasCampaign: true, finished: false, busy: false, actionsUsed: 1, actionsMax: 3 };

describe('Encerrar o mês na doca', () => {
  it('com a partida em andamento encerra e mostra as ações usadas', () => {
    expect(endMonthControl(playing)).toEqual({
      mode: 'encerrar',
      label: 'Encerrar o mês',
      caption: '1 de 3 ações usadas',
      disabled: false,
    });
  });

  it('enquanto a store processa o mês o botão fica desabilitado e avisa', () => {
    const control = endMonthControl({ ...playing, busy: true });
    expect(control.mode).toBe('encerrar');
    expect(control.disabled).toBe(true);
    expect(control.label).toBe('Encerrando…');
  });

  it('com a campanha encerrada vira "Ver legado" e continua tocável', () => {
    const control = endMonthControl({ ...playing, finished: true });
    expect(control).toMatchObject({ mode: 'legado', label: 'Ver legado', disabled: false });
  });

  it('sem partida (demonstração) fica indisponível', () => {
    const control = endMonthControl({ ...playing, hasCampaign: false });
    expect(control).toMatchObject({ mode: 'indisponivel', disabled: true });
  });

  it('a legenda concorda com o limite de ações', () => {
    expect(actionsCaption(0, 3)).toBe('0 de 3 ações usadas');
    expect(actionsCaption(1, 1)).toBe('1 de 1 ação usada');
  });
});

describe('Abertura automática do relatório', () => {
  it('abre só quando o mês avançou', () => {
    expect(monthAdvanced(0, 1)).toBe(true);
    expect(monthAdvanced(4, 4)).toBe(false);
  });

  it('sem partida antes ou depois não abre', () => {
    expect(monthAdvanced(undefined, 1)).toBe(false);
    expect(monthAdvanced(2, undefined)).toBe(false);
  });
});

describe('Trilhos da mesa', () => {
  it('esquerdo: o mês', () => {
    expect(LEFT_RAIL.map((b) => b.id)).toEqual(['alertas', 'meta', 'relatorio']);
  });

  it('direito: o país, sem o Congresso nem a evolução do PIB avulsa', () => {
    expect(RIGHT_RAIL.map((b) => b.id)).toEqual(['camadas', 'regioes', 'indicadores', 'ministerios']);
  });

  it('nenhum botão se repete entre os trilhos', () => {
    const ids = [...LEFT_RAIL, ...RIGHT_RAIL].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
