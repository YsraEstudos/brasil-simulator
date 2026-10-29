import { CERTIFY_EXPORT_ACTION_ID, FUND_TECHNOLOGY_ACTION_ID, SUSPEND_TECHNOLOGY_ACTION_ID } from '../actions';
import { keyedRng } from '../career/draw';
import { researchFailureReduction } from '../skills/skills';
import { currentNominalGdpMillions, scenarioEconomyValues } from '../state';
import type { Decision, DecisionRejection, GameContent, GameState, MonthStep, ScheduledImpulse } from '../types';
import {
  TECHNOLOGY_ROUTES,
  TECHNOLOGY_STAGES,
  type TechnologyCatalog,
  type TechnologyNode,
  type TechnologyRouteId,
  type TechnologyRouteSpec,
  type TechnologyStageId,
} from '../../types/technology';
import { researchParam } from './calibration';
import type { ResearchBottleneck, ResearchProgram, ResearchState } from './types';

export { researchEnergyEffects } from './effects';

/**
 * Árvore de tecnologias (PLANO_EXPANSAO F07, EX-24 e EX-32). O jogador escolhe, para cada nó, uma rota:
 *
 * - **importar:** só o estágio de adoção; rápido, mas a maior parte do gasto vai a fornecedores externos (custo
 *   cambial e importações), a manutenção depende de licenças e o país não ganha domínio técnico nem pode exportar;
 * - **transferir:** com um parceiro que aceite, pula a pesquisa básica e absorve a tecnologia; domínio parcial;
 * - **desenvolver:** os quatro estágios (pesquisa básica, prototipagem, escala industrial, adoção), mais tempo,
 *   risco de falha parcial em cada um e domínio pleno, que permite pedir certificação de exportação.
 *
 * Canais únicos (plano §2.2): o gasto entra no motor fiscal como `gasto.investimento`, disputando o mesmo espaço
 * discricionário da carteira de obras (o que sobrou depois dela no mês); a parte paga lá fora é lida pelo comércio
 * exterior como importação; o efeito adotado vai ao PIB potencial (`oferta.potencial`, pela variação do nível) ou ao
 * balanço de energia (TWh). Nenhum efeito é aplicado duas vezes.
 */

const MONTHS_PER_YEAR = 12;
const EPSILON = 1e-9;

export const EMPTY_RESEARCH: ResearchState = { programs: [] };

/** Prefixo dos impulsos da pesquisa (gasto e efeito), para auditoria e explicação. */
export const RESEARCH_IMPULSE_PREFIX = 'pesquisa:';

export const ROUTE_LABEL: Readonly<Record<TechnologyRouteId, string>> = {
  importar: 'Importar',
  transferir: 'Transferir e adaptar',
  desenvolver: 'Desenvolver no país',
};

export const STAGE_LABEL: Readonly<Record<TechnologyStageId, string>> = {
  pesquisa_basica: 'Pesquisa básica',
  prototipagem: 'Prototipagem e adaptação',
  escala_industrial: 'Escala industrial',
  adocao: 'Adoção e manutenção',
};

export function researchOf(state: Pick<GameState, 'research'>): ResearchState {
  return state.research ?? EMPTY_RESEARCH;
}

export function technologyNode(content: Pick<GameContent, 'technology'>, nodeId: unknown): TechnologyNode | undefined {
  return content.technology?.nodes.find((node) => node.id === nodeId);
}

export function programOf(state: Pick<GameState, 'research'>, nodeId: string): ResearchProgram | undefined {
  return researchOf(state).programs.find((program) => program.nodeId === nodeId);
}

export function isAdopted(state: Pick<GameState, 'research'>, nodeId: string): boolean {
  return programOf(state, nodeId)?.status === 'adotada';
}

/** Estágios que a rota percorre, na ordem do plano. */
export function routeStages(route: TechnologyRouteSpec): TechnologyStageId[] {
  return TECHNOLOGY_STAGES.filter((stage) => route.stages[stage] !== undefined);
}

