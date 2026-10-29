import { z } from 'zod';

import { contentIdSchema, dataStatusSchema } from './data';

/**
 * Árvore de tecnologias (PLANO_EXPANSAO F07, EX-24 e EX-32), gravada em `src/data/technology/`. Cada nó tem até três
 * rotas de aquisição — importar, transferir/adaptar com um parceiro ou desenvolver no país — e cada rota percorre só
 * os estágios que lhe cabem. Custos e prazos são hipóteses de jogo `PROVISORIO`, não orçamento de engenharia
 * (docs/EXPANSAO_CALIBRACAO.md, R7).
 */

/** Estágios independentes do plano (F07), na ordem em que acontecem. */
export const technologyStageSchema = z.enum(['pesquisa_basica', 'prototipagem', 'escala_industrial', 'adocao']);
export type TechnologyStageId = z.infer<typeof technologyStageSchema>;
export const TECHNOLOGY_STAGES: readonly TechnologyStageId[] = technologyStageSchema.options;

export const technologyRouteSchema = z.enum(['importar', 'transferir', 'desenvolver']);
export type TechnologyRouteId = z.infer<typeof technologyRouteSchema>;
export const TECHNOLOGY_ROUTES: readonly TechnologyRouteId[] = technologyRouteSchema.options;

/**
 * Canal único do efeito depois da adoção (plano §2.2: um dono por variável). `potencial` é o nível do PIB potencial
 * (fração), consumido pela economia; os demais são TWh/mês consumidos pelo balanço de energia.
 */
export const technologyEffectSchema = z
  .object({
    channel: z.enum(['potencial', 'geracao', 'transmissao', 'armazenamento']),
    /** Fração do PIB potencial (`potencial`) ou TWh/mês (`geracao`, `transmissao`) ou TWh de estoque (`armazenamento`). */
    value: z.number().positive(),
  })
  .strict();
export type TechnologyEffect = z.infer<typeof technologyEffectSchema>;

const stageCostSchema = z
  .object({
    /** Meses do estágio com financiamento pleno e capital humano de referência. */
    months: z.number().int().positive(),
    /** Desembolso anual pleno em R$ milhões de jan/2027. */
    annualMillions: z.number().nonnegative(),
  })
  .strict();

export const technologyRouteSpecSchema = z
  .object({
    stages: z.partialRecord(technologyStageSchema, stageCostSchema),
    /** Chance de falha parcial ao fim de cada estágio de pesquisa ou absorção (0–1); importar não tem. */
    stageFailure: z.number().min(0).max(0.9),
    /** Fração do gasto paga a fornecedores externos (câmbio e importações). */
    importShare: z.number().min(0).max(1),
    /** Manutenção e licenças por ano depois da adoção, R$ milhões de jan/2027. */
    maintenanceMillions: z.number().nonnegative(),
    /** Domínio técnico local ao concluir (0 importar, parcial transferir, 1 desenvolver). */
    capability: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((route, ctx) => {
    if (!route.stages.adocao)
      ctx.addIssue({ code: 'custom', path: ['stages'], message: 'toda rota termina na adoção' });
  });
export type TechnologyRouteSpec = z.infer<typeof technologyRouteSpecSchema>;

export const technologyNodeSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    branch: contentIdSchema,
    summary: z.string().min(1),
    /** Nós que precisam estar adotados antes de começar este. */
    prerequisites: z.array(contentIdSchema),
    /** Setores e grupos beneficiados (texto para o jogador). */
    beneficiaries: z.array(z.string().min(1)).min(1),
    /** Custos e efeitos adversos possíveis (texto para o jogador). */
    adverse: z.array(z.string().min(1)).min(1),
    /** Anos efetivos de estudo da força de trabalho que dão o ritmo de referência (`humanCapital` da educação). */
    humanCapitalReference: z.number().positive(),
    /** Obra que precisa estar em operação para a adoção (política da carteira existente). */
    requiresProject: z.array(contentIdSchema).optional(),
    /** A adoção depende de eletricidade sem racionamento no mês. */
    requiresEnergy: z.boolean(),
    effect: technologyEffectSchema,
    /** Consumo adicional de eletricidade depois da adoção, TWh/mês (efeito adverso; 0 = nenhum). */
    energyDemandTwh: z.number().nonnegative(),
    /** Exportação anual possível depois de certificada, R$ milhões de jan/2027 (0 = sem mercado externo). */
    exportMillions: z.number().nonnegative(),
    routes: z.partialRecord(technologyRouteSchema, technologyRouteSpecSchema),
  })
  .strict();
export type TechnologyNode = z.infer<typeof technologyNodeSchema>;

export const technologyCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.\d{2}\.\d+$/, 'versão no formato AAAA.MM.N'),
    status: dataStatusSchema,
    source: z.string().min(1),
    branches: z.array(z.object({ id: contentIdSchema, name: z.string().min(1) }).strict()).min(1),
    nodes: z.array(technologyNodeSchema).min(1),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const branches = new Set(catalog.branches.map((b) => b.id));
    const ids = new Set<string>();
    catalog.nodes.forEach((node, i) => {
      if (ids.has(node.id))
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'id'], message: `id repetido: ${node.id}` });
      ids.add(node.id);
      if (!branches.has(node.branch))
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'branch'], message: `ramo desconhecido: ${node.branch}` });
      if (Object.keys(node.routes).length === 0)
        ctx.addIssue({ code: 'custom', path: ['nodes', i, 'routes'], message: 'nó sem rota de aquisição' });
      const imported = node.routes.importar;
      if (imported && (imported.capability !== 0 || imported.stageFailure !== 0))
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', i, 'routes', 'importar'],
          message: 'importar não gera domínio local nem tem estágio de pesquisa',
        });
    });
    // Pré-requisito só aponta para nó anterior: a árvore não tem ciclos e a ordem do arquivo é a de exibição.
    const seen = new Set<string>();
    catalog.nodes.forEach((node, i) => {
      for (const p of node.prerequisites) {
        if (!seen.has(p))
          ctx.addIssue({
            code: 'custom',
            path: ['nodes', i, 'prerequisites'],
            message: `pré-requisito ${p} desconhecido ou posterior`,
          });
      }
      seen.add(node.id);
    });
  });
export type TechnologyCatalog = z.infer<typeof technologyCatalogSchema>;

export function parseTechnologyCatalog(
  raw: unknown,
): { ok: true; catalog: TechnologyCatalog } | { ok: false; errors: string[] } {
  const r = technologyCatalogSchema.safeParse(raw);
  if (r.success) return { ok: true, catalog: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
