import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(ROOT, '..', '..');
const TEMPLATE = path.join(ROOT, 'modelo', 'AUDITORIA.template.html');
const DATA_FILE = 'dados.json';
const OUTPUT_FILE = 'AUDITORIA.html';

function escHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
}

function operationalHtml(incident) {
  if (!incident || typeof incident !== 'object' || Array.isArray(incident)) return '';
  const id = String(incident.id || 'OP');
  const title = String(incident.title || 'Incidente operacional');
  const classification = String(incident.classification || 'Fora do PR');
  const scope = String(incident.scope || '');
  const summary = String(incident.summary || '');
  const action = String(incident.action || '');
  const acceptance = String(incident.acceptance || '');
  return (
    '<div class="callout" style="margin-bottom:22px;border-color:#785236;background:#2a2016;color:#f3d6b8">' +
    '<span class="cap" aria-hidden="true">!</span><div>' +
    '<strong>' +
    escHtml(`${id} — ${title}`) +
    '</strong>' +
    `<p><b>${escHtml(classification)}.</b> ${escHtml(scope)}</p>` +
    (summary ? `<p>${escHtml(summary)}</p>` : '') +
    (action ? `<p><b>Ação:</b> ${escHtml(action)}</p>` : '') +
    (acceptance ? `<p><b>Aceite:</b> ${escHtml(acceptance)}</p>` : '') +
    '</div></div>'
  );
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function replaceOnce(html, from, to, label) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`Template inválido: ${label} (${count} ocorrências)`);
  return html.replace(from, to);
}

function replaceAll(html, from, to, label) {
  const count = html.split(from).length - 1;
  if (count === 0) throw new Error(`Template inválido: ${label} não encontrado`);
  return html.split(from).join(to);
}

