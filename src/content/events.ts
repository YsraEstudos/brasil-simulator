import { type GameEvent, parseGameEvent } from '@/types/event';

import altaPetroleo from '@/data/events/alta_petroleo.json';
import calibragemCbs from '@/data/events/calibragem_cbs.json';
import camaraTravaPauta from '@/data/events/camara_trava_pauta.json';
import dadosEmpregoSurpreendem from '@/data/events/dados_emprego_surpreendem.json';
import enchentesMetropole from '@/data/events/enchentes_metropole.json';
import escandaloMinisterio from '@/data/events/escandalo_ministerio.json';
import fndrGovernadores from '@/data/events/fndr_governadores.json';
import grevesServidores from '@/data/events/greve_servidores.json';
import orcamentoTransicao from '@/data/events/orcamento_transicao.json';
import paralisacaoMaquina from '@/data/events/paralisacao_maquina.json';
import pressaoGovernadores from '@/data/events/pressao_governadores.json';
import regimesDiferenciados from '@/data/events/regimes_diferenciados.json';
import revisaoRating from '@/data/events/revisao_rating.json';
import saidaCapitais from '@/data/events/saida_capitais.json';
import secaSafraEnergia from '@/data/events/seca_safra_energia.json';

/**
 * Eventos (src/data/events/*.json), validados ao carregar (GAME_DESIGN.md §11.3): os 10 do protótipo e os 5 de
 * 2027 da Fase 03. A ordem importa: o sorteio segue esta lista até `max_eventos_mes` (o orçamento de transição
 * vem primeiro para sempre chegar em fevereiro de 2027).
 */
const RAW_EVENTS: readonly unknown[] = [
  orcamentoTransicao,
  altaPetroleo,
  secaSafraEnergia,
  grevesServidores,
  escandaloMinisterio,
  revisaoRating,
  camaraTravaPauta,
  enchentesMetropole,
  saidaCapitais,
  pressaoGovernadores,
  dadosEmpregoSurpreendem,
  calibragemCbs,
  regimesDiferenciados,
  fndrGovernadores,
  paralisacaoMaquina,
];

function load(raw: unknown, index: number): GameEvent {
  const r = parseGameEvent(raw);
  if (!r.ok) throw new Error(`evento inválido (posição ${index}):\n${r.errors.join('\n')}`);
  return r.event;
}

export const EVENTS: readonly GameEvent[] = RAW_EVENTS.map(load);
