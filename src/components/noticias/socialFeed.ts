import { offsetOfKey, type NewsItem, type NewsKind } from '@/engine';
import { shortCareerTurnLabel, shortMonthLabel } from '@/components/campaign/labels';

import { NEWS_KIND_LABEL } from '@/components/tabs/newsView';

/**
 * Redes sociais da mesa de notícias: reações fictícias às manchetes do feed. Só interface — nada disso entra
 * no motor nem no save. Determinístico: a mesma notícia gera sempre as mesmas publicações (semente = id da
 * notícia), então reabrir a aba não embaralha nada. Autores são inventados; personagens são os do cenário.
 */

export type PostStance = 'apoio' | 'critica' | 'neutra';

export interface SocialAuthor {
  name: string;
  handle: string;
  initials: string;
  /** Cor do avatar (hex). */
  color: string;
  /** Conta de personagem do cenário (selo de conta oficial). */
  verified: boolean;
  role?: string;
}

export interface SocialPost {
  id: string;
  author: SocialAuthor;
  text: string;
  stance: PostStance;
  kind: NewsKind;
  newsId: string;
  /** Quando foi publicado, em texto ("há 3 h", "mar/27"). */
  when: string;
  replies: number;
  shares: number;
  likes: number;
}

export interface Trend {
  kind: NewsKind;
  tag: string;
  posts: number;
}

export interface SocialCharacter {
  id: string;
  name: string;
  role: string;
  standing: number;
}

/** Quantas notícias recentes viram publicações (as mais novas primeiro). */
const NEWS_WINDOW = 14;
/** Prestígio a partir do qual um personagem defende (ou ataca) o governo. */
const STANDING_SIDE = 20;

export const KIND_TAG: Record<NewsKind, string> = {
  economia: '#Economia',
  congresso: '#Congresso',
  evento: '#Brasil',
  personagem: '#Bastidores',
  institucional: '#Instituições',
};

const FIRST_NAMES = [
  'Ana',
  'Bruno',
  'Carla',
  'Diego',
  'Elaine',
  'Fábio',
  'Gisele',
  'Heitor',
  'Iara',
  'João',
  'Kátia',
  'Leandro',
  'Marina',
  'Nilton',
  'Olívia',
  'Paulo',
  'Quitéria',
  'Renato',
  'Sueli',
  'Tiago',
  'Úrsula',
  'Vinícius',
  'Wanda',
  'Yago',
  'Zélia',
  'Rosângela',
  'Edson',
  'Luana',
  'Caio',
  'Débora',
];
const LAST_NAMES = [
  'Albuquerque',
  'Barros',
  'Cavalcanti',
  'Dantas',
  'Esteves',
  'Farias',
  'Guimarães',
  'Holanda',
  'Inácio',
  'Jardim',
  'Lacerda',
  'Macedo',
  'Nogueira',
  'Pacheco',
  'Queiroz',
  'Rezende',
  'Sampaio',
  'Teixeira',
  'Valadares',
  'Xavier',
];
const AVATAR_COLORS = ['#c0583e', '#3f7d5c', '#3a6ea5', '#8a5aa8', '#b8892c', '#2f8f8f', '#a8456b', '#5b6b2f'];

const CITIZEN: Record<PostStance, readonly string[]> = {
  apoio: [
    'Finalmente uma boa notícia: “{h}”. Que continue assim. {tag}',
    'Quem torcia contra vai ter que engolir essa. {tag}',
    'Li a matéria inteira. Ponto pro governo dessa vez. {tag}',
    'Isso aqui faz diferença no fim do mês de muita gente. {tag}',
    'Não sou governista, mas é justo reconhecer: “{h}”.',
    'Mandei no grupo da família e até meu tio concordou. Milagre. {tag}',
  ],
  critica: [
    'Mais uma: “{h}”. Até quando? {tag}',
    'E a conta, quem paga? Sempre a gente. {tag}',
    'Prometeram outra coisa na campanha. {tag}',
    'Lendo “{h}” e pensando no preço do mercado. Não dá. {tag}',
    'Alguém em Brasília leu isso antes de decidir? {tag}',
    'Daqui a pouco vão dizer que a culpa é do governo anterior. {tag}',
  ],
  neutra: [
    'Alguém explica o que muda na prática com isso? “{h}”',
    'Vou esperar os números do próximo mês antes de opinar. {tag}',
    'Notícia importante, mas o detalhe é o que vai pesar. {tag}',
    'Salvando pra ler com calma: “{h}”.',
    'Os dois lados vão usar essa manchete do jeito que convém. {tag}',
  ],
};

