import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, RAILWAYS } from '@/content';
import type { GameState, Proposal } from '@/engine';
import { testState } from '@/tests/fixtures';

import {
  ALL_RAILWAYS,
  buildRailwayOverlay,
  corridorLength,
  governmentWorks,
  lengthText,
  railwayCaption,
  railwayListRows,
  RAILWAY_STYLES,
  segmentDescription,
  splitPath,
  statusCounts,
  toggleFilter,
  type GovernmentWork,
} from './railwayView';

const content = loadContent(DEFAULT_SCENARIO_ID);
const lineFor = (segmentId: string, overlay = buildRailwayOverlay({ network: RAILWAYS })) =>
  overlay.lines.filter((l) => l.segmentId === segmentId);

function work(
  segmentId: string,
  stage: GovernmentWork['stage'],
  progress: number,
): ReadonlyMap<string, GovernmentWork> {
  return new Map([
    [segmentId, { segmentId, proposalId: 'p1', policyName: 'Obra', stage, progress, kind: 'construcao' }],
  ]);
}

// PLANO_EXPANSAO EX-30: "nenhum trecho planejado confundido com ativo"; filtros e alternativa acessível em lista.
describe('camada Ferrovias', () => {
  it('desenha toda a rede com um estilo por situação e legenda só do que aparece', () => {
    const overlay = buildRailwayOverlay({ network: RAILWAYS });
    const segments = RAILWAYS.corridors.flatMap((c) => c.segments);
    expect(overlay.lines).toHaveLength(segments.length);
    for (const s of segments) expect(lineFor(s.id, overlay)[0]!.styleId).toBe(s.status);
    expect(overlay.legend.map((e) => e.styleId)).toEqual([
      'ativa',
      'parcial',
      'em_construcao',
      'planejada',
      'desativada',
    ]);
    expect(overlay.caption).toBe('Traçado esquemático · situação de dez/2025 · v2026.10.1 · PROVISORIO');
  });

  it('distingue situações por cor e por padrão de traço (não só pela cor)', () => {
    const keys = (['ativa', 'parcial', 'em_construcao', 'planejada', 'desativada'] as const).map(
      (id) =>
        `${RAILWAY_STYLES[id].color}|${RAILWAY_STYLES[id].dash?.join(',') ?? 'cheio'}|${RAILWAY_STYLES[id].widthPx}`,
    );
    expect(new Set(keys).size).toBe(5);
    // Ativa e parcial dividem a cor; o traço as separa.
    expect(RAILWAY_STYLES.ativa.dash).toBeNull();
    expect(RAILWAY_STYLES.parcial.dash).not.toBeNull();
  });

  it('filtra por situação e por uso, sem esvaziar o filtro', () => {
    const passengers = { ...ALL_RAILWAYS, usages: ['passageiros' as const] };
    const overlay = buildRailwayOverlay({ network: RAILWAYS, filter: passengers });
    const ids = new Set(overlay.lines.map((l) => l.corridorId));
    expect([...ids].sort()).toEqual(['trem_brasilia_goiania', 'trem_intercidades_sp', 'trem_rio_sao_paulo']);
    const activeOnly = buildRailwayOverlay({ network: RAILWAYS, filter: { ...ALL_RAILWAYS, statuses: ['ativa'] } });
    expect(activeOnly.lines.every((l) => l.styleId === 'ativa')).toBe(true);
    expect(toggleFilter(['ativa'], 'ativa', ['ativa', 'parcial'])).toEqual(['ativa']);
    expect(toggleFilter(['parcial'], 'ativa', ['ativa', 'parcial'])).toEqual(['ativa', 'parcial']);
  });

  it('a obra do governo substitui o desenho planejado, com a parte executada separada', () => {
    const overlay = buildRailwayOverlay({ network: RAILWAYS, works: work('fiol_3', 'obra', 0.4) });
    const lines = lineFor('fiol_3', overlay);
    expect(lines.map((l) => l.styleId)).toEqual(['governo_falta', 'governo_feito']);
    expect(overlay.legend[0]!.styleId).toBe('governo_feito');
    // Filtrar "planejada" não esconde a obra do governo: ela tem interruptor próprio.
    const noPlanned = buildRailwayOverlay({
      network: RAILWAYS,
      works: work('fiol_3', 'obra', 0.4),
      filter: { ...ALL_RAILWAYS, statuses: ['ativa'] },
    });
    expect(lineFor('fiol_3', noPlanned)).toHaveLength(2);
    const hidden = buildRailwayOverlay({
      network: RAILWAYS,
      works: work('fiol_3', 'obra', 0.4),
      filter: { ...ALL_RAILWAYS, government: false },
    });
    expect(lineFor('fiol_3', hidden)).toHaveLength(0);
  });

  it('só a obra em operação vira ativa; a proposta continua pontilhada', () => {
    const operating = buildRailwayOverlay({ network: RAILWAYS, works: work('fiol_3', 'operacao', 1) });
    expect(lineFor('fiol_3', operating)[0]!.styleId).toBe('ativa');
    const proposed = buildRailwayOverlay({ network: RAILWAYS, works: work('fiol_3', 'proposta', 0) });
    expect(lineFor('fiol_3', proposed)[0]!.styleId).toBe('governo_proposta');
  });

  it('corta o traçado na fração do avanço, sem perder pontos', () => {
    const path = [
      [0, 0],
      [2, 0],
      [4, 0],
    ] as const;
    const [done, rest] = splitPath(path, 0.25);
    expect(done).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(rest).toEqual([
      [1, 0],
      [2, 0],
      [4, 0],
    ]);
    expect(splitPath(path, 0)).toEqual([[], [...path]]);
    expect(splitPath(path, 1)).toEqual([[...path], []]);
  });

  it('destaca o corredor escolhido e apaga os demais', () => {
    const overlay = buildRailwayOverlay({ network: RAILWAYS, selectedCorridorId: 'ef_carajas' });
    expect(overlay.lines.filter((l) => l.emphasis === 'selected').map((l) => l.corridorId)).toEqual(['ef_carajas']);
    expect(overlay.lines.filter((l) => l.corridorId !== 'ef_carajas').every((l) => l.emphasis === 'dimmed')).toBe(true);
    expect(buildRailwayOverlay({ network: RAILWAYS, selectedCorridorId: 'inexistente' }).selectedCorridorId).toBeNull();
  });

  it('a lista usa o mesmo filtro e põe a obra do governo primeiro', () => {
    const rows = railwayListRows(RAILWAYS, ALL_RAILWAYS, work('trem_bsb_gyn', 'obra', 0.1));
    expect(rows[0]!.corridor.id).toBe('trem_brasilia_goiania');
    expect(rows).toHaveLength(RAILWAYS.corridors.length);
    const deactivated = railwayListRows(RAILWAYS, { ...ALL_RAILWAYS, statuses: ['desativada'] });
    expect(deactivated.every((r) => r.segments.every((s) => s.status === 'desativada'))).toBe(true);
    expect(deactivated.map((r) => r.corridor.id)).toContain('madeira_mamore');
    const counts = statusCounts(RAILWAYS);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(RAILWAYS.corridors.flatMap((c) => c.segments).length);
  });

  it('diz "sem dado" quando a fonte não traz a extensão, em vez de inventar', () => {
    const mrs = RAILWAYS.corridors.find((c) => c.id === 'mrs')!;
    expect(lengthText(corridorLength(mrs))).toBe('Extensão sem dado consolidado');
    const fiol = RAILWAYS.corridors.find((c) => c.id === 'fiol')!;
    expect(lengthText(corridorLength(fiol))).toBe('≥ 1.022 km (só trechos com dado)');
    const efc = RAILWAYS.corridors.find((c) => c.id === 'ef_carajas')!;
    expect(lengthText(corridorLength(efc))).toBe('892 km');
    expect(segmentDescription(efc, efc.segments[0]!, 'ativa', null)).toBe(
      'EFC, Carajás – São Luís, Ativa, Situação confirmada na fonte, 892 km',
    );
    expect(railwayCaption(RAILWAYS)).toContain('PROVISORIO');
  });

  it('lê as obras ferroviárias do governo a partir das propostas e da carteira', () => {
    const state = testState(7, 'estrategica', content);
    const proposal = (id: string, policyId: string, status: Proposal['status']) =>
      ({ id, policyId, status, scale: 1, executionStart: 0, history: [] }) as unknown as Proposal;
    const withWorks = {
      ...state,
      proposals: [
        proposal('a', 'projeto_ferrovia_integracao_oeste', 'em_tramitacao'),
        proposal('b', 'projeto_trem_regional_passageiros', 'em_execucao'),
      ],
      publicPolicies: {
        ...state.publicPolicies,
        projects: [
          {
            proposalId: 'b',
            policyId: 'projeto_trem_regional_passageiros',
            phase: 'obra' as const,
            phaseMonth: 3,
            progress: 0.3,
            budgetMillions: 7500,
            spentMillions: 2000,
            assetMillions: 0,
            maintenanceMillions: 0,
            delayMonths: 0,
            startMonth: 0,
          },
        ],
      },
    } as GameState;
    const works = governmentWorks(withWorks, content);
    expect(works.get('fiol_3')).toMatchObject({ stage: 'proposta', progress: 0 });
    expect(works.get('trem_bsb_gyn')).toMatchObject({ stage: 'obra', progress: 0.3 });
    const cancelled = {
      ...withWorks,
      publicPolicies: {
        ...withWorks.publicPolicies,
        projects: withWorks.publicPolicies.projects.map((p) => ({ ...p, phase: 'cancelado' as const })),
      },
    } as GameState;
    expect(governmentWorks(cancelled, content).has('trem_bsb_gyn')).toBe(false);
  });
});
