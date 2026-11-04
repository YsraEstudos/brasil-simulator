import { describe, expect, it } from 'vitest';

import { MP_TRANCA_MESES, MP_VIGENCIA_MESES, type House, type ProposalStatus } from '@/engine';

import {
  amendmentsThisYear,
  AMENDMENTS_CAUSE,
  mpDeadline,
  pautaLocks,
  scandalAlert,
  tenureText,
} from './congressDeadlines';

describe('validade da MP (B34)', () => {
  it('conta os meses que ainda dá para votar, incluindo o atual', () => {
    expect(MP_VIGENCIA_MESES).toBe(4);
    expect(mpDeadline(10, 10)).toMatchObject({ remaining: 4, lastMonth: 13, tone: 'textSecondary' });
    expect(mpDeadline(10, 10).text).toBe('Perde a eficácia em 4 meses se não for votada.');
    expect(mpDeadline(10, 12)).toMatchObject({ remaining: 2, tone: 'warning' });
  });

  it('no último mês avisa que caduca ao encerrar o mês', () => {
    expect(mpDeadline(10, 13)).toMatchObject({ remaining: 1, tone: 'negative' });
    expect(mpDeadline(10, 13).text).toMatch(/Último mês/);
    expect(mpDeadline(10, 20).remaining).toBe(0);
  });
});

describe('pauta trancada (B66)', () => {
  const p = (id: string, createdMonth: number, status: ProposalStatus = 'em_tramitacao') => ({
    id,
    createdMonth,
    status,
  });
  const HOUSES: Record<string, House | null> = {
    mp1: 'camara',
    mp2: 'senado',
    mp3: 'camara',
    pl1: 'camara',
    mp4: null,
  };
  const isMeasure = (id: string) => id.startsWith('mp');
  const houseOf = (id: string) => HOUSES[id] ?? null;

  it('MP com 45 dias tranca a Casa em que está; a que completa no mês que vem aparece como aviso', () => {
    expect(MP_TRANCA_MESES).toBe(2);
    const locks = pautaLocks(
      [p('mp1', 8), p('mp2', 9), p('mp3', 10), p('pl1', 0), p('mp4', 0), p('mp5', 0, 'parada')],
      10,
      isMeasure,
      houseOf,
    );
    expect(locks).toEqual([
      { house: 'camara', proposalId: 'mp1', now: true },
      { house: 'senado', proposalId: 'mp2', now: false },
    ]);
  });
});

describe('ministérios (B68, B36)', () => {
  it('alerta a partir de 70% do teto mensal de escândalo', () => {
    expect(scandalAlert(0.021, 0.03)).toBe(true);
    expect(scandalAlert(0.02, 0.03)).toBe(false);
    expect(scandalAlert(0, 0)).toBe(false);
  });

  it('tempo no cargo em meses e anos', () => {
    expect(tenureText(0, 30, true)).toBe('No cargo desde o início do governo');
    expect(tenureText(0, 1, false)).toBe('No cargo há 1 mês');
    expect(tenureText(5, 5, false)).toBe('Nomeado neste mês');
    expect(tenureText(2, 17, false)).toBe('No cargo há 1 ano e 3 meses');
    expect(tenureText(2, 26, false)).toBe('No cargo há 2 anos');
  });
});

describe('emendas liberadas no ano (B69)', () => {
  const t = (monthIndex: number, cause: string) => ({
    monthIndex,
    cause,
    status: 'em_tramitacao' as const,
    detail: '',
  });

  it('conta só as liberações do ano civil atual', () => {
    const proposals = [
      { history: [t(1, AMENDMENTS_CAUSE), t(2, 'negociacao')] },
      { history: [t(11, AMENDMENTS_CAUSE), t(13, AMENDMENTS_CAUSE)] },
    ];
    expect(amendmentsThisYear(proposals, 5)).toBe(2);
    expect(amendmentsThisYear(proposals, 14)).toBe(1);
    expect(amendmentsThisYear([], 0)).toBe(0);
  });
});
