/**
 * Imprensa interpretativa e confiança (PLANO_EXPANSAO F15, EX-28). Separa quatro coisas que a interface mostra com
 * rótulos diferentes:
 *
 * - **fato:** reprodução de uma publicação oficial (boletim, revisão) — o número é o publicado, não a verdade;
 * - **estimativa:** faixa projetada a partir das estimativas do governo, nunca da verdade do motor;
 * - **interpretação:** leitura de um veículo, com viés, sobre fatos já publicados;
 * - **rumor:** afirmação não verificada. O motor sabe se é verdadeira (vazamento) ou falsa (desinformação), mas a
 *   interface só mostra isso depois da checagem.
 *
 * Nenhum item de imprensa altera a realidade do motor: o rumor muda comportamento (adesão, procura por vacina) e
 * confiança, com causa registrada; os compartimentos e os indicadores nunca leem o número de uma manchete.
 */

/** Tom da comunicação do governo sobre crises. `rotina`: boletins técnicos sem campanha. */
export type CrisisTone = 'rotina' | 'transparente' | 'tranquilizador' | 'alerta';
export const CRISIS_TONES: readonly CrisisTone[] = ['rotina', 'transparente', 'tranquilizador', 'alerta'];

export type PressCategory = 'fato' | 'estimativa' | 'interpretacao' | 'rumor';
export type RumorStatus = 'circulando' | 'confirmado' | 'desmentido';
/** Resposta a um rumor: negar com força ou esclarecer com os dados oficiais. */
export type PressResponse = 'desmentir' | 'esclarecer';
export const PRESS_RESPONSES: readonly PressResponse[] = ['desmentir', 'esclarecer'];

export interface PressItem {
  /** `imprensa:${mês}:${ordem}`, único. */
  id: string;
  month: number;
  outletId: string;
  category: PressCategory;
  headline: string;
  /** Leitura do veículo: −1 crítica ao governo … +1 favorável. Fatos e estimativas ficam perto de 0. */
  stance: number;
  /** Boletim ou surto de origem. */
  sourceId?: string;
  rumorId?: string;
  uf?: string;
  /** Verdade do rumor, decidida pelo motor na origem. Só a checagem a torna pública. */
  truthful?: boolean;
  status?: RumorStatus;
  /** Mês em que a checagem independente resolve o rumor. */
  resolveMonth?: number;
  response?: PressResponse;
  responseMonth?: number;
  /** Fração do alcance ainda em circulação (1 = pleno). */
  circulation?: number;
}

export interface OutletState {
  id: string;
  /** Confiabilidade percebida (0–1): sobe com rumores confirmados, cai com desmentidos. */
  reliability: number;
  confirmed: number;
  refuted: number;
}

/** Mudança da confiança com causa, para o "Por que mudou?". */
export interface TrustChange {
  month: number;
  delta: number;
  cause: string;
}

export interface PressState {
  /** Confiança da população na comunicação oficial sobre crises (0–1). */
  trust: number;
  tone: CrisisTone;
  /** Mês em que o tom atual foi adotado. */
  toneMonth: number | null;
  outlets: OutletState[];
  /** Itens mais recentes por último, limitados. */
  items: PressItem[];
  trustLog: TrustChange[];
}
