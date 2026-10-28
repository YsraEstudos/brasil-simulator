import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { createInitialState } from '../state';
import {
  buildPublication,
  checkPublications,
  currentRevisionOf,
  publicationDigest,
  revisePublication,
  type Publication,
  type PublicationDraft,
} from './publication';

// PLANO_EXPANSAO_BRASIL_SIMULATOR.md EX-04 e §6.1 Informação: a publicação tem data e conteúdo estáveis; ler a
// interface não altera o motor nem consome PRNG; e a mesma observação volta igual depois de reabrir ou recarregar.

const content = loadContent(DEFAULT_SCENARIO_ID);

const DRAFT: PublicationDraft = {
  id: 'pesquisa_0_2026-08',
  kind: 'pesquisa',
  source: { id: 'instituto_ficticio', name: 'Instituto de Pesquisa (fictício)', fictional: true },
  publishedAt: '2026-08',
  observedPeriod: { from: '2026-08', to: '2026-08' },
  methodVersion: 'pesquisa_carreira_v2',
  precision: { margin: 0.03 },
  payload: { undecided: 0.12, intentions: [{ candidateId: 'jogador', share: 0.31 }] },
};

const RETIFICACAO = {
  publishedAt: '2026-09',
  observedPeriod: { from: '2026-08', to: '2026-08' },
  methodVersion: 'pesquisa_carreira_v2',
  precision: { margin: 0.02 },
  payload: { undecided: 0.1, intentions: [{ candidateId: 'jogador', share: 0.34 }] },
  reason: 'amostra ampliada',
};

describe('contrato de publicação (PLANO_EXPANSAO §6.1)', () => {
  it('mesmo rascunho → mesma publicação e mesmo resumo (determinismo)', () => {
    const a = buildPublication(DRAFT);
    const b = buildPublication(DRAFT);
    expect(a).toEqual(b);
    expect(publicationDigest(a)).toBe(publicationDigest(b));
    // Ordem das chaves no payload não muda o resumo: serialização canônica, chaves em ordem.
    const reordered = buildPublication({
      ...DRAFT,
      payload: { intentions: [{ candidateId: 'jogador', share: 0.31 }], undecided: 0.12 },
    });
    expect(publicationDigest(reordered)).toBe(publicationDigest(a));
  });

  it('mesma observação após reabrir/recarregar: ida e volta por JSON deixa o resumo idêntico', () => {
    const publication = buildPublication(DRAFT);
    const reopened = JSON.parse(JSON.stringify(publication)) as Publication;
    expect(publicationDigest(reopened)).toBe(publicationDigest(publication));
    // Prós contraste: conteúdo diferente → resumo diferente.
    expect(publicationDigest(revisePublication(publication, RETIFICACAO))).not.toBe(publicationDigest(publication));
  });

  it('retificação: revisão nova sem reescrever a anterior; `checkPublications` segue vazio', () => {
    const original = buildPublication(DRAFT);
    const digestBefore = publicationDigest(original);
    const revised = revisePublication(original, RETIFICACAO);
    expect(currentRevisionOf(revised).revision).toBe(2);
    // A revisão anterior está intacta, byte a byte, e o resumo do histórico até ela não muda.
    expect(revised.revisions[0]).toEqual(original.revisions[0]);
    expect(revisionDigest(revised, 1)).toBe(digestBefore);
    expect(checkPublications([revised])).toEqual([]);
  });

  it('publicação adulterada é flagrada: lacuna de revisão e data retroagida', () => {
    const base = revisePublication(buildPublication(DRAFT), RETIFICACAO);
    expect(checkPublications([base])).toEqual([]);
    // Lacuna: 1 → 3.
    const gap: Publication = {
      ...base,
      revisions: [base.revisions[0], { ...base.revisions[1], revision: 3 }],
    };
    expect(checkPublications([gap])).toEqual([expect.stringContaining('lacuna')]);
    // Retrocesso: a segunda "publicação" sai antes da primeira.
    const backwards: Publication = {
      ...base,
      revisions: [base.revisions[0], { ...base.revisions[1], publishedAt: '2026-07' }],
    };
    expect(checkPublications([backwards])).toEqual([expect.stringContaining('retroagiu')]);
  });

  it('payload imutável e leituras puras: nada muda a publicação lida', () => {
    const publication = buildPublication(DRAFT);
    expect(Object.isFrozen(publication)).toBe(true);
    expect(Object.isFrozen(currentRevisionOf(publication).payload)).toBe(true);
    const before = publicationDigest(publication);
    currentRevisionOf(publication);
    expect(publicationDigest(publication)).toBe(before);
  });

  it('ler a revisão e o resumo não consome o PRNG do estado (§6.1)', () => {
    const state = createInitialState({ content, difficulty: 'estrategica', seed: 42 });
    const rngBefore = structuredClone(state.rng);
    const publication = buildPublication(DRAFT);
    currentRevisionOf(publication);
    expect(publicationDigest(publication)).toBe(publicationDigest(publication));
    expect(checkPublications([publication])).toEqual([]);
    expect(state.rng).toEqual(rngBefore);
  });
});

/** Resumo do histórico até a revisão dada, para comparar sem reescrever nada. */
function revisionDigest(publication: Publication, upTo: number): string {
  return publicationDigest({ ...publication, revisions: publication.revisions.slice(0, upTo) });
}
