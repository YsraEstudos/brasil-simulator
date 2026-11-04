import type { CampaignSummary } from '@/database/campaignRepository';

/**
 * Abrir direto na última campanha (Configurações → `prefs.openLastCampaign`). Função pura: escolhe o id que o app
 * deve abrir ao iniciar; quem executa (`continueCampaign` e a ida ao Painel) fica em `src/app/_layout.tsx`.
 */

export type StartupCampaign = Pick<CampaignSummary, 'id' | 'status' | 'lastPlayedAt' | 'updatedAt'>;

/** Instante de referência de uma campanha: a última vez que foi jogada; sem registro, a última gravação. */
function referenceTime(c: StartupCampaign): number {
  const t = Date.parse(c.lastPlayedAt ?? c.updatedAt);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Id da campanha ativa mais recente (`lastPlayedAt ?? updatedAt`); `null` se não há nenhuma ativa. Empate: a primeira. */
export function lastActiveCampaignId(campaigns: readonly StartupCampaign[]): string | null {
  let best: StartupCampaign | null = null;
  for (const c of campaigns) {
    if (c.status !== 'ativa') continue;
    if (best === null || referenceTime(c) > referenceTime(best)) best = c;
  }
  return best?.id ?? null;
}

/** Id a abrir ao iniciar o app, ou `null` para ficar no menu (store não pronta, opção desligada ou sem campanha ativa). */
export function startupCampaignId(input: {
  status: 'iniciando' | 'pronto' | 'erro';
  openLastCampaign: boolean;
  campaigns: readonly StartupCampaign[];
}): string | null {
  if (input.status !== 'pronto' || !input.openLastCampaign) return null;
  return lastActiveCampaignId(input.campaigns);
}
