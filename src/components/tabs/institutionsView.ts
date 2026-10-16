/** Funções puras do quadro "Instituições" (FASE_07.md, T7). Simulação fictícia: nada aqui é dado real. */

/** Limites superiores da faixa de pressão de impeachment (fração 0–1). Acima do último: Crítica. */
export const PRESSURE_BAND_LIMITS = { baixa: 0.15, moderada: 0.35, alta: 0.6 } as const;

export type PressureBand = 'Baixa' | 'Moderada' | 'Alta' | 'Crítica';

/** Faixa textual da pressão de impeachment: Baixa < 0,15 ≤ Moderada < 0,35 ≤ Alta < 0,6 ≤ Crítica. */
export function pressureBand(pressure: number): PressureBand {
  if (pressure < PRESSURE_BAND_LIMITS.baixa) return 'Baixa';
  if (pressure < PRESSURE_BAND_LIMITS.moderada) return 'Moderada';
  if (pressure < PRESSURE_BAND_LIMITS.alta) return 'Alta';
  return 'Crítica';
}

export interface InstitutionalMarkDef {
  flag: string;
  label: string;
  /** Marca que, quando gravada, encerra esta (ex.: CPI encerrada deixa de ser CPI instalada). */
  supersededBy?: string;
}

/** Marcas institucionais exibidas no quadro (POLITICAL_RULES.md §9–§10), com rótulos em português. */
export const INSTITUTIONAL_MARKS: readonly InstitutionalMarkDef[] = [
  { flag: 'cpi_instalada', label: 'CPI instalada', supersededBy: 'cpi_encerrada' },
  { flag: 'tcu_alerta', label: 'Alerta do TCU sobre as contas' },
  { flag: 'tcu_parecer_rejeicao', label: 'Parecer do TCU pela rejeição das contas' },
  { flag: 'impeachment_denuncia_aceita', label: 'Denúncia de impeachment aceita' },
  { flag: 'impeachment_autorizado', label: 'Câmara autorizou o impeachment' },
];

export interface ActiveMark {
  flag: string;
  label: string;
  /** Mês em que a marca foi gravada. */
  sinceMonth: number;
}

/** Marcas ativas, na ordem da lista acima. Uma marca superada por outra não aparece. */
export function activeInstitutionalMarks(flags: Readonly<Record<string, number>>): ActiveMark[] {
  const has = (flag: string) => Object.hasOwn(flags, flag);
  return INSTITUTIONAL_MARKS.filter((mark) => has(mark.flag) && !(mark.supersededBy && has(mark.supersededBy))).map(
    (mark) => ({ flag: mark.flag, label: mark.label, sinceMonth: flags[mark.flag] }),
  );
}
