/**
 * Contrato de publicação (PLANO_EXPANSAO_BRASIL_SIMULATOR.md EX-04; §2.4 e §6.1 Informação). O motor distingue
 * **verdade** (estado interno, nunca publicado), **publicação** (a estimativa que sai: fonte, método, data e
 * conteúdo estáveis) e **interpretação** (o que a interface faz com a estimativa). Ler a publicação não altera o
 * motor nem consome PRNG, e o histórico é só-acréscimo: uma retificação cria uma revisão nova, nunca reescreve a
 * anterior. A serialização canônica — sem biblioteca de hash, sem criptografia — prova a "mesma observação"
 * depois de reabrir ou recarregar o save.
 */

/** Valor que pode ser divulgado: somente dado pronto para serializar de forma estável. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Objeto de publicação: chaves de texto, valores JSON, tudo congelado. */
export type JsonObject = { readonly [key: string]: JsonValue };

/** Tipos de publicação (§2.4): estimativa de pesquisa, manchete de notícia e boletim epidemiológico (R8). */
export type PublicationKind = 'pesquisa' | 'noticia' | 'boletim';

/**
 * Fonte da publicação: sempre fictícia. Atribuir instituto ou veículo real é proibido
 * (docs/AI_INSTRUCTIONS.md §8).
 */
export interface PublicationSource {
  id: string;
  /** Nome fictício do instituto ou do serviço de imprensa. */
  name: string;
  fictional: true;
}

/** Precisão divulgada com a estimativa, quando o método dá margem (fração, nunca porcentagem inteira). */
export interface PublicationPrecision {
  /** Margem de erro divulgada, fração de 1. */
  margin: number;
}

/** Precisão divulgada junto com a estimativa, quando o método dá margem. */
export interface PublicationRevision {
  /** Número da revisão: 1, 2, … estritamente crescente, sem lacunas. */
  revision: number;
  /** Mês da publicação ou da retificação, "AAAA-MM". */
  publishedAt: string;
  /** Período observado pela estimativa ("AAAA-MM"), mesmo na retificação. */
  observedPeriod: { readonly from: string; readonly to: string };
  /** Versão do método divulgada; mudar o método é criar revisão, não editar a passada. */
  methodVersion: string;
  precision?: PublicationPrecision;
  /** Conteúdo divulgado da revisão: a estimativa publicada, jamais a verdade interna do motor. */
  payload: JsonObject;
  /** Motivo da retificação; ausente na primeira revisão. */
  reason?: string;
}

/**
 * Publicação estável: `id`, `kind` e `source` não mudam; `revisions` só ganha itens (§6.1 — a leitura da UI nunca
 * reescreve o histórico). A revisão atual é sempre a última do arranjo.
 */
export interface Publication {
  /** Identificador estável durante toda a partida, gravado como parte do save. */
  id: string;
  kind: PublicationKind;
  source: PublicationSource;
  revisions: readonly PublicationRevision[];
}

/**
 * Rascunho de revisão (`revisePublication`). O chamador decide o que é publicado: o motor só recebe estimativas,
 * nunca o estado real (§2.4).
 */
export interface PublicationRevisionDraft {
  publishedAt: string;
  observedPeriod: { from: string; to: string };
  methodVersion: string;
  precision?: PublicationPrecision;
  payload: JsonObject;
  reason?: string;
}

/** Rascunho da publicação nova (`buildPublication`). */
export interface PublicationDraft extends PublicationRevisionDraft {
  id: string;
  kind: PublicationKind;
  source: PublicationSource;
}

/** Formato válido de mês civil "AAAA-MM" (nunca `Date`; ECONOMIC_MODEL.md §2). */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Congela em profundidade: tentativa de mudar revisão publicada vira erro em tempo de execução. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Cria a publicação com a revisão 1, inteiramente congelada. Mesmo rascunho → mesma publicação: nada aqui sorteia
 * ou cronometra (§6.1). Revisão inicial não registra `reason`: só retificação tem motivo.
 */
export function buildPublication(draft: PublicationDraft): Publication {
  if (draft.reason !== undefined) {
    throw new RangeError('revisão inicial não registra motivo de retificação');
  }
  return deepFreeze({
    id: draft.id,
    kind: draft.kind,
    source: deepFreeze({ ...draft.source }),
    revisions: [deepFreeze(revisionOf(draft, 1))],
  });
}

/** Congela uma revisão com o número dado. */
function revisionOf(revision: PublicationRevisionDraft, number: number): PublicationRevision {
  if (!Number.isFinite(number) || number < 1 || !Number.isInteger(number)) {
    throw new RangeError(`número de revisão inválido: ${number}`);
  }
  return deepFreeze({
    revision: number,
    publishedAt: revision.publishedAt,
    observedPeriod: deepFreeze({ ...revision.observedPeriod }),
    methodVersion: revision.methodVersion,
    ...(revision.precision ? { precision: deepFreeze({ ...revision.precision }) } : {}),
    payload: deepFreeze(revision.payload),
    ...(revision.reason ? { reason: revision.reason } : {}),
  });
}

/**
 * Retificação: devolve uma publicação nova com a revisão seguinte acrescida; a publicação original e a revisão
 * anterior ficam intocadas — reescrever o histórico é proibido (§6.1).
 */
