import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent, POLICIES } from '@/content';
import {
  VISIT_ACTION_ID,
  type EventLocation,
  type NewsItem,
  type PendingEvent,
  type ProjectPhase,
  type PublicProject,
} from '@/engine';
import { UF_IDS } from '@/types/regions';

import {
  MARKER_CRITICAL_SEVERITY,
  buildMarkerItems,
  compareItems,
  groupMarkers,
  itemLabel,
  markerLabel,
  markerPulseKey,
  newCriticalInstances,
  nextMarkerItem,
  opensStateCard,
  type MarkerItem,
} from './markersView';

// PLANO_GLOBO.md §7, PR 11: marcadores de eventos e notícias, agrupados por UF, com crítico e "novo crítico".

const content = loadContent(DEFAULT_SCENARIO_ID);
const SECA = 'seca_safra_energia_v2';
const CHEIA = 'enchentes_metropole_v2';
const NACIONAL = 'alta_petroleo';

const where = (primary: string, severity: number, extra: string[] = []): EventLocation => ({
  affectedUfs: [primary, ...extra],
  primaryUf: primary,
  severityByUf: { [primary]: severity },
});

const pending = (eventId: string, month: number, location?: EventLocation): PendingEvent => ({
  eventId,
  monthIndex: month,
  instanceId: `${eventId}#${month}`,
  ...(location ? { location } : {}),
});

const news = (id: string, monthIndex: number, extra: Partial<NewsItem> = {}): NewsItem => ({
  id,
  monthIndex,
  kind: 'evento',
  tone: 'negativa',
  headline: `Manchete ${id}`,
  cause: 'Causa: teste.',
  ...extra,
});

const state = (monthIndex: number, pend: PendingEvent[], feed: NewsItem[] = []) => ({
  monthIndex,
  events: { pending: pend, news: feed },
});

const item = (over: Partial<MarkerItem>): MarkerItem => ({
  id: 'evento:x#1',
  kind: 'event',
  sigla: 'CE',
  critical: false,
  severity: 0.3,
  title: 'T',
  instanceId: 'x#1',
  ...over,
});

describe('buildMarkerItems', () => {
  it('evento com local vira um item na UF principal, com título já preenchido e severidade da UF', () => {
    const items = buildMarkerItems(state(5, [pending(SECA, 5, where('CE', 0.8, ['PI']))]), content);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: `evento:${SECA}#5`,
      kind: 'event',
      sigla: 'CE',
      severity: 0.8,
      critical: true,
      instanceId: `${SECA}#5`,
    });
    expect(items[0].title).toBe('Estiagem severa castiga lavouras e reservatórios');
  });

  it('a UF é a principal ou, sem ela, a primeira atingida; UF desconhecida não vira marcador', () => {
    const noPrimary: EventLocation = { affectedUfs: ['PI', 'CE'] };
    const strange: EventLocation = { affectedUfs: ['XX'] };
    const items = buildMarkerItems(state(5, [pending(SECA, 5, noPrimary), pending(CHEIA, 5, strange)]), content);
    expect(items.map((i) => i.sigla)).toEqual(['PI']);
  });

  it('evento nacional (sem local) não tem marcador: continua só na caixa de entrada', () => {
    expect(buildMarkerItems(state(5, [pending(NACIONAL, 5)]), content)).toEqual([]);
  });

  it('pendência de evento que sumiu do conteúdo cai fora, como na caixa de entrada', () => {
    expect(buildMarkerItems(state(5, [pending('evento_que_sumiu', 5, where('CE', 0.9))]), content)).toEqual([]);
  });

  it('crítico = severidade da UF no limite ou acima; sem severidade gravada nunca é crítico', () => {
    const at = (s: number) => buildMarkerItems(state(5, [pending(CHEIA, 5, where('SP', s))]), content)[0];
    expect(at(MARKER_CRITICAL_SEVERITY).critical).toBe(true);
    expect(at(MARKER_CRITICAL_SEVERITY - 0.01).critical).toBe(false);
    const noSeverity: EventLocation = { affectedUfs: ['SP'], primaryUf: 'SP' };
    const [chained] = buildMarkerItems(state(5, [pending(CHEIA, 5, noSeverity)]), content);
    expect(chained).toMatchObject({ critical: false, severity: 0 });
  });

  it('notícia do último mês processado com local vira item; de outro mês ou sem local, não', () => {
    const feed = [
      news('4_0', 4, { location: where('RS', 0.4) }),
      news('4_1', 4),
      news('3_0', 3, { location: where('RS', 0.4) }),
    ];
    const items = buildMarkerItems(state(5, [], feed), content);
    expect(items.map((i) => i.id)).toEqual(['noticia:4_0']);
    expect(items[0]).toMatchObject({ kind: 'news', critical: false, newsId: '4_0', sigla: 'RS' });
  });

  it('notícia de um evento ainda pendente é omitida: o marcador do evento já leva ao mesmo assunto', () => {
    const location = where('CE', 0.8);
    const feed = [
      news('4_0', 4, { location, instanceId: `${SECA}#4` }),
      news('4_1', 4, { location, instanceId: `${CHEIA}#3` }),
    ];
    const items = buildMarkerItems(state(5, [pending(SECA, 4, location)], feed), content);
    expect(items.map((i) => i.id)).toEqual([`evento:${SECA}#4`, 'noticia:4_1']);
  });

  it('no mês zero não há notícia de mês anterior', () => {
    expect(buildMarkerItems(state(0, [], [news('0_0', 0, { location: where('CE', 0.5) })]), content)).toEqual([]);
  });
});