function isRoute(value: unknown): value is TechnologyRouteId {
  return typeof value === 'string' && (TECHNOLOGY_ROUTES as readonly string[]).includes(value);
}

/** Relação atual com um parceiro comercial (−100 a 100), ou `null` se não houver. */
function partnerRelation(state: Pick<GameState, 'trade'>, partnerId: unknown): number | null {
  return state.trade?.partners.find((partner) => partner.id === partnerId)?.relation ?? null;
}

/** Parceiros que aceitam transferir tecnologia e estão com relação suficiente. */
export function transferPartners(state: Pick<GameState, 'trade'>, content: Pick<GameContent, 'trade'>): string[] {
  const min = researchParam('relacao_minima_transferencia');
  return (content.trade?.partners ?? [])
    .filter((partner) => partner.technologyPartner && (partnerRelation(state, partner.id) ?? -Infinity) >= min)
    .map((partner) => partner.id);
}

/** Pré-requisitos ainda não adotados. */
export function missingPrerequisites(state: Pick<GameState, 'research'>, node: TechnologyNode): string[] {
  return node.prerequisites.filter((id) => !isAdopted(state, id));
}

/** Validação de `financiar_tecnologia` (`nodeId`, `route`, `partnerId` na transferência). `null` = válida. */
export function validateFundTechnology(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  const node = technologyNode(content, params.nodeId);
  if (!node || !isRoute(params.route) || !node.routes[params.route]) return 'alvo_invalido';
  if (missingPrerequisites(state, node).length > 0) return 'alvo_invalido';
  const current = programOf(state, node.id);
  if (current && (current.status === 'em_andamento' || current.status === 'adotada')) return 'ja_em_andamento';
  if (params.route === 'transferir' && !transferPartners(state, content).includes(String(params.partnerId)))
    return 'alvo_invalido';
  return null;
}

/** `suspender_tecnologia`: só um programa em andamento. */
export function validateSuspendTechnology(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
): DecisionRejection | null {
  const program = typeof params.nodeId === 'string' ? programOf(state, params.nodeId) : undefined;
  return program?.status === 'em_andamento' ? null : 'alvo_invalido';
}

/** O programa pode pedir certificação de exportação: adotado, com escala industrial e domínio local suficiente. */
export function canCertify(program: ResearchProgram | undefined, node: TechnologyNode | undefined): boolean {
  return (
    program !== undefined &&
    node !== undefined &&
    program.status === 'adotada' &&
    program.certifiedMonth === undefined &&
    node.exportMillions > 0 &&
    program.completedStages.includes('escala_industrial') &&
    program.capability >= researchParam('capacidade_exportar') - EPSILON
  );
}

export function validateCertifyExport(
  params: Readonly<Record<string, unknown>>,
  state: Readonly<GameState>,
  content: GameContent,
): DecisionRejection | null {
  const node = technologyNode(content, params.nodeId);
  return node && canCertify(programOf(state, node.id), node) ? null : 'alvo_invalido';
}

/**
 * R$ correntes por R$ milhão de jan/2027: a parte nacional segue os preços internos; a parte paga lá fora segue o
 * câmbio (o custo cambial da importação).
 */
export function costFactor(importShare: number, state: Readonly<GameState>, content: Pick<GameContent, 'scenario'>) {
  const anchor = scenarioEconomyValues(content.scenario).exchangeRate;
  const fx = anchor > 0 ? state.economy.exchangeRate / anchor : 1;
  return {
    domestic: (1 - importShare) * state.economy.priceLevel,
    imported: importShare * fx,
  };
}

