import { type GameEvent, parseGameEvent } from '@/types/event';

import altaPetroleo from '@/data/events/alta_petroleo.json';
import camaraTravaPauta from '@/data/events/camara_trava_pauta.json';
import dadosEmpregoSurpreendem from '@/data/events/dados_emprego_surpreendem.json';
import enchentesMetropole from '@/data/events/enchentes_metropole.json';
import escandaloMinisterio from '@/data/events/escandalo_ministerio.json';
import grevesServidores from '@/data/events/greve_servidores.json';
import pressaoGovernadores from '@/data/events/pressao_governadores.json';
import revisaoRating from '@/data/events/revisao_rating.json';
import saidaCapitais from '@/data/events/saida_capitais.json';
import secaSafraEnergia from '@/data/events/seca_safra_energia.json';

/** Eventos do protótipo (src/data/events/*.json), validados ao carregar (GAME_DESIGN.md §11.3). */
const RAW_EVENTS: readonly unknown[] = [
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
];

function load(raw: unknown, index: number): GameEvent {
  const r = parseGameEvent(raw);
  if (!r.ok) throw new Error(`evento inválido (posição ${index}):\n${r.errors.join('\n')}`);
  return r.event;
}

export const EVENTS: readonly GameEvent[] = RAW_EVENTS.map(load);