export function revisePublication(publication: Publication, revision: PublicationRevisionDraft): Publication {
  const last = publication.revisions[publication.revisions.length - 1];
  if (!last) throw new RangeError(`publicação sem revisões: ${publication.id}`);
  return deepFreeze({
    ...publication,
    revisions: [...publication.revisions, revisionOf(revision, last.revision + 1)],
  });
}

/** Revisão atual da publicação: a última do histórico. Só leitura. */
export function currentRevisionOf(publication: Publication): PublicationRevision {
  const last = publication.revisions[publication.revisions.length - 1];
  if (!last) throw new RangeError(`publicação sem revisões: ${publication.id}`);
  return last;
}

/**
 * Serialização canônica (chaves em ordem, sem espaços; chave com `undefined`some, como no JSON, para o resumo
 * sobreviver ao ciclo `JSON.stringify` → `parse`). Números não finitos são recusados: instabilidade entre o
 * objeto vivo e o JSON recarregado.
 */
export function canonicalJson(value: JsonValue): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`valor não finito na publicação: ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean' || value === null) return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as { readonly [key: string]: JsonValue };
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}

/**
 * Resumo estável da observação ("mesma observação após reabrir/recarregar", §6.1): a serialização canônica de id,
 * tipo, fonte e histórico completo. Duas leituras do mesmo conteúdo dão exatamente o mesmo texto, e ler o resumo
 * não muda a publicação nem consome PRNG.
 */
export function publicationDigest(publication: Publication): string {
  return canonicalJson({
    id: publication.id,
    kind: publication.kind,
    source: {
      id: publication.source.id,
      name: publication.source.name,
      fictional: publication.source.fictional,
    },
    revisions: publication.revisions.map((r) => ({
      revision: r.revision,
      publishedAt: r.publishedAt,
      observedPeriod: { from: r.observedPeriod.from, to: r.observedPeriod.to },
      methodVersion: r.methodVersion,
      ...(r.precision ? { precision: { margin: r.precision.margin } } : {}),
      payload: r.payload,
      ...(r.reason ? { reason: r.reason } : {}),
    })),
  });
}

/**
 * Invariantes das publicações, no estilo de `checkClimate`/`checkPublicPolicies` (vazio = válido): numeração
 * 1, 2, 3… sem lacunas; `publishedAt` não recua; meses em "AAAA-MM"; período observado coerente; fonte e método
 * sempre presentes e fictícios; payload sempre presente; e `reason` só a partir da retificação.
 */
export function checkPublications(publications: readonly Publication[]): string[] {
  const errors: string[] = [];
  for (const publication of publications) {
    const tag = publication.id?.trim() ? publication.id : '<id vazio>';
    if (!publication.id?.trim()) errors.push('id de publicação vazio');
    if (publication.kind !== 'pesquisa' && publication.kind !== 'noticia' && publication.kind !== 'boletim') {
      errors.push(`${tag}: tipo de publicação inválido: ${String(publication.kind)}`);
    }
    if (!publication.source?.id?.trim() || !publication.source?.name?.trim()) {
      errors.push(`${tag}: fonte sem id ou nome`);
    }
    if (publication.source?.fictional !== true) {
      errors.push(`${tag}: fonte não marcada como fictícia`);
    }
    if (!publication.revisions?.length) {
      errors.push(`${tag}: publicação sem revisões`);
      continue;
    }

    let previous: PublicationRevision | undefined;
    publication.revisions.forEach((revision, index) => {
      const label = previous ? `${tag}: revisão ${revision.revision}` : `${tag}: revisão 1`;
      if (previous && revision.revision !== previous.revision + 1) {
        errors.push(`${tag}: lacuna na numeração de revisões: ${previous.revision} → ${revision.revision}`);
      }
      if (previous && revision.publishedAt < previous.publishedAt) {
        errors.push(`${tag}: publicação retroagiu: ${previous.publishedAt} → ${revision.publishedAt}`);
      }
      if (!MONTH_RE.test(revision.publishedAt)) {
        errors.push(`${label}: mês da publicação não é "AAAA-MM": ${revision.publishedAt}`);
      }
      if (!MONTH_RE.test(revision.observedPeriod.from) || !MONTH_RE.test(revision.observedPeriod.to)) {
        errors.push(`${label}: período observado não é "AAAA-MM"`);
      } else if (revision.observedPeriod.from > revision.observedPeriod.to) {
        errors.push(
          `${label}: período observado invertido: ${revision.observedPeriod.from} → ${revision.observedPeriod.to}`,
        );
      }
      if (!revision.methodVersion?.trim()) errors.push(`${label}: método divulgado vazio`);
      if (revision.precision !== undefined) {
        const margin = revision.precision.margin;
        if (!Number.isFinite(margin) || margin < 0) {
          errors.push(`${label}: margem de erro inválida: ${margin}`);
        }
      }
      if (Object.keys(revision.payload ?? {}).length === 0) {
        errors.push(`${label}: sem conteúdo divulgado`);
      }
      if (index === 0 && revision.reason !== undefined) {
        errors.push(`${label}: primeira revisão não registra motivo de retificação`);
      }
      previous = revision;
    });
  }
  return errors;
}
