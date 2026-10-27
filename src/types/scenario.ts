import { z } from 'zod';

import { contentIdSchema, dataSeriesSchema, dataStatusSchema, dataValueSchema } from './data';
import { regionIdSchema, ufIdSchema } from './regions';

/**
 * Cenário inicial de campanha, gravado como JSON versionado em `src/data/scenarios/` (DATA_SOURCES.md §1).
 * Um cenário publicado nunca é alterado: atualização de dados = nova `version`.
 */

/** Cadeiras totais (POLITICAL_RULES.md §3: quóruns calculados sobre 513 deputados e 81 senadores). */
export const CHAMBER_SEATS = 513;
export const SENATE_SEATS = 81;

const unitInterval = z.number().min(0).max(1);
const axis = z.number().min(-1).max(1);

/** Bloco parlamentar fictício (decisão D1; POLITICAL_RULES.md §6.1). */
export const blocSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    chamberSeats: z.number().int().min(0),
    senateSeats: z.number().int().min(0),
    /** Econômico: −1 estado … 1 mercado. Social: −1 progressista … 1 conservador. */
    ideology: z.object({ economic: axis, social: axis }).strict(),
    cohesion: unitInterval,
    /** −100 … 100 */
    governmentRelation: z.number().min(-100).max(100),
    interests: z.array(contentIdSchema),
  })
  .strict();
export type Bloc = z.infer<typeof blocSchema>;

/** Indicadores iniciais em fração decimal; mesmas chaves de `Indicators` do motor (testado em schemas.test.ts). */
export const scenarioIndicatorsSchema = z
  .object({
    approval: dataValueSchema,
    gdpGrowth12m: dataValueSchema,
    inflation12m: dataValueSchema,
    unemployment: dataValueSchema,
    primaryBalance12m: dataValueSchema,
  })
  .strict();

/**
 * Estado econômico inicial (ECONOMIC_MODEL.md §3, subconjunto v0.1). Fluxos fiscais em fração do PIB anual.
 * Opcional para cenários antigos: sem ele o motor usa valores padrão provisórios.
 */
export const scenarioEconomySchema = z
  .object({
    /** PIB nominal de 12 meses, R$ milhões (converte custos de políticas em fração do PIB). */
    nominalGdpMillions: dataValueSchema,
    outputGap: dataValueSchema,
    selic: dataValueSchema,
    inflationExpectation: dataValueSchema,
    credibility: dataValueSchema,
    grossDebt: dataValueSchema,
    implicitRate: dataValueSchema,
    /** Receita primária líquida do governo central, fração do PIB. */
    revenue: dataValueSchema,
    /** Despesa primária do governo central, fração do PIB. */
    primarySpending: dataValueSchema,
    /** Câmbio R$/US$ (ECONOMIC_MODEL.md §5.5). Opcional: sem ele o motor usa o valor provisório padrão. */
    exchangeRate: dataValueSchema.optional(),
    /** Prêmio de risco soberano anual (fração). */
    riskPremium: dataValueSchema.optional(),
    /** Juro externo anual (fração). */
    externalRate: dataValueSchema.optional(),
    /** Crescimento real do PIB dois anos antes do início (regra do salário mínimo, Lei 15.077/2024). */
    gdpGrowthTwoYearsAgo: dataValueSchema.optional(),
  })
  .strict();
export type ScenarioEconomy = z.infer<typeof scenarioEconomySchema>;

/** Fração por grupo de receita (ECONOMIC_MODEL.md §5.7); mesmas chaves de `RevenueGroup` do motor. */
const revenueGroupsSchema = z
  .object({
    renda: dataValueSchema,
    folha: dataValueSchema,
    consumo: dataValueSchema,
    outras: dataValueSchema,
    royalties: dataValueSchema,
  })
  .strict();

/**
 * Estrutura fiscal inicial (ECONOMIC_MODEL.md §5.7–5.8; POLITICAL_RULES.md §4.2–4.3). Opcional: sem ela o
 * motor reparte os totais de `economy` pelas frações provisórias padrão (`FALLBACK_FISCAL`).
 */
