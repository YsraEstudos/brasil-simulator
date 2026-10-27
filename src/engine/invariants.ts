import { isPreInauguration, turnIndexOf } from './career';
import { nationalRecognition } from './career/viability';
import { checkClimate } from './climate/climate';
import { MEMORY_MONTHS } from './elections/elections';
import { populationShares, regionsOf } from './regions/regions';
import { checkSociety } from './society/society';
import { checkPublicPolicies } from './publicPolicies/publicPolicies';
import {
  MANDATORY_GROUPS,
  REVENUE_GROUPS,
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
    const populationWeights = content ? populationShares(regionsOf(content)) : [];
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

  // Perfil ideológico (PLANO_GLOBO.md §5.1): média móvel de posições em [−1, 1], logo sempre dentro dos eixos.
  const profile = next.government.profile;
  if (!(Math.abs(profile.economic) <= 1 && Math.abs(profile.social) <= 1)) {
    errors.push(`perfil ideológico fora de [−1, 1]: ${profile.economic} / ${profile.social}`);
  }

  // Clima (PLANO_GLOBO.md §6.1): ENSO em [−1, 1], seca em [0, 1], anomalia de chuva finita e acima de −100%.
  errors.push(...checkClimate(next.climate));

  if (next.society !== prev.society) errors.push(...checkSociety(next.society, next));
  errors.push(...checkPublicPolicies(next));
  return errors;
}

/**
 * Carreira antes da posse (PLANO_CAMPANHA.md Fase C2, tarefa C2.5): reconhecimento em [0, 1] e valência em [−1, 1]
 * para todos os candidatos; pesquisa com parcelas não negativas que somam 1; e, com o conteúdo (população das UFs),
 * a variação do reconhecimento nacional do jogador igual à soma das contribuições `'careerRecognition'` (§7.3).
 */
function checkCareer(
  prev: GameState,
  next: GameState,
  report: MonthReport,
  content?: Pick<GameContent, 'scenario'>,
): string[] {
  const errors: string[] = [];
  const career = next.career!;
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
  return errors;
}
