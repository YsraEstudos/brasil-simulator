import { describe, expect, it } from 'vitest';

import technologyJson from '@/data/technology/arvore_tecnologica.json';
import tradeJson from '@/data/trade/comercio_exterior.json';
import { parseTechnologyCatalog } from '@/types/technology';
import { parseTradeCatalog } from '@/types/trade';

import { TECHNOLOGY, TRADE } from './technology';

// PLANO_EXPANSAO §7: dados versionados, status declarado (PROVISORIO) e validados por Zod ao carregar.

describe('catálogos do R7', () => {
  it('árvore e comércio carregam com status e versão', () => {
    expect(TECHNOLOGY.status).toBe('PROVISORIO');
    expect(TRADE.status).toBe('PROVISORIO');
    expect(TECHNOLOGY.version).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  });

  it('pré-requisito posterior ou desconhecido é recusado (a árvore não tem ciclos)', () => {
    const raw = structuredClone(technologyJson) as { nodes: { id: string; prerequisites: string[] }[] };
    raw.nodes[0].prerequisites = [raw.nodes[1].id];
    const r = parseTechnologyCatalog(raw);
    expect(r.ok).toBe(false);
  });

  it('rota importada não pode prometer domínio local', () => {
    const raw = structuredClone(technologyJson) as {
      nodes: { routes: { importar?: { capability: number } } }[];
    };
    raw.nodes[0].routes.importar!.capability = 0.5;
    expect(parseTechnologyCatalog(raw).ok).toBe(false);
  });

  it('frações de comércio por parceiro não passam de 100% e a tarifa-base fica na faixa', () => {
    const raw = structuredClone(tradeJson) as { partners: { exportShare: number }[]; tariff: { base: number } };
    raw.partners[0].exportShare = 0.9;
    expect(parseTradeCatalog(raw).ok).toBe(false);
    const bad = structuredClone(tradeJson) as { tariff: { base: number } };
    bad.tariff.base = 0.5;
    expect(parseTradeCatalog(bad).ok).toBe(false);
  });
});
