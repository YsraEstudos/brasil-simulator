// Gera o HTML de cada página do site. Não guarda conteúdo: recebe os dados de site.mjs.
//
// Caminhos: as páginas ficam em docs/EXPLICACOES/; a página inicial fica em docs/EXPLICACOES.html.
// `ctx.pasta` é o prefixo das páginas do site a partir do arquivo atual.
// `ctx.voltaDocs` é o prefixo até a pasta docs/, para os documentos .md.

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const ESTADOS = {
  completo: { rotulo: 'Completo', classe: 'ok', nota: 'Texto revisado.' },
  rascunho: {
    rotulo: 'Rascunho',
    classe: 'parc',
    nota: 'Resumo do tema. Os detalhes completos entram na revisão com o autor.',
  },
  pendente: {
    rotulo: 'A preencher',
    classe: 'todo',
    nota: 'Página criada, ainda sem conteúdo. Os detalhes entram depois.',
  },
};

const pill = (status) => `<span class="pill ${ESTADOS[status].classe}">${ESTADOS[status].rotulo}</span>`;
const hrefPagina = (ctx, id) => `${ctx.pasta}${id}.html`;
const hrefDoc = (ctx, arquivo) => `${ctx.voltaDocs}${arquivo}`;
const bloco = (titulo, html) => `<section class="bloco"><h2>${esc(titulo)}</h2>${html}</section>`;

function migalhas(itens) {
  const partes = itens.map((it, i) =>
    i === itens.length - 1
      ? `<span aria-current="page">${esc(it.t)}</span>`
      : `<a href="${it.h}">${esc(it.t)}</a>`,
  );
  return `<nav class="migalhas" aria-label="Caminho">${partes.join('<span class="sep" aria-hidden="true">/</span>')}</nav>`;
}

const campoBusca = (hero) =>
  `<div class="busca-wrap${hero ? ' busca-hero' : ''}">` +
  `<input class="busca" type="search" placeholder="Buscar motor, tela, sistema… (tecla /)" aria-label="Buscar no site" data-busca autocomplete="off">` +
  `<div class="resultados" data-resultados hidden></div>` +
  `</div>`;

function menuLateral(ctx, atual) {
  const grupos = ctx.grupos
    .map((g) => {
      const pags = ctx.paginas.filter((p) => p.grupo === g.id);
      const aberto = atual.grupo === g.id;
      const marca = !atual.pagina && atual.grupo === g.id ? ' aria-current="page"' : '';
      const lista = pags.length
        ? `<ul>${pags
            .map(
              (p) =>
                `<li><a href="${hrefPagina(ctx, p.id)}"${p.id === atual.pagina ? ' aria-current="page"' : ''}>${esc(p.titulo)}</a></li>`,
            )
            .join('')}</ul>`
        : '';
      return `<details${aberto ? ' open' : ''}><summary><a href="${hrefPagina(ctx, g.id)}"${marca}>${esc(g.titulo)}</a>` +
        `<span class="contagem">${pags.length || ''}</span></summary>${lista}</details>`;
    })
    .join('\n');
  return `<aside class="indice" id="indice-lateral" aria-label="Índice do site">
    <a class="inicio-link" href="${ctx.inicio}"${atual.home ? ' aria-current="page"' : ''}>Início</a>
    ${grupos}
  </aside>`;
}

