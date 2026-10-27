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
    /**
     * Pautas-bomba do cenário (PLANO_CAMPANHA.md Fase C6c): ids de políticas que o Congresso pode aprovar por conta
     * própria, na ordem em que chegam. Fora de `policies` (o jogador não as propõe). Ausente = sistema desligado.
     */
    fiscalBombs: z.array(contentIdSchema).optional(),
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
  });
export type Scenario = z.infer<typeof scenarioSchema>;

/** Valida dados desconhecidos (JSON) e devolve o cenário ou os erros em texto legível. */
export function parseScenario(input: unknown): { ok: true; scenario: Scenario } | { ok: false; errors: string[] } {
  const r = scenarioSchema.safeParse(input);
  if (r.success) return { ok: true, scenario: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
