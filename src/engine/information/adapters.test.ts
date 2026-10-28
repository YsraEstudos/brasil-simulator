import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { createInitialState } from '../state';
import type { CareerPoll, GameState, NewsItem } from '../types';

import { newsPublication, pollPublication } from './adapters';
import { checkPublications, currentRevisionOf, publicationDigest } from './publication';

// PLANO_EXPANSAO_BRASIL_SIMULATOR.md EX-04 e §2.4: verdade × publicação × interpretação. Os adaptadores só
// carregam o que o instituto e o serviço de imprensa divulgam — o eleitorado real, as apurações (`Tally`) e os
// números internos de reconhecimento nunca saem (§6.1: a visão não vaza verdade secreta) — e nada sorteia fora do
// motor: mesmos dados → mesmas publicações, mesmo resumo.

const content = loadContent(DEFAULT_SCENARIO_ID);

/** Pesquisa publicada do turno, como o produtor `career/polls.ts` a deixa no estado. */
const POLL: CareerPoll = {
  observedPeriod: { from: '2026-08', to: '2026-08' },
  publishedAt: '2026-08',
  source: 'instituto_ficticio',
  methodVersion: 'pesquisa_carreira_v2',
  precision: { margin: 0.03 },
  turnIndex: 2,
  month: '2026-08',
  scope: 'nacional',
  margin: 0.03,
  intentions: [
    { candidateId: 'jogador', share: 0.31 },
    { candidateId: 'bloco_oposicao', share: 0.29 },
  ],
  undecided: 0.28,
  blankNull: 0.12,
  recognitionBands: { SP: 'conhecido', BA: 'pouco_conhecido' },
};

/** Notícia persistida do mês, como o produtor de notícias a deixa no estado. */
const NEWS: NewsItem = {
  id: '3_1',
  monthIndex: 3,
  kind: 'economia',
  tone: 'positiva',
  headline: 'Indústria retoma investimentos',
  cause: 'Causa: o Copom sinalizou estabilidade da Selic',
  sourceId: 'copom_3',
};

/** Chaves que seriam verdade interna do motor; nenhuma pode aparecer no payload divulgado. */
const TRUTH_KEYS = ['electorate', 'abstencao', 'abstention', 'votes', 'tally', 'tallies', 'recognition'] as const;

describe('adaptação da pesquisa ao contrato de publicação (EX-04, §2.4)', () => {
  it('mesma pesquisa → mesma publicação e mesmo resumo (determinismo)', () => {
    const a = pollPublication(POLL);
    const b = pollPublication(POLL);
    expect(a).toEqual(b);
    expect(publicationDigest(a)).toBe(publicationDigest(b));
  });

  it('não vaza verdade secreta: o payload publicado só tem estimativas divulgadas', () => {
    const publication = pollPublication(POLL);
    expect(checkPublications([publication])).toEqual([]);
    const payload = currentRevisionOf(publication).payload;
    // É exatamente isto que o instituto divulga — nem uma chave a mais.
    expect(Object.keys(payload).sort()).toEqual([
      'blankNull',
      'intentions',
      'month',
      'recognitionBands',
      'scope',
      'turnIndex',
      'undecided',
    ]);
    for (const truthKey of TRUTH_KEYS) {
      expect(truthKey in payload).toBe(false);
    }
    for (const intention of currentPayloadIntentions(payload)) {
      expect(Object.keys(intention).sort()).toEqual(['candidateId', 'share']);
      expect(Number.isFinite(intention.share)).toBe(true);
    }
    // O reconhecimento sai em faixa de rótulo, nunca em número real.
    for (const band of Object.values(currentPayloadRecognitionBands(payload))) {
      expect(band).toBeTypeOf('string');
    }
    // A fonte deve ser fictícia: instituto de verdade é proibido.
    expect(publication.source).toMatchObject({ id: 'instituto_ficticio', fictional: true });
    expect(currentRevisionOf(publication).precision).toEqual({ margin: 0.03 });
  });

  it('mesma observação após reabrir/recarregar: JSON ida e volta deixa o resumo idêntico', () => {
    const publication = pollPublication(POLL);
    const reopened = JSON.parse(JSON.stringify(publication)) as typeof publication;
    expect(publicationDigest(reopened)).toBe(publicationDigest(publication));
  });
});

describe('adaptação da notícia ao contrato de publicação (EX-04, §2.4)', () => {
  it('mesma notícia → mesma publicação e mesmo resumo (determinismo)', () => {
    const a = newsPublication(NEWS);
    const b = newsPublication(NEWS);
    expect(a).toEqual(b);
    expect(publicationDigest(a)).toBe(publicationDigest(b));
  });

  it('o payload carrega o texto divulgado e nada dos indicadores por trás dele', () => {
    const publication = newsPublication(NEWS);
    expect(publication.kind).toBe('noticia');
    expect(publication.source).toMatchObject({ id: 'servico_noticias', fictional: true });
    const revision = currentRevisionOf(publication);
    expect(revision.publishedAt).toBe('2027-04'); // monthIndex 3 → "2027-04".
    expect(Object.keys(revision.payload).sort()).toEqual(['cause', 'headline', 'kind', 'sourceId', 'tone']);
    expect(revision.payload).toMatchObject({
      kind: 'economia',
      tone: 'positiva',
      headline: 'Indústria retoma investimentos',
    });
    expect(checkPublications([publication])).toEqual([]);
  });

  it('notícia da campanha usa a referência civil como mês; sem origem, o payload omite a chave', () => {
    const publication = newsPublication({ ...NEWS, careerPeriod: '2026-08', sourceId: undefined });
    expect(currentRevisionOf(publication).publishedAt).toBe('2026-08');
    expect('sourceId' in currentRevisionOf(publication).payload).toBe(false);
    expect(checkPublications([publication])).toEqual([]);
  });
});

/** Ler publicações e resumos são leituras da interface: nunca passos do motor (§6.1). */
describe('a leitura de publicações não toca o motor (§6.1)', () => {
  it('estado e PRNG intactos depois dos adaptadores e dos resumos', () => {
    const state: GameState = createInitialState({ content, difficulty: 'estrategica', seed: 42 });
    const stateBefore = structuredClone(state);
    const rngBefore = structuredClone(state.rng);

    const pollPublicationOut = pollPublication(POLL);
    const newsPublicationOut = newsPublication(NEWS);
    publicationDigest(pollPublicationOut);
    publicationDigest(newsPublicationOut);
    currentRevisionOf(pollPublicationOut);
    currentRevisionOf(newsPublicationOut);

    expect(state.rng).toEqual(rngBefore);
    expect(state).toEqual(stateBefore);
  });

  it('os adaptadores não alteram os objetos de origem: `CareerPoll` e `NewsItem` ficam íntegras', () => {
    const pollBefore = structuredClone(POLL);
    const newsBefore = structuredClone(NEWS);
    pollPublication(POLL);
    newsPublication(NEWS);
    expect(POLL).toEqual(pollBefore);
    expect(NEWS).toEqual(newsBefore);
  });
});

/** Intenções divulgadas, tipadas para as asserções acima. */
function currentPayloadIntentions(payload: Record<string, unknown>): { candidateId: string; share: number }[] {
  return payload['intentions'] as {
    candidateId: string;
    share: number;
  }[];
}

/** Faixas de reconhecimento divulgadas, tipadas para as asserções acima. */
function currentPayloadRecognitionBands(payload: Record<string, unknown>): Record<string, string> {
  return payload['recognitionBands'] as Record<string, string>;
}
