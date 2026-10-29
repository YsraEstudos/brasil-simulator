import { isPreInauguration, turnIndexOf } from './career';
import { checkAdministrations } from './administration/identity';
import { usesFormalRules } from './campaignConfig';
import { electedOutcome } from './career/election';
import { nationalRecognition } from './career/viability';
import { checkClimate } from './climate/climate';
import { checkEducation } from './education/education';
import { MEMORY_MONTHS } from './elections/elections';
import { populationShares, regionsOf } from './regions/regions';
import { checkSociety } from './society/society';
import { checkPublicPolicies } from './publicPolicies/publicPolicies';
import {
  MANDATORY_GROUPS,
  REVENUE_GROUPS,
  TECHNICAL_OCCUPANT,
  type GameContent,
  type GameState,
  type IndicatorKey,
  type MonthReport,
} from './types';

/** Tolerância numérica para somas de contribuições (indicadores são frações). */
const EPSILON = 1e-9;

/**
 * Invariantes do ECONOMIC_MODEL.md §7: 1 e 2 (contas públicas), 3 (contribuições), 4 (limite de despesas com
 * exceções registradas), 5 (valores possíveis), 6 (finitude) e 9 (regiões somam o total nacional). O 7
 * (determinismo) e o 8 (estado estacionário) são testados nas simulações. Retorna a lista de violações; vazia =
 * tudo certo. As médias regionais de desemprego e aprovação só são conferidas com o conteúdo (população das UFs).
 */
