import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from './gerar.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(ROOT, '..', '..');

function runGit(args) {
  try {
    return execFileSync('git', args, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function repoFromGit() {
  const raw = runGit(['config', '--get', 'remote.origin.url']);
  const match = /github\.com[:/](.+?)(?:\.git)?$/i.exec(raw);
  return match ? match[1] : '';
}

function printHelp() {
  console.log('Uso:');
  console.log('  node docs/PRs/novo.mjs 3           # cria docs/PRs/pr3 com dados.json vazio');
  console.log('  node docs/PRs/novo.mjs pr3         # o mesmo');
  console.log('');
  console.log('Com npm:');
  console.log('  npm run pr:novo -- 3');
  console.log('');
  console.log('Depois edite dados.json e rode:');
  console.log('  npm run pr:gerar -- pr3');
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(args.length ? 0 : 1);
}

const input = args[0];
const match = /^(?:pr[-_ ]?)?(\d+)$/i.exec(input);
if (!match) {
  console.error('Erro: informe o número do PR (ex.: 3) ou a pasta (ex.: pr3).');
  process.exit(1);
}

const pr = Number(match[1]);
const folderName = `pr${pr}`;
const folder = path.join(ROOT, folderName);
const dataPath = path.join(folder, 'dados.json');

if (fs.existsSync(folder)) {
  console.error(`Erro: ${path.relative(PROJECT_ROOT, folder)} já existe.`);
  console.error(`Para regerar, rode: npm run pr:gerar -- ${folderName}`);
  process.exit(1);
}

const sha = runGit(['rev-parse', 'HEAD']);
const repo = repoFromGit();
const today = new Date().toISOString().slice(0, 10);

const data = {
  meta: {
    pr,
    title: `PR #${pr}`,
    date: today,
  },
  schema_version: 3,
  audit_sha: sha,
  base: sha && repo ? `https://github.com/${repo}/blob/${sha}/` : '',
  repository: repo,
  id_aliases: {},
  issues: [],
  rejected: [],
  docs: {},
  glossary: [],
  scenarios: [],
  env_vars: [],
  counters: [],
  tools: [],
  fault_points: [],
  preserved_optimizations: [],
  migration_log: [],
  test_protocols: [],
};

fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`Criado ${path.relative(PROJECT_ROOT, dataPath)}`);

try {
  const result = build(folder);
  console.log(`Gerado ${path.relative(PROJECT_ROOT, result.output)}`);
} catch (error) {
  console.error('Aviso: o HTML ainda não foi gerado:', error && error.message ? error.message : error);
}

console.log('');
console.log('Próximos passos:');
console.log(`  1. edite ${path.relative(PROJECT_ROOT, dataPath)}`);
console.log(`  2. rode: npm run pr:gerar -- ${folderName}`);