/** Ritmo de um estágio (fração do pleno) pelo capital humano da força de trabalho, saturado. */
export function researchPace(state: Pick<GameState, 'education'>, node: TechnologyNode): number {
  const hc = state.education?.humanCapital ?? node.humanCapitalReference;
  const ratio = hc / node.humanCapitalReference;
  return Math.min(
    researchParam('ritmo_max'),
    Math.max(researchParam('ritmo_min'), ratio ** researchParam('ritmo_capital_humano')),
  );
}

/** Chance de falha parcial ao fim de um estágio, já com a habilidade de ciência e tecnologia. */
export function stageFailureChance(state: Pick<GameState, 'control' | 'skills'>, route: TechnologyRouteSpec): number {
  return route.stageFailure * Math.max(0, 1 - researchFailureReduction(state));
}

/** Exportação de tecnologia potencial no mês, R$ milhões de jan/2027 por ano, antes do acesso aos mercados. */
export function technologyExportMillions(
  state: Pick<GameState, 'research' | 'monthIndex'>,
  content: Pick<GameContent, 'technology'>,
): number {
  const lag = researchParam('meses_certificacao');
  const ramp = researchParam('rampa_exportacao');
  return researchOf(state).programs.reduce((sum, program) => {
    const node = technologyNode(content, program.nodeId);
    if (!node || program.certifiedMonth === undefined || program.status !== 'adotada') return sum;
    const months = state.monthIndex - program.certifiedMonth - lag;
    if (months < 0) return sum;
    return sum + node.exportMillions * program.capability * program.effectLevel * Math.min(1, (months + 1) / ramp);
  }, 0);
}

/** Importações do mês pagas pelos programas, R$ milhões correntes (lidas pelo comércio exterior). */
export function researchImportsMillions(state: Pick<GameState, 'research'>): number {
  return researchOf(state).programs.reduce((sum, program) => sum + program.monthImportedMillions, 0);
}

function newProgram(
  node: TechnologyNode,
  route: TechnologyRouteId,
  partnerId: string | undefined,
  inherited: readonly TechnologyStageId[],
  t: number,
): ResearchProgram {
  const spec = node.routes[route]!;
  const stages = routeStages(spec);
  // Resultado intermediário: estágio concluído num programa anterior do mesmo nó não é refeito.
  const stage = stages.find((s) => !inherited.includes(s)) ?? 'adocao';
  return {
    nodeId: node.id,
    route,
    ...(partnerId ? { partnerId } : {}),
    status: 'em_andamento',
    stage,
    stageProgress: 0,
    completedStages: [...inherited],
    startedMonth: t,
    setbacks: 0,
    spentMillions: 0,
    monthSpentMillions: 0,
    monthImportedMillions: 0,
    bottleneck: null,
    maintained: 0,
    effectLevel: 0,
    capability: 0,
  };
}

function applyDecisions(
  programs: ResearchProgram[],
  state: GameState,
  decisions: readonly Decision[],
  content: GameContent,
  notes: string[],
) {
  const t = state.monthIndex;
  for (const decision of decisions) {
    const params = decision.params ?? {};
    const node = technologyNode(content, params.nodeId);
    if (!node) continue;
    const index = programs.findIndex((p) => p.nodeId === node.id);
    const current = index >= 0 ? programs[index] : undefined;
    if (decision.policyId === SUSPEND_TECHNOLOGY_ACTION_ID && current?.status === 'em_andamento') {
      programs[index] = { ...current, status: 'suspensa', bottleneck: null };
      notes.push(`Tecnologia ${node.name}: programa suspenso; os estágios concluídos ficam guardados.`);
    } else if (decision.policyId === FUND_TECHNOLOGY_ACTION_ID && isRoute(params.route)) {
      if (current && (current.status === 'em_andamento' || current.status === 'adotada')) continue;
      const partnerId = params.route === 'transferir' ? String(params.partnerId) : undefined;
      const program = newProgram(node, params.route, partnerId, current?.completedStages ?? [], t);
      if (index >= 0) programs[index] = program;
      else programs.push(program);
      notes.push(`Tecnologia ${node.name}: programa iniciado pela rota “${ROUTE_LABEL[params.route]}”.`);
    } else if (decision.policyId === CERTIFY_EXPORT_ACTION_ID && current && canCertify(current, node)) {
      programs[index] = { ...current, certifiedMonth: t };
      notes.push(
        `Tecnologia ${node.name}: certificação para exportar pedida; vendas externas começam em ${researchParam('meses_certificacao')} meses, conforme o acesso aos mercados.`,
      );
    }
  }
}

