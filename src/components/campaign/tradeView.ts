import { formatPercent } from '@/components/ui/format';
import {
  agreementInForce,
  canNegotiate,
  partnerAccess,
  ratificationForecast,
  tradeParam,
  validateAdjustTariff,
  type GameContent,
  type GameState,
  type TradeAgreement,
} from '@/engine';
import type { TradeSector } from '@/types/trade';

/**
 * Modelo do cartão "Comércio exterior e diplomacia" (PLANO_EXPANSAO F14, EX-25): tarifa e faixa do decreto, fluxos do
 * último mês com unidade e sinal, parceiros com relação, acesso, acordo e choques, e a previsão sem sorteio da
 * ratificação. Só lê o estado.
 */

const SECTOR_LABEL: Record<TradeSector, string> = {
  agropecuaria: 'agropecuária',
  extrativa: 'indústria extrativa',
  industria: 'indústria de transformação',
  servicos: 'serviços',
};

const pp = (fraction: number) =>
  `${fraction >= 0 ? '+' : '−'}${Math.abs(fraction * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} p.p. do PIB`;

export interface PartnerView {
  id: string;
  name: string;
  /** "Relação 25 · acesso 85% do normal · setor exposto: agropecuária". */
  status: string;
  agreement: string | null;
  shock: string | null;
  canNegotiate: boolean;
  negotiateLabel: string;
}

export interface TradeView {
  tariff: string;
  canRaise: boolean;
  canLower: boolean;
  flows: { label: string; value: string }[];
  /** Setores com exportação perdida ou ganha no mês. */
  sectors: string | null;
  partners: PartnerView[];
  supplyShock: string | null;
}

function agreementText(agreement: TradeAgreement | undefined, state: GameState, content: GameContent): string | null {
  if (!agreement) return null;
  const rounds = tradeParam('rodadas_acordo');
  switch (agreement.stage) {
    case 'negociacao':
      return `Acordo em negociação: ${agreement.progress.toLocaleString('pt-BR')} de ${rounds} rodadas.`;
    case 'ratificacao': {
      const forecast = ratificationForecast(state, content)
        .map(
          (h) =>
            `${h.house === 'camara' ? 'Câmara' : 'Senado'} ~${Math.round(h.expectedYes)} de ${h.required} necessários`,
        )
        .join(' · ');
      return `Assinado; votação no Congresso em ${(agreement.voteMonth ?? state.monthIndex) - state.monthIndex} meses. Previsão: ${forecast}.`;
    }
    case 'vigente':
      return agreementInForce(agreement, state.monthIndex)
        ? `Acordo vigente até daqui a ${(agreement.endMonth ?? state.monthIndex) - state.monthIndex} meses: mais acesso às exportações, mais importações do parceiro e ${formatPercent(tradeParam('concessao_tarifa'), 0)} da tarifa sem cobrança.`
        : 'Acordo ratificado; vigora no próximo mês.';
    case 'rejeitado':
      return 'Acordo rejeitado pelo Congresso.';
    case 'encerrado':
      return 'Acordo encerrado ao fim da vigência.';
  }
}

export function tradeView(state: GameState, content: GameContent): TradeView | null {
  const catalog = content.trade;
  if (!catalog) return null;
  const trade = state.trade;
  const f = trade.flows;
  const t = state.monthIndex;
  const sectors = (Object.entries(f.sectors) as [TradeSector, number][])
    .filter(([, v]) => v !== 0)
    .map(([id, v]) => `${SECTOR_LABEL[id]} ${pp(v)}`);
  const chain = trade.shocks.find((s) => s.kind === 'cadeia' && s.startMonth <= t && t <= s.endMonth);
  return {
    tariff: `Tarifa média de importação: ${formatPercent(trade.tariff, 0)} (base ${formatPercent(catalog.tariff.base, 0)}; o decreto pode ir de ${formatPercent(catalog.tariff.min, 0)} a ${formatPercent(catalog.tariff.max, 0)}).`,
    canRaise: validateAdjustTariff({ direction: 'elevar' }, state, content) === null,
    canLower: validateAdjustTariff({ direction: 'reduzir' }, state, content) === null,
    flows:
      t === 0
        ? []
        : [
            { label: 'Exportações de bens (acesso a mercados)', value: pp(f.exports) },
            { label: 'Exportações de tecnologia', value: pp(f.techExports) },
            { label: 'Importações (tarifa e acordos)', value: pp(f.imports) },
            { label: 'Importações dos programas de tecnologia', value: pp(f.techImports) },
            { label: 'Saldo em relação ao início', value: pp(f.net) },
            { label: 'Imposto de importação em relação ao início', value: pp(f.tariffRevenue) },
          ],
    sectors: sectors.length ? `Setores afetados no mês: ${sectors.join(' · ')}.` : null,
    partners: catalog.partners.map((spec) => {
      const partner = trade.partners.find((p) => p.id === spec.id);
      const barrier = trade.shocks.find(
        (s) => s.kind === 'barreira' && s.partnerId === spec.id && s.startMonth <= t && t <= s.endMonth,
      );
      const agreement = partner?.agreement;
      return {
        id: spec.id,
        name: spec.name,
        status: `Relação ${Math.round(partner?.relation ?? spec.initialRelation)} · acesso ${formatPercent(partnerAccess(state, spec), 0)} do normal · ${formatPercent(spec.exportShare, 0)} das exportações · setor exposto: ${SECTOR_LABEL[spec.mainSector]}`,
        agreement: spec.agreementAvailable
          ? agreementText(agreement, state, content)
          : 'Sem acordo possível neste cenário (união aduaneira ou negociação fora de pauta).',
        shock: barrier
          ? `Barreira às compras do Brasil por mais ${barrier.endMonth - t + 1} meses (−${formatPercent(barrier.size, 0)} de acesso).`
          : null,
        canNegotiate: canNegotiate(state, content, spec.id),
        negotiateLabel:
          agreement?.stage === 'negociacao'
            ? 'Nova rodada de negociação (1 ação)'
            : 'Abrir negociação de acordo (1 ação)',
      };
    }),
    supplyShock: chain
      ? `Ruptura das cadeias de suprimento por mais ${chain.endMonth - t + 1} meses: importações e manutenção de tecnologia importada mais caras.`
      : null,
  };
}

/** Rodapé do cartão. */
export function tradeFootnote(): string {
  return 'Fluxos em pontos do PIB, anualizados, como desvio do início da campanha (PROVISÓRIO). O preço das commodities segue nos termos de troca da economia; aqui entram volume, acesso e tarifa.';
}