export const scenarioFiscalSchema = z
  .object({
    /** Participação de cada grupo na receita bruta (soma 1). */
    revenueShares: revenueGroupsSchema,
    /** Fração de cada grupo repassada a estados e municípios (FPE, FPM, royalties). */
    transferShares: revenueGroupsSchema,
    /** Despesas em fração do PIB; somam `economy.primarySpending`. O limite inicial é tudo menos as exceções. */
    spending: z
      .object({
        previdencia: dataValueSchema,
        beneficios: dataValueSchema,
        pessoal: dataValueSchema,
        outras: dataValueSchema,
        linked: dataValueSchema,
        discretionary: dataValueSchema,
        exceptions: dataValueSchema,
      })
      .strict(),
  })
  .strict();
export type ScenarioFiscal = z.infer<typeof scenarioFiscalSchema>;

/** Ocupante técnico/aliado de um ministério (POLITICAL_RULES.md §6.3.1); os demais ocupantes são ids de bloco. */
export const TECHNICAL_MINISTER = 'tecnico';

/** Ministério relevante para a coalizão (POLITICAL_RULES.md §6.3.1). */
export const ministrySchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    /** Áreas de política (`Policy.area`) executadas pela pasta. */
    areas: z.array(contentIdSchema).min(1),
    /** Peso político da pasta (0–1): apoio do bloco que a ocupa e relação ganha na nomeação. */
    weight: unitInterval,
    /** Ocupante no início: `tecnico` ou id de bloco. */
    occupant: contentIdSchema,
  })
  .strict();
export type Ministry = z.infer<typeof ministrySchema>;

/**
 * Instituições do cenário (POLITICAL_RULES.md §6.3, §13): blocos que presidem a Câmara e o Senado e
 * ministérios. Opcional: sem ele, cada Casa é presidida pelo maior bloco nela e não há ministérios.
 */
export const scenarioInstitutionsSchema = z
  .object({
    housePresidents: z.object({ camara: contentIdSchema, senado: contentIdSchema }).strict(),
    ministries: z.array(ministrySchema),
  })
  .strict();
export type ScenarioInstitutions = z.infer<typeof scenarioInstitutionsSchema>;

/** Quantidade de UFs (26 estados e o Distrito Federal). */
export const UF_COUNT = 27;

const shareSchema = z.number().gt(0).lt(1);

/** UF no cenário (ECONOMIC_MODEL.md §5.12, §5.15): só a matriz de participação e de sensibilidade setorial. */
export const scenarioUfSchema = z
  .object({
    /** Sigla, igual à do globo (`src/globe/data/ufs.json`). */
    id: ufIdSchema,
    name: z.string().min(1),
    region: regionIdSchema,
    /** Milhares de pessoas (ECONOMIC_MODEL.md §2). */
    population: z.number().positive(),
    /** Participação no PIB nacional no início do cenário; soma 1 entre as UFs. */
    gdpShare: shareSchema,
    /** Peso de cada setor no valor adicionado da UF; soma 1. */
    sectors: z
      .object({ agropecuaria: unitInterval, extrativa: unitInterval, industria: unitInterval, servicos: unitInterval })
      .strict(),
    /** Desemprego inicial da UF (só a diferença relativa entre as UFs é usada). */
    unemployment: shareSchema,
    /** População abaixo da linha de pobreza (chave de distribuição de transferências). */
    poverty: unitInterval,
    /** Governador fictício: bloco a que pertence e relação inicial com o presidente (−100…100). */
    governor: z.object({ bloc: contentIdSchema, relation: z.number().min(-100).max(100) }).strict(),
    /**
     * Inclinação política do eleitorado da UF nos mesmos eixos de `Bloc.ideology` e `Policy.position`
     * (PLANO_GLOBO.md §5.1): econômico −1 estado … 1 mercado; social −1 progressista … 1 conservador. Opcional:
     * sem ela (cenários até a v0.7.0) o alinhamento com o perfil do governo não age. Tudo ou nada em todas as UFs.
     */
    lean: z.object({ economic: axis, social: axis }).strict().optional(),
  })
  .strict();
export type ScenarioUf = z.infer<typeof scenarioUfSchema>;

