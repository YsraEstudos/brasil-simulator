import { formatMoneyMillions, formatPercent } from '@/components/ui/format';
import {
  canCertify,
  costFactor,
  missingPrerequisites,
  programOf,
  researchPace,
  researchParam,
  ROUTE_LABEL,
  routeStages,
  STAGE_LABEL,
  stageFailureChance,
  transferPartners,
  validateFundTechnology,
  type GameContent,
  type GameState,
  type ResearchBottleneck,
} from '@/engine';
import type { TechnologyNode, TechnologyRouteId } from '@/types/technology';

/**
 * Modelo da árvore de tecnologias no Gabinete (PLANO_EXPANSAO F07, EX-32). Para cada nó: pré-requisitos, rotas com
 * prazo, custo, incerteza, manutenção e dependência externa, efeitos esperados, quem ganha, efeitos adversos e o
 * andamento do programa. Só lê o estado: abrir a árvore não sorteia nada nem muda a campanha.
 */

export interface RouteView {
  route: TechnologyRouteId;
  label: string;
  /** "36–48 meses · R$ 2,1 bi" — prazo no ritmo atual (faixa pelo financiamento) e custo total em preços de jan/2027. */
  estimate: string;
  /** "Risco de falha parcial: 20% por estágio" ou "Sem risco de pesquisa". */
  uncertainty: string;
  /** "80% pago a fornecedores externos · manutenção R$ 120 mi/ano · sem domínio local". */
  dependency: string;
  /** Pode começar agora (pré-requisitos, programa ativo, parceiro). */
  available: boolean;
  /** Parceiros possíveis na transferência (ids). */
  partners: string[];
}

export interface ProgramView {
  status: string;
  /** "Estágio 2 de 4: Prototipagem e adaptação · 40%". */
  progress: string;
  /** Gargalo do mês, em texto ("Falta orçamento: o estágio andou só em parte"). */
  bottleneck: string | null;
  spent: string;
  /** Efeito em vigor ("Efeito em vigor: 60% do previsto"). */
  effect: string | null;
  canSuspend: boolean;
  canCertify: boolean;
  /** Situação da exportação, se certificada. */
  exportStatus: string | null;
}

export interface TechnologyNodeView {
  id: string;
  name: string;
  summary: string;
  /** "Requer: Sinalização (adotada)". */
  prerequisites: string | null;
  locked: boolean;
  effect: string;
  beneficiaries: string;
  adverse: string;
  requirements: string | null;
  routes: RouteView[];
  program: ProgramView | null;
}

export interface TechnologyBranchView {
  id: string;
  name: string;
  nodes: TechnologyNodeView[];
}

const BOTTLENECK_TEXT: Record<Exclude<ResearchBottleneck, null>, string> = {
  orcamento: 'Falta orçamento: o espaço discricionário que as obras deixaram não cobriu o mês.',
  infraestrutura: 'Parado: a adoção precisa de uma obra em operação.',
  energia: 'Parado: a adoção depende de eletricidade sem racionamento.',
  parceiro: 'Parado: a relação com o parceiro caiu abaixo do mínimo para a transferência.',
};

const STATUS_TEXT = {
  em_andamento: 'Em andamento',
  adotada: 'Adotada',
  falhou: 'Encerrado por falhas',
  suspensa: 'Suspenso',
} as const;

function effectText(node: TechnologyNode): string {
  switch (node.effect.channel) {
    case 'potencial':
      return `PIB potencial ${formatPercent(node.effect.value, 2)} maior quando plenamente adotada e mantida.`;
    case 'geracao':
      return `+${node.effect.value.toLocaleString('pt-BR')} TWh/mês de geração.`;
    case 'transmissao':
      return `+${node.effect.value.toLocaleString('pt-BR')} TWh/mês de capacidade de transmissão.`;
    case 'armazenamento':
      return `+${node.effect.value.toLocaleString('pt-BR')} TWh de reserva de energia.`;
  }
}

function requirementsText(node: TechnologyNode, content: GameContent): string | null {
  const parts: string[] = [];
  if (node.requiresProject?.length) {
    const names = node.requiresProject.map((id) => content.policies[id]?.name ?? id);
    parts.push(`adoção exige uma destas obras em operação: ${names.join('; ')}`);
  }
  if (node.requiresEnergy) parts.push('adoção exige eletricidade sem racionamento');
  if (node.energyDemandTwh > 0) parts.push(`consome +${node.energyDemandTwh.toLocaleString('pt-BR')} TWh/mês`);
  return parts.length ? `${parts.join(' · ')}.` : null;
}

