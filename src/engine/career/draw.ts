import { createRng, deriveSeed, seedRng, type Rng } from '../rng';

/**
 * Sorteio por chave da carreira (PLANO_CAMPANHA.md §4.1, D-C11 na recomendação "sorteio por chave"). O resultado
 * depende só da chave (semente da campanha + partes como sistema, turno, ação, alvo, ocorrência), nunca da posição
 * numa lista nem do PRNG principal: abrir uma tela ou mudar a ordem de outras ações não muda o sorteio.
 */

/** Base de 32 bits do FNV-1a. */
const FNV_OFFSET = 0x811c9dc5;
/** Primo de 32 bits do FNV-1a. */
const FNV_PRIME = 0x01000193;

/**
 * Sal estável de 32 bits para uma chave (FNV-1a sobre as partes unidas por "|"). Só `Math.imul` e operações
 * inteiras: idêntico no Hermes e no V8. As chaves publicadas **nunca mudam** (mudar uma chave muda o sorteio das
 * campanhas existentes).
 */
export function keySalt(parts: readonly (string | number)[]): number {
  const text = parts.join('|');
  let h = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

/** PRNG de uso único para uma chave: `deriveSeed(semente, sal da chave)`. */
export function keyedRng(seed: number, parts: readonly (string | number)[]): Rng {
  return createRng(seedRng(deriveSeed(seed, keySalt(parts))));
}