function sanitize(value) {
  return (
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'auditoria'
  );
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function longDate(value) {
  const date = parseDate(value);
  if (!date) return String(value ?? '');
  return date.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function shortDate(value) {
  const date = parseDate(value);
  if (!date) return String(value ?? '');
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function inferPr(folderName) {
  const match = /^pr[-_ ]?(\d+)$/i.exec(folderName);
  return match ? Number(match[1]) : null;
}

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

function resolveFolder(arg) {
  const candidates = [path.resolve(ROOT, arg)];
  if (/^\d+$/.test(arg)) candidates.push(path.join(ROOT, 'pr' + arg));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  }
  throw new Error(`Pasta não encontrada: ${arg}`);
}

function listFolders() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(ROOT, entry.name, DATA_FILE)))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export function build(folderArg) {
  const folder = typeof folderArg === 'string' ? resolveFolder(folderArg) : folderArg;
  const dataPath = path.join(folder, DATA_FILE);
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Arquivo não encontrado: ${path.relative(ROOT, dataPath)}`);
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${DATA_FILE} deve conter um objeto JSON`);
  }

  const meta = raw.meta && typeof raw.meta === 'object' && !Array.isArray(raw.meta) ? raw.meta : {};
  const dataset = { ...raw };
  delete dataset.meta;

  const folderName = path.basename(folder);
  const inferredPr = inferPr(folderName);
  const pr = Object.prototype.hasOwnProperty.call(meta, 'pr') ? meta.pr : inferredPr;
  const hasPr = pr !== null && pr !== undefined && String(pr).trim() !== '';

  const sha = String(dataset.audit_sha || runGit(['rev-parse', 'HEAD']) || '').trim();
  const repo = String(dataset.repository || repoFromGit() || '').trim();
  if (!sha) throw new Error('Informe audit_sha em dados.json (ou execute dentro de um repositório git)');
  if (!repo) throw new Error('Informe repository em dados.json (ex.: dono/repositorio)');

  const dateValue = meta.date || new Date().toISOString().slice(0, 10);

  dataset.schema_version = 3;
  dataset.audit_sha = sha;
  dataset.repository = repo;
  dataset.base = dataset.base || `https://github.com/${repo}/blob/${sha}/`;
  dataset.id_aliases =
    dataset.id_aliases && typeof dataset.id_aliases === 'object' && !Array.isArray(dataset.id_aliases)
      ? dataset.id_aliases
      : {};
  dataset.issues = Array.isArray(dataset.issues) ? dataset.issues : [];
  dataset.rejected = Array.isArray(dataset.rejected) ? dataset.rejected : [];
  dataset.docs = dataset.docs && typeof dataset.docs === 'object' && !Array.isArray(dataset.docs) ? dataset.docs : {};
  dataset.glossary = Array.isArray(dataset.glossary) ? dataset.glossary : [];

  for (const key of [
    'scenarios',
    'env_vars',
    'counters',
    'tools',
    'fault_points',
    'preserved_optimizations',
    'migration_log',
    'test_protocols',
  ]) {
    if (!Array.isArray(dataset[key])) dataset[key] = [];
  }

  const prNumber = hasPr ? String(pr) : '';
  const titleText = String(meta.title || (hasPr ? `PR #${prNumber}` : 'Painel de auditoria'));
  const docTitle = /^orbis audit\b/i.test(titleText) ? titleText : `Orbis Audit — ${titleText}`;
  const description = String(
    meta.description ||
      'Painel interativo e offline de auditoria de corretude e performance, com evidências, guias de implementação, laboratório de testes, experimentos e prontidão para merge.',
  );
  const snapshot = String(meta.snapshot || (hasPr ? `● Snapshot · ${sha.slice(0, 7)}` : '● Sem snapshot'));

  const scopeBase = meta.slug ? meta.slug : hasPr ? `pr${prNumber}` : folderName;
  const pageScope = `${sanitize(scopeBase)}-${sanitize(sha.slice(0, 12))}`;
  const exportBase = sanitize(meta.slug || (hasPr ? `pr${prNumber}` : folderName));

  const commitBlock =
    '<div class="commit"><div class="eyebrow" style="font-size:9px">BASE DA AUDITORIA</div><strong>' +
    escHtml(hasPr ? `PR #${prNumber} · commit ${sha.slice(0, 7)}` : 'Sem PR vinculado') +
    '</strong><br>' +
    escHtml(repo) +
    '<br>' +
    escHtml(longDate(dateValue)) +
    '</div>';

  const breadcrumb = hasPr ? `PR ${prNumber}` : 'AUDITORIA';
  const footerStatus = dataset.issues.length ? 'Não executa alterações no repositório' : 'Nenhuma auditoria carregada';
  const footerRight = `Funciona offline · ${footerStatus} · ${shortDate(dateValue)}`;

  let html = fs.readFileSync(TEMPLATE, 'utf8');
  html = replaceOnce(html, '__TITLE_HTML__', escHtml(docTitle), 'título');
  html = replaceOnce(html, '__DESCRIPTION_HTML__', escHtml(description), 'descrição');
  html = replaceOnce(html, '__OPERATIONAL_HTML__', operationalHtml(dataset.operational_incident), 'aviso operacional');
  html = replaceOnce(html, 'OA.AUDIT_SHA = __AUDIT_SHA_JSON__;', `OA.AUDIT_SHA = ${JSON.stringify(sha)};`, 'SHA');
  html = replaceOnce(
    html,
    'OA.REPOSITORY = __AUDIT_REPO_JSON__;',
    `OA.REPOSITORY = ${JSON.stringify(repo)};`,
    'repositório',
  );
  html = replaceOnce(
    html,
    'OA.PAGE_SCOPE = __PAGE_SCOPE_JSON__;',
    `OA.PAGE_SCOPE = ${JSON.stringify(pageScope)};`,
    'escopo',
  );
  html = replaceOnce(html, '__COMMIT_BLOCK_HTML__', commitBlock, 'bloco de commit');
  html = replaceOnce(html, '__BREADCRUMB_HTML__', escHtml(breadcrumb), 'breadcrumb');
  html = replaceOnce(html, '__SNAPSHOT_HTML__', escHtml(snapshot), 'snapshot');
  html = replaceOnce(html, '__FOOTER_RIGHT_HTML__', escHtml(footerRight), 'rodapé');
  html = replaceAll(html, '__EXPORT_BASE__', exportBase, 'nome do arquivo exportado');
  html = replaceOnce(
    html,
    '<script type="application/json" id="dataset">__DATASET_JSON__</script>',
    `<script type="application/json" id="dataset">${jsonForScript(dataset)}</script>`,
    'dataset',
  );

  const note = `<!-- Gerado por docs/PRs/gerar.mjs a partir de ${folderName}/${DATA_FILE}. Edite o JSON e regenere; não edite este HTML. -->`;
  html = replaceOnce(html, '<!DOCTYPE html>', `<!DOCTYPE html>\n${note}`, 'DOCTYPE');

  const outputPath = path.join(folder, OUTPUT_FILE);
  fs.writeFileSync(outputPath, html, 'utf8');
  return {
    output: outputPath,
    folder,
    issues: dataset.issues.length,
    rejected: dataset.rejected.length,
  };
}

function printHelp() {
  console.log('Uso:');
  console.log('  node docs/PRs/gerar.mjs            # gera todas as pastas com dados.json');
  console.log('  node docs/PRs/gerar.mjs pr3        # gera apenas docs/PRs/pr3');
  console.log('  node docs/PRs/gerar.mjs 3          # atalho para pr3');
  console.log('');
  console.log('Com npm:');
  console.log('  npm run pr:gerar');
  console.log('  npm run pr:gerar -- pr3');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  try {
    const targets = args.length ? args : listFolders();
    if (!targets.length) {
      console.log('Nenhuma pasta com dados.json encontrada em docs/PRs.');
      process.exit(0);
    }
    for (const target of targets) {
      const result = build(target);
      console.log(
        `Gerado ${path.relative(PROJECT_ROOT, result.output)} (${result.issues} itens, ${result.rejected} descartados)`,
      );
    }
  } catch (error) {
    console.error('Erro:', error && error.message ? error.message : error);
    process.exit(1);
  }
}
