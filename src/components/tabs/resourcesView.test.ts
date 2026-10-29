import { describe, expect, it } from 'vitest';
import { advanceEnergy, initialEnergy } from '@/engine/energy/energy';
import { energyAdvice } from './resourcesView';

describe('diagnóstico energético', () => {
  it('não diagnostica um período ainda não processado', () => {
    expect(energyAdvice(initialEnergy(), false)).toContain('primeiro mês');
  });
  it('identifica rede como limitante e aponta expansão com prazo', () => {
    const energy = advanceEnergy(initialEnergy(), {
      dryness: 0,
      transmissionAssetMillions: 0,
      efficiency: 0,
      demand: 80,
    });
    expect(energyAdvice(energy, true)).toContain('transmissão');
    expect(energyAdvice(energy, true)).toContain('concluída');
  });
  it('distingue seca e falta de capacidade geradora', () => {
    const dry = advanceEnergy(
      { ...initialEnergy(), reservoir: 0 },
      { dryness: 1, transmissionAssetMillions: 1000000, efficiency: 0, demand: 60 },
    );
    expect(energyAdvice(dry, true)).toContain('água');
    const limited = advanceEnergy(initialEnergy(), {
      dryness: 0,
      transmissionAssetMillions: 1000000,
      efficiency: 0,
      demand: 80,
    });
    expect(energyAdvice(limited, true)).toContain('geração');
  });
  it('não declara crise quando a demanda é atendida', () => {
    const energy = advanceEnergy(initialEnergy(), { dryness: 0, transmissionAssetMillions: 0, efficiency: 0 });
    expect(energyAdvice(energy, true)).toContain('atendida');
  });
});