/** Ordem estável dos programas: a do catálogo (a do arquivo é a de exibição e a de prioridade de pagamento). */
function catalogOrder(programs: ResearchProgram[], catalog: TechnologyCatalog): ResearchProgram[] {
  const position = new Map(catalog.nodes.map((node, i) => [node.id, i]));
  return [...programs].sort((a, b) => (position.get(a.nodeId) ?? 0) - (position.get(b.nodeId) ?? 0));
}

function supplyShock(state: Readonly<GameState>): number {
  const t = state.monthIndex;
  return (state.trade?.shocks ?? [])
    .filter((shock) => shock.kind === 'cadeia' && shock.startMonth <= t && t <= shock.endMonth)
    .reduce((sum, shock) => sum + shock.size, 0);
}

/** Bloqueio do estágio que não depende de dinheiro (`null` = pode andar). */
function stageBlock(
  program: ResearchProgram,
  node: TechnologyNode,
  state: Readonly<GameState>,
): Exclude<ResearchBottleneck, 'orcamento'> {
  if (
    program.route === 'transferir' &&
    (partnerRelation(state, program.partnerId) ?? -Infinity) < researchParam('relacao_minima_transferencia')
  )
    return 'parceiro';
  if (program.stage !== 'adocao') return null;
  const projects = node.requiresProject ?? [];
  if (
    projects.length > 0 &&
    !state.publicPolicies.projects.some((p) => projects.includes(p.policyId) && p.phase === 'operacao')
  )
    return 'infraestrutura';
  if (node.requiresEnergy) {
    const e = state.energy;
    if (e && e.demand > 0 && e.shortage / e.demand > researchParam('racionamento_maximo')) return 'energia';
  }
  return null;
}

/**
 * Etapa do mês (depois da carteira de obras): aplica as decisões, paga a manutenção das tecnologias adotadas e
 * financia os estágios em andamento com o espaço discricionário que a carteira deixou, sorteia por chave a falha
 * parcial dos estágios concluídos e transforma a variação do nível do efeito em impulso.
 */
