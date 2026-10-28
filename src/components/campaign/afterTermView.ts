import {
  afterTerm,
  type GameContent,
  type GameState,
  type InfluenceBand,
  type LegacyBand,
  type LegalLevel,
  type PromiseStatus,
} from '@/engine';

/**
 * Texto da seção "Depois do mandato" do Legado (PLANO_CAMPANHA.md Fase C7): três aspectos independentes e as
 * possibilidades, sem números do motor além das contagens e da escala de 0 a 100 da influência.
 */

const INFLUENCE_LABEL: Record<InfluenceBand, string> = { baixa: 'baixa', media: 'média', alta: 'alta' };
const LEGAL_LABEL: Record<LegalLevel, string> = {
  nenhuma: 'nenhuma pendência',
  investigacao: 'sob investigação',
  acusacao: 'com acusação formal',
  condenacao: 'condenação em diretoria de estatal',
  restricao: 'com restrição efetiva de direitos',
};
const LEGACY_LABEL: Record<LegacyBand, string> = { negativo: 'negativo', misto: 'misto', positivo: 'positivo' };

export type AfterTermTone = 'positive' | 'textSecondary' | 'warning' | 'negative';

export interface AfterTermAspect {
  title: string;
  value: string;
  tone: AfterTermTone;
  details: string[];
}

export interface AfterTermView {
  aspects: AfterTermAspect[];
  /** Promessas com estado, tom e evidência (EX-18). */
  accountability: { promise: string; status: string; tone: AfterTermTone; evidence: string }[];
  possibilities: string[];
}

const PROMISE_LABEL: Record<PromiseStatus, string> = {
  cumprida: 'Cumprida',
  parcial: 'Parcial',
  abandonada: 'Abandonada',
  inviavel: 'Inviável',
};

const PROMISE_TONE: Record<PromiseStatus, AfterTermTone> = {
  cumprida: 'positive',
  parcial: 'warning',
  abandonada: 'negative',
  inviavel: 'negative',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function signed(points: number): string {
  const n = Math.round(points);
  return n < 0 ? `−${-n}` : `+${n}`;
}

export function afterTermView(state: GameState, content: GameContent, monthLimit: number): AfterTermView | null {
  const view = afterTerm(state, content, monthLimit);
  if (!view) return null;
  const { influence, legal, legacy } = view;
  const drivers = [...influence.factors]
    .filter((f) => Math.round(f.points) !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .map((f) => `${f.label} ${signed(f.points)}`);
  return {
    aspects: [
      {
        title: 'Influência política',
        value: `${INFLUENCE_LABEL[influence.band]} · ${Math.round(influence.value)} de 100`,
        tone: influence.band === 'alta' ? 'positive' : influence.band === 'media' ? 'textSecondary' : 'warning',
        details: drivers.length > 0 ? [drivers.join(' · ')] : [],
      },
      {
        title: 'Situação jurídica',
        value: LEGAL_LABEL[legal.level],
        tone:
          legal.level === 'nenhuma'
            ? 'positive'
            : legal.level === 'investigacao'
              ? 'textSecondary'
              : legal.level === 'acusacao'
                ? 'warning'
                : 'negative',
        details: legal.items.map((item) => item.label),
      },
      {
        title: 'Legado de governo',
        value: LEGACY_LABEL[legacy.band],
        tone: legacy.band === 'positivo' ? 'positive' : legacy.band === 'misto' ? 'textSecondary' : 'negative',
        details: [
          `Melhoraram ${legacy.improved} de 5 indicadores; ${plural(legacy.approvedProposals, 'proposta aprovada', 'propostas aprovadas')}.`,
        ],
      },
    ],
    accountability: view.accountability.map((item) => ({
      promise: item.promise,
      status: PROMISE_LABEL[item.status],
      tone: PROMISE_TONE[item.status],
      evidence: item.evidence,
    })),
    possibilities: view.possibilities,
  };
}
