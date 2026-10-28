/**
 * Matriz completa de configuração da campanha (PLANO_EXPANSAO_BRASIL_SIMULATOR.md, R1):
 * dificuldade `casual|estrategica|realismo` × regras institucionais × clareza da informação ×
 * dicas × situação inicial = 108 combinacoes.
 *
 * Critério de saída da R1: a configuração completa vive em `GameState.initialCampaignConfiguration`
 * e sobrevive a save/replay; cada Combinacao tem que produzir um estado inicial idêntico para a
 * mesma semente (determinismo), respeitar os efeitos causais documentados em `campaignConfig.ts`
 * ((`START_SITUATIONS`, `INFORMATION_NOISE`, `usesFormalRules`)) e rodar um mês sem violar
 * nenhuma invariante do ECONOMIC_MODEL.md §7.
 *
 * Custo: 1 mês por Combinacao — a regressão de longo prazo (48/96/240 meses) vive em
 * `replayDeterminism.test.ts`; aqui só saneamento rápido.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';

import { advanceMonth } from './advanceMonth';
import {
  INFORMATION_NOISE,
  START_SITUATIONS,
  campaignConfigSchema,
  usesFormalRules,
  type InstitutionalRules,
  type StartSituationId,
} from './campaignConfig';
import { tallyCareer } from './career/polls';
import { checkInvariants } from './invariants';
import { createInitialState } from './state';
import type { Difficulty, GameState } from './types';

const content = loadContent(DEFAULT_SCENARIO_ID);
const SEED = 31;
const SEED_OUTRA = 4242;

const DIFICULDADES = ['casual', 'estrategica', 'realismo'] as const;
const REGRAS = ['brasileiras', 'simplificadas'] as const;
const CLAREZAS = ['clara', 'padrao', 'incerta'] as const;
const SITUACOES = ['normal', 'pressao_externa', 'desaceleracao'] as const;

interface Combinacao {
  difficulty: Difficulty;
  institutionalRules: InstitutionalRules;
  informationClarity: 'clara' | 'padrao' | 'incerta';
  hints: boolean;
  startSituationId: StartSituationId;
}

/** As 108 combinacoes válidas do NOVO JOGO (3×2×3×2×3), na ordem fixa para o relatório ser estável. */
function combinacoes(): Combinacao[] {
  const lista: Combinacao[] = [];
  for (const difficulty of DIFICULDADES)
    for (const institutionalRules of REGRAS)
      for (const informationClarity of CLAREZAS)
        for (const hints of [true, false])
          for (const startSituationId of SITUACOES)
            lista.push({ difficulty, institutionalRules, informationClarity, hints, startSituationId });
  return lista;
}

/** Campanha nova com todos os eixos da matriz fixados na entrada. */
function construir(c: Combinacao, seed: number = SEED): GameState {
  return createInitialState({
    content,
    seed,
    difficulty: c.difficulty,
    startSituationId: c.startSituationId,
    institutionalRules: c.institutionalRules,
    assistance: { informationClarity: c.informationClarity, hints: c.hints },
  });
}

/** Etiqueta legível para a mensagem de falha dizer exatamente qual Combinacao quebrou. */
const rotulo = (c: Combinacao) =>
  `dificuldade=${c.difficulty} regras=${c.institutionalRules} clareza=${c.informationClarity} dicas=${c.hints}` +
  ` situação=${c.startSituationId}`;

/** Estado sem a configuração inicial: o que um ajuste de assistência/regras **não** pode tocar. */
function semConfiguracao(s: GameState): Omit<GameState, 'initialCampaignConfiguration'> {
  const { initialCampaignConfiguration: _c, ...resto } = s;
  return resto;
}

/** Estado sem a pesquisa publicada e sem a configuração: o eleitorado real que a assistência não vê. */
function semPublicado(s: GameState): Omit<GameState, 'initialCampaignConfiguration'> {
  const resto = semConfiguracao(s);
  return { ...resto, career: resto.career ? { ...resto.career, poll: undefined } : undefined };
}