export const researchStep: MonthStep = (state, ctx) => {
  const catalog = ctx.content.technology;
  const t = state.monthIndex;
  const before = researchOf(state);
  if (!catalog || (before.programs.length === 0 && !ctx.decisions.some(isResearchDecision)))
    return { state, contributions: [] };
  const notes = ctx.draft.notes;
  const programs = before.programs.map((p) => ({ ...p, completedStages: [...p.completedStages] }));
  applyDecisions(programs, state, ctx.decisions, ctx.content, notes);

  const room = ctx.draft.publicRoom ?? { roomMillions: 0, gdpMillions: currentNominalGdpMillions(state, ctx.content) };
  let roomMillions = room.roomMillions;
  const gdpMillions = room.gdpMillions;
  const pay = (needMillions: number): number => {
    const allocated = Math.max(0, Math.min(needMillions, roomMillions / MONTHS_PER_YEAR));
    roomMillions -= allocated * MONTHS_PER_YEAR;
    return allocated;
  };
  const shock = supplyShock(state);
  const impulses: ScheduledImpulse[] = [];
  const ordered = catalogOrder(programs, catalog);

  for (const program of ordered) {
    program.monthSpentMillions = 0;
    program.monthImportedMillions = 0;
    const node = technologyNode(ctx.content, program.nodeId);
    const spec = node?.routes[program.route];
    if (!node || !spec) continue;
    const factor = costFactor(spec.importShare, state, ctx.content);
    const record = (allocated: number, need: number) => {
      // A parte importada do desembolso segue a proporção do custo (câmbio já embutido no `need`).
      const importedShare = need > 0 ? factor.imported / (factor.domestic + factor.imported) : 0;
      program.monthSpentMillions += allocated;
      program.monthImportedMillions += allocated * importedShare;
      program.spentMillions += allocated;
    };

    if (program.status === 'adotada') {
      // Manutenção antes de implantação: o que já funciona é pago primeiro. Choque de cadeias encarece a parte
      // importada (licenças, peças) — a dependência da rota importada.
      const need = (spec.maintenanceMillions / MONTHS_PER_YEAR) * (factor.domestic + factor.imported * (1 + shock));
      const paid = pay(need);
      record(paid, need);
      program.maintained = need > EPSILON ? paid / need : 1;
      program.bottleneck = program.maintained < 1 - EPSILON ? 'orcamento' : null;
      if (program.maintained < 1 - EPSILON)
        notes.push(`Tecnologia ${node.name}: manutenção paga só em parte; o efeito se desgasta.`);
    }
  }

  for (const program of ordered) {
    if (program.status !== 'em_andamento') continue;
    const node = technologyNode(ctx.content, program.nodeId);
    const spec = node?.routes[program.route];
    const stageCost = spec?.stages[program.stage];
    if (!node || !spec || !stageCost) continue;
    const block = stageBlock(program, node, state);
    if (block) {
      program.bottleneck = block;
      continue;
    }
    const factor = costFactor(spec.importShare, state, ctx.content);
    const need = (stageCost.annualMillions / MONTHS_PER_YEAR) * (factor.domestic + factor.imported);
    const paid = pay(need);
    const funded = need > EPSILON ? paid / need : 1;
    const importedShare = factor.imported / (factor.domestic + factor.imported);
    program.monthSpentMillions += paid;
    program.monthImportedMillions += paid * importedShare;
    program.spentMillions += paid;
    program.bottleneck = funded < 1 - EPSILON ? 'orcamento' : null;
    program.stageProgress += funded * researchPace(state, node);
    if (program.stageProgress + EPSILON < stageCost.months) continue;

    const chance = program.stage === 'adocao' ? 0 : stageFailureChance(state, spec);
    const failed =
      chance > 0 &&
      keyedRng(state.seed, ['pesquisa', node.id, program.route, program.stage, program.setbacks, t]).chance(chance);
    if (failed) {
      program.setbacks += 1;
      if (program.setbacks >= researchParam('falhas_maximas')) {
        program.status = 'falhou';
        program.bottleneck = null;
        notes.push(
          `Tecnologia ${node.name}: o estágio ${STAGE_LABEL[program.stage].toLowerCase()} falhou de novo e o programa foi encerrado; os estágios concluídos ficam como resultado intermediário.`,
        );
      } else {
        program.stageProgress = stageCost.months * (1 - researchParam('perda_falha'));
        notes.push(
          `Tecnologia ${node.name}: falha parcial em ${STAGE_LABEL[program.stage].toLowerCase()}; parte do estágio será refeita.`,
        );
      }
      continue;
    }
    program.completedStages.push(program.stage);
    const next = routeStages(spec).find((s) => !program.completedStages.includes(s));
    if (next) {
      program.stage = next;
      program.stageProgress = 0;
      notes.push(`Tecnologia ${node.name}: estágio concluído; começa ${STAGE_LABEL[next].toLowerCase()}.`);
    } else {
      program.status = 'adotada';
      program.adoptedMonth = t;
      program.maintained = 1;
      program.capability = spec.capability;
      program.bottleneck = null;
      notes.push(`Tecnologia ${node.name}: adotada; o efeito chega aos poucos e depende de manutenção.`);
    }
  }

  const adjust = researchParam('ajuste_efeito');
  for (const program of ordered) {
    const node = technologyNode(ctx.content, program.nodeId);
    const previous = program.effectLevel;
    const target = program.status === 'adotada' ? program.maintained : 0;
    program.effectLevel = previous + (target - previous) * adjust;
    if (program.status !== 'adotada' && program.effectLevel < EPSILON) program.effectLevel = 0;
    if (!node) continue;
    if (program.monthSpentMillions > EPSILON && gdpMillions > 0) {
      impulses.push({
        sourceId: `${RESEARCH_IMPULSE_PREFIX}${node.id}:gasto:${t}`,
        label: `Tecnologia: ${node.name}`,
        target: 'gasto.investimento',
        delta: (program.monthSpentMillions * MONTHS_PER_YEAR) / gdpMillions,
        startMonth: t,
        endMonth: t,
      });
    }
    const change = program.effectLevel - previous;
    if (node.effect.channel === 'potencial' && Math.abs(change) > EPSILON) {
      impulses.push({
        sourceId: `${RESEARCH_IMPULSE_PREFIX}${node.id}:efeito:${t}`,
        label: change > 0 ? `Tecnologia adotada: ${node.name}` : `Tecnologia sem manutenção: ${node.name}`,
        target: 'oferta.potencial',
        delta: change * node.effect.value * MONTHS_PER_YEAR,
        startMonth: t,
        endMonth: t,
      });
    }
  }

  ctx.draft.publicRoom = { roomMillions, gdpMillions };
  return {
    state: { ...state, research: { programs: ordered }, impulses: [...state.impulses, ...impulses] },
    contributions: [],
  };
};

