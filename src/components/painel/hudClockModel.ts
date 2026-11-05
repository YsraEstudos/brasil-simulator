/**
 * Relógio e bateria no HUD do Painel e o aviso da tela acesa (PLANO_SAVES_HISTORICO.md, Fase H1: D33 e B11). Só
 * contas puras: a tela lê a hora do aparelho e a bateria e passa os números para cá. O motor nunca vê essa hora.
 */

/** Estado da carga, nos valores do `BatteryState` do `expo-battery` (0 desconhecido … 4 sem carregar). */
export const BATTERY_STATE = { unknown: 0, unplugged: 1, charging: 2, full: 3, notCharging: 4 } as const;

/** Abaixo disto (fração 0–1) a bateria aparece como fraca: cor de alerta e um "!" (a cor não é o único sinal). */
export const LOW_BATTERY = 0.2;

/** "14:05": hora do aparelho em 24 horas, como no Brasil. */
export function formatClock(hours: number, minutes: number): string {
  const pad = (n: number) => String(Math.max(0, Math.trunc(n))).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}`;
}

/** Milissegundos até a virada do próximo minuto, para o relógio trocar junto com o do aparelho. */
export function msUntilNextMinute(seconds: number, milliseconds: number): number {
  const elapsed = seconds * 1000 + milliseconds;
  return Math.max(1, 60_000 - elapsed);
}

export type BatteryReading = {
  /** Fração 0–1; −1 quando o aparelho não informa. */
  level: number;
  /** `BatteryState` do `expo-battery`. */
  state: number;
  /** Rodando no navegador. */
  web: boolean;
};

export type BatteryView = {
  /** "87%". */
  text: string;
  percent: number;
  charging: boolean;
  low: boolean;
};

/**
 * O que mostrar da bateria, ou `null` para mostrar só a hora. Sem leitura (nível fora de 0–1 ou estado
 * desconhecido) não há bateria. No navegador, um computador sem bateria responde "100% e carregando" para sempre:
 * esse caso também fica só com a hora.
 */
export function batteryView({ level, state, web }: BatteryReading): BatteryView | null {
  if (!Number.isFinite(level) || level < 0 || level > 1 || state === BATTERY_STATE.unknown) return null;
  const charging = state === BATTERY_STATE.charging || state === BATTERY_STATE.full;
  if (web && charging && level >= 1) return null;
  const percent = Math.round(level * 100);
  return { text: `${percent}%`, percent, charging, low: !charging && level < LOW_BATTERY };
}

/** Rótulo do leitor de tela para o canto do relógio. */
export function clockAccessibilityLabel(time: string, battery: BatteryView | null): string {
  if (!battery) return `Hora do aparelho: ${time}`;
  const detail = battery.charging ? ', carregando' : battery.low ? ', fraca' : '';
  return `Hora do aparelho: ${time}. Bateria: ${battery.percent}%${detail}`;
}

/** O relógio aparece no HUD só com a preferência ligada e com a mesa medida (antes do layout não há onde pô-lo). */
export function showHudClock(pref: boolean, width: number, height: number): boolean {
  return pref && width > 0 && height > 0;
}

/** A tela fica acesa só com a preferência ligada e o Painel em foco (uma subtela ou o menu por cima desligam). */
export function keepAwakeActive(pref: boolean, painelFocused: boolean): boolean {
  return pref && painelFocused;
}

/**
 * Legenda da opção nas Configurações. `available` é a resposta do aparelho (`null` enquanto não respondeu): sem
 * suporte, a opção explica que o navegador não deixa manter a tela acesa.
 */
export function keepAwakeNote(available: boolean | null): string {
  if (available === false)
    return 'Este navegador não permite manter a tela acesa. A opção fica gravada, mas não tem efeito aqui.';
  return 'Só vale com o Painel aberto. Ao sair dele, a tela volta a apagar normalmente.';
}
