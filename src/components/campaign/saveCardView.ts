import { formatPercent, formatSignedPercent } from '@/components/ui/format';
import type { CampaignCardSummary, CampaignSummary } from '@/database/campaignRepository';

/**
 * Textos do cartão de cada save na tela "Carregar jogo" (funções puras: sem React, sem relógio próprio).
 * `now` chega de fora para os testes controlarem o tempo; datas são lidas no fuso local do aparelho.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Número do dia no calendário local (sem depender de horas nem do horário de verão). */
function localDayNumber(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 21 → "21h"; 21:05 → "21h05" */
function timeOfDay(d: Date): string {
  const minutes = d.getMinutes();
  return minutes === 0 ? `${d.getHours()}h` : `${d.getHours()}h${pad2(minutes)}`;
}

/**
 * Quando a partida foi jogada pela última vez, relativo a `now`:
 * "Agora mesmo", "Há 5 minutos", "Há 2 horas", "Ontem às 21h05", "Terça às 14h", "12/10 às 14h", "12/10/2024 às 14h".
 * ISO inválido → "".
 */
export function relativePlayedLabel(iso: string, now: Date): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const diffMs = now.getTime() - when.getTime();
  // Menos de 1 minuto, ou data no futuro (relógio do aparelho atrasado), contam como agora.
  if (diffMs < MINUTE_MS) return 'Agora mesmo';

  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 60) return minutes === 1 ? 'Há 1 minuto' : `Há ${minutes} minutos`;

  const days = localDayNumber(now) - localDayNumber(when);
  if (days === 0) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? 'Há 1 hora' : `Há ${hours} horas`;
  }
  if (days === 1) return `Ontem às ${timeOfDay(when)}`;
  if (days <= 6) return `${WEEKDAYS[when.getDay()]} às ${timeOfDay(when)}`;

  const date = `${pad2(when.getDate())}/${pad2(when.getMonth() + 1)}`;
  const year = when.getFullYear() === now.getFullYear() ? '' : `/${when.getFullYear()}`;
  return `${date}${year} às ${timeOfDay(when)}`;
}

/** Tempo total jogado: 45 min → "45m jogados"; 105 min → "1h 45m jogados"; 120 min → "2h jogados"; 0 → "". */
export function playTimeLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  if (ms < MINUTE_MS) return 'Menos de 1 min jogado';
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m jogados`;
  if (minutes === 0) return `${hours}h jogados`;
  return `${hours}h ${minutes}m jogados`;
}

/**
 * Linha de indicadores do cartão: "Aprovação 42% · PIB +1,8% em 12 meses".
 * Só aparece com resumo gravado e partida já no governo; antes da posse ou sem resumo → "".
 */
export function governmentSummaryLine(card: CampaignCardSummary | null, stage: CampaignSummary['stage']): string {
  if (!card || (stage !== null && stage !== 'governo')) return '';
  return `Aprovação ${formatPercent(card.approval, 0)} · PIB ${formatSignedPercent(card.gdpGrowth12m, 1)} em 12 meses`;
}

/** Linha de atividade: "Última vez: Ontem às 21h · 1h 45m jogados". Partes sem dado somem. */
export function savedCardActivityLine(
  campaign: Pick<CampaignSummary, 'lastPlayedAt' | 'updatedAt' | 'playTimeMs'>,
  now: Date,
): string {
  const last = relativePlayedLabel(campaign.lastPlayedAt ?? campaign.updatedAt, now);
  const parts = [last ? `Última vez: ${last}` : '', playTimeLabel(campaign.playTimeMs)];
  return parts.filter(Boolean).join(' · ');
}
