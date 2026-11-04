import { describe, expect, it } from 'vitest';

import { MAX_SAVE_FILE_BYTES, saveFileTooLargeMessage } from './saveFileRules';

const MB = 1024 * 1024;

describe('limite de tamanho do arquivo de save', () => {
  it('o teto é 20 MB', () => {
    expect(MAX_SAVE_FILE_BYTES).toBe(20 * MB);
  });

  it('aceita arquivo dentro do limite, inclusive exatamente no limite', () => {
    expect(saveFileTooLargeMessage(4 * 1024)).toBeNull();
    expect(saveFileTooLargeMessage(MAX_SAVE_FILE_BYTES)).toBeNull();
  });

  it('não recusa quando o tamanho é desconhecido (a validação do pacote acontece depois)', () => {
    expect(saveFileTooLargeMessage(undefined)).toBeNull();
    expect(saveFileTooLargeMessage(Number.NaN)).toBeNull();
  });

  it('recusa um byte acima do limite com mensagem pt-BR que cita os dois tamanhos', () => {
    const message = saveFileTooLargeMessage(MAX_SAVE_FILE_BYTES + 1);
    expect(message).not.toBeNull();
    expect(message).toContain('21 MB');
    expect(message).toContain('limite é de 20 MB');
  });

  it('arredonda o tamanho para cima, para não parecer dentro do limite', () => {
    expect(saveFileTooLargeMessage(20.4 * MB)).toContain('21 MB');
    expect(saveFileTooLargeMessage(100 * MB)).toContain('100 MB');
  });
});
