/**
 * Conteúdo puro da tela SOBRE (rota `/sobre`, PLANO_MENU_SAVES_CONFIG.md §3 "Fase M1", item 4): montagem da lista de
 * versões e textos fixos. Sem React e sem importações: os valores chegam por parâmetro, então o teste roda sem o app.
 */

export interface AboutRow {
  label: string;
  value: string;
}

/** Cenário embutido, já com o título de exibição (`scenarioTitle`) e a versão do próprio cenário (`Scenario.version`). */
export interface AboutScenario {
  /** Id do registro `SCENARIOS` (ex.: `brasil_2027_01_v080`); distingue cenários com o mesmo título. */
  id: string;
  title: string;
  version: string;
}

export interface AboutVersions {
  appVersion: string;
  engineVersion: string;
  stateSchemaVersion: number;
  dbVersion: number;
  scenarios: readonly AboutScenario[];
}

/** Monta as linhas "Versões": app, motor, esquema do estado, banco e uma linha por cenário embutido. */
export function buildAboutRows(versions: AboutVersions): AboutRow[] {
  const rows: AboutRow[] = [
    { label: 'Aplicativo', value: versions.appVersion },
    { label: 'Motor de simulação', value: versions.engineVersion },
    { label: 'Esquema do estado', value: String(versions.stateSchemaVersion) },
    { label: 'Banco de dados', value: String(versions.dbVersion) },
  ];
  for (const scenario of versions.scenarios) {
    rows.push({ label: `Cenário: ${scenario.title}`, value: `${scenario.version} · ${scenario.id}` });
  }
  return rows;
}

/** Aviso de ficção (GAME_DESIGN.md §13). Texto exato: não reescrever sem revisão do autor. */
export const FICTION_NOTICE =
  'Simulação fictícia e independente, sem afiliação a qualquer órgão do governo brasileiro.';

export const FICTION_DETAIL =
  'Personagens, partidos e notícias são fictícios. Nenhuma conduta é atribuída a pessoas reais.';

/** Fontes de dados, resumido. O detalhe (id, acesso e status de cada valor) está em docs/DATA_SOURCES.md. */
export const DATA_SOURCES_TEXT =
  'Os dados dos cenários vêm de fontes públicas oficiais, como IBGE, Banco Central, Tesouro Nacional, Câmara, Senado e TSE. ' +
  'Cada valor tem um status (real, provisório ou fictício), registrado no documento de fontes do projeto.';
