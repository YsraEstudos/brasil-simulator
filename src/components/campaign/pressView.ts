import { formatNumber, formatPercent } from '@/components/ui/format';
import { pressOf, TONE_LABEL, type CrisisTone, type GameContent, type GameState, type PressItem } from '@/engine';

import { hashString } from '../noticias/socialFeed';

import { shortMonthLabel } from './labels';

/**
 * Modelo do cartão "Imprensa e confiança" (PLANO_EXPANSAO EX-28). Só lê o estado. A verdade de um rumor (o motor sabe
 * se é vazamento ou desinformação) **só aparece depois da checagem**: antes, todo rumor é "não verificado". A leitura dos
 * veículos sobre a manchete do mês é reconstruída aqui de forma determinística (mesma notícia, mesmo veículo, mesmo
 * texto), sem ir para o save e sem sorteio.
 */

export interface PressItemView {
  id: string;
  /** "Fato", "Estimativa", "Interpretação", "Rumor não verificado", "Rumor confirmado", "Falso (desinformação)". */
  badge: string;
  tone: 'neutral' | 'positive' | 'negative' | 'warning';
  outlet: string;
  /** "Confiabilidade 72% · nacional · viés crítico ao governo". */
  outletInfo: string;
  headline: string;
  when: string;
  /** Rumor em circulação sem resposta: o governo pode responder. */
  canRespond: boolean;
  response: string | null;
}

export interface ToneOption {
  tone: CrisisTone;
  label: string;
  effect: string;
  current: boolean;
}

export interface PressView {
  trust: string;
  trustWhy: string[];
  tones: ToneOption[];
  items: PressItemView[];
  reading: string | null;
}

const TONE_EFFECT: Record<CrisisTone, string> = {
  rotina: 'Boletins técnicos sem campanha. Nada muda na adesão.',
  transparente:
    'Boletins abertos e coletivas. A confiança cresce devagar durante a crise; números ruins ficam expostos.',
  tranquilizador:
    'Menos alarme agora, mas a adesão cai e os boletins deixam de ser divulgados. Se os casos subirem, a confiança despenca e os boatos crescem.',
  alerta: 'Pede que a população se proteja: a adesão sobe. Manter o alerta sem crise em curso desgasta a confiança.',
};

const BIAS = (bias: number) =>
  bias <= -0.3 ? 'crítico ao governo' : bias >= 0.3 ? 'simpático ao governo' : 'equilibrado';

function badgeOf(item: PressItem): { badge: string; tone: PressItemView['tone'] } {
  switch (item.category) {
    case 'fato':
      return { badge: 'Fato (dado oficial)', tone: 'neutral' };
    case 'estimativa':
      return { badge: 'Estimativa (faixa)', tone: 'neutral' };
    case 'interpretacao':
      return {
        badge: 'Interpretação',
        tone: item.stance >= 0.3 ? 'positive' : item.stance <= -0.3 ? 'negative' : 'neutral',
      };
    case 'rumor':
      if (item.status === 'confirmado') return { badge: 'Rumor confirmado pela checagem', tone: 'warning' };
      if (item.status === 'desmentido') return { badge: 'Falso (desinformação)', tone: 'negative' };
      return { badge: 'Rumor não verificado', tone: 'warning' };
  }
}

export function pressView(state: GameState, content: GameContent, limit = 8): PressView | null {
  const catalog = content.press;
  if (!catalog) return null;
  const press = pressOf(state);
  const items = [...press.items]
    .reverse()
    .slice(0, limit)
    .map((item): PressItemView => {
      const spec = catalog.outlets.find((o) => o.id === item.outletId);
      const live = press.outlets.find((o) => o.id === item.outletId);
      const { badge, tone } = badgeOf(item);
      return {
        id: item.id,
        badge,
        tone,
        outlet: spec?.name ?? item.outletId,
        outletInfo: spec
          ? `Confiabilidade ${formatPercent(live?.reliability ?? spec.reliability, 0)} · ${spec.reach === 'nacional' ? 'nacional' : `circula no ${spec.reach.replace('_', '-')}`} · ${BIAS(spec.bias)}`
          : '',
        headline: item.headline,
        when: shortMonthLabel(item.month),
        canRespond: item.category === 'rumor' && item.status === 'circulando' && !item.response,
        response: item.response
          ? item.response === 'desmentir'
            ? 'O governo desmentiu.'
            : 'O governo respondeu com dados oficiais.'
          : null,
      };
    });
  const trustWhy = [...press.trustLog]
    .reverse()
    .slice(0, 3)
    .map(
      (c) =>
        `${c.delta >= 0 ? '+' : '−'}${formatNumber(Math.abs(c.delta) * 100, 1)} · ${c.cause} (${shortMonthLabel(c.month)})`,
    );
  return {
    trust: `Confiança na comunicação do governo: ${formatPercent(press.trust, 0)}. Muda a adesão às medidas e a procura por vacina, não a aprovação.`,
    trustWhy,
    tones: (Object.keys(TONE_EFFECT) as CrisisTone[]).map((tone) => ({
      tone,
      label: TONE_LABEL[tone],
      effect: TONE_EFFECT[tone],
      current: press.tone === tone,
    })),
    items,
    reading: newsReading(state, content),
  };
}

/** Leitura de um veículo sobre a manchete mais recente (interpretação de fato publicado), determinística. */
export function newsReading(state: GameState, content: GameContent): string | null {
  const outlets = (content.press?.outlets ?? []).filter((o) => o.kind !== 'rede');
  const latest = state.events.news[state.events.news.length - 1];
  if (!latest || outlets.length === 0) return null;
  const outlet = outlets[hashString(latest.id) % outlets.length];
  const lean = outlet.bias + (latest.tone === 'positiva' ? 0.4 : latest.tone === 'negativa' ? -0.4 : 0);
  const frame =
    lean >= 0.3 ? 'sinal de rumo certo' : lean <= -0.3 ? 'o governo deve explicações' : 'os efeitos ainda são incertos';
  return `${outlet.name} lê “${latest.headline}”: ${frame}. (Interpretação de um veículo ${BIAS(outlet.bias)}.)`;
}

export function pressFootnote(): string {
  return 'Veículos fictícios. Fato reproduz dado oficial; estimativa traz faixa; interpretação é leitura com viés; rumor só vira verdadeiro ou falso depois da checagem independente.';
}
