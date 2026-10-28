/**
 * Contrato de save/replay (PLANO_EXPANSAO_BRASIL_SIMULATOR.md, R1 e §6.2):
 * a regressão de longo prazo — campanhas de 48 e 96 meses — com semente fixa.
 *
 * O caminho entre sessões é exatamente um: `JSON.parse(JSON.stringify(state))` no banco. O teste
 * reproduz isso no meio da campanha e exige que o final seja **igual** ao de uma partida direta
 * (mesma semente, sem `Math.random` nem relógio de parede no motor). Após a posse, os relatorios
 * mensais têm que coincidir também: cada linha de notícia/fato de cada mês tem causa registrada e
 * é derivada do estado, logo um replay fiel as repõe uma a uma.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { advanceMonth, DEFAULT_STEPS } from './advanceMonth';
import { currentPollView } from './career/polls';
import { checkInvariants } from './invariants';
import { createInitialState } from './state';
import { ENGINE_VERSION, STATE_SCHEMA_VERSION, type GameState, type MonthReport } from './types';

const content = loadContent(DEFAULT_SCENARIO_ID);
const SEED = 171;
const MESES_48 = 48;
const MESES_96 = 96;
const RETOMADA_48 = 24;
const RETOMADA_96 = 48;

/** Sequência fixa no lugar de Math.random: ids e sementes automáticos variam sem sorteio real. */
const fakeRandom = () => {
  let i = 0;
  return () => ((i++ * 0.37) % 1) + 0.01;
};

/** Campos no mínimo exigidos por §6.2; inclui tudo o que decide o futuro da partida. */
const CAMPOS_RELEVANTES = [
  'schemaVersion',
  'engineVersion',
  'difficulty',
  'seed',
  'initialCampaignConfiguration',
  'rng',
  'monthIndex',
  'indicators',
  'resources',
  'economy',
  'career',
  'congress',
  'proposals',
  'publicPolicies',
  'events',
  'society',
  'government',
  'climate',
  'regions',
  'impulses',
  'court',
  'cases',
  'impeachmentDrawer',
] as const;

/** Recorte só dos campos relevantes: a igualdade exata exige menos que o estado completo. */
function relevantes(state: GameState): Record<string, unknown> {
  return Object.fromEntries(CAMPOS_RELEVANTES.filter((campo) => campo in state).map((campo) => [campo, state[campo]]));
}

/** Campanha nova na posse (a partida de sempre, PLANO_CAMPANHA.md Fase C1), sem tocar outros eixos. */
function partida(seed: number = SEED, startPoint?: 'corrida'): GameState {
  return createInitialState({
    content,
    seed,
    difficulty: 'estrategica',
    ...(startPoint ? { startPoint } : {}),
  });
}

/**
 * "Save" exatamente como o banco grava: JSON ida-e-volta. É o único transporte entre sessões;
 * se algo do estado não sobreviver a ele, a retomada não reproduz o jogo.
 */
