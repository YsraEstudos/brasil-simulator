import { describe, expect, it } from 'vitest';

import { CAMPAIGN_NAME_MAX } from '@/store/campaignSetup';

import { NAME_COMPLEMENTS, NAME_PREFIXES, numberedName, randomCampaignName, yearOfPeriod } from './campaignNames';

/** Sequência fixa de valores de `random`, repetida quando acaba. */
function sequence(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const value = values[i % values.length] ?? 0;
    i++;
    return value;
  };
}

/** Gerador congruencial simples: determinístico, só para cobrir muitos sorteios. */
function lcg(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('randomCampaignName: formato', () => {
  it('monta "prefixo complemento" com as listas (valores 0 escolhem o primeiro item)', () => {
    expect(randomCampaignName(sequence([0]), [])).toBe(`${NAME_PREFIXES[0]} ${NAME_COMPLEMENTS[0]}`);
    expect(randomCampaignName(sequence([0]), [])).toBe('Governo da Reconstrução');
  });

  it('valores altos escolhem os últimos itens das listas', () => {
    expect(randomCampaignName(sequence([0.99]), [])).toBe('Projeto do Litoral');
  });

  it('valor fora de [0, 1) ou NaN não sai da lista', () => {
    expect(randomCampaignName(() => Number.NaN, [])).toBe('Governo da Reconstrução');
    expect(randomCampaignName(() => 5, [])).toBe('Projeto do Litoral');
    expect(randomCampaignName(() => -3, [])).toBe('Governo da Reconstrução');
  });

  it('muitos sorteios sempre seguem o formato e ficam dentro do limite', () => {
    const random = lcg(42);
    for (let i = 0; i < 500; i++) {
      const name = randomCampaignName(random, [], 2027);
      const [prefix] = name.split(' ');
      expect(NAME_PREFIXES).toContain(prefix);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(CAMPAIGN_NAME_MAX);
    }
  });
});

describe('randomCampaignName: ano do cenário', () => {
  it('usa o ano quando o sorteio cair nessa opção', () => {
    // Primeiro valor escolhe o prefixo; o segundo (0 < 0,25) decide usar o ano.
    expect(randomCampaignName(sequence([0, 0]), [], 2027)).toBe('Governo 2027');
  });

  it('usa um complemento quando o sorteio não cair no ano', () => {
    // 0,9 escolhe "Projeto" e, como 0,9 >= 0,25, o complemento de índice 9 ("Travessia").
    expect(randomCampaignName(sequence([0.9, 0.9]), [], 2027)).toBe('Projeto Travessia');
  });

  it('sem ano, nunca aparece número no nome sorteado', () => {
    const random = lcg(7);
    for (let i = 0; i < 200; i++) {
      expect(randomCampaignName(random, [])).not.toMatch(/\d/);
    }
  });

  it('ano fora de 1000 a 9999 é ignorado', () => {
    expect(randomCampaignName(sequence([0, 0]), [], 27)).toBe('Governo da Reconstrução');
  });

  it('yearOfPeriod lê o ano de "AAAA-MM" e recusa outros formatos', () => {
    expect(yearOfPeriod('2027-01')).toBe(2027);
    expect(yearOfPeriod('2027')).toBeUndefined();
    expect(yearOfPeriod('')).toBeUndefined();
    expect(yearOfPeriod(undefined)).toBeUndefined();
  });
});

describe('randomCampaignName: nomes já existentes', () => {
  it('não repete um nome de taken, mesmo com diferença de maiúsculas', () => {
    // Primeiro sorteio: "Governo da Reconstrução" (já existe em caixa alta). Segundo: "Mandato Ponte".
    const taken = ['GOVERNO DA RECONSTRUÇÃO'];
    expect(randomCampaignName(sequence([0, 0, 0.2, 0.5]), taken)).toBe('Mandato Ponte');
  });

  it('ignora espaços nas pontas dos nomes já existentes', () => {
    expect(randomCampaignName(sequence([0, 0, 0.2, 0.5]), ['  governo da reconstrução  '])).toBe('Mandato Ponte');
  });

  it('se todos os sorteios colidirem, numera o primeiro: " (2)", depois " (3)"', () => {
    const taken = ['Governo da Reconstrução'];
    expect(randomCampaignName(sequence([0]), taken)).toBe('Governo da Reconstrução (2)');

    expect(randomCampaignName(sequence([0]), [...taken, 'governo da reconstrução (2)'])).toBe(
      'Governo da Reconstrução (3)',
    );
  });

  it('o sorteio não usa taken como lista de escolhas: só descarta repetidos', () => {
    // Sem colisão, o primeiro sorteio é devolvido tal qual, sem numeração.
    expect(randomCampaignName(sequence([0]), ['Outro nome'])).toBe('Governo da Reconstrução');
  });
});

describe('numberedName e limite de tamanho', () => {
  it('a base longa é cortada para o resultado caber em CAMPAIGN_NAME_MAX', () => {
    const base = 'a'.repeat(CAMPAIGN_NAME_MAX);
    const result = numberedName(base, [base]);
    expect(result).toBe(`${'a'.repeat(CAMPAIGN_NAME_MAX - ' (2)'.length)} (2)`);
    expect(result.length).toBe(CAMPAIGN_NAME_MAX);
  });

  it('numera até achar um número livre, mesmo com muitos colididos', () => {
    const taken = ['Governo'];
    for (let n = 2; n <= 30; n++) taken.push(`Governo (${n})`);
    expect(numberedName('Governo', taken)).toBe('Governo (31)');
  });

  it('o nome sorteado nunca passa do limite, mesmo com muitos nomes ocupados', () => {
    const random = lcg(99);
    const taken: string[] = [];
    for (let i = 0; i < 120; i++) {
      const name = randomCampaignName(random, taken, 2027);
      expect(name.length).toBeLessThanOrEqual(CAMPAIGN_NAME_MAX);
      taken.push(name);
    }
    expect(new Set(taken.map((n) => n.toLowerCase())).size).toBe(taken.length);
  });
});