function routeView(node: TechnologyNode, route: TechnologyRouteId, state: GameState, content: GameContent): RouteView {
  const spec = node.routes[route]!;
  const stages = routeStages(spec);
  const done = programOf(state, node.id)?.completedStages ?? [];
  const remaining = stages.filter((s) => !done.includes(s));
  const months = remaining.reduce((sum, s) => sum + spec.stages[s]!.months, 0);
  const cost = remaining.reduce((sum, s) => sum + (spec.stages[s]!.months * spec.stages[s]!.annualMillions) / 12, 0);
  const pace = researchPace(state, node);
  const fast = Math.ceil(months / pace);
  const failure = route === 'importar' ? 0 : stageFailureChance(state, spec);
  const factor = costFactor(spec.importShare, state, content);
  const nominal = cost * (factor.domestic + factor.imported);
  const partners = route === 'transferir' ? transferPartners(state, content) : [];
  const valid =
    validateFundTechnology(
      { nodeId: node.id, route, ...(route === 'transferir' && partners[0] ? { partnerId: partners[0] } : {}) },
      state,
      content,
    ) === null;
  return {
    route,
    label: ROUTE_LABEL[route],
    estimate: `${fast} meses ou mais no ritmo atual · ${formatMoneyMillions(nominal)} (${remaining.length} ${remaining.length === 1 ? 'estágio' : 'estágios'})`,
    uncertainty:
      failure > 0
        ? `Risco de falha parcial: ${formatPercent(failure, 0)} por estágio de pesquisa ou absorção.`
        : 'Sem risco de pesquisa: compra pronta, sujeita a câmbio e licenças.',
    dependency: `${formatPercent(spec.importShare, 0)} pago a fornecedores externos · manutenção ${formatMoneyMillions(spec.maintenanceMillions)}/ano · ${
      spec.capability === 0
        ? 'sem domínio local (não exporta)'
        : spec.capability < 1
          ? 'domínio local parcial'
          : 'domínio local pleno'
    }`,
    available: valid,
    partners,
  };
}

function programView(node: TechnologyNode, state: GameState): ProgramView | null {
  const program = programOf(state, node.id);
  if (!program) return null;
  const spec = node.routes[program.route]!;
  const stages = routeStages(spec);
  const index = stages.indexOf(program.stage);
  const months = spec.stages[program.stage]?.months ?? 1;
  const certified = program.certifiedMonth;
  const lag = researchParam('meses_certificacao');
  return {
    status: `${STATUS_TEXT[program.status]} · rota ${ROUTE_LABEL[program.route].toLowerCase()}${program.setbacks > 0 ? ` · ${program.setbacks} falha(s) parcial(is)` : ''}`,
    progress:
      program.status === 'adotada'
        ? `Todos os ${stages.length} estágios concluídos.`
        : `Estágio ${index + 1} de ${stages.length}: ${STAGE_LABEL[program.stage]} · ${formatPercent(Math.min(1, program.stageProgress / months), 0)}`,
    bottleneck: program.bottleneck ? BOTTLENECK_TEXT[program.bottleneck] : null,
    spent: `Gasto até agora: ${formatMoneyMillions(program.spentMillions)} (${formatMoneyMillions(program.monthSpentMillions)} no último mês).`,
    effect:
      program.status === 'adotada' || program.effectLevel > 0
        ? `Efeito em vigor: ${formatPercent(program.effectLevel, 0)} do previsto · manutenção paga ${formatPercent(program.maintained, 0)}.`
        : null,
    canSuspend: program.status === 'em_andamento',
    canCertify: canCertify(program, node),
    exportStatus:
      certified === undefined
        ? null
        : state.monthIndex < certified + lag
          ? `Certificação em andamento: exportações a partir de ${certified + lag - state.monthIndex} meses.`
          : 'Exportando: as vendas crescem aos poucos e dependem do acesso aos parceiros.',
  };
}

export function technologyTree(state: GameState, content: GameContent): TechnologyBranchView[] {
  const catalog = content.technology;
  if (!catalog) return [];
  return catalog.branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    nodes: catalog.nodes
      .filter((node) => node.branch === branch.id)
      .map((node) => {
        const missing = missingPrerequisites(state, node);
        const names = node.prerequisites.map((id) => {
          const name = catalog.nodes.find((n) => n.id === id)?.name ?? id;
          return missing.includes(id) ? `${name} (falta adotar)` : `${name} (adotada)`;
        });
        const routes = (Object.keys(node.routes) as TechnologyRouteId[]).map((route) =>
          routeView(node, route, state, content),
        );
        return {
          id: node.id,
          name: node.name,
          summary: node.summary,
          prerequisites: names.length ? `Requer: ${names.join(', ')}.` : null,
          locked: missing.length > 0,
          effect: effectText(node),
          beneficiaries: `Ganham: ${node.beneficiaries.join('; ')}.`,
          adverse: `Riscos e custos: ${node.adverse.join('; ')}.`,
          requirements: requirementsText(node, content),
          routes,
          program: programView(node, state),
        };
      }),
  }));
}

/** Rodapé do cartão: de onde sai o dinheiro e o que a árvore não promete. */
export function technologyFootnote(): string {
  return 'Custos e prazos são estimativas de jogo (PROVISÓRIO), em preços de jan/2027 corrigidos por inflação e câmbio. O gasto sai do mesmo espaço discricionário das obras; o efeito chega aos poucos e exige manutenção.';
}