function reviver(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/**
 * Joga `meses` turnos sem decisões, conferindo invariante (ECONOMIC_MODEL.md §7) a cada mês. Devolve o estado
 * após **cada** mês (fotografias para comparar com a partida retomada) e o relatório de cada mês.
 */
function jogar(inicio: GameState, meses: number): { estados: GameState[]; relatorios: MonthReport[] } {
  let state = inicio;
  const estados: GameState[] = [];
  const relatorios: MonthReport[] = [];
  for (let i = 0; i < meses; i++) {
    const result = advanceMonth(state, { decisions: [] }, content, DEFAULT_STEPS);
    // A campanha longa é saudável, não só reproduzível: nenhum mês pode violar invariante.
    expect(
      checkInvariants(state, result.state, result.report, content),
      `mês ${state.monthIndex} (turno ${state.career?.turnIndex ?? 0})`,
    ).toEqual([]);
    state = result.state;
    estados.push(state);
    relatorios.push(result.report);
  }
  return { estados, relatorios };
}

/** Confere mês a mês que os estados de um trecho repetem os da partida direta. */
function conferirMeses(fragmento: GameState[], direta: GameState[], desde: number, mensagem: string) {
  fragmento.forEach((estado, i) => {
    expect(relevantes(estado), `${mensagem} (mês ${desde + i + 1})`).toEqual(relevantes(direta[desde + i]));
  });
}

describe('replay de campanha longa (save/replay com semente fixa)', () => {
  it('campanha de 48 meses: direta e retomada por save JSON no mês 24 chegam ao mesmo estado', () => {
    const direta = jogar(partida(), MESES_48);
    // Até a parada, a retomada é a mesma partida do começo, mês a mês.
    const ate24 = jogar(partida(), RETOMADA_48);
    conferirMeses(ate24.estados, direta.estados, 0, 'primeira metade ≠ direta');
    expect(ate24.relatorios).toEqual(direta.relatorios.slice(0, RETOMADA_48));
    // Retomada: o transporte entre sessões é a serialização JSON do save, nada mais.
    const final = jogar(reviver(ate24.estados[RETOMADA_48 - 1]), MESES_48 - RETOMADA_48);
    conferirMeses(final.estados, direta.estados, RETOMADA_48, 'retomada ≠ direta');
    // relatorios do segundo trecho: notícias, fatos e causas deles, mês a mês, têm que se reproduzir.
    expect(final.relatorios).toEqual(direta.relatorios.slice(RETOMADA_48));
  });

  it('campanha de 96 meses: direta e retomada por save JSON no mês 48 chegam ao mesmo estado', () => {
    const direta = jogar(partida(), MESES_96);
    const ate48 = jogar(partida(), RETOMADA_96);
    conferirMeses(ate48.estados, direta.estados, 0, 'primeira metade ≠ direta');
    const final = jogar(reviver(ate48.estados[RETOMADA_96 - 1]), MESES_96 - RETOMADA_96);
    // Dois mandatos, duas eleicoes gerais: a retomada têm que atravessá-las idêntica à direta.
    conferirMeses(final.estados, direta.estados, RETOMADA_96, 'retomada ≠ direta');
    expect(final.relatorios).toEqual(direta.relatorios.slice(RETOMADA_96));
    // A partida de 96 meses tem uma eleição geral por mandato; o resultado por UF aparece nos dois trechos.
    const eleicoes = direta.relatorios.filter((r) => r.electionResult).length;
    expect(eleicoes).toBeGreaterThanOrEqual(2);
  });

  it('mesma semente rodada duas vezes no mesmo processo dá o mesmo estado (independe do relógio)', () => {
    // Contraparte barata e explícita do teste anterior: sem save, só determinismo, lá e aqui de novo.
    const primeira = jogar(partida(), RETOMADA_48);
    const segunda = jogar(partida(), RETOMADA_48);
    conferirMeses(segunda.estados, primeira.estados, 0, 'reexecução ≠ primeira execução');
    expect(segunda.relatorios).toEqual(primeira.relatorios);
  });
});

describe('leituras de interface entre meses não perturbam o replay', () => {
  it('abrir a visao da pesquisa (currentPollView) em cada turno não muda o fluxo posterior do jogo', () => {
    // Com carreira ('corrida') a pesquisa publicada existe; a interface abre essa visao a cada tela.
    let comLeitura = partida(SEED, 'corrida');
    let semLeitura = partida(SEED, 'corrida');
    let leituras = 0;
    for (let i = 0; i < 6; i++) {
      // A leitura é pura, mas o contrato proíbe efeito colateral: se ela move o PRNG ou o estado,
      // o jogo muda só por causa de uma consulta — violação da R1.
      const visao = currentPollView(comLeitura, content);
      if (visao) leituras++;
      comLeitura = advanceMonth(comLeitura, { decisions: [] }, content, DEFAULT_STEPS).state;
      semLeitura = advanceMonth(semLeitura, { decisions: [] }, content, DEFAULT_STEPS).state;
    }
    // Sem leitura alguma a visao não existiria, exatamente como a interface consulta.
    expect(leituras).toBeGreaterThanOrEqual(1);
    expect(relevantes(comLeitura), 'consulta mudou o estado').toEqual(relevantes(semLeitura));
  });
});

describe('versões gravadas no estado (guarda de retomada)', () => {
  it('o estado grava STATE_SCHEMA_VERSION e ENGINE_VERSION, e ambos sobrevivem ao save JSON', () => {
    const state = partida();
    // A guarda da store compara essas strings com as do app carregado: têm que ser as vigentes.
    expect(state.schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(state.engineVersion).toBe(ENGINE_VERSION);
    expect(reviver(state).schemaVersion).toBe(STATE_SCHEMA_VERSION);
    expect(reviver(state).engineVersion).toBe(ENGINE_VERSION);
  });

  it('a guarda da store recusa a nova tentativa com save de motor mais novo e aceita com o atual', async () => {
    // O mesmo "aparelho" do gameStore.test: o banco sobrevive às reaberturas do app.
    const { openNodeDatabase } = await import('@/database/nodeDatabase');
    const { migrate } = await import('@/database/migrate');
    const { createGameStore } = await import('@/store/gameStore');
    const db = openNodeDatabase();
    await migrate(db);
    const keepOpen = { ...db, close: async () => {} };
    const store = createGameStore({ openDb: async () => keepOpen, random: fakeRandom() });
    await store.getState().init();

    // Nova tentativa (retryCareer) existe só para campanha eleitoral: começa na corrida.
    await store.getState().newCampaign({ name: 'Carreira', difficulty: 'estrategica', startPoint: 'corrida' });
    const active = store.getState().active!;
    expect(active.state.career).toBeDefined();

    // Chegada saudável: com a versão vigente a guarda deixa recriar a campanha.
    const ok = await store.getState().retryCareer('same');
    // O objeto inteiro vai na falha: se a guarda recusar sem motivo, o `error` aparece na saída.
    expect(ok, `guarda de retomada recusou save atual: ${ok.ok ? '' : `${JSON.stringify(ok)}`}`).toMatchObject({
      ok: true,
    });

    // Agora interceptada: simule um save gravado por uma versão futura do motor.
    store.getState().active!.state.engineVersion = '999.0.0';
    const recusada = await store.getState().retryCareer();
    // A store não pode tentar continuar um jogo que ela não sabe rodar.
    expect(recusada.ok).toBe(false);
    if (!recusada.ok) expect(recusada.error).toContain('Comece um novo jogo');
  });
});
