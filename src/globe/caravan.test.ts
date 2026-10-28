import { describe, expect, it } from 'vitest';
import { caravanDestination, caravanPosition } from './caravan';

// PLANO_CAMPANHA.md Fase C8.3: somente ações executadas geram a animação.
describe('caravana no globo', () => {
  it('seleciona o destino aceito e ignora alvos inválidos ou outras ações', () => {
    expect(caravanDestination([{ actionId: 'caravana_regional', target: 'BA' }])).toBe('BA');
    expect(caravanDestination([{ actionId: 'caravana_regional', target: 'XX' }])).toBeNull();
    expect(caravanDestination([{ actionId: 'comicio_nacional' }])).toBeNull();
  });
  it('termina na UF e movimento reduzido salta para o destino', () => {
    expect(caravanPosition('BA', 0, true)).toEqual(caravanPosition('BA', 1, false));
    expect(caravanPosition('BA', 0, false)).not.toEqual(caravanPosition('BA', 1, false));
  });
});
