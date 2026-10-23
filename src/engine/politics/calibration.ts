import type { ParamSpec } from '../economy/calibration';

/**
 * Calibração do perfil ideológico do governo e do alinhamento por UF (PLANO_GLOBO.md §5.1; POLITICAL_RULES.md
 * §11.2; AI_INSTRUCTIONS.md §3: sem números mágicos). Mesma forma de `PARAMS`: valor, faixa, significado e
 * justificativa. Valores PROVISORIO, sujeitos à revisão de calibração do PR 4 (PLANO_GLOBO.md §10).
 *
 * Eixos (os mesmos de `Policy.position` e de `Bloc.ideology`): econômico −1 estado … 1 mercado; social −1
 * progressista … 1 conservador.
 */

const JOGO = 'critério de jogo: legibilidade da deriva do perfil e da pressão regional; testado na faixa';
const SATURACAO = 'saturação de segurança (ECONOMIC_MODEL.md §1.8)';

export const PROFILE_PARAMS = {
  memoria_decisao: {
    value: 0.12,
    min: 0.05,
    max: 0.25,
    note: 'λ: fração do caminho até a posição de uma decisão sancionada ou executada que o perfil percorre (peso cheio)',
    basis: `${JOGO}; ~8 decisões na mesma direção levam o perfil a ~64% do caminho`,
  },
  peso_proposta: {
    value: 0.25,
    min: 0.1,
    max: 0.5,
    note: 'peso da proposta enviada ao Congresso, em relação à sancionada ou executada (sinal de intenção)',
    basis: JOGO,
  },
  peso_veto: {
    value: 0.5,
    min: 0.25,
    max: 1,
    note: 'peso do veto total, em relação à sanção; o perfil anda na direção oposta à posição do projeto vetado',
    basis: JOGO,
  },
  peso_evento: {
    value: 0.75,
    min: 0.25,
    max: 1,
    note: 'peso de uma escolha de evento com posição, em relação à sanção; só escolhas do jogador contam',
    basis: JOGO,
  },
  memoria_maxima: {
    value: 0.5,
    min: 0.3,
    max: 0.8,
    note: 'teto do λ efetivo de uma decisão (λ × peso × relevância): o perfil nunca salta direto para a posição',
    basis: SATURACAO,
  },
  movimentos_por_mes: {
    value: 3,
    min: 1,
    max: 6,
    note: 'quantas decisões que mais moveram o perfil o relatório do mês guarda (as demais só entram na soma)',
    basis: 'estado enxuto (ECONOMIC_MODEL.md §11): a lista é curta e fica no relatório, não no estado',
  },
  alinhamento_regional_max: {
    value: 0.04,
    min: 0.02,
    max: 0.08,
    note: 'k: desvio máximo de aprovação de uma UF, em relação à média, por alinhamento com o perfil do governo',
    basis: `${JOGO}; mesma ordem do efeito de um governador totalmente aliado (aprovacao_governador = 0,04); o teto geral continua sendo desvio_aprovacao_max`,
  },
  alinhamento_regional_escala: {
    value: 0.12,
    min: 0.06,
    max: 0.25,
    note: 's: diferença de alinhamento (0–1) em relação à média das UFs que satura o desvio regional (tanh)',
    basis: `${JOGO}; os alinhamentos das UFs se espalham em ±0,1 a ±0,2 em torno da média`,
  },
  eleitor_mediano_teto: {
    value: 0.02,
    min: 0.01,
    max: 0.04,
    note: 'efeito máximo, em fração da aprovação, da distância do perfil ao eleitor mediano (estado estacionário)',
    basis: `${SATURACAO}; termo nacional pequeno (PLANO_GLOBO.md §5.1, D-G10)`,
  },
  eleitor_mediano_distancia_neutra: {
    value: 0.2,
    min: 0.1,
    max: 0.35,
    note: 'distância normalizada (0–1) entre o perfil e o eleitor mediano em que o termo nacional vale zero',
    basis: `${JOGO}; ~0,57 em unidades dos eixos: governo "razoavelmente" perto do eleitor`,
  },
  eleitor_mediano_escala: {
    value: 0.15,
    min: 0.08,
    max: 0.3,
    note: 'distância normalizada que satura o termo nacional (tanh); simétrico em torno da distância neutra',
    basis: SATURACAO,
  },
  ufs_destacadas_previa: {
    value: 5,
    min: 3,
    max: 8,
    note: 'quantas UFs a prévia da decisão destaca entre as que tendem a ganhar e as que tendem a perder',
    basis: 'legibilidade: só a interface lê; não entra em nenhuma conta do motor',
  },
  faixa_central: {
    value: 0.2,
    min: 0.1,
    max: 0.3,
    note: 'posição (valor absoluto) abaixo da qual um eixo é descrito como "centro" para o jogador',
    basis: 'legibilidade: só texto da interface, não entra em nenhuma conta do motor',
  },
} as const satisfies Record<string, ParamSpec>;

export type ProfileParamName = keyof typeof PROFILE_PARAMS;

/** Valor de um parâmetro do perfil. */
export function profileParam(name: ProfileParamName): number {
  return PROFILE_PARAMS[name].value;
}

/**
 * Maior distância possível entre dois pontos dos eixos [−1, 1]² (a diagonal do quadrado): a distância
 * normalizada é a euclidiana dividida por ela. Constante matemática, não coeficiente de jogo.
 */
export const PROFILE_MAX_DISTANCE = 2 * Math.SQRT2;

/** Perfis iniciais do NOVO JOGO (PLANO_GLOBO.md §5.1, D-G9): posições nos eixos, sem nomes de partidos reais. */
export const PROFILE_PRESETS = [
  {
    id: 'centro',
    name: 'Centro',
    description: 'Sem inclinação nos dois eixos: o perfil se define pelo que o governo decidir.',
    economic: 0,
    social: 0,
  },
  {
    id: 'centro_esquerda',
    name: 'Centro-esquerda',
    description: 'Mais Estado na economia e pauta social levemente progressista.',
    economic: -0.3,
    social: -0.3,
  },
  {
    id: 'esquerda',
    name: 'Esquerda',
    description: 'Estado forte na economia e pauta social progressista.',
    economic: -0.7,
    social: -0.6,
  },
  {
    id: 'centro_direita',
    name: 'Centro-direita',
    description: 'Mais mercado na economia e pauta social levemente conservadora.',
    economic: 0.3,
    social: 0.3,
  },
  {
    id: 'liberal',
    name: 'Liberal',
    description: 'Mercado na economia e costumes mais abertos.',
    economic: 0.7,
    social: -0.2,
  },
  {
    id: 'conservador',
    name: 'Conservador',
    description: 'Economia moderada e pauta de costumes conservadora.',
    economic: 0.2,
    social: 0.7,
  },
] as const;

export type ProfilePresetId = (typeof PROFILE_PRESETS)[number]['id'];
export type ProfilePreset = (typeof PROFILE_PRESETS)[number];

export const DEFAULT_PROFILE_PRESET: ProfilePresetId = 'centro';

/** O id é um perfil inicial conhecido (busca pela chave própria da lista). */
export function isProfilePresetId(value: unknown): value is ProfilePresetId {
  return typeof value === 'string' && PROFILE_PRESETS.some((p) => p.id === value);
}

/** Perfil inicial de um preset; id desconhecido volta ao padrão (Centro, 0/0). */
export function presetProfile(id: ProfilePresetId | undefined): { economic: number; social: number } {
  const preset = PROFILE_PRESETS.find((p) => p.id === id) ?? PROFILE_PRESETS[0];
  return { economic: preset.economic, social: preset.social };
}