/**
 * Dados regionais do cenário (DATA_SOURCES.md §4.2): uma linha por UF e os metadados de cada série (os números
 * de uma série têm a mesma origem e o mesmo status). Opcional: sem ele, o motor não distribui o agregado.
 */
export const scenarioRegionsSchema = z
  .object({
    meta: z
      .object({
        population: dataSeriesSchema,
        gdpShare: dataSeriesSchema,
        sectors: dataSeriesSchema,
        unemployment: dataSeriesSchema,
        poverty: dataSeriesSchema,
        governors: dataSeriesSchema,
        /** Origem e status da inclinação política das UFs (`PROVISORIO`); obrigatória quando as UFs têm `lean`. */
        lean: dataSeriesSchema.optional(),
      })
      .strict(),
    ufs: z.array(scenarioUfSchema).length(UF_COUNT),
  })
  .strict();
export type ScenarioRegions = z.infer<typeof scenarioRegionsSchema>;

/** Personagem fictício recorrente (FASE_07.md). Nunca baseado em pessoa real (GAME_DESIGN.md §13). */
export const characterSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    /** Cargo ou papel, em português (ex.: "Ministra da Fazenda"). */
    role: z.string().min(1),
    description: z.string().min(1),
    /** Bloco a que pertence, se houver. */
    blocId: contentIdSchema.optional(),
    /** Prestígio inicial com o governo, −100…100. */
    initialStanding: z.number().min(-100).max(100),
    dataStatus: dataStatusSchema,
  })
  .strict();
export type Character = z.infer<typeof characterSchema>;

/** Candidato fictício a presidente por bloco (Fase 08); nome e status sempre fictícios (GAME_DESIGN.md §13). */
export const electionCandidateSchema = z
  .object({ blocId: contentIdSchema, name: z.string().min(1), dataStatus: dataStatusSchema })
  .strict();
export type ElectionCandidate = z.infer<typeof electionCandidateSchema>;

/**
 * Eleições do cenário (Fase 08): calendário e regra de reeleição. Meses 0–47 contam do início do mandato
 * (posse jan/2027 = 0). Ausente = cenário sem eleições: o motor nunca roda o passo eleitoral, aplica vedação
 * ou encerra por derrota/fim de mandato.
 */
export const scenarioElectionsSchema = z
  .object({
    /** Reeleição permitida (CF art. 14 §5º, uma reeleição). */
    reeleicaoPermitida: z.boolean(),
    /** Mês do mandato das eleições municipais (21 = out/2028 e out/2032). */
    mesEleicaoMunicipal: z.number().int().min(1).max(47),
    /** Mês do mandato da eleição geral (45 = out/2030 e out/2034). */
    mesEleicaoGeral: z.number().int().min(1).max(47),
    /** Janela em que `declarar_reeleicao` é aceito. */
    janelaDeclaracao: z
      .object({ inicio: z.number().int().min(0).max(47), fim: z.number().int().min(0).max(47) })
      .strict(),
    /** Candidatos fictícios por bloco (nomes usados nas notícias); blocos sem entrada aparecem pelo nome do bloco. */
    candidatos: z.array(electionCandidateSchema).optional(),
  })
  .strict();
export type ScenarioElections = z.infer<typeof scenarioElectionsSchema>;

/** Mês do calendário civil no formato "AAAA-MM" (rótulo de turno antes da posse; PLANO_CAMPANHA.md §2.4). */
const calendarMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'mês no formato AAAA-MM');

/** Estágios antes da posse (PLANO_CAMPANHA.md Fase C5, máquina de estados); `governo` começa na posse. */
export const PRE_INAUGURATION_STAGES = ['pre_campanha', 'convencao', 'corrida', 'eleicao', 'transicao'] as const;

/**
 * Ações de campanha com execução no motor (PLANO_CAMPANHA.md Fase C4, tarefa C4.1): um id por arquétipo. Só ids desta
 * lista podem ter custo em `career.finance.costs`; o catálogo (efeitos e estágios) mora em `engine/career/actions.ts`.
 */