describe('groupMarkers', () => {
  it('um marcador por UF, na ordem de UF_IDS, com a contagem de itens', () => {
    const items = [
      item({ id: 'a', sigla: 'SP' }),
      item({ id: 'b', sigla: 'AC', kind: 'news', instanceId: undefined, newsId: 'n' }),
      item({ id: 'c', sigla: 'SP', severity: 0.5 }),
    ];
    const markers = groupMarkers(items);
    expect(markers.map((m) => m.sigla)).toEqual(['AC', 'SP']);
    expect(markers.map((m) => m.id)).toEqual(['marker:AC', 'marker:SP']);
    expect(markers.map((m) => m.count)).toEqual([1, 2]);
    expect(UF_IDS.indexOf('AC')).toBeLessThan(UF_IDS.indexOf('SP'));
  });

  it('é determinístico: a ordem de entrada não muda marcadores nem itens', () => {
    const items = [
      item({ id: 'evento:a#1', severity: 0.2 }),
      item({ id: 'evento:b#1', severity: 0.9, critical: true }),
      item({ id: 'noticia:1', kind: 'news', severity: 1, instanceId: undefined, newsId: '1' }),
      item({ id: 'evento:c#1', severity: 0.2 }),
    ];
    const forward = groupMarkers(items);
    expect(groupMarkers([...items].reverse())).toEqual(forward);
  });

  it('dentro do grupo: crítico, depois evento antes de notícia, depois maior severidade, depois id', () => {
    const items = [
      item({ id: 'noticia:1', kind: 'news', severity: 1, instanceId: undefined, newsId: '1' }),
      item({ id: 'evento:z', severity: 0.2 }),
      item({ id: 'evento:a', severity: 0.2 }),
      item({ id: 'evento:crit', severity: 0.65, critical: true }),
      item({ id: 'evento:forte', severity: 0.55 }),
    ];
    expect(groupMarkers(items)[0].items.map((i) => i.id)).toEqual([
      'evento:crit',
      'evento:forte',
      'evento:a',
      'evento:z',
      'noticia:1',
    ]);
    expect(items.map((i) => compareItems(i, i))).toEqual([0, 0, 0, 0, 0]);
  });

  it('o crítico manda no marcador do grupo; evento manda sobre notícia no tipo', () => {
    const [mixed] = groupMarkers([
      item({ id: 'evento:a', critical: true, severity: 0.9 }),
      item({ id: 'noticia:1', kind: 'news', instanceId: undefined, newsId: '1' }),
    ]);
    expect(mixed).toMatchObject({ kind: 'event', critical: true, count: 2 });
    const [onlyNews] = groupMarkers([item({ id: 'noticia:1', kind: 'news', instanceId: undefined, newsId: '1' })]);
    expect(onlyNews).toMatchObject({ kind: 'news', critical: false, count: 1 });
  });

  it('o rótulo de acessibilidade é em português e diz tipo, título e UF; em grupo, o número de itens', () => {
    const [one] = groupMarkers([item({ title: 'Seca no Nordeste', critical: true, severity: 0.9 })]);
    expect(one.label).toBe('Evento crítico: Seca no Nordeste, CE');
    expect(itemLabel(item({ title: 'Cheia' }))).toBe('Evento: Cheia, CE');
    expect(itemLabel(item({ kind: 'news', title: 'Manchete' }))).toBe('Notícia: Manchete, CE');
    const [group] = groupMarkers([
      item({ id: 'a', title: 'Seca no Nordeste', critical: true, severity: 0.9 }),
      item({ id: 'b', title: 'Cheia' }),
    ]);
    expect(group.label).toBe('2 itens em CE, o primeiro: Evento crítico: Seca no Nordeste, CE');
    expect(markerLabel(group.items)).toBe(group.label);
  });
});

