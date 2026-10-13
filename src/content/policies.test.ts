import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LEGISLATIVE_INSTRUMENTS, parsePolicy } from '@/types/policy';

import { SCENARIOS } from './scenarios';
import { POLICIES } from './policies';

const EXPECTED_IDS = [
  'contingenciamento',
  'gastos_tributarios_revisao',
  'infraestrutura_credito_adicional',
  'iof_credito_reducao',
  'irpf_tabela',
  'reforma_administrativa',
  'seguranca_cooperacao',
  'transferencia_renda_ampliacao',
].sort();

const POLICIES_DIR = fileURLToPath(new URL('../data/policies', import.meta.url));

describe('catálogo de políticas do protótipo', () => {
  it('contém exatamente as 8 políticas do protótipo', () => {
    expect(Object.keys(POLICIES).sort()).toEqual(EXPECTED_IDS);
  });

  it('cada política é válida pelo esquema Zod', () => {
    for (const policy of Object.values(POLICIES)) {
      const r = parsePolicy(policy);
      expect(r.ok, r.ok ? '' : r.errors.join('; ')).toBe(true);
    }
  });

  it('a chave de cada política coincide com o id e o nome do arquivo JSON', () => {
    const files = readdirSync(POLICIES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(files).toEqual(EXPECTED_IDS);
    for (const [key, policy] of Object.entries(POLICIES)) {
      expect(policy.id).toBe(key);
    }
  });

  it('todas as políticas são citadas pelo cenário prototipo_ficticio', () => {
    const cited = SCENARIOS.prototipo_ficticio?.policies ?? [];
    for (const id of EXPECTED_IDS) {
      expect(cited).toContain(id);
    }
  });

  it('prazo legislativo é positivo só quando há instrumento legislativo', () => {
    for (const policy of Object.values(POLICIES)) {
      const legislative = policy.instruments.some((i) => LEGISLATIVE_INSTRUMENTS.includes(i));
      if (legislative) {
        expect(policy.timeline.expectedLegislativeMonths, policy.id).toBeGreaterThan(0);
      } else {
        expect(policy.timeline.expectedLegislativeMonths, policy.id).toBe(0);
      }
    }
  });

  it('reforma_administrativa usa PEC e custa 2 pontos de agenda', () => {
    const reforma = POLICIES.reforma_administrativa;
    expect(reforma).toBeDefined();
    expect(reforma?.instruments).toContain('pec');
    expect(reforma?.agendaCost).toBe(2);
  });
});
