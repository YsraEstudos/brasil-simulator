/**
 * Adaptadores de publicação (PLANO_EXPANSAO_BRASIL_SIMULATOR.md EX-04, §2.4). Levam os produtores existentes — a
 * pesquisa da carreira (`career/polls.ts`) e a manchete do mês (`news`) — para o contrato de `publication.ts`.
 * Porta a porta: só o que é publicado entra na `Publication`; o eleitorado real, as apurações e os números
 * internos de reconhecimento nunca atravessam (§6.1: a visão não vaza verdade secreta).
 */

import { monthKey } from '../calendar';
import type { CareerPoll, NewsItem } from '../types';

import { buildPublication, type JsonObject, type Publication, type PublicationSource } from './publication';

/** Instituto fictício que assina a pesquisa (mesmo id divulgado em `CareerPoll.source`). */
export const POLL_SOURCE: PublicationSource = {
  id: 'instituto_ficticio',
  name: 'Instituto de Pesquisa (fictício)',
  fictional: true,
};

/** Serviço de imprensa fictício que publica a manchete do mês. */
export const NEWS_SOURCE: PublicationSource = {
  id: 'servico_noticias',
  name: 'Serviço de Notícias (fictício)',
  fictional: true,
};

/** Versão do método de notícia divulgada junto com a publicação. */
export const NEWS_METHOD_VERSION = 'noticia_v1';

/**
 * Publicação da pesquisa (PLANO_CAMPANHA.md Fase C2). O `payload` carrega apenas o que o instituto divulga:
 * intenções sobre o comparecimento estimado, indecisos, brancos/nulos e a faixa de reconhecimento por UF — não os
 * números do eleitorado, nem a apuração (`Tally`), nem o reconhecimento real. Mesma pesquisa → mesma publicação.
 */
export function pollPublication(poll: CareerPoll): Publication {
  return buildPublication({
    id: `pesquisa_${poll.turnIndex}_${poll.month}`,
    kind: 'pesquisa',
    source: POLL_SOURCE,
    publishedAt: poll.publishedAt,
    observedPeriod: { ...poll.observedPeriod },
    methodVersion: poll.methodVersion,
    precision: { margin: poll.precision.margin },
    payload: {
      scope: poll.scope,
      month: poll.month,
      turnIndex: poll.turnIndex,
      intentions: poll.intentions.map((i) => ({ candidateId: i.candidateId, share: i.share })),
      undecided: poll.undecided,
      blankNull: poll.blankNull,
      recognitionBands: Object.fromEntries(Object.entries(poll.recognitionBands)) as JsonObject,
    },
  });
}

/**
 * Publicação da manchete persistida (`NewsItem`, FASE_07.md). O `payload` carrega o texto já divulgado — tipo,
 * tom, manchete, causa e, quando houver, a origem — e nada dos indicadores por trás da frase. Notícia de carreira
 * (antes da posse) usa a referência civil própria como mês de publicação.
 */
export function newsPublication(item: NewsItem): Publication {
  const publishedAt = item.careerPeriod ?? monthKey(item.monthIndex);
  return buildPublication({
    id: `noticia_${item.id}`,
    kind: 'noticia',
    source: NEWS_SOURCE,
    publishedAt,
    observedPeriod: { from: publishedAt, to: publishedAt },
    methodVersion: NEWS_METHOD_VERSION,
    payload: {
      kind: item.kind,
      tone: item.tone,
      headline: item.headline,
      cause: item.cause,
      ...(item.sourceId ? { sourceId: item.sourceId } : {}),
    },
  });
}
