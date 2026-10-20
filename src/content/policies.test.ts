import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LEGISLATIVE_INSTRUMENTS, parsePolicy } from '@/types/policy';

import { DEFAULT_SCENARIO_ID, SCENARIOS } from './scenarios';
import { POLICIES } from './policies';

/** As 8 políticas do protótipo (GAME_DESIGN.md §11.2). */
const PROTOTYPE_IDS = [
  'contingenciamento',
  'gastos_tributarios_revisao',
  'infraestrutura_credito_adicional',
  'iof_credito_reducao',
  'irpf_tabela',
  'reforma_administrativa',
  'seguranca_cooperacao',
  'transferencia_renda_ampliacao',
].sort();

/** Catálogo completo: protótipo + valorização do salário mínimo (Fase 03, ECONOMIC_MODEL.md §5.8). */
const EXPECTED_IDS = [...PROTOTYPE_IDS, 'salario_minimo_valorizacao', 'reforma_previdencia'].sort();

const POLICIES_DIR = fileURLToPath(new URL('../data/policies', import.meta.url));

describe('catálogo de políticas', () => {
  it('contém as 8 políticas do protótipo, a valorização do salário mínimo e a reforma da previdência', () => {
    expect(Object.keys(POLICIES)).toEqual(expect.arrayContaining(EXPECTED_IDS));
    expect(Object.keys(POLICIES).length).toBeGreaterThanOrEqual(30);
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
    expect(files).toEqual(Object.keys(POLICIES).sort());
    for (const [key, policy] of Object.entries(POLICIES)) {
      expect(policy.id).toBe(key);
    }
  });

  it('as políticas do protótipo são citadas pelo cenário prototipo_ficticio', () => {
    const cited = SCENARIOS.prototipo_ficticio?.policies ?? [];
    for (const id of PROTOTYPE_IDS) {
      expect(cited).toContain(id);
    }
  });

  it('todas as políticas são citadas pelo cenário brasil_2027_01', () => {
    expect([...(SCENARIOS.brasil_2027_01?.policies ?? [])].sort()).toEqual(EXPECTED_IDS);
  });

  it('o cenário novo disponibiliza todas as políticas sem expandir o catálogo legado', () => {
    expect([...SCENARIOS[DEFAULT_SCENARIO_ID].policies].sort()).toEqual(Object.keys(POLICIES).sort());
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

  it('reforma_previdencia: PEC de 2 ações, economia que cresce com o tempo e custo de aprovação', () => {
    const reforma = POLICIES.reforma_previdencia;
    expect(reforma?.instruments[0]).toBe('pec');
    expect(reforma?.agendaCost).toBe(2);
    const cortes = (reforma?.impacts ?? []).filter((i) => i.channel === 'despesa_obrigatoria');
    expect(cortes.every((i) => i.magnitude < 0)).toBe(true);
    expect(cortes.map((i) => i.lagMonths)).toEqual([...cortes.map((i) => i.lagMonths)].sort((a, b) => a - b));
    expect(reforma?.impacts.find((i) => i.channel === 'aprovacao')?.magnitude).toBeLessThan(0);
  });

  it('reforma_administrativa usa PEC e custa 2 ações de agenda', () => {
    const reforma = POLICIES.reforma_administrativa;
    expect(reforma).toBeDefined();
    expect(reforma?.instruments).toContain('pec');
    expect(reforma?.agendaCost).toBe(2);
  });
});
