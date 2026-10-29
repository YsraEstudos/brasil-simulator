import { formatMoneyMillions, formatNumber, formatPercent } from '@/components/ui/format';
import {
  adherenceOf,
  bulletinNumber,
  bulletinsOf,
  currentRevisionOf,
  diseaseOf,
  healthOf,
  healthParam,
  measureBlock,
  type BedCriterion,
  type CrisisReport,
  type GameContent,
  type GameState,
  type HealthUf,
  type Outbreak,
} from '@/engine';
import type { MacroRegion, MeasureId } from '@/types/health';

/**
 * Modelo do cartão "Saúde e crises sanitárias" (PLANO_EXPANSAO EX-26/EX-27). Só lê o estado e **nunca mostra a verdade
 * do motor**: casos, óbitos e ocupação vêm dos boletins publicados; o ritmo da epidemia vem da faixa estimada pelo
 * governo; a verdade sorteada do surto (R0, internação, mês da vacina) não aparece. Sem sorteio: abrir o cartão não muda
 * nada.
 */

export const REGION_LABEL: Record<MacroRegion, string> = {
  norte: 'Norte',
  nordeste: 'Nordeste',
  sudeste: 'Sudeste',
  sul: 'Sul',
  centro_oeste: 'Centro-Oeste',
};

export const CRITERION_LABEL: Record<BedCriterion, { label: string; hint: string }> = {
  ocupacao: { label: 'pela ocupação', hint: 'Leitos vão para onde a ocupação notificada está mais alta' },
  populacao: { label: 'pela população', hint: 'Divide pelo tamanho das UFs afetadas; pode chegar tarde onde lota' },
  pedidos: { label: 'pelos pedidos', hint: 'Atende primeiro quem pediu; quem não pediu fica sem' },
  aliados: {
    label: 'aliados primeiro',
    hint: 'Governadores aliados recebem antes; os demais reclamam e a imprensa fala em favoritismo',
  },
};

/** Pessoas (milhares no motor) em texto curto. */
export function people(thousands: number): string {
  const n = thousands * 1000;
  if (n >= 1_000_000) return `${formatNumber(n / 1_000_000, 1)} ${n >= 2_000_000 ? 'milhões' : 'milhão'}`;
  if (n >= 10_000) return `${formatNumber(n / 1000, 0)} mil`;
  return formatNumber(n, 0);
}