const CHARACTER: Record<PostStance, readonly string[]> = {
  apoio: [
    'Recebemos com satisfação: “{h}”. Seguimos à disposição para o diálogo.',
    'Passo na direção certa. Conte com nosso apoio. {tag}',
  ],
  critica: [
    'Não vamos aceitar calados. “{h}” exige explicações.',
    'Alertamos antes e fomos ignorados. O resultado está aí. {tag}',
  ],
  neutra: [
    'Acompanhamos com atenção: “{h}”. Vamos avaliar os desdobramentos.',
    'Há pontos a discutir. Nossa equipe está analisando. {tag}',
  ],
};

const JOURNALIST = [
  'Bastidores: {c}. A leitura em Brasília é que isso ainda vai render.',
  'Fio sobre “{h}”: o que está por trás e o que vem agora. {tag}',
  'Ouvi três fontes hoje. Ninguém esperava “{h}” agora. {tag}',
];

/** FNV-1a de 32 bits: semente estável a partir do id da notícia. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** PRNG mulberry32 (só para variar textos da interface; o motor tem o próprio). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: readonly T[], r: () => number): T => list[Math.floor(r() * list.length)];

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function citizen(r: () => number): SocialAuthor {
  const first = pick(FIRST_NAMES, r);
  const last = pick(LAST_NAMES, r);
  const name = `${first} ${last}`;
  const handle = `@${stripAccents(first).toLowerCase()}${stripAccents(last).toLowerCase().slice(0, 4)}${Math.floor(r() * 90 + 10)}`;
  return { name, handle, initials: initialsOf(name), color: pick(AVATAR_COLORS, r), verified: false };
}

function characterAuthor(c: SocialCharacter): SocialAuthor {
  const handle = `@${stripAccents(c.name)
    .toLowerCase()
    .replace(/[^a-z]+/g, '')}`;
  return {
    name: c.name,
    handle,
    initials: initialsOf(c.name),
    color: AVATAR_COLORS[hashString(c.id) % AVATAR_COLORS.length],
    verified: true,
    role: c.role,
  };
}

/**
 * Preenche o modelo numa passagem só e com função: um `$&` na manchete não vira padrão do `replace`, e um
 * `{c}` dentro da manchete não é substituído de novo.
 */
export function fill(template: string, item: Pick<NewsItem, 'headline' | 'cause' | 'kind'>): string {
  const cause = item.cause.replace(/^Causa:\s*/i, '').replace(/\.$/, '');
  const values: Record<string, string> = { '{h}': item.headline, '{c}': cause, '{tag}': KIND_TAG[item.kind] };
  return template.replace(/\{h\}|\{c\}|\{tag\}/g, (token) => values[token]).trim();
}

/** Lado de um cidadão: puxado pelo tom da notícia e pela aprovação do governo (0–1). */
export function citizenStance(tone: NewsItem['tone'], approval: number, roll: number): PostStance {
  // Faixas nunca negativas: com aprovação extrema, uma faixa zera sem encolher a outra.
  const support = Math.max(0, { positiva: 0.62, negativa: 0.18, neutra: 0.36 }[tone] + (approval - 0.5) * 0.5);
  const against = Math.max(0, { positiva: 0.16, negativa: 0.62, neutra: 0.3 }[tone] - (approval - 0.5) * 0.5);
  if (roll < support) return 'apoio';
  if (roll < support + against) return 'critica';
  return 'neutra';
}

/** Lado de um personagem: pelo prestígio com o governo. */
export function characterStance(standing: number): PostStance {
  if (standing >= STANDING_SIDE) return 'apoio';
  if (standing <= -STANDING_SIDE) return 'critica';
  return 'neutra';
}