export function checkInvariants(
  prev: GameState,
  next: GameState,
  report: MonthReport,
  content?: Pick<GameContent, 'scenario'>,
): string[] {
  const errors: string[] = [];

  // §7.6: nenhum NaN ou Infinity
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) errors.push(`${path} não é finito: ${value}`);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  walk(next, 'state');

  // R6: estoques e fluxos só são comparados quando a respectiva etapa foi executada.
  if (prev.demography && next.demography && prev.demography !== next.demography) {
    const previous = new Map(prev.demography.ufs.map((uf) => [uf.id, uf]));
    let internalMigration = 0;
    for (const uf of next.demography.ufs) {
      const old = previous.get(uf.id);
      const total = (ages: typeof uf.ages) => ages.young + ages.working + ages.older;
      if (Object.values(uf.ages).some((value) => value < 0)) errors.push(`população negativa em ${uf.id}`);
      if (!old) {
        errors.push(`UF demográfica sem estoque anterior: ${uf.id}`);
        continue;
      }
      const { births, deaths, internal, external } = uf.flows;
      if (Math.abs(total(uf.ages) - total(old.ages) - births + deaths - internal - external) > 1e-6)
        errors.push(`população não reconciliada em ${uf.id}`);
      internalMigration += internal;
    }
    if (next.demography.ufs.length !== prev.demography.ufs.length) errors.push('UFs demográficas alteradas');
    if (Math.abs(internalMigration) > 1e-6) errors.push('migração interna não soma zero');
  }
  if (prev.energy && next.energy && prev.energy !== next.energy) {
    const e = next.energy;
    if (
      [
        e.reservoir,
        e.inflow,
        e.hydro,
        e.spill,
        e.otherGeneration,
        e.delivered,
        e.curtailment,
        e.demand,
        e.shortage,
      ].some((value) => value < -EPSILON)
    )
      errors.push('energia com valor negativo');
    if (e.reservoir > e.reservoirCapacity + EPSILON) errors.push('energia: reservatório acima da capacidade');
    if (Math.abs(prev.energy.reservoir + e.inflow - e.hydro - e.spill - e.reservoir) > EPSILON)
      errors.push('energia: reservatório não reconciliado');
    if (Math.abs(e.hydro + e.otherGeneration - e.delivered - e.curtailment) > EPSILON)
      errors.push('energia: geração não reconciliada');
    if (Math.abs(e.delivered + e.shortage - e.demand) > EPSILON) errors.push('energia: demanda não reconciliada');
    if (e.delivered > e.transmissionCapacity + EPSILON || e.hydro + e.otherGeneration > e.generationCapacity + EPSILON)
      errors.push('energia: capacidade excedida');
  }

  // §7.5: valores fisicamente possíveis
  const { indicators: ind, resources: res } = next;
  if (!(ind.unemployment > 0 && ind.unemployment < 1)) errors.push(`desemprego fora de (0, 1): ${ind.unemployment}`);
  if (!(ind.approval >= 0 && ind.approval <= 1)) errors.push(`aprovação fora de [0, 1]: ${ind.approval}`);
  if (ind.inflation12m <= -1) errors.push(`inflação ≤ −100%: ${ind.inflation12m}`);
  if (!(res.politicalCapital >= 0 && res.politicalCapital <= 100)) {
    errors.push(`capital político fora de [0, 100]: ${res.politicalCapital}`);
  }
  const eco = next.economy;
  if (!(eco.selic >= 0)) errors.push(`Selic negativa: ${eco.selic}`);
  if (!(eco.credibility >= 0 && eco.credibility <= 1)) {
    errors.push(`credibilidade fora de [0, 1]: ${eco.credibility}`);
  }
  if (!(eco.grossDebt > 0)) errors.push(`dívida bruta não positiva: ${eco.grossDebt}`);
  if (!(eco.exchangeRate > 0)) errors.push(`câmbio não positivo: ${eco.exchangeRate}`);
  if (!(eco.priceLevel > 0)) errors.push(`nível de preços não positivo: ${eco.priceLevel}`);
  if (!(eco.potentialIndex > 0)) errors.push(`PIB potencial não positivo: ${eco.potentialIndex}`);
  if (!(eco.riskPremium >= 0)) errors.push(`prêmio de risco negativo: ${eco.riskPremium}`);

  // Contas por grupo fecham com os totais (ECONOMIC_MODEL.md §5.7–5.8)
  const f = eco.fiscal;
  const revenueSum = REVENUE_GROUPS.reduce((s, g) => s + f.revenueByGroup[g], 0);
  if (Math.abs(revenueSum - eco.revenue) > EPSILON) {
    errors.push(`receita por grupo não fecha com a receita total: diferença ${revenueSum - eco.revenue}`);
  }
  // Do tributo legal à receita líquida (PLANO_EXPANSAO EX-11): cada base fecha com a própria receita líquida.
  for (const g of REVENUE_GROUPS) {
    const d = f.revenueDetail[g];
    const net = d.base + d.policy + d.cycle - d.loss - d.transfers;
    if (Math.abs(net - f.revenueByGroup[g]) > EPSILON) {
      errors.push(
        `receita de ${g} não fecha com carga, ciclo, perda e repartição: diferença ${net - f.revenueByGroup[g]}`,
      );
    }
    if (!(d.loss >= 0) || !(d.transfers >= 0)) errors.push(`receita de ${g}: perda ou repartição negativa`);
  }
  const spendingSum =
    MANDATORY_GROUPS.reduce((s, g) => s + f.mandatory[g], 0) +
    f.linked +
    f.policyMandatory +
    f.discretionary +
    f.policyDiscretionary +
    f.exceptions +
    f.extraordinary;
  if (Math.abs(spendingSum - eco.primarySpending) > EPSILON) {
    errors.push(`despesa por grupo não fecha com a despesa total: diferença ${spendingSum - eco.primarySpending}`);
  }
  if (f.discretionary < 0) errors.push(`discricionárias negativas: ${f.discretionary}`);

  // §7.4: despesa sujeita ao limite ≤ limite + estouro registrado como exceção
  const overLimit = eco.primarySpending - f.exceptions - f.extraordinary - f.spendingLimit - f.limitExcess;
  if (overLimit > EPSILON) errors.push(`despesa acima do limite sem registro: ${overLimit}`);

  // §7.1: resultado primário do mês = receita − despesa
  const primaryGap = eco.monthlyPrimary - (eco.revenue - eco.primarySpending);
  if (Math.abs(primaryGap) > EPSILON) {
    errors.push(`resultado primário do mês ≠ receita − despesa: diferença ${primaryGap}`);
  }

  // §7.2: dívida = dívida anterior + (juros − primário)/12 + ajuste do denominador
  // (só quando a economia foi processada no mês; testes com etapas parciais devolvem o mesmo objeto)
  if (prev.economy && next.economy !== prev.economy) {
    const debtGap =
      eco.grossDebt - prev.economy.grossDebt - ((eco.interest - eco.monthlyPrimary) / 12 + eco.debtAdjustment);
    if (Math.abs(debtGap) > EPSILON) {
      errors.push(`dívida bruta não fecha com juros, primário e ajuste: diferença ${debtGap}`);
    }
  }

  // §7.9: soma das variáveis regionais = total nacional (só quando a etapa regional rodou no mês)
  const ufs = next.regions?.ufs ?? [];
  if (ufs.length > 0 && next.regions !== prev.regions) {
    const shares = ufs.reduce((s, u) => s + u.share, 0);
    const structural = ufs.reduce((s, u) => s + u.structuralShare, 0);
    if (Math.abs(shares - 1) > EPSILON) errors.push(`participações das UFs somam ${shares}, esperado 1`);
    if (Math.abs(structural - 1) > EPSILON) errors.push(`participações de tendência somam ${structural}, esperado 1`);
    const populationWeights = content ? populationShares(regionsOf(content), next) : [];
    if (populationWeights.length === ufs.length) {
      const mean = (pick: (u: (typeof ufs)[number]) => number) =>
        ufs.reduce((s, u, i) => s + populationWeights[i] * pick(u), 0);
      const uGap = mean((u) => u.unemployment) - ind.unemployment;
      const aGap = mean((u) => u.approval) - ind.approval;
      if (Math.abs(uGap) > EPSILON) errors.push(`desemprego médio das UFs ≠ nacional: diferença ${uGap}`);
      if (Math.abs(aGap) > EPSILON) errors.push(`aprovação média das UFs ≠ nacional: diferença ${aGap}`);
    }
    for (const u of ufs) {
      if (!(u.share > 0)) errors.push(`${u.id}: participação não positiva: ${u.share}`);
      if (!(u.unemployment > 0 && u.unemployment < 1)) errors.push(`${u.id}: desemprego fora de (0, 1)`);
      if (!(u.approval >= 0 && u.approval <= 1)) errors.push(`${u.id}: aprovação fora de [0, 1]: ${u.approval}`);
      if (!(Math.abs(u.governorRelation) <= 100)) errors.push(`${u.id}: relação do governador fora de −100…100`);
    }
    // Cada explicação regional soma a diferença que explica (o "Por que mudou?" das UFs).
    for (const x of report.regional ?? []) {
      const u = ufs.find((v) => v.id === x.id);
      if (!u) continue;
      const total = (pieces: readonly { delta: number }[]) => pieces.reduce((s, p) => s + p.delta, 0);
      const gaps: [string, number][] = [
        ['atividade', total(x.activity) - (u.share / u.structuralShare - 1)],
        ['desemprego', total(x.unemployment) - (u.unemployment - ind.unemployment)],
        ['aprovação', total(x.approval) - (u.approval - ind.approval)],
      ];
      for (const [name, gap] of gaps) {
        if (Math.abs(gap) > EPSILON) errors.push(`${u.id}: explicação de ${name} não fecha: diferença ${gap}`);
      }
    }
  }

  // Tempo anda exatamente um turno; o mês do mandato anda junto, salvo antes da posse, quando fica parado
  // (PLANO_CAMPANHA.md §2.3).
  if (turnIndexOf(next) !== turnIndexOf(prev) + 1)
    errors.push(`turno não avançou 1: ${turnIndexOf(prev)} → ${turnIndexOf(next)}`);
  const expectedMonth = isPreInauguration(prev) ? prev.monthIndex : prev.monthIndex + 1;
  if (next.monthIndex !== expectedMonth) errors.push(`mês não avançou 1: ${prev.monthIndex} → ${next.monthIndex}`);

  // §7.3: soma das contribuições = variação total de cada indicador
  for (const key of Object.keys(ind) as IndicatorKey[]) {
    const delta = next.indicators[key] - prev.indicators[key];
    const explained = report.contributions.filter((c) => c.indicator === key).reduce((s, c) => s + c.delta, 0);
    if (Math.abs(delta - explained) > EPSILON) {
      errors.push(`${key}: variação ${delta} ≠ soma das contribuições ${explained}`);
    }
  }

  // Fase 08: intenção de voto é report-only (pseudo-indicador `'votingIntention'`), conferida pelo mesmo §7.3
  // quando há estado eleitoral nos dois lados; a memória do eleitor guarda no máximo MEMORY_MONTHS meses.
  if (next.politics) {
    const intention = next.politics.votingIntention;
    if (!(intention >= 0 && intention <= 1)) errors.push(`intenção de voto fora de [0, 1]: ${intention}`);
    if (next.politics.memoria.length > MEMORY_MONTHS) {
      errors.push(`memória do eleitor com ${next.politics.memoria.length} meses (máximo ${MEMORY_MONTHS})`);
    }
    if (prev.politics) {
      const delta = intention - prev.politics.votingIntention;
      const explained = report.contributions
        .filter((c) => c.indicator === 'votingIntention')
        .reduce((s, c) => s + c.delta, 0);
      if (Math.abs(delta - explained) > EPSILON) {
        errors.push(`votingIntention: variação ${delta} ≠ soma das contribuições ${explained}`);
      }
    }
  }

  if (next.career) errors.push(...checkCareer(prev, next, report, content));

  // Tempo político (onda R4): histórico de administrações contíguo, um único mandato aberto e controle coerente.
  if (next.administrations) errors.push(...checkAdministrations(prev, next));

  // Perfil ideológico (PLANO_GLOBO.md §5.1): média móvel de posições em [−1, 1], logo sempre dentro dos eixos.
  const profile = next.government.profile;
  if (!(Math.abs(profile.economic) <= 1 && Math.abs(profile.social) <= 1)) {
    errors.push(`perfil ideológico fora de [−1, 1]: ${profile.economic} / ${profile.social}`);
  }

  // Clima (PLANO_GLOBO.md §6.1): ENSO em [−1, 1], seca em [0, 1], anomalia de chuva finita e acima de −100%.
  errors.push(...checkClimate(next.climate));

  if (next.society !== prev.society) errors.push(...checkSociety(next.society, next));
  errors.push(...checkPublicPolicies(next));

  // Educação por coorte (PLANO_EXPANSAO EX-19; plano §6.1): coortes conservadas e fluxo dentro do estoque.
  if (prev.education && next.education && next.education !== prev.education) {
    errors.push(...checkEducation(prev.education, next.education));
  }

  // Diretorias de estatais (Fase C6a): cada troca grava um cargo do cenário, um ocupante possível e um mês já vivido.
  if (content && next.congress.directorates) {
    const known = new Set((content.scenario.institutions?.directorates ?? []).map((d) => d.id));
    const blocs = new Set(content.scenario.blocs.map((b) => b.id));
    const seen = new Set<string>();
    for (const d of next.congress.directorates) {
      if (!known.has(d.id)) errors.push(`diretoria fora do cenário: ${d.id}`);
      if (seen.has(d.id)) errors.push(`diretoria repetida no estado: ${d.id}`);
      seen.add(d.id);
      if (d.occupant !== TECHNICAL_OCCUPANT && !blocs.has(d.occupant)) {
        errors.push(`${d.id}: ocupante inválido ${d.occupant}`);
      }
      if (!(d.since >= 0 && d.since <= next.monthIndex)) errors.push(`${d.id}: nomeação no mês ${d.since}`);
    }
  }

  // Gaveta do impeachment (Fase C6e): pedidos únicos, decididos depois do protocolo; abrir nunca grava condenação.
  const requestIds = new Set<string>();
  for (const r of next.impeachmentDrawer ?? []) {
    if (requestIds.has(r.id)) errors.push(`pedido de impeachment repetido: ${r.id}`);
    requestIds.add(r.id);
    if (r.status !== 'na_gaveta' && !(r.decidedMonth !== undefined && r.decidedMonth >= r.filedMonth)) {
      errors.push(`${r.id}: pedido decidido sem mês ou antes do protocolo`);
    }
  }

  // Casos de escândalo (Fase C6b; PLANO_EXPANSAO EX-13/14): ids únicos, exposição não negativa, prova entre 0 e 1,
  // desfecho só depois de uma acusação e nenhuma sanção sem irregularidade real (rumor sozinho não condena).
  const caseIds = new Set<string>();
  for (const c of next.cases ?? []) {
    if (caseIds.has(c.id)) errors.push(`caso repetido: ${c.id}`);
    caseIds.add(c.id);
    if (!(c.exposure >= 0)) errors.push(`${c.id}: exposição negativa ${c.exposure}`);
    if (!(c.evidence >= 0 && c.evidence <= 1)) errors.push(`${c.id}: prova fora de 0–1 ${c.evidence}`);
    if (c.stageMonth < c.openedMonth) errors.push(`${c.id}: etapa antes da abertura`);
    const verdict = c.stage === 'condenacao' || c.stage === 'sancao' || c.stage === 'absolvido';
    if (verdict && !(c.accusedMonth !== undefined && c.accusedMonth < c.stageMonth)) {
      errors.push(`${c.id}: julgamento sem acusação anterior`);
    }
    if ((c.stage === 'condenacao' || c.stage === 'sancao') && !c.irregular) {
      errors.push(`${c.id}: sanção sem irregularidade real`);
    }
  }
  // STF (Fase C6d): cada vaga é do calendário do cenário, uma vez só; indicação em sabatina tem mês e perfil.
  if (content && next.court) {
    const calendar = new Set((content.scenario.institutions?.supremeCourt?.vacancies ?? []).map((v) => v.id));
    const seen = new Set<string>();
    for (const v of next.court.vacancies) {
      if (!calendar.has(v.id)) errors.push(`vaga do STF fora do calendário: ${v.id}`);
      if (seen.has(v.id)) errors.push(`vaga do STF repetida: ${v.id}`);
      seen.add(v.id);
      if (v.status === 'em_sabatina' && (v.hearingMonth === undefined || !v.nominee)) {
        errors.push(`${v.id}: sabatina sem mês ou sem indicado`);
      }
      if (v.status === 'preenchida' && !(v.nominee && v.lastVote?.approved)) {
        errors.push(`${v.id}: vaga preenchida sem aprovação do Senado`);
      }
    }
  }
  return errors;
}

