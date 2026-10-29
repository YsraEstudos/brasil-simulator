import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState, createOutbreak, diseaseOf, type GameState, type PressItem } from '@/engine';

import { healthView } from './healthView';
import { newsReading, pressView } from './pressView';

const content = loadContent(DEFAULT_SCENARIO_ID);

function crisis(phase: 'alerta' | 'identificado'): GameState {
  let s = createInitialState({ content, difficulty: 'estrategica', seed: 4, modules: ['clima_detalhado', 'noticias'] });
  const outbreak = createOutbreak(s, diseaseOf(content, 'respiratorio_novo')!, content.scenario.regions!.ufs, 'SP', {
    r0: 1.87654,
    hospitalRate: 0.0234567,
    vaccineMonth: 17,
  });
  outbreak.phase = phase;
  outbreak.detectedMonth = 0;
  if (phase === 'identificado') outbreak.identifiedMonth = 0;
  s = { ...s, health: { ...s.health, outbreaks: [outbreak] } };
  for (let m = 0; m < 3; m++) s = advanceMonth(s, { decisions: [] }, content).state;
  return s;
}

describe('cartão de saúde (EX-26/EX-27)', () => {
  it('sem crise mostra capacidade por região e como investir', () => {
    const s = createInitialState({ content, difficulty: 'estrategica', seed: 1 });
    const view = healthView(s, content)!;
    expect(view.regions.map((r) => r.name)).toEqual(['Norte', 'Nordeste', 'Sudeste', 'Sul', 'Centro-Oeste']);
    expect(view.crises).toEqual([]);
    expect(view.howToInvest).toMatch(/diretriz anual do Ministério da Saúde/);
  });

  it('alerta sem agente: oferece investigar e não inventa estimativa', () => {
    const view = healthView(crisis('alerta'), content)!;
    const c = view.crises[0];
    expect(c.title).toMatch(/sem agente identificado/);
    expect(c.canInvestigate).toBe(true);
    expect(c.estimates.join(' ')).toMatch(/Sem agente identificado/);
    expect(c.measures.find((m) => m.id === 'vacinacao_em_massa')!.blocked).toBe('agente ainda não identificado');
  });

  it('identificado: separa boletim (notificado) de estimativa (faixa), sem vazar a verdade do surto', () => {
    const s = crisis('identificado');
    const snapshot = JSON.stringify(s);
    const first = JSON.stringify([healthView(s, content), pressView(s, content)]);
    const second = JSON.stringify([healthView(s, content), pressView(s, content)]);
    // Abrir as telas não muda o estado nem sorteia nada.
    expect(first).toEqual(second);
    expect(JSON.stringify(s)).toEqual(snapshot);
    // Nem o R0 nem a internação verdadeiros aparecem; a vacina só aparece como janela estimada.
    expect(first).not.toMatch(/1,88|1,87|2,35%|2,34%/);
    const c = healthView(s, content)!.crises[0];
    expect(c.observed[0]).toMatch(/preliminar/);
    expect(c.estimates[0]).toMatch(/transmite a \d+,\d–\d+,\d outras/);
    expect(c.estimates.join(' ')).toMatch(/Vacina: os laboratórios preveem/);
  });
});

describe('cartão de imprensa (EX-28)', () => {
  it('rumor em circulação aparece como não verificado, sem revelar se é verdadeiro', () => {
    const s = crisis('identificado');
    const item: PressItem = {
      id: 'imprensa:x',
      month: 2,
      outletId: 'corrente_zap',
      category: 'rumor',
      headline: 'Teste',
      stance: -0.5,
      rumorId: 'cura_caseira',
      truthful: false,
      status: 'circulando',
      resolveMonth: 9,
      circulation: 1,
    };
    const view = pressView({ ...s, press: { ...s.press, items: [item] } }, content)!;
    expect(view.items[0].badge).toBe('Rumor não verificado');
    expect(view.items[0].canRespond).toBe(true);
    const checked = pressView({ ...s, press: { ...s.press, items: [{ ...item, status: 'desmentido' }] } }, content)!;
    expect(checked.items[0].badge).toBe('Falso (desinformação)');
    expect(checked.items[0].canRespond).toBe(false);
  });

  it('a leitura de manchete por um veículo é determinística e marcada como interpretação', () => {
    const s = crisis('identificado');
    const withNews: GameState = {
      ...s,
      events: {
        ...s.events,
        news: [
          {
            id: '2_0',
            monthIndex: 2,
            kind: 'economia',
            tone: 'negativa',
            headline: 'Inflação sobe',
            cause: 'Causa: x',
          },
        ],
      },
    };
    expect(newsReading(withNews, content)).toEqual(newsReading(withNews, content));
    expect(newsReading(withNews, content)).toMatch(/Interpretação de um veículo/);
    expect(pressView(withNews, content)!.tones.find((t) => t.current)!.tone).toBe('rotina');
  });
});