describe('matriz de configuração da campanha (3×2×3×2×3 = 108 combinacoes)', () => {
  it('cobre as 108 combinacoes exatamente uma vez', () => {
    expect(combinacoes()).toHaveLength(108);
    // Chave composta: nenhuma repetição, nenhum furo na matriz.
    const chaves = new Set(
      combinacoes().map(
        (c) => `${c.difficulty}|${c.institutionalRules}|` + `${c.informationClarity}|${c.hints}|${c.startSituationId}`,
      ),
    );
    expect(chaves.size).toBe(108);
  });

  // Dividido por dificuldade para cada `it` ficar sob ~1,5 s de trabalho real nesta máquina.
  describe.each(DIFICULDADES)('dificuldade %s', (difficulty) => {
    const bloco = combinacoes().filter((c) => c.difficulty === difficulty);

    it('a configuração escolhida chega gravada ao estado e sobrevive a um round-trip de JSON', () => {
      for (const c of bloco) {
        const config = construir(c).initialCampaignConfiguration;
        // Cada eixo da matriz precisa constar no save: perdê-lo ao retomar mudaria o jogo silenciosamente.
        // A versão do contrato (v2) vem do próprio esquema, não de número fixo aqui: o parse é quem a valida.
        expect(config).toMatchObject({
          difficulty: c.difficulty,
          institutionalRules: c.institutionalRules,
          assistance: { informationClarity: c.informationClarity, hints: c.hints },
          startSituationId: c.startSituationId,
        });
        // Save/replay: o JSON gravado no banco tem que reconstruir a configuração identicamente.
        const revivida = campaignConfigSchema.parse(JSON.parse(JSON.stringify(config)));
        expect(revivida).toEqual(config);
      }
    });

    it('mesma configuração e semente geram estados idênticos; semente diferente troca o PRNG', () => {
      for (const c of bloco) {
        const a = construir(c);
        const b = construir(c);
        // Fonte da verdade da R1: sem Math.random nem relógio na criação, duas passagens iguais.
        expect(b, rotulo(c)).toEqual(a);
        const outra = construir(c, SEED_OUTRA);
        // A semente é o número que separa campanhas: o PRNG tem que divergir em cada Combinacao.
        expect(outra.rng, rotulo(c)).not.toEqual(a.rng);
        expect(outra.seed, rotulo(c)).not.toEqual(a.seed);
      }
    });

    it('um mês rodado com o pipeline inteiro não viola nenhuma invariante (ECONOMIC_MODEL.md §7)', () => {
      for (const c of bloco) {
        const state = construir(c);
        const result = advanceMonth(state, { decisions: [] }, content);
        // Saneamento barato de todas as 108 combinacoes: 1 mês basta; a longa regressão é outro suite.
        expect(checkInvariants(state, result.state, result.report, content), rotulo(c)).toEqual([]);
      }
    });
  });

  describe('efeitos causais documentados das situações iniciais', () => {
    // Assistência nas margens, desafio no preset: quem varia em cada teste é só a situação.
    const base = (difficulty: Difficulty, startSituationId: StartSituationId): Combinacao => ({
      difficulty,
      institutionalRules: 'brasileiras',
      informationClarity: 'padrao',
      hints: true,
      startSituationId,
    });

    it('pressao_externa começa com o prêmio de risco do cenário mais o delta documentado — em toda dificuldade', () => {
      for (const difficulty of DIFICULDADES) {
        const normal = construir(base(difficulty, 'normal'));
        const pressao = construir(base(difficulty, 'pressao_externa'));
        const deltas = START_SITUATIONS.find((s) => s.id === 'pressao_externa')!;
        // O anúncio do NOVO JOGO promete +0,5 p.p.: o estado não pode divergir do que foi oferecido.
        expect(pressao.economy.riskPremium).toBeCloseTo(normal.economy.riskPremium + deltas.riskDelta, 12);
        // A vantagem existe também depois do primeiro mês (não é só um valor inicial decorativo).
        const normalSeguinte = advanceMonth(normal, { decisions: [] }, content).state;
        const pressaoSeguinte = advanceMonth(pressao, { decisions: [] }, content).state;
        expect(pressaoSeguinte.economy.riskPremium).toBeGreaterThan(normalSeguinte.economy.riskPremium);
      }
    });

    it('desaceleracao começa com o hiato do produto um ponto menor — em toda dificuldade', () => {
      for (const difficulty of DIFICULDADES) {
        const normal = construir(base(difficulty, 'normal'));
        const desaceleracao = construir(base(difficulty, 'desaceleracao'));
        const deltas = START_SITUATIONS.find((s) => s.id === 'desaceleracao')!;
        expect(desaceleracao.economy.outputGap).toBeCloseTo(normal.economy.outputGap + deltas.gapDelta, 12);
        const normalSeguinte = advanceMonth(normal, { decisions: [] }, content).state;
        const desaceleracaoSeguinte = advanceMonth(desaceleracao, { decisions: [] }, content).state;
        expect(desaceleracaoSeguinte.economy.outputGap).toBeLessThan(normalSeguinte.economy.outputGap);
      }
    });
  });

  describe('regras institucionais são ficção', () => {
    it('simplificadas não muda o preset de dificuldade nem os dados reais; só troca usesFormalRules', () => {
      for (const difficulty of DIFICULDADES) {
        for (const startSituationId of SITUACOES) {
          const c: Combinacao = {
            difficulty,
            institutionalRules: 'brasileiras',
            informationClarity: 'padrao',
            hints: true,
            startSituationId,
          };
          const formais = construir(c);
          const simplificadas = construir({ ...c, institutionalRules: 'simplificadas' });
          // A blessed marca da ficção: cada régua institucional é reconhecível por quem consulta.
          expect(usesFormalRules(formais)).toBe(true);
          expect(usesFormalRules(simplificadas)).toBe(false);
          // Ficção não vira desafio: preset e controles do desafio não podem ter sido mexidos.
          expect(simplificadas.initialCampaignConfiguration.presetId).toBe(
            formais.initialCampaignConfiguration.presetId,
          );
          expect(simplificadas.initialCampaignConfiguration.challenge).toEqual(
            formais.initialCampaignConfiguration.challenge,
          );
          // Economia, Congresso, eleitorado, PRNG e restante do estado continuam idênticos.
          expect(semConfiguracao(simplificadas), rotulo(c)).toEqual(semConfiguracao(formais));
        }
      }
    });
  });

  describe('assistência muda só o que é publicado', () => {
    it('clara vs incerta: mesmo PRNG e mesma partição real; margem/ruído publicados escalam com INFORMATION_NOISE', () => {
      for (const difficulty of DIFICULDADES) {
        const clara = advanceMonth(
          createInitialState({
            content,
            seed: SEED,
            difficulty,
            startPoint: 'corrida',
            startSituationId: 'normal',
            institutionalRules: 'brasileiras',
            assistance: { informationClarity: 'clara', hints: true },
          }),
          { decisions: [] },
          content,
        );
        const incerta = advanceMonth(
          createInitialState({
            content,
            seed: SEED,
            difficulty,
            startPoint: 'corrida',
            startSituationId: 'normal',
            institutionalRules: 'brasileiras',
            assistance: { informationClarity: 'incerta', hints: true },
          }),
          { decisions: [] },
          content,
        );
        // Antes da posse há carreira e, portanto, pesquisa publicada (o estado real fica embaixo dela).
        expect(clara.state.career?.poll).toBeDefined();
        expect(incerta.state.career?.poll).toBeDefined();
        // 1) O fluxo do motor é o mesmo: a clareza não consome nem desloca o PRNG principal.
        expect(incerta.state.rng, `dificuldade=${difficulty}`).toEqual(clara.state.rng);
        // 2) O eleitorado real (partição "se a eleição fosse hoje") não pode mudar com a clareza.
        expect(tallyCareer(incerta.state.career!, content, 'pesquisa'), `dificuldade=${difficulty}`).toEqual(
          tallyCareer(clara.state.career!, content, 'pesquisa'),
        );
        expect(incerta.state.career!.recognition).toEqual(clara.state.career!.recognition);
        // 3) Só o publicado se move: margem e precisão escalam com clareza (0,5× vs 1,5×).
        expect(incerta.state.career!.poll!.margin).toBeGreaterThan(clara.state.career!.poll!.margin);
        expect(incerta.state.career!.poll!.margin / clara.state.career!.poll!.margin).toBeCloseTo(
          INFORMATION_NOISE.incerta / INFORMATION_NOISE.clara,
          12,
        );
        // 4) E todo o restante do estado é igual: nenhuma consequência oculta da "claridade".
        expect(semPublicado(incerta.state), `dificuldade=${difficulty}`).toEqual(semPublicado(clara.state));
      }
    });

    it('hints liga/desliga apenas o tutorial da interface: nenhum dado real ou sorteio muda', () => {
      for (const difficulty of DIFICULDADES) {
        for (const institutionalRules of REGRAS) {
          for (const startSituationId of SITUACOES) {
            const c: Combinacao = {
              difficulty,
              institutionalRules,
              informationClarity: 'padrao',
              hints: true,
              startSituationId,
            };
            const com = construir(c);
            const sem = construir({ ...c, hints: false });
            // O estado do motor não enxerga o parâmetro; quem usa `hints` é a interface (cartão do tutorial).
            expect(semConfiguracao(sem), rotulo(c)).toEqual(semConfiguracao(com));
            // A configuração gravada carrega a escolha para a interface recompor o tutorial ao retomar.
            expect(sem.initialCampaignConfiguration.assistance.hints).toBe(false);
          }
        }
      }
    });
  });
});