describe('novo crítico e pulso', () => {
  const crit = (id: string) => item({ id: `evento:${id}`, instanceId: id, critical: true, severity: 0.9 });
  const calm = item({ id: 'evento:calmo#1', instanceId: 'calmo#1', severity: 0.2 });

  it('só evento crítico cuja instância a sessão ainda não viu é novo', () => {
    const items = [crit('a#1'), crit('b#2'), calm];
    expect(newCriticalInstances(items, new Set())).toEqual(['a#1', 'b#2']);
    expect(newCriticalInstances(items, new Set(['a#1']))).toEqual(['b#2']);
    expect(newCriticalInstances(items, new Set(['a#1', 'b#2']))).toEqual([]);
  });

  it('notícia nunca pulsa, e o pulso é só do marcador cujo item está em `pulsing`', () => {
    const feed = item({ id: 'noticia:1', kind: 'news', instanceId: undefined, newsId: '1', sigla: 'RS' });
    const markers = groupMarkers([crit('a#1'), calm, feed, { ...crit('b#2'), sigla: 'PA' }], new Set(['a#1']));
    expect(Object.fromEntries(markers.map((m) => [m.sigla, m.pulse]))).toEqual({ CE: true, PA: false, RS: false });
    // evento calmo, mesmo "visto", não pulsa
    expect(groupMarkers([calm], new Set(['calmo#1']))[0].pulse).toBe(false);
  });

  it('a chave do pulso é vazia sem pulso e muda quando entra outro crítico na mesma UF', () => {
    expect(markerPulseKey(groupMarkers([crit('a#1')]))).toBe('');
    const one = markerPulseKey(groupMarkers([crit('a#1')], new Set(['a#1'])));
    const two = markerPulseKey(groupMarkers([crit('a#1'), crit('b#2')], new Set(['a#1', 'b#2'])));
    expect(one).toBe('a#1');
    expect(two).toBe('a#1|b#2');
    expect(one).not.toBe(two);
  });
});