/**
 * Carreira antes da posse (PLANO_CAMPANHA.md Fase C2, tarefa C2.5): reconhecimento em [0, 1] e valência em [−1, 1]
 * para todos os candidatos; pesquisa com parcelas não negativas que somam 1; e, com o conteúdo (população das UFs),
 * a variação do reconhecimento nacional do jogador igual à soma das contribuições `'careerRecognition'` (§7.3); e a
 * variação da valência do jogador igual à soma das contribuições `'careerValence'` (Fase C4).
 */
function checkCareer(
  prev: GameState,
  next: GameState,
  report: MonthReport,
  content?: Pick<GameContent, 'scenario'>,
): string[] {
  const errors: string[] = [];
  const career = next.career!;
  const moneyValid = (value: number) => Number.isSafeInteger(value) && value >= 0;
  const simple = career.finance;
  if (simple) {
    if (!moneyValid(simple.balance) || !moneyValid(simple.spent) || !moneyValid(simple.spendingLimit))
      errors.push('carreira: saldo ou gasto financeiro inválido');
    if (simple.spent > simple.spendingLimit) errors.push('carreira: teto financeiro ultrapassado');
    const previous = prev.career?.finance;
    const accounting = report.career?.finance;
    if (previous && accounting && previous.closedBalance === undefined) {
      const receipts = accounting.receipts.reduce((sum, item) => sum + item.amount, 0);
      const paid = accounting.expenditures.reduce((sum, item) => sum + item.paid, 0);
      if ((simple.closedBalance ?? simple.balance) !== previous.balance + receipts - paid)
        errors.push('carreira: conservação do caixa simples violada');
    }
  }
  const finance = career.expandedFinance;
  if (finance) {
    if (Object.values(finance.pockets).some((value) => !moneyValid(value)) || !moneyValid(finance.personalAvailable))
      errors.push('carreira: saldo financeiro inválido');
    if (
      ![
        finance.spent,
        finance.spendingLimit,
        finance.debt,
        finance.debtLimit,
        finance.personalLimit,
        finance.personalContributed,
      ].every(moneyValid)
    )
      errors.push('carreira: gasto ou limite financeiro inválido');
    if (
      finance.spent > finance.spendingLimit ||
      finance.personalContributed > finance.personalLimit ||
      finance.debt > finance.debtLimit
    )
      errors.push('carreira: teto financeiro ultrapassado');
    if (finance.scheduled.some((item) => !moneyValid(item.amount) || !moneyValid(item.turn)))
      errors.push('carreira: parcela financeira inválida');
    const previous = prev.career?.expandedFinance;
    const accounting = report.career?.expandedFinance;
    if (previous && accounting && !previous.closure) {
      const finalPockets = finance.closure?.remaining ?? finance.pockets;
      for (const pocket of ['personal', 'party', 'donations'] as const) {
        const receipts = accounting.receipts
          .filter((item) => item.pocket === pocket)
          .reduce((sum, item) => sum + item.amount, 0);
        const personal = pocket === 'personal' ? accounting.personalContribution : 0;
        const paid = accounting.expenditures
          .filter((item) => item.pocket === pocket)
          .reduce((sum, item) => sum + item.paid, 0);
        if (finalPockets[pocket] !== previous.pockets[pocket] + receipts + personal - paid)
          errors.push(`carreira: conservação do bolso ${pocket} violada`);
      }
      const contractedDebt = accounting.expenditures.reduce((sum, item) => sum + item.debt, 0);
      if ((finance.closure?.debt ?? finance.debt) !== previous.debt + contractedDebt)
        errors.push('carreira: conservação da dívida violada');
    }
  }
  if (
    career.illicit &&
    (!moneyValid(career.illicit.balance) ||
      !Number.isFinite(career.illicit.exposure) ||
      career.illicit.exposure < 0 ||
      career.illicit.pending.some((item) => !moneyValid(item.amount) || !moneyValid(item.turn)))
  )
    errors.push('carreira: saldo ou exposição de caixa 2 inválido');
  if (!usesFormalRules(next) && career.illicit) errors.push('carreira: caixa 2 indisponível nas regras simplificadas');
  const candidates = [
    { id: 'jogador', recognition: career.recognition, valence: career.valence },
    ...(career.opponents ?? []).map((o) => ({ id: o.blocId, recognition: o.recognition, valence: o.valence })),
  ];
  for (const c of candidates) {
    if (!(Math.abs(c.valence) <= 1)) errors.push(`carreira: valência de ${c.id} fora de [−1, 1]: ${c.valence}`);
    for (const [uf, r] of Object.entries(c.recognition)) {
      if (!(r >= 0 && r <= 1)) errors.push(`carreira: reconhecimento de ${c.id} em ${uf} fora de [0, 1]: ${r}`);
    }
  }
  const poll = career.poll;
  if (poll) {
    const parts = [...poll.intentions.map((i) => i.share), poll.undecided, poll.blankNull];
    if (parts.some((x) => !(x >= 0))) errors.push('carreira: pesquisa com parcela negativa');
    const total = parts.reduce((s, x) => s + x, 0);
    if (Math.abs(total - 1) > EPSILON) errors.push(`carreira: parcelas da pesquisa somam ${total}, não 1`);
  }
  const ufs = content?.scenario.regions?.ufs ?? [];
  if (prev.career && ufs.length > 0) {
    const delta = nationalRecognition(career.recognition, ufs) - nationalRecognition(prev.career.recognition, ufs);
    const explained = report.contributions
      .filter((c) => c.indicator === 'careerRecognition')
      .reduce((s, c) => s + c.delta, 0);
    if (Math.abs(delta - explained) > EPSILON) {
      errors.push(`careerRecognition: variação ${delta} ≠ soma das contribuições ${explained}`);
    }
  }
  // Fase C4: a valência do jogador só muda com causa (ações e debate).
  if (prev.career) {
    const delta = career.valence - prev.career.valence;
    const explained = report.contributions
      .filter((c) => c.indicator === 'careerValence')
      .reduce((s, c) => s + c.delta, 0);
    if (Math.abs(delta - explained) > EPSILON) {
      errors.push(`careerValence: variação ${delta} ≠ soma das contribuições ${explained}`);
    }
  }
  // Fase C5: cada rodada da eleição é uma partição inteira do eleitorado, e o vencedor é coerente com os votos.
  const election = career.election;
  if (election) {
    for (const round of election.second ? [election.first, election.second] : [election.first]) {
      const sum = round.abstention + round.blankNull + round.votes.reduce((s, v) => s + v, 0);
      if (sum !== round.electorate) errors.push(`carreira: rodada da eleição soma ${sum}, não ${round.electorate}`);
      if (round.votes.some((v) => !Number.isInteger(v) || v < 0)) errors.push('carreira: voto não inteiro na eleição');
    }
    const last = election.second ?? election.first;
    if (!last.candidates.includes(election.winner)) errors.push('carreira: vencedor fora da última rodada');
    if (election.second && election.second.candidates.length !== 2)
      errors.push('carreira: 2º turno sem dois finalistas');
    if (prev.career?.election && prev.career.election.turnIndex !== election.turnIndex) {
      errors.push('carreira: resultado da eleição mudou depois de apurado');
    }
  }
  if (career.stage === 'governo' && election && !electedOutcome(election.outcome)) {
    errors.push('carreira: posse sem eleição ganha');
  }
  return errors;
}