export const CAREER_ACTION_IDS = [
  'comicio_nacional',
  'caravana_regional',
  'mobilizar_militancia',
  'ataque_adversario',
  'arrecadar_doacoes',
] as const;
export type CareerActionId = (typeof CAREER_ACTION_IDS)[number];

/** Debate na TV (PLANO_CAMPANHA.md Fase C4, tarefa C4.2): acontece no turno que começa em `from`. */
export const careerDebateSchema = z
  .object({ id: contentIdSchema, name: z.string().min(1), from: calendarMonthSchema })
  .strict();
export type CareerDebate = z.infer<typeof careerDebateSchema>;

/**
 * Turno de jogo antes da posse (PLANO_CAMPANHA.md §2.4): estágio e meses do calendário civil que ele cobre. `to`
 * ausente = um mês só; com `to`, o turno é condensado (ex.: transição nov–dez).
 */
export const careerTurnSchema = z
  .object({ stage: z.enum(PRE_INAUGURATION_STAGES), from: calendarMonthSchema, to: calendarMonthSchema.optional() })
  .strict();
export type CareerTurn = z.infer<typeof careerTurnSchema>;

/** Calendário de um ponto de partida: turnos contíguos que terminam no mês anterior à posse. */
export const careerStartPointSchema = z.object({ turns: z.array(careerTurnSchema).min(1) }).strict();
export type CareerStartPointSpec = z.infer<typeof careerStartPointSchema>;

/**
 * Perfil de candidato (PLANO_CAMPANHA.md Fase C1, contratos iniciais). Valores de design (`FICTICIO`) até a
 * calibração; dinheiro em R$ mil inteiros (D-C14). `territorialBase`: reconhecimento extra por UF (0–1); UF
 * ausente = sem base própria.
 */
export const careerProfileSchema = z
  .object({
    id: contentIdSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    /**
     * Bloco do partido do candidato (PLANO_CAMPANHA.md Fase C2, D-C17): o jogador ocupa a vaga desse bloco na
     * disputa, e o adversário listado para o bloco sai dela. A ideologia do bloco orienta o alinhamento por UF.
     */
    blocId: contentIdSchema,
    /** Reconhecimento nacional inicial, 0–1. */
    recognition: unitInterval,
    /** Valência nacional (imagem entre quem conhece), −1…1. */
    valence: axis,
    /** Influência no próprio partido, 0–1. */
    partyInfluence: unitInterval,
    /** Patrimônio pessoal, R$ mil. */
    wealth: z.number().int().min(0),
    /** Fração do patrimônio que pode virar dinheiro na campanha, 0–1. */
    liquidity: unitInterval,
    /** Capacidade de arrecadar por turno, R$ mil. */
    fundraisingCapacity: z.number().int().min(0),
    territorialBase: z.record(ufIdSchema, unitInterval),
    /**
     * Idade na eleição (`FICTICIO`), só para o desempate (CF art. 77 §5: o mais idoso; PLANO_CAMPANHA.md Fase C5).
     * Mínimo de 35 anos para presidente (CF art. 14 §3, VI, a). Ausente: o desempate vai ao sorteio por chave.
     */
    age: z.number().int().min(35).max(120).optional(),
    dataStatus: dataStatusSchema,
  })
  .strict();
export type CareerProfile = z.infer<typeof careerProfileSchema>;

/**
 * Adversário simples da eleição antes da posse (PLANO_CAMPANHA.md Fase C2, D-C17 opção a): a **identidade** (nome) é
 * a de `elections.candidatos` do mesmo bloco; aqui ficam só os dados de campanha. Valores `FICTICIO` até a calibração.
 */
export const careerOpponentSchema = z
  .object({
    blocId: contentIdSchema,
    /** Reconhecimento nacional inicial, 0–1. */
    recognition: unitInterval,
    /** Valência nacional, −1…1. */
    valence: axis,
    territorialBase: z.record(ufIdSchema, unitInterval),
    /**
     * Idade na eleição (`FICTICIO`), só para o desempate (CF art. 77 §5: o mais idoso; PLANO_CAMPANHA.md Fase C5).
     * Mínimo de 35 anos para presidente (CF art. 14 §3, VI, a). Ausente: o desempate vai ao sorteio por chave.
     */
    age: z.number().int().min(35).max(120).optional(),
    dataStatus: dataStatusSchema,
  })
  .strict();
