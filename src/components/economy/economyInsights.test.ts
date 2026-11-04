import { describe, expect, it } from 'vitest';

import { DEFAULT_SOCIETY_CALIBRATION } from '@/engine/society/calibration';

import {
  discretionaryFloorAlert,
  interestShareOfRevenue,
  minimumWageReais,
  monetaryStance,
  nextCopom,
  nextCopomWhen,
  rigidityShare,
  sectorSensitivity,
  shareTone,
} from './economyInsights';

const COPOM = [1, 3, 5, 6, 7, 9, 11, 12];

describe('próxima reunião do Copom (B40)', () => {
  it('conta o mês atual quando ele tem reunião', () => {
    expect(nextCopom(0, COPOM)).toEqual({ monthIndex: 0, inMonths: 0 }); // jan/2027
    expect(nextCopomWhen({ monthIndex: 0, inMonths: 0 })).toMatch(/Neste mês/);
  });

  it('pula os meses sem reunião e atravessa o ano', () => {
    expect(nextCopom(1, COPOM)).toEqual({ monthIndex: 2, inMonths: 1 }); // fev → mar
    expect(nextCopom(7, COPOM)).toEqual({ monthIndex: 8, inMonths: 1 }); // ago → set
    expect(nextCopom(12, COPOM)).toEqual({ monthIndex: 12, inMonths: 0 }); // jan/2028
    expect(nextCopom(9, [1])).toEqual({ monthIndex: 12, inMonths: 3 });
    expect(nextCopomWhen({ monthIndex: 12, inMonths: 3 })).toBe('Daqui a 3 meses');
    expect(nextCopom(0, [])).toBeNull();
  });
});

describe('postura do BC (B71)', () => {
  it('compara o juro real com o neutro, com folga de 0,5 p.p.', () => {
    expect(monetaryStance(0.08, 0.05)).toMatchObject({ kind: 'contracionista', label: 'Contracionista' });
    expect(monetaryStance(0.08, 0.05).text).toMatch(/3,0 p\.p\. acima/);
    expect(monetaryStance(0.053, 0.05).kind).toBe('neutra');
    expect(monetaryStance(0.03, 0.05).kind).toBe('expansionista');
  });
});

describe('discricionárias e piso (B72)', () => {
  it('acende abaixo do piso e até 25% acima dele', () => {
    expect(discretionaryFloorAlert(0.01, 0.012)).toEqual({ level: 'abaixo' });
    const near = discretionaryFloorAlert(0.014, 0.012);
    expect(near?.level).toBe('perto');
    expect(near && near.level === 'perto' ? near.room : 0).toBeCloseTo(0.002);
    expect(discretionaryFloorAlert(0.02, 0.012)).toBeNull();
  });
});

describe('engessamento e juros (B73, B74)', () => {
  it('soma obrigatórias, vinculadas e obrigatórias de políticas sobre a despesa', () => {
    const mix = {
      mandatory: { previdencia: 0.08, beneficios: 0.02, pessoal: 0.03, outras: 0.02 },
      linked: 0.03,
      policyMandatory: 0.002,
      discretionary: 0.018,
    };
    expect(rigidityShare(mix)).toBeCloseTo(0.182 / 0.2);
    expect(
      rigidityShare({
        ...mix,
        mandatory: { previdencia: 0, beneficios: 0, pessoal: 0, outras: 0 },
        linked: 0,
        policyMandatory: 0,
        discretionary: 0,
      }),
    ).toBe(0);
  });

  it('juros sobre a receita e tom das razões', () => {
    expect(interestShareOfRevenue(0.06, 0.2)).toBeCloseTo(0.3);
    expect(interestShareOfRevenue(0.06, 0)).toBeNull();
    expect(shareTone(0.2, 0.25, 0.35)).toBe('textSecondary');
    expect(shareTone(0.3, 0.25, 0.35)).toBe('warning');
    expect(shareTone(0.4, 0.25, 0.35)).toBe('negative');
  });
});

describe('sensibilidade dos setores (B75)', () => {
  it('vem dos termos de troca da calibração', () => {
    const tt = DEFAULT_SOCIETY_CALIBRATION.termsOfTradeSensitivity;
    expect(sectorSensitivity(tt.extrativa).level).toBe('alta');
    expect(sectorSensitivity(tt.agropecuaria).level).toBe('alta');
    expect(sectorSensitivity(tt.industria).level).toBe('media');
    expect(sectorSensitivity(tt.servicos).level).toBe('baixa');
  });
});

describe('salário mínimo em R$ (A64)', () => {
  it('valor-base × índice real × nível de preços', () => {
    expect(minimumWageReais(1700, 1, 1)).toBe(1700);
    expect(minimumWageReais(1700, 1.02, 1.05)).toBeCloseTo(1820.7);
  });
});