function casca(ctx, atual, { titulo, descricao, main }) {
  const indiceJson = JSON.stringify(ctx.indice).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · Brasil Simulator</title>
<meta name="description" content="${esc(descricao)}">
<link rel="stylesheet" href="${ctx.pasta}assets/site.css">
<script src="${ctx.pasta}assets/site.js" defer></script>
</head>
<body>
<a class="pular" href="#conteudo">Ir para o conteúdo</a>
<header class="topo">
  <button class="menu-btn" type="button" data-menu aria-label="Abrir índice" aria-controls="indice-lateral" aria-expanded="false">☰</button>
  <a class="marca" href="${ctx.inicio}">Brasil Simulator <span>· Documentação</span></a>
  ${campoBusca(false)}
</header>
<div class="layout">
  ${menuLateral(ctx, atual)}
  <main class="conteudo" id="conteudo">
    ${main}
    <footer class="rodape">Gerado por <code>docs/explicacoes/build.mjs</code> a partir de <code>docs/explicacoes/src/</code>. Para mudar um texto, edite a fonte e rode o build.</footer>
  </main>
</div>
<script type="application/json" id="indice">${indiceJson}</script>
</body>
</html>
`;
}

const cartaoPagina = (ctx, p) =>
  `<a class="cartao" href="${hrefPagina(ctx, p.id)}"><div class="cartao-topo">${pill(p.status)}</div>` +
  `<h3>${esc(p.titulo)}</h3><p>${esc(p.resumo)}</p></a>`;

function paginacao(ctx, anterior, proxima) {
  if (!anterior && !proxima) return '';
  const link = (p, lado) =>
    p
      ? `<a class="${lado}" href="${hrefPagina(ctx, p.id)}"><small>${lado === 'ant' ? '← Anterior' : 'Próxima →'}</small><span>${esc(p.titulo)}</span></a>`
      : '<span></span>';
  return `<nav class="paginacao" aria-label="Página anterior e próxima">${link(anterior, 'ant')}${link(proxima, 'prox')}</nav>`;
}

function alvoRelacionado(ctx, id) {
  const pagina = ctx.paginas.find((p) => p.id === id);
  if (pagina) return { t: pagina.titulo, h: hrefPagina(ctx, id) };
  const grupo = ctx.grupos.find((g) => g.id === id);
  if (grupo) return { t: grupo.titulo, h: hrefPagina(ctx, id) };
  throw new Error(`relacionado inexistente: ${id}`);
}

export function inicioHtml(ctx) {
  const total = ctx.paginas.length;
  const contar = (status) => ctx.paginas.filter((p) => p.status === status).length;
  const cards = ctx.grupos
    .map((g) => {
      const n = ctx.paginas.filter((p) => p.grupo === g.id).length;
      const rotulo = n ? `${n} página${n > 1 ? 's' : ''}` : 'Visão geral';
      return `<a class="cartao" href="${hrefPagina(ctx, g.id)}"><div class="cartao-topo"><span class="contagem">${rotulo}</span></div>` +
        `<h3>${esc(g.titulo)}</h3><p>${esc(g.descricao)}</p></a>`;
    })
    .join('');
  const main = `
  <section class="hero">
    <p class="eyebrow">Documentação do jogo</p>
    <h1>Brasil Simulator</h1>
    <p>Motores, telas, sistemas de jogo, camadas técnicas e fases em um só lugar. Pesquise pelo nome ou escolha um grupo abaixo.</p>
    ${campoBusca(true)}
  </section>
  <div class="stats">
    <div class="stat"><b>${total}</b><span>páginas</span></div>
    <div class="stat"><b>${contar('completo')}</b><span>completas</span></div>
    <div class="stat"><b>${contar('rascunho')}</b><span>em rascunho</span></div>
    <div class="stat"><b>${contar('pendente')}</b><span>a preencher</span></div>
  </div>
  <h2 class="secao-titulo">Grupos</h2>
  <div class="cartoes">${cards}</div>
  <h2 class="secao-titulo">Como ler</h2>
  <div class="grid-2">
    <div class="card"><span class="meta">Motores</span><h4>O que o código calcula</h4><p>Cada motor é uma parte de <code>src/engine/</code>. Não tem interface e roda o mês.</p></div>
    <div class="card"><span class="meta">Sistemas</span><h4>O que o jogador experimenta</h4><p>Cada sistema mostra uma feature do ponto de vista de quem joga e aponta para os motores que a sustentam.</p></div>
  </div>`;
  return casca(ctx, { home: true, grupo: null, pagina: null }, {
    titulo: 'Início',
    descricao: 'Documentação do Brasil Simulator: motores, telas, sistemas, Congresso, camadas técnicas e fases.',
    main,
  });
}

export function grupoHtml(ctx, g) {
  const pags = ctx.paginas.filter((p) => p.grupo === g.id);
  const cards = pags.length
    ? `<h2 class="secao-titulo">Páginas</h2><div class="cartoes">${pags.map((p) => cartaoPagina(ctx, p)).join('')}</div>`
    : '';
  const corpo = g.corpo ? `<section class="bloco corpo">${ctx.fragmentos.get(g.corpo)}</section>` : '';
  const main = `
  ${migalhas([{ t: 'Início', h: ctx.inicio }, { t: g.titulo }])}
  <p class="eyebrow">Grupo</p>
  <h1>${esc(g.titulo)}</h1>
  <p class="resumo">${esc(g.descricao)}</p>
  ${cards}
  ${corpo}`;
  return casca(ctx, { grupo: g.id, pagina: null, home: false }, { titulo: g.titulo, descricao: g.descricao, main });
}

export function paginaHtml(ctx, p) {
  const grupo = ctx.grupos.find((g) => g.id === p.grupo);
  const i = ctx.ordem.findIndex((x) => x.id === p.id);
  const anterior = i > 0 ? ctx.ordem[i - 1] : null;
  const proxima = i < ctx.ordem.length - 1 ? ctx.ordem[i + 1] : null;

  const blocos = [];
  if (p.pontos?.length) {
    blocos.push(bloco('Como funciona', `<ul class="bullets">${p.pontos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`));
  }
  if (p.corpo) {
    blocos.push(`<section class="bloco corpo">${ctx.fragmentos.get(p.corpo)}</section>`);
  }
  blocos.push(
    bloco(
      'Onde está no código',
      `<ul class="codigo-lista">${p.codigo.map((c) => `<li><code>${esc(c)}</code></li>`).join('')}</ul>`,
    ),
  );
  if (p.docs?.length) {
    blocos.push(
      bloco(
        'Documentos',
        `<ul class="bullets">${p.docs.map(([rotulo, arq]) => `<li><a href="${hrefDoc(ctx, arq)}">${esc(rotulo)}</a></li>`).join('')}</ul>`,
      ),
    );
  }
  if (p.relacionados?.length) {
    const links = p.relacionados
      .map((id) => alvoRelacionado(ctx, id))
      .map((a) => `<a href="${a.h}">${esc(a.t)}</a>`)
      .join('');
    blocos.push(bloco('Veja também', `<div class="relacionados">${links}</div>`));
  }
  blocos.push(bloco('Estado do texto', `<p>${esc(p.nota ?? ESTADOS[p.status].nota)}</p>`));

  const main = `
  ${migalhas([{ t: 'Início', h: ctx.inicio }, { t: grupo.titulo, h: hrefPagina(ctx, grupo.id) }, { t: p.titulo }])}
  <p class="eyebrow">${esc(grupo.titulo)}</p>
  <h1>${esc(p.titulo)}</h1>
  <p class="resumo">${esc(p.resumo)}</p>
  <div class="linha-meta">${pill(p.status)}<span>${p.codigo.length} caminho${p.codigo.length > 1 ? 's' : ''} de código</span></div>
  ${blocos.join('\n  ')}
  ${paginacao(ctx, anterior, proxima)}`;

  return casca(ctx, { grupo: p.grupo, pagina: p.id, home: false }, { titulo: p.titulo, descricao: p.resumo, main });
}
