// Gera o site de documentação em docs/EXPLICACOES.html (início) e docs/EXPLICACOES-paginas/ (páginas e assets).
//
//   src/site.mjs       dados: grupos e páginas
//   src/layout.mjs     estrutura HTML de cada tipo de página
//   src/tema/          site.css e site.js, copiados para EXPLICACOES-paginas/assets/
//   src/corpo/         fragmentos HTML usados por algumas páginas
//
// O build valida os dados (ids, grupos, fragmentos, documentos e páginas relacionadas) e confere
// todos os links internos do site gerado. Se algo estiver errado, ele para com a lista de erros.
//
// Uso: node docs/explicacoes/build.mjs

import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grupos, paginas } from './src/site.mjs';
import { inicioHtml, grupoHtml, paginaHtml, ESTADOS } from './src/layout.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const docs = resolve(aqui, '..');
const src = join(aqui, 'src');
const pastaSite = join(docs, 'EXPLICACOES-paginas');
const pastaAssets = join(pastaSite, 'assets');
const arquivoInicio = join(docs, 'EXPLICACOES.html');

// Remove um fragmento do HTML que o layout já recria: a seção externa, o título e o lead.
function limparFragmento(html) {
  return html
    .replace(/^\s*<section[^>]*>\s*/, '')
    .replace(/\s*<\/section>\s*$/, '')
    .replace(/\s*<h2>[\s\S]*?<\/h2>/, '')
    .replace(/\s*<p class="lead">[\s\S]*?<\/p>/, '')
    .trim();
}

// 1. Fragmentos disponíveis.
const fragmentos = new Map();
for (const nome of readdirSync(join(src, 'corpo'))) {
  fragmentos.set(nome, limparFragmento(readFileSync(join(src, 'corpo', nome), 'utf8')));
}

// 2. Validação dos dados.
const erros = [];
const ids = new Set();
for (const item of [...grupos, ...paginas]) {
  if (ids.has(item.id)) erros.push(`id repetido: ${item.id}`);
  ids.add(item.id);
}
const idsGrupos = new Set(grupos.map((g) => g.id));
for (const p of paginas) {
  if (!idsGrupos.has(p.grupo)) erros.push(`${p.id}: grupo inexistente "${p.grupo}"`);
  if (!ESTADOS[p.status]) erros.push(`${p.id}: status inválido "${p.status}"`);
  if (!Array.isArray(p.codigo) || p.codigo.length === 0) erros.push(`${p.id}: falta "codigo"`);
  if (p.corpo && !fragmentos.has(p.corpo)) erros.push(`${p.id}: fragmento inexistente "${p.corpo}"`);
  for (const [, arq] of p.docs ?? []) {
    if (!existsSync(join(docs, arq))) erros.push(`${p.id}: documento inexistente "${arq}"`);
  }
  for (const alvo of p.relacionados ?? []) {
    if (!ids.has(alvo)) erros.push(`${p.id}: relacionado inexistente "${alvo}"`);
  }
}
for (const g of grupos) {
  if (g.corpo && !fragmentos.has(g.corpo)) erros.push(`grupo ${g.id}: fragmento inexistente "${g.corpo}"`);
}
if (erros.length) {
  console.error('Erros nos dados do site:\n' + erros.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

// 3. Índice de busca: uma entrada por grupo e por página, com o caminho relativo à página que o usa.
const ordem = grupos.flatMap((g) => paginas.filter((p) => p.grupo === g.id));
const indicePara = (prefixo) => [
  ...grupos.map((g) => ({ t: g.titulo, g: 'Grupo', s: g.descricao, h: `${prefixo}${g.id}.html` })),
  ...ordem.map((p) => ({
    t: p.titulo,
    g: grupos.find((g) => g.id === p.grupo).titulo,
    s: p.resumo,
    h: `${prefixo}${p.id}.html`,
  })),
];

const contexto = (home) => ({
  home,
  grupos,
  paginas,
  ordem,
  fragmentos,
  inicio: home ? 'EXPLICACOES.html' : '../EXPLICACOES.html',
  voltaDocs: home ? '' : '../',
  pasta: home ? 'EXPLICACOES-paginas/' : '',
  indice: indicePara(home ? 'EXPLICACOES-paginas/' : ''),
});

// 4. Escrita. Só os .html da pasta de páginas são apagados, e só os que o build gera.
mkdirSync(pastaAssets, { recursive: true });
for (const arq of readdirSync(pastaSite)) {
  if (arq.endsWith('.html')) rmSync(join(pastaSite, arq));
}
copyFileSync(join(src, 'tema', 'site.css'), join(pastaAssets, 'site.css'));
copyFileSync(join(src, 'tema', 'site.js'), join(pastaAssets, 'site.js'));
copyFileSync(join(src, 'tema', 'features.js'), join(pastaAssets, 'features.js'));

writeFileSync(arquivoInicio, inicioHtml(contexto(true)), 'utf8');
for (const g of grupos) {
  writeFileSync(join(pastaSite, `${g.id}.html`), grupoHtml(contexto(false), g), 'utf8');
}
for (const p of paginas) {
  writeFileSync(join(pastaSite, `${p.id}.html`), paginaHtml(contexto(false), p), 'utf8');
}

// 5. Confere os links internos de todas as páginas geradas.
const gerados = [arquivoInicio, ...readdirSync(pastaSite).filter((f) => f.endsWith('.html')).map((f) => join(pastaSite, f))];
const quebrados = [];
for (const arq of gerados) {
  const html = readFileSync(arq, 'utf8');
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const alvo = m[1];
    if (/^(https?:|mailto:|#)/.test(alvo)) continue;
    const caminho = resolve(dirname(arq), alvo.split('#')[0]);
    if (!existsSync(caminho)) quebrados.push(`${arq} → ${alvo}`);
  }
}
if (quebrados.length) {
  console.error('Links quebrados:\n' + quebrados.map((q) => `  - ${q}`).join('\n'));
  process.exit(1);
}

console.log(`OK: início + ${grupos.length} grupos + ${paginas.length} páginas. Links internos conferidos.`);