function whenLabel(newsMonth: number, currentMonth: number, r: () => number): string {
  const age = currentMonth - newsMonth;
  if (age <= 0) return `há ${Math.floor(r() * 22) + 1} h`;
  if (age === 1) return `há ${Math.floor(r() * 3) + 2} sem`;
  return shortMonthLabel(newsMonth);
}

function counts(stance: PostStance, verified: boolean, r: () => number) {
  // Críticas circulam mais; contas de personagem têm mais alcance.
  const reach = (verified ? 6 : 1) * (stance === 'critica' ? 1.6 : stance === 'apoio' ? 1.1 : 0.7);
  const likes = Math.round(r() * r() * 4200 * reach) + 3;
  return {
    likes,
    shares: Math.round(likes * (0.08 + r() * 0.25)),
    replies: Math.round(likes * (0.03 + r() * 0.12)),
  };
}

/**
 * Publicações para a linha do tempo: mês mais recente primeiro e, dentro do mês, na ordem de prioridade do
 * motor (a manchete principal antes). `news` vem como em `EventsState.news`: meses do mais antigo para o mais
 * novo, cada mês já em ordem de prioridade. Cada notícia rende: o personagem citado (se houver), às vezes a
 * colunista, e um ou dois cidadãos.
 */
export function buildSocialFeed(
  news: readonly NewsItem[],
  characters: readonly SocialCharacter[],
  approval: number,
  currentMonth: number,
): SocialPost[] {
  const posts: SocialPost[] = [];
  const journalist = characters.find((c) => c.id === 'jornalista');
  // Ordenação estável: só os meses se invertem; a prioridade dentro do mês fica como o motor gravou.
  const time = (item: NewsItem) => (item.careerPeriod ? offsetOfKey(item.careerPeriod) : item.monthIndex);
  const recent = news.slice(-NEWS_WINDOW).sort((a, b) => time(b) - time(a));

  for (const item of recent) {
    const r = rng(hashString(item.id));
    const push = (author: SocialAuthor, stance: PostStance, template: string, n: number) =>
      posts.push({
        id: `${item.id}_${n}`,
        author,
        text: fill(template, item),
        stance,
        kind: item.kind,
        newsId: item.id,
        when: item.careerPeriod
          ? shortCareerTurnLabel({ from: item.careerPeriod })
          : whenLabel(item.monthIndex, currentMonth, r),
        ...counts(stance, author.verified, r),
      });

    const cited = item.characterId ? characters.find((c) => c.id === item.characterId) : undefined;
    if (cited && cited.id !== 'jornalista') {
      const stance = characterStance(cited.standing);
      push(characterAuthor(cited), stance, pick(CHARACTER[stance], r), 0);
    }
    if (journalist && (r() < 0.34 || cited?.id === 'jornalista')) {
      push(characterAuthor(journalist), 'neutra', pick(JOURNALIST, r), 1);
    }
    const citizens = r() < 0.5 ? 1 : 2;
    for (let n = 0; n < citizens; n++) {
      const stance = citizenStance(item.tone, approval, r());
      push(citizen(r), stance, pick(CITIZEN[stance], r), 2 + n);
    }
  }
  return posts;
}

/** Assuntos em alta: tipos de notícia com mais publicações. */
export function trendsOf(posts: readonly SocialPost[]): Trend[] {
  const byKind = new Map<NewsKind, number>();
  for (const p of posts) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  return [...byKind.entries()]
    .sort((a, b) => b[1] - a[1] || NEWS_KIND_LABEL[a[0]].localeCompare(NEWS_KIND_LABEL[b[0]]))
    .map(([kind, n]) => ({ kind, tag: KIND_TAG[kind], posts: n }));
}

/** Humor da rede: parcela de publicações de apoio, crítica e neutras (somam 1; 0 quando vazia). */
export function moodOf(posts: readonly SocialPost[]): Record<PostStance, number> {
  const total = posts.length || 1;
  const count = (s: PostStance) => posts.filter((p) => p.stance === s).length / total;
  return posts.length === 0
    ? { apoio: 0, critica: 0, neutra: 0 }
    : { apoio: count('apoio'), critica: count('critica'), neutra: count('neutra') };
}

/** Número curto: 1.234 → "1,2 mil". */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k
    .toFixed(k < 10 ? 1 : 0)
    .replace('.', ',')
    .replace(',0', '')} mil`;
}