describe('nextMarkerItem', () => {
  const [marker] = groupMarkers([
    item({ id: 'evento:a', critical: true, severity: 0.9 }),
    item({ id: 'evento:b', severity: 0.4 }),
    item({ id: 'noticia:1', kind: 'news', instanceId: undefined, newsId: '1' }),
  ]);

  it('o primeiro toque abre o item mais importante (crítico primeiro)', () => {
    expect(nextMarkerItem(marker).id).toBe('evento:a');
  });

  it('tocar de novo percorre o grupo e volta ao primeiro', () => {
    expect(nextMarkerItem(marker, 'evento:a').id).toBe('evento:b');
    expect(nextMarkerItem(marker, 'evento:b').id).toBe('noticia:1');
    expect(nextMarkerItem(marker, 'noticia:1').id).toBe('evento:a');
  });

  it('um item que saiu do grupo vale como primeiro toque; grupo de um item sempre abre o mesmo', () => {
    expect(nextMarkerItem(marker, 'evento:sumiu').id).toBe('evento:a');
    const [single] = groupMarkers([item({ id: 'evento:z' })]);
    expect(nextMarkerItem(single, 'evento:z').id).toBe('evento:z');
  });
});

// PLANO_GLOBO.md §7, PR 13: pins de visitas presidenciais e de obras (só com UF no conteúdo, nunca coordenadas).

describe('visitas presidenciais no mapa (PR 13)', () => {
  const visit = (monthIndex: number, uf: string) => ({
    monthIndex,
    decision: { policyId: VISIT_ACTION_ID, agendaCost: 1, params: { uf } },
  });
  const window = content.calibration.meses_visita;

  it('a UF visitada ganha um item enquanto o efeito local dura (meses_visita) e depois some', () => {
    const at = (monthIndex: number) =>
      buildMarkerItems({ ...state(monthIndex, []), decisionLog: [visit(10, 'CE')] }, content).filter(
        (i) => i.kind === 'visit',
      );
    // A visita do próprio mês ainda não foi processada (o rascunho não vira pin); do mês seguinte em diante vale.
    expect(at(10)).toEqual([]);
    expect(at(11)).toHaveLength(1);
    expect(at(11)[0]).toMatchObject({ id: 'visita:CE:10', kind: 'visit', sigla: 'CE', critical: false, severity: 0 });
    expect(at(11)[0].title).toBe('Visita presidencial a Ceará, no mês passado');
    expect(at(12)[0].title).toBe('Visita presidencial a Ceará, há 2 meses');
    expect(at(10 + window - 1)).toHaveLength(1);
    expect(at(10 + window)).toEqual([]);
  });

  it('só a visita mais recente por UF vale; outras ações de agenda e UFs diferentes não se misturam', () => {
    const log = [
      visit(10, 'CE'),
      visit(11, 'CE'),
      visit(11, 'SP'),
      { monthIndex: 11, decision: { policyId: 'pressionar_banco_central', agendaCost: 1 } },
    ];
    const items = buildMarkerItems({ ...state(12, []), decisionLog: log }, content);
    expect(items.map((i) => i.id)).toEqual(['visita:CE:11', 'visita:SP:11']);
  });

  it('sem registro, sem calibração ou sem UFs no cenário, nenhum item de visita', () => {
    expect(buildMarkerItems(state(12, []), content)).toEqual([]);
    const { calibration: _calibration, ...bare } = content;
    void _calibration;
    expect(buildMarkerItems({ ...state(12, []), decisionLog: [visit(11, 'CE')] }, bare)).toEqual([]);
  });

  it('o marcador de uma UF só com visita tem o glifo da visita, não é crítico e não pulsa', () => {
    const items = buildMarkerItems({ ...state(12, []), decisionLog: [visit(11, 'CE')] }, content);
    const [marker] = groupMarkers(items, new Set(['qualquer#1']));
    expect(marker).toMatchObject({ sigla: 'CE', kind: 'visit', critical: false, pulse: false, count: 1 });
    expect(marker.label).toBe('Visita: Visita presidencial a Ceará, no mês passado, CE');
    expect(opensStateCard(marker.items[0])).toBe(true);
    expect(markerPulseKey([marker])).toBe('');
  });
});