export type CareerOpponent = z.infer<typeof careerOpponentSchema>;

/**
 * Carreira antes da posse (PLANO_CAMPANHA.md, Fase C1). Ausente = o jogo só começa na posse, como sempre. Cada ponto
 * de partida é opcional; um nome desconhecido é recusado (`.strict()`).
 */
export const scenarioCareerSchema = z
  .object({
    startPoints: z
      .object({ pre_campanha: careerStartPointSchema.optional(), corrida: careerStartPointSchema.optional() })
      .strict(),
    profiles: z.array(careerProfileSchema).min(1),
    /** Caixa eleitoral em R$ mil; ausente desliga a contabilidade da carreira. */
    finance: z
      .object({
        initialBalance: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        spendingLimit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        spendingLimitStatus: dataStatusSchema.optional(),
        dataStatus: dataStatusSchema,
        expanded: z
          .object({
            personalAvailable: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
            personalLimit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
            debtLimit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
            debtDeadline: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
            illicit: z
              .object({
                decay: z.number().min(0).lt(1).optional(),
                sensitivity: z.number().min(0).optional(),
                maxHazard: z.number().min(0).max(1).optional(),
                monthlyLimit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
              })
              .strict()
              .optional(),
            installments: z
              .array(
                z
                  .object({
                    turn: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
                    amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
                    pocket: z.enum(['party', 'donations']),
                  })
                  .strict(),
              )
              .optional(),
          })
          .strict()
          .optional(),
        /** Catálogo de custos em R$ mil; só incluir ações que tenham execução no motor. */
        costs: z
          .array(
            z
              .object({
                id: contentIdSchema,
                cost: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
                pockets: z
                  .array(z.enum(['personal', 'party', 'donations', 'illicit']))
                  .min(1)
                  .optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
    /** Adversários por bloco; o do bloco do perfil escolhido sai da disputa (o jogador ocupa a vaga). */
    opponents: z.array(careerOpponentSchema).min(1),
    /** Debates na TV (Fase C4); ausente = nenhum debate. */
    debates: z.array(careerDebateSchema).optional(),
    dataStatus: dataStatusSchema,
  })
  .strict();
export type ScenarioCareer = z.infer<typeof scenarioCareerSchema>;

/** "2026-08" → meses contados a partir de "2027-01" (negativo antes da posse). */
function monthsFromInauguration(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return (y - 2027) * 12 + (m - 1);
}

export const scenarioSchema = z
  .object({
    /** Ex.: `brasil_2027_01` */
    id: contentIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'versão semântica X.Y.Z'),
    name: z.string().min(1),
    /** Mês de posse = monthIndex 0 (jan/2027). */
    startPeriod: z.literal('2027-01'),
    indicators: scenarioIndicatorsSchema,
    economy: scenarioEconomySchema.optional(),
    fiscal: scenarioFiscalSchema.optional(),
    institutions: scenarioInstitutionsSchema.optional(),
    regions: scenarioRegionsSchema.optional(),
    /** Parâmetros do modelo (ECONOMIC_MODEL.md §6), todos com status — `A_CALIBRAR` = `PROVISORIO`. */
    parameters: z.record(z.string().regex(/^[a-z][a-z0-9_.]*$/), dataValueSchema),
    blocs: z.array(blocSchema).min(2),
    /** Meses (1–12) com reunião do Copom (ECONOMIC_MODEL.md §5.4: 8 por ano). */
    copomMonths: z.array(z.number().int().min(1).max(12)).length(8),
    /** IDs das políticas disponíveis neste cenário. */
    policies: z.array(contentIdSchema).min(1),
    /** Elenco de personagens fictícios (Fase 07); ausente nos cenários anteriores. */
    characters: z.array(characterSchema).optional(),
    /** Eleições e calendário eleitoral (Fase 08); ausente nos cenários anteriores. */
    elections: scenarioElectionsSchema.optional(),
    /** Carreira antes da posse (PLANO_CAMPANHA.md, Fase C1); ausente = só o ponto de partida da posse. */
    career: scenarioCareerSchema.optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const sum = (k: 'chamberSeats' | 'senateSeats') => s.blocs.reduce((n, b) => n + b[k], 0);
    if (sum('chamberSeats') !== CHAMBER_SEATS) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocs'],
        message: `Câmara soma ${sum('chamberSeats')}, esperado ${CHAMBER_SEATS}`,
      });
    }
    if (sum('senateSeats') !== SENATE_SEATS) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocs'],
        message: `Senado soma ${sum('senateSeats')}, esperado ${SENATE_SEATS}`,
      });
    }
    const unique = (ids: string[], path: string) => {
      const dup = ids.find((id, i) => ids.indexOf(id) !== i);
      if (dup) ctx.addIssue({ code: 'custom', path: [path], message: `id repetido: ${dup}` });
    };
    unique(
      s.blocs.map((b) => b.id),
      'blocs',
    );
    unique(s.policies, 'policies');
    if (s.institutions) {
      const blocIds = new Set(s.blocs.map((b) => b.id));
      for (const house of ['camara', 'senado'] as const) {
        if (!blocIds.has(s.institutions.housePresidents[house])) {
          ctx.addIssue({
            code: 'custom',
            path: ['institutions', 'housePresidents', house],
            message: `bloco inexistente: ${s.institutions.housePresidents[house]}`,
          });
        }
      }
      unique(
        s.institutions.ministries.map((m) => m.id),
        'institutions',
      );
      for (const m of s.institutions.ministries) {
        if (m.occupant !== TECHNICAL_MINISTER && !blocIds.has(m.occupant)) {
          ctx.addIssue({
            code: 'custom',
            path: ['institutions', 'ministries', m.id],
            message: `ocupante deve ser "${TECHNICAL_MINISTER}" ou um bloco: ${m.occupant}`,
          });
        }
      }
    }
    if (s.regions) {
      const blocIds = new Set(s.blocs.map((b) => b.id));
      const ufs = s.regions.ufs;
      unique(
        ufs.map((u) => u.id),
        'regions',
      );
      const shares = ufs.reduce((n, u) => n + u.gdpShare, 0);
      if (Math.abs(shares - 1) > 1e-6) {
        ctx.addIssue({
          code: 'custom',
          path: ['regions', 'ufs'],
          message: `participações somam ${shares}, esperado 1`,
        });
      }
      const withLean = ufs.filter((u) => u.lean !== undefined).length;
      if (withLean !== 0 && withLean !== ufs.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['regions', 'ufs'],
          message: `inclinação (lean) em ${withLean} de ${ufs.length} UFs: todas ou nenhuma`,
        });
      }
      if (withLean > 0 && !s.regions.meta.lean) {
        ctx.addIssue({
          code: 'custom',
          path: ['regions', 'meta', 'lean'],
          message: 'UFs com inclinação exigem os metadados da série (status e fonte)',
        });
      }
      for (const u of ufs) {
        const sectors = Object.values(u.sectors).reduce((n, v) => n + v, 0);
        if (Math.abs(sectors - 1) > 1e-6) {
          ctx.addIssue({ code: 'custom', path: ['regions', u.id, 'sectors'], message: `setores somam ${sectors}` });
        }
        if (!blocIds.has(u.governor.bloc)) {
          ctx.addIssue({
            code: 'custom',
            path: ['regions', u.id, 'governor'],
            message: `bloco inexistente: ${u.governor.bloc}`,
          });
        }
      }
    }
    unique(s.copomMonths.map(String), 'copomMonths');
    const u = s.indicators.unemployment.value;
    if (!(u > 0 && u < 1))
      ctx.addIssue({ code: 'custom', path: ['indicators', 'unemployment'], message: 'desemprego em fração (0, 1)' });
    if (s.fiscal) {
      const shares = Object.values(s.fiscal.revenueShares).reduce((n, v) => n + v.value, 0);
      if (Math.abs(shares - 1) > 1e-6) {
        ctx.addIssue({
          code: 'custom',
          path: ['fiscal', 'revenueShares'],
          message: `frações somam ${shares}, esperado 1`,
        });
      }
      if (Object.values(s.fiscal.transferShares).some((v) => !(v.value >= 0 && v.value < 1))) {
        ctx.addIssue({ code: 'custom', path: ['fiscal', 'transferShares'], message: 'repasse em fração [0, 1)' });
      }
      const spending = Object.values(s.fiscal.spending).reduce((n, v) => n + v.value, 0);
      const total = s.economy?.primarySpending.value;
      if (total === undefined || Math.abs(spending - total) > 1e-6) {
        ctx.addIssue({
          code: 'custom',
          path: ['fiscal', 'spending'],
          message: `despesas somam ${spending}, esperado economy.primarySpending (${total})`,
        });
      }
    }
    const a = s.indicators.approval.value;
    if (!(a >= 0 && a <= 1))
      ctx.addIssue({ code: 'custom', path: ['indicators', 'approval'], message: 'aprovação em fração [0, 1]' });
    if (s.elections) {
      const e = s.elections;
      if (e.mesEleicaoMunicipal >= e.mesEleicaoGeral) {
        ctx.addIssue({
          code: 'custom',
          path: ['elections', 'mesEleicaoMunicipal'],
          message: `eleição municipal (mês ${e.mesEleicaoMunicipal}) precisa vir antes da geral (mês ${e.mesEleicaoGeral})`,
        });
      }
      if (e.janelaDeclaracao.inicio > e.janelaDeclaracao.fim) {
        ctx.addIssue({
          code: 'custom',
          path: ['elections', 'janelaDeclaracao'],
          message: 'janela invertida (inicio > fim)',
        });
      }
      if (e.janelaDeclaracao.fim >= e.mesEleicaoGeral) {
        ctx.addIssue({
          code: 'custom',
          path: ['elections', 'janelaDeclaracao', 'fim'],
          message: `janela precisa fechar antes da eleição geral (mês ${e.mesEleicaoGeral})`,
        });
      }
      if (e.candidatos) {
        const blocIds = new Set(s.blocs.map((b) => b.id));
        const seen = new Set<string>();
        for (const c of e.candidatos) {
          if (!blocIds.has(c.blocId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['elections', 'candidatos'],
              message: `bloco inexistente: ${c.blocId}`,
            });
          } else if (seen.has(c.blocId)) {
            ctx.addIssue({
              code: 'custom',
              path: ['elections', 'candidatos'],
              message: `candidato repetido para o bloco: ${c.blocId}`,
            });
          }
          seen.add(c.blocId);
        }
      }
    }
    if (s.career) checkCareer(s, s.career, ctx);
  });