function isResearchDecision(decision: Decision): boolean {
  return (
    decision.policyId === FUND_TECHNOLOGY_ACTION_ID ||
    decision.policyId === SUSPEND_TECHNOLOGY_ACTION_ID ||
    decision.policyId === CERTIFY_EXPORT_ACTION_ID
  );
}

/** Invariantes (plano §6.1, "Ferrovias e tecnologia"). Lista vazia = tudo certo. */
export function checkResearch(
  previous: Readonly<ResearchState>,
  next: Readonly<ResearchState>,
  content: Pick<GameContent, 'technology'>,
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const program of next.programs) {
    if (ids.has(program.nodeId)) issues.push(`tecnologia repetida: ${program.nodeId}`);
    ids.add(program.nodeId);
    const node = technologyNode(content, program.nodeId);
    const spec = node?.routes[program.route];
    if (!node || !spec) {
      issues.push(`tecnologia sem nó ou rota: ${program.nodeId}`);
      continue;
    }
    const old = previous.programs.find((p) => p.nodeId === program.nodeId);
    if (old && old.startedMonth === program.startedMonth && program.spentMillions + EPSILON < old.spentMillions)
      issues.push(`gasto acumulado diminuiu: ${program.nodeId}`);
    if (program.monthImportedMillions > program.monthSpentMillions + EPSILON)
      issues.push(`importação maior que o gasto: ${program.nodeId}`);
    if (![program.effectLevel, program.maintained, program.capability].every((v) => v >= -EPSILON && v <= 1 + EPSILON))
      issues.push(`fração fora de 0–1: ${program.nodeId}`);
    if (program.status === 'adotada' && !routeStages(spec).every((s) => program.completedStages.includes(s)))
      issues.push(`tecnologia adotada sem todos os estágios: ${program.nodeId}`);
    if (
      program.status === 'adotada' &&
      program.spentMillions <= EPSILON &&
      routeStages(spec).some((s) => (spec.stages[s]?.annualMillions ?? 0) > 0)
    )
      issues.push(`tecnologia adotada sem desembolso: ${program.nodeId}`);
    if (program.status !== 'adotada' && program.capability > EPSILON)
      issues.push(`domínio local sem adoção: ${program.nodeId}`);
  }
  return issues;
}