describe('obras no mapa (PR 13): só com UF citada pelo conteúdo', () => {
  const project = (policyId: string, phase: ProjectPhase, progress = 0): PublicProject => ({
    proposalId: `${policyId}_0`,
    policyId,
    phase,
    phaseMonth: 0,
    progress,
    budgetMillions: 1,
    spentMillions: 0,
    assetMillions: 0,
    maintenanceMillions: 0,
    delayMonths: 0,
    startMonth: 0,
  });
  const withProjects = (...projects: PublicProject[]) => ({
    ...state(30, []),
    publicPolicies: { projects },
  });

  it('o projeto de segurança hídrica vira um item em cada UF do semiárido citada no escopo, e nenhum fora dela', () => {
    const items = buildMarkerItems(withProjects(project('projeto_seguranca_hidrica', 'obra', 0.45)), content);
    const semiarid = POLICIES.projeto_seguranca_hidrica.regional!.scope;
    // Na ordem de UF_IDS não: na ordem do escopo do conteúdo (a de `projectUfs`).
    expect(items.map((i) => i.sigla)).toEqual(semiarid);
    expect(items.every((i) => i.kind === 'work' && !i.critical)).toBe(true);
    expect(items[0]).toMatchObject({ id: 'obra:projeto_seguranca_hidrica_0:PI' });
    expect(items[0].title).toBe('Segurança hídrica do semiárido, em obra, 45%');
    expect(items.some((i) => i.sigla === 'RS' || i.sigla === 'SP')).toBe(false);
  });

  it('projeto nacional (escopo vazio) ou de macrorregião não tem pin; fases antes da obra entram, operação e cancelado não', () => {
    expect(buildMarkerItems(withProjects(project('projeto_drenagem_contencao', 'obra', 0.2)), content)).toEqual([]);
    expect(buildMarkerItems(withProjects(project('projeto_hospitais_regionais', 'obra', 0.2)), content)).toEqual([]);
    const phases = ['planejamento', 'licenciamento', 'licitacao', 'obra'] as const;
    for (const phase of phases) {
      expect(buildMarkerItems(withProjects(project('projeto_seguranca_hidrica', phase)), content), phase).toHaveLength(
        9,
      );
    }
    expect(buildMarkerItems(withProjects(project('projeto_seguranca_hidrica', 'operacao', 1)), content)).toEqual([]);
    expect(buildMarkerItems(withProjects(project('projeto_seguranca_hidrica', 'cancelado')), content)).toEqual([]);
  });

  it('projeto cuja política sumiu do conteúdo é ignorado; sem carteira no estado, nenhum item', () => {
    expect(buildMarkerItems(withProjects(project('politica_inexistente', 'obra')), content)).toEqual([]);
    expect(buildMarkerItems(state(30, []), content)).toEqual([]);
  });

  it('obra e evento na mesma UF viram um marcador de dois itens: evento primeiro, depois a obra', () => {
    const base = withProjects(project('projeto_seguranca_hidrica', 'obra', 0.1));
    const items = buildMarkerItems(
      { ...base, events: { pending: [pending(SECA, 30, where('CE', 0.8))], news: [] } },
      content,
    );
    const ce = groupMarkers(items).find((m) => m.sigla === 'CE')!;
    expect(ce).toMatchObject({ kind: 'event', critical: true, count: 2 });
    expect(ce.items.map((i) => i.kind)).toEqual(['event', 'work']);
    // As demais UFs do semiárido ficam com o glifo de obra.
    expect(groupMarkers(items).find((m) => m.sigla === 'PI')).toMatchObject({ kind: 'work', count: 1 });
    expect(nextMarkerItem(ce, ce.items[0].id).kind).toBe('work');
  });

  it('nenhum item carrega coordenadas: só a sigla de uma UF do cenário', () => {
    const items = buildMarkerItems(withProjects(project('projeto_seguranca_hidrica', 'obra', 0.3)), content);
    const known = new Set(UF_IDS as readonly string[]);
    for (const i of items) {
      expect(known.has(i.sigla)).toBe(true);
      expect(Object.keys(i).sort()).toEqual(['critical', 'id', 'kind', 'severity', 'sigla', 'title']);
    }
  });
});