/** Contagem com o substantivo no número certo: "1 óbito", "3 mil óbitos". */
export function count(thousands: number, singular: string, plural: string): string {
  const n = Math.round(thousands * 1000);
  return `${people(thousands)} ${n === 1 ? singular : plural}`;
}

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2027-02" → "fev/2027". */
function monthOfKey(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_SHORT[Number(month) - 1] ?? month}/${year}`;
}

export interface RegionCapacityView {
  id: MacroRegion;
  name: string;
  /** "1,6 leito SUS por mil hab. · ocupação habitual 80%". */
  beds: string;
  /** "Atenção básica 72% · vigilância 60% · vacina 15% da pop./mês". */
  network: string;
}

export interface MeasureView {
  id: MeasureId;
  name: string;
  summary: string;
  /** "R$ 400 mi/mês por crédito extraordinário · efeito pleno em 2 meses". */
  cost: string;
  limits: string[];
  active: boolean;
  /** "Em vigor há 3 meses" ou o critério dos leitos. */
  status: string | null;
  /** Motivo de não poder adotar agora. */
  blocked: string | null;
}

export interface CrisisView {
  id: string;
  title: string;
  phase: string;
  /** O que o governo sabe (boletins), com a data e o caráter preliminar. */
  observed: string[];
  /** Estimativas com faixa (nunca o valor real). */
  estimates: string[];
  /** Adesão estimada às medidas, em faixa. */
  adherence: string;
  canInvestigate: boolean;
  investigating: boolean;
  measures: MeasureView[];
  requests: string[];
  /** Ocupação notificada nas UFs mais pressionadas. */
  hotspots: string[];
}

export interface HealthView {
  regions: RegionCapacityView[];
  howToInvest: string;
  crises: CrisisView[];
  lastReport: ReportView | null;
}

export interface ReportView {
  title: string;
  observed: string[];
  estimated: string[];
  accounts: string[];
}

function byRegion(ufs: readonly HealthUf[], state: GameState, region: MacroRegion) {
  const members = ufs.filter((u) => u.region === region);
  const pop = (id: string) => {
    const a = state.demography.ufs.find((u) => u.id === id)?.ages;
    return a ? a.young + a.working + a.older : 0;
  };
  const total = members.reduce((s, u) => s + pop(u.id), 0);
  const weighted = (pick: (u: HealthUf) => number) =>
    total > 0 ? members.reduce((s, u) => s + pick(u) * pop(u.id), 0) / total : 0;
  return {
    bedsPerThousand: total > 0 ? (members.reduce((s, u) => s + u.beds, 0) / total) * 1000 : 0,
    routine: (() => {
      const beds = members.reduce((s, u) => s + u.beds, 0);
      return beds > 0 ? members.reduce((s, u) => s + u.routineDemand, 0) / beds : 0;
    })(),
    primary: weighted((u) => u.primary),
    surveillance: weighted((u) => u.surveillance),
    vaccination: weighted((u) => u.vaccination),
    prevention: weighted((u) => u.prevention),
  };
}

function surveillanceWord(v: number): string {
  return v >= 0.75 ? 'forte' : v >= 0.55 ? 'média' : 'fraca';
}

function monthsLabel(n: number): string {
  return n === 1 ? '1 mês' : `${n} meses`;
}

function phaseLabel(outbreak: Outbreak): string {
  return outbreak.phase === 'alerta'
    ? 'Alerta: agente ainda desconhecido'
    : `Agente identificado${outbreak.investigatedMonth !== undefined ? ' por investigação de campo' : ''}`;
}

function crisisView(outbreak: Outbreak, state: GameState, content: GameContent): CrisisView | null {
  const disease = diseaseOf(content, outbreak.diseaseId);
  if (!disease || outbreak.phase === 'silencioso') return null;
  const t = state.monthIndex;
  const health = healthOf(state);
  const bulletins = bulletinsOf(health, outbreak.id);
  const last = bulletins[bulletins.length - 1];
  const previous = bulletins[bulletins.length - 2];
  const observed: string[] = [];
  if (last) {
    observed.push(
      `Boletim de ${monthOfKey(currentRevisionOf(last).publishedAt)} (preliminar): ${count(bulletinNumber(last, 'cases'), 'caso', 'casos')}, ${count(bulletinNumber(last, 'hospitalizations'), 'internação', 'internações')} e ${count(bulletinNumber(last, 'deaths'), 'óbito', 'óbitos')} notificados. Faltam notificações atrasadas.`,
    );
  }
  if (previous && previous.revisions.length > 1) {
    const first = previous.revisions[0].payload;
    const before = typeof first.cases === 'number' ? first.cases : 0;
    observed.push(
      `Mês anterior revisado: ${count(bulletinNumber(previous, 'cases'), 'caso', 'casos')} (eram ${people(before)} no primeiro boletim) e ${count(bulletinNumber(previous, 'deaths'), 'óbito', 'óbitos')}.`,
    );
  }
  if (last && currentRevisionOf(last).payload.public !== true)
    observed.push('Os boletins não estão sendo divulgados (tom tranquilizador): a imprensa trabalha com vazamentos.');

  const estimates: string[] = [];
  if (outbreak.estimate) {
    const [lo, hi] = outbreak.estimate.r;
    const serial = disease.latentDays + disease.infectiousDays;
    const growth = (r: number) => Math.exp(((r - 1) * 30) / serial);
    const g = (v: number) => (v >= 10 ? formatNumber(v, 0) : formatNumber(v, 1));
    estimates.push(
      `Cada pessoa infectada transmite a ${formatNumber(lo, 1)}–${formatNumber(hi, 1)} outras. ${hi < 1 ? 'A epidemia está recuando.' : lo > 1 ? 'A epidemia cresce.' : 'Não dá para saber ainda se cresce ou recua.'}`,
    );
    estimates.push(
      `Se nada mudar, os casos do próximo mês ficam entre ×${g(growth(lo))} e ×${g(growth(hi))} os deste mês.`,
    );
    const [hl, hh] = outbreak.estimate.hospitalRate;
    estimates.push(`Entre ${formatPercent(hl, 1)} e ${formatPercent(hh, 1)} dos infectados precisam de internação.`);
    if (outbreak.phase === 'identificado') {
      const [vmin, vmax] = disease.vaccine.monthsUntilAvailable;
      const since = t - (outbreak.startMonth ?? t);
      estimates.push(
        outbreak.truth.vaccineMonth <= t
          ? 'Há vacina aprovada; a oferta de doses por mês é limitada.'
          : `Vacina: os laboratórios preveem algo entre ${monthsLabel(Math.max(1, vmin - since))} e ${monthsLabel(Math.max(1, vmax - since))} (estimativa).`,
      );
    }
  } else {
    estimates.push(
      'Sem agente identificado não há estimativa confiável de transmissão nem de gravidade. Investigar adianta a identificação.',
    );
  }

  const ufsById = new Map(health.ufs.map((u) => [u.id, u]));
  const adherenceValues = health.ufs.map((u) => adherenceOf(state, content, outbreak, u));
  const mean = adherenceValues.reduce((s, v) => s + v, 0) / Math.max(1, adherenceValues.length);
  const adherence = `Adesão esperada às medidas: ${formatPercent(Math.max(0, mean - 0.1), 0)}–${formatPercent(Math.min(1, mean + 0.1), 0)} (confiança na comunicação, governadores, cansaço e boatos).`;

  const measures: MeasureView[] = (content.health?.measures ?? []).map((m) => {
    const active = outbreak.measures.find((a) => a.id === m.id);
    const relevant =
      m.transmissionCut[disease.transmission] > 0 || m.transmissionCut.respiratoria + m.transmissionCut.vetorial === 0;
    const block = measureBlock(outbreak, m.id, t);
    const monthly =
      m.id === 'vacinacao_em_massa'
        ? `${formatMoneyMillions(m.monthlyMillions * state.economy.priceLevel)}/mês mais as doses`
        : `${formatMoneyMillions(m.monthlyMillions * state.economy.priceLevel)}/mês`;
    return {
      id: m.id,
      name: m.name,
      summary: m.summary,
      cost: `${monthly} por crédito extraordinário · efeito pleno ${m.rampMonths === 0 ? 'no mesmo mês' : `em ${monthsLabel(m.rampMonths + 1)}`}${relevant ? '' : ' · pouco efeito contra esta doença'}`,
      limits: m.limits,
      active: active !== undefined,
      status: active
        ? `Em vigor há ${monthsLabel(t - active.startMonth + 1)}${active.criterion ? `, leitos ${CRITERION_LABEL[active.criterion].label}` : ''}`
        : null,
      blocked: block === 'já em vigor' ? null : block,
    };
  });

  const nameOf = (id: string) => content.scenario.regions?.ufs.find((u) => u.id === id)?.name ?? id;
  const requests = outbreak.requests
    .filter((r) => r.status === 'pendente')
    .map(
      (r) =>
        `${nameOf(r.uf)} pede ${people(r.bedsNeeded)} leitos (há ${monthsLabel(t - r.month + 1)}; expira em ${monthsLabel(Math.max(1, healthParam('pedido_meses') - (t - r.month)))}).`,
    );
  const hotspots = Object.entries(outbreak.observedOccupancy)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .filter(([, v]) => v > 0)
    .map(
      ([id, v]) =>
        `${nameOf(id)}: ${formatPercent(v, 0)} dos leitos ocupados (notificado)${(ufsById.get(id)?.emergencyBeds ?? 0) > 0 ? ' · com leitos de emergência' : ''}`,
    );

  return {
    id: outbreak.id,
    title: outbreak.phase === 'identificado' ? disease.name : disease.alertName,
    phase: phaseLabel(outbreak),
    observed,
    estimates,
    adherence,
    canInvestigate: outbreak.phase === 'alerta' && outbreak.investigatedMonth === undefined,
    investigating: outbreak.phase === 'alerta' && outbreak.investigatedMonth !== undefined,
    measures,
    requests,
    hotspots,
  };
}

function reportView(report: CrisisReport, content: GameContent): ReportView {
  const o = report.observed;
  const e = report.estimated;
  const measure = (id: MeasureId) => content.health?.measures.find((m) => m.id === id)?.name ?? id;
  return {
    title: `Balanço: ${report.diseaseName}`,
    observed: [
      `${count(o.cases, 'caso', 'casos')} e ${count(o.deaths, 'óbito', 'óbitos')} notificados.`,
      o.peakUf
        ? `Pior ocupação notificada: ${formatPercent(o.peakOccupancy, 0)} em ${o.peakUf}${o.ufsOverCapacity.length ? `; ${o.ufsOverCapacity.length} UF(s) passaram da capacidade` : ''}.`
        : 'Nenhuma UF notificou falta de leitos.',
      `Pedidos de governadores: ${o.requestsServed} atendidos, ${o.requestsExpired} sem resposta.`,
    ],
    estimated: [
      `Infecções reais estimadas: ${people(e.infections[0])} a ${people(e.infections[1])} (muitos casos não procuram atendimento).`,
      `Óbitos reais estimados: ${people(e.deaths[0])} a ${people(e.deaths[1])}.`,
      `Atividade perdida (modelo): ${formatNumber(Math.abs(e.activityLossPp), 1)} pontos do PIB-mês somados.`,
      `Efeito na aprovação atribuído à crise: ${formatNumber(e.approvalPp, 1)} p.p. somados.`,
    ],
    accounts: [
      `Gasto federal da resposta: ${formatMoneyMillions(o.fiscalMillions)} (crédito extraordinário, conta exata).`,
      o.measures.length
        ? `Medidas: ${o.measures.map((m) => `${measure(m.id)} (${monthsLabel(m.months)})`).join(', ')}.`
        : 'Nenhuma medida federal adotada.',
      ...(report.trustChange !== null
        ? [
            `Confiança na comunicação: ${report.trustChange >= 0 ? '+' : '−'}${formatNumber(Math.abs(report.trustChange) * 100, 0)} pontos desde o alerta.`,
          ]
        : []),
    ],
  };
}

export function healthView(state: GameState, content: GameContent): HealthView | null {
  if (!content.health) return null;
  const health = healthOf(state);
  if (health.ufs.length === 0) return null;
  const regions = (Object.keys(REGION_LABEL) as MacroRegion[]).map((id) => {
    const r = byRegion(health.ufs, state, id);
    return {
      id,
      name: REGION_LABEL[id],
      beds: `${formatNumber(r.bedsPerThousand, 2)} leito SUS por mil hab. · ocupação habitual ${formatPercent(r.routine, 0)}`,
      network: `Atenção básica ${formatPercent(r.primary, 0)} · vigilância ${surveillanceWord(r.surveillance)} · vacina ${formatPercent(r.vaccination, 0)} da pop./mês${r.prevention > 0.005 ? ` · controle de vetores −${formatPercent(r.prevention, 0)}` : ''}`,
    };
  });
  const last = health.history[health.history.length - 1];
  return {
    regions,
    howToInvest:
      'Para ampliar a rede: a diretriz anual do Ministério da Saúde escolhe uma rotina (atenção básica, vigilância, imunização ou controle de vetores) e a obra de hospitais regionais abre leitos quando entra em operação. O gasto é o da carteira; a capacidade cresce aos poucos.',
    crises: health.outbreaks.map((o) => crisisView(o, state, content)).filter((c): c is CrisisView => c !== null),
    lastReport: last ? reportView(last, content) : null,
  };
}

export function healthFootnote(): string {
  return 'Capacidade de partida: ordens de grandeza do CNES e do e-Gestor AB por macrorregião (PROVISÓRIO). Casos e óbitos são notificações, com atraso e revisão; transmissão e gravidade são estimativas em faixa.';
}