/**
 * Regras do bloco `career` que dependem do resto do cenário: UFs da base territorial existem no cenário, ids de
 * perfil únicos, turnos de cada ponto de partida contíguos, em ordem e terminando no mês anterior à posse, e a
 * disputa (Fase C2): blocos existentes, adversário com identidade em `elections.candidatos`, no máximo um por bloco e
 * pelo menos dois candidatos (jogador incluído) para cada perfil.
 */
function checkCareer(
  s: { blocs: readonly Bloc[]; regions?: ScenarioRegions; elections?: ScenarioElections },
  career: ScenarioCareer,
  ctx: z.RefinementCtx,
) {
  const costIds = new Set<string>();
  for (const [index, cost] of (career.finance?.costs ?? []).entries()) {
    if (!(CAREER_ACTION_IDS as readonly string[]).includes(cost.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['career', 'finance', 'costs', index, 'id'],
        message: `ação de carreira sem execução: ${cost.id}`,
      });
    }
    if (costIds.has(cost.id))
      ctx.addIssue({
        code: 'custom',
        path: ['career', 'finance', 'costs', index, 'id'],
        message: `custo repetido: ${cost.id}`,
      });
    costIds.add(cost.id);
  }
  const known = new Set(s.regions?.ufs.map((u) => u.id) ?? []);
  const blocIds = new Set(s.blocs.map((b) => b.id));
  const named = new Set(s.elections?.candidatos?.map((c) => c.blocId) ?? []);
  const checkBase = (base: Record<string, number>, path: (string | number)[]) => {
    for (const uf of Object.keys(base)) {
      if (!known.has(uf)) ctx.addIssue({ code: 'custom', path, message: `UF inexistente no cenário: ${uf}` });
    }
  };
  const seen = new Set<string>();
  if (career.finance?.expanded && career.finance.expanded.personalLimit > career.finance.spendingLimit / 10) {
    ctx.addIssue({
      code: 'custom',
      path: ['career', 'finance', 'expanded', 'personalLimit'],
      message: 'limite pessoal excede 10% do teto de campanha',
    });
  }
  for (const p of career.profiles) {
    if (seen.has(p.id)) ctx.addIssue({ code: 'custom', path: ['career', 'profiles'], message: `id repetido: ${p.id}` });
    seen.add(p.id);
    if (career.finance?.expanded && career.finance.expanded.personalAvailable > p.wealth * p.liquidity) {
      ctx.addIssue({
        code: 'custom',
        path: ['career', 'finance', 'expanded', 'personalAvailable'],
        message: `liquidez insuficiente no perfil ${p.id}`,
      });
    }
    checkBase(p.territorialBase, ['career', 'profiles', p.id, 'territorialBase']);
    if (!blocIds.has(p.blocId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['career', 'profiles', p.id, 'blocId'],
        message: `bloco inexistente: ${p.blocId}`,
      });
    }
    if (career.opponents.filter((o) => o.blocId !== p.blocId).length < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['career', 'profiles', p.id],
        message: 'a disputa precisa de pelo menos dois candidatos, com o jogador',
      });
    }
  }
  const seenOpponents = new Set<string>();
  for (const [i, o] of career.opponents.entries()) {
    const path = ['career', 'opponents', i];
    if (seenOpponents.has(o.blocId))
      ctx.addIssue({ code: 'custom', path, message: `adversário repetido: ${o.blocId}` });
    seenOpponents.add(o.blocId);
    if (!named.has(o.blocId)) {
      ctx.addIssue({ code: 'custom', path, message: `adversário sem candidato em elections.candidatos: ${o.blocId}` });
    }
    checkBase(o.territorialBase, [...path, 'territorialBase']);
  }
  // Debate: id único, num turno de campanha oficial (corrida ou eleição) de algum ponto de partida.
  const debateIds = new Set<string>();
  for (const [i, d] of (career.debates ?? []).entries()) {
    const path = ['career', 'debates', i];
    if (debateIds.has(d.id)) ctx.addIssue({ code: 'custom', path, message: `debate repetido: ${d.id}` });
    debateIds.add(d.id);
    const inCampaign = Object.values(career.startPoints).some((spec) =>
      spec?.turns.some((t) => t.from === d.from && (t.stage === 'corrida' || t.stage === 'eleicao')),
    );
    if (!inCampaign) {
      ctx.addIssue({ code: 'custom', path, message: `debate fora de um turno de campanha oficial: ${d.from}` });
    }
  }
  for (const [point, spec] of Object.entries(career.startPoints)) {
    if (!spec) continue;
    let expected = monthsFromInauguration(spec.turns[0].from);
    for (const [i, t] of spec.turns.entries()) {
      const from = monthsFromInauguration(t.from);
      const to = t.to ? monthsFromInauguration(t.to) : from;
      if (from !== expected || to < from) {
        ctx.addIssue({
          code: 'custom',
          path: ['career', 'startPoints', point, 'turns', i],
          message: `turno fora de ordem ou com lacuna: ${t.from}${t.to ? `–${t.to}` : ''}`,
        });
      }
      expected = to + 1;
    }
    if (expected !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['career', 'startPoints', point, 'turns'],
        message: 'os turnos precisam terminar em dezembro de 2026, o mês anterior à posse',
      });
    }
  }
}
export type Scenario = z.infer<typeof scenarioSchema>;

/** Valida dados desconhecidos (JSON) e devolve o cenário ou os erros em texto legível. */
export function parseScenario(input: unknown): { ok: true; scenario: Scenario } | { ok: false; errors: string[] } {
  const r = scenarioSchema.safeParse(input);
  if (r.success) return { ok: true, scenario: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
