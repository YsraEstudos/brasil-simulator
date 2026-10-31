// Página "Features futuras": categorias com cartões de feature. Cada feature tem um post-it ao lado;
// ao clicar nele, o post-it se abre numa folha para escrever. Tudo fica no localStorage deste
// navegador. Exportar cópia gera um JSON de backup.
// O HTML da página vem de src/corpo/features-futuras.html.
(function () {
  'use strict';

  var CHAVE = 'brasil-features-futuras-v2';
  var CHAVE_V1 = 'brasil-features-futuras';
  var VERSAO = 2;
  var TAMANHOS = [
    ['p', 'Pequeno'],
    ['m', 'Médio'],
    ['g', 'Grande'],
    ['xg', 'Extra grande'],
  ];
  var CORES = [
    ['amarelo', 'Amarelo'],
    ['rosa', 'Rosa'],
    ['azul', 'Azul'],
    ['verde', 'Verde'],
  ];
  // Botões da barra da folha. `cmd` é o comando do execCommand; `valor` é o argumento dele.
  var BOTOES = [
    { rotulo: 'B', dica: 'Negrito', cmd: 'bold' },
    { rotulo: 'I', dica: 'Itálico', cmd: 'italic' },
    { rotulo: 'U', dica: 'Sublinhado', cmd: 'underline' },
    { rotulo: 'S', dica: 'Riscado', cmd: 'strikeThrough' },
    { rotulo: 'Título', dica: 'Transformar o parágrafo em título', cmd: 'formatBlock', valor: 'H4' },
    { rotulo: 'Lista', dica: 'Lista com marcadores', cmd: 'insertUnorderedList' },
    { rotulo: 'Tabela', dica: 'Inserir tabela', cmd: 'tabela' },
    { rotulo: 'Limpar', dica: 'Remover formatação do trecho', cmd: 'removeFormat' },
  ];
  var TABELA_MODELO =
    '<table><thead><tr><th>Item</th><th>Detalhe</th><th>Status</th></tr></thead>' +
    '<tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br></p>';
  // Tags que podem vir de uma cópia importada ou de uma colagem. Scripts e formulários somem.
  var REMOVER = /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|TEMPLATE|NOSCRIPT|FORM|INPUT|BUTTON|SELECT|TEXTAREA)$/;
  var PERMITIDAS = /^(P|BR|DIV|SPAN|B|STRONG|I|EM|U|S|STRIKE|DEL|SMALL|SUB|SUP|MARK|CODE|PRE|BLOCKQUOTE|HR|H1|H2|H3|H4|H5|H6|UL|OL|LI|A|IMG|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|CAPTION|COLGROUP|COL)$/;
  var reduzirMovimento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var raiz = document.getElementById('ft-raiz');
  if (!raiz) return;
  var categoriasEl = raiz.querySelector('[data-categorias]');
  var camada = raiz.querySelector('[data-camada]');
  var statusEl = raiz.querySelector('[data-status]');
  var importarEl = raiz.querySelector('[data-importar]');
  var avisoEl = raiz.querySelector('[data-aviso]');
  var buscaEl = raiz.querySelector('[data-busca-feat]');
  var buscaInfoEl = raiz.querySelector('[data-busca-info]');
  var arvoreEl = raiz.querySelector('[data-arvore]');
  var caminhoEl = raiz.querySelector('[data-caminho]');
  var cabecalhoEl = raiz.querySelector('[data-cabecalho]');
  var atual = null; // pasta aberta no explorador (null = raiz)
  var historico = [null]; // pastas visitadas, para Voltar e Avançar
  var posHist = 0;
  var expandidas = {}; // pastas abertas na árvore (só da tela, não vai para o arquivo)
  var selecionada = null; // pasta selecionada na área de conteúdo
  var contador = 0;
  var timer = null;
  var alteracoes = false; // há mudanças que ainda não foram gravadas no arquivo
  var arquivoOk = false; // true só se o features.js carregou de verdade (senão, gravar apagaria o arquivo)
  var gravando = false; // evita dois seletores de arquivo ao mesmo tempo
  var aberta = null; // { feat, catId, painel, origem } enquanto a folha está aberta
  var estado = carregar();
  // Versão do arquivo de onde a página partiu. A cópia do navegador guarda essa versão, para saber se ainda vale.
  var baseArquivo = assinatura(estado);

  // ---------- dados ----------

  function novoId(prefixo) {
    contador += 1;
    return prefixo + Date.now().toString(36) + contador.toString(36);
  }

  function semente() {
    return {
      versao: VERSAO,
      mostrarConcluidas: true,
      categorias: [
        {
          id: 'cat-tutorial',
          nome: 'Tutorial e ensino',
          features: [
            {
              id: 'feat-personagens',
              titulo: 'Personagens explicativos feitos por IA',
              descricao: 'Personagens ilustrados que explicam o jogo de forma visual, no lugar de textos longos.',
              concluida: false,
              cor: 'amarelo',
              html:
                '<p>O autor vai criar personagens ilustrados que explicam o jogo de forma visual ' +
                '(regras, telas e consequências das decisões), no lugar de textos longos.</p>',
            },
          ],
        },
        {
          id: 'cat-expansoes',
          nome: 'Expansões',
          features: [
            {
              id: 'feat-expansoes',
              titulo: 'Expansões',
              descricao: 'Ideias para depois da versão 1.5.',
              concluida: false,
              cor: 'azul',
              html: '<p>A definir pelo autor. Ainda não há itens nesta seção.</p>',
            },
          ],
        },
      ],
    };
  }

  // Remove tags e atributos perigosos de um HTML vindo de fora (cópia importada ou colagem).
  // O <template> é inerte: nada executa enquanto a limpeza roda.
  function limpar(html) {
    var modelo = document.createElement('template');
    modelo.innerHTML = String(html);
    limparNos(modelo.content);
    return modelo.innerHTML;
  }

  function limparNos(no) {
    Array.prototype.slice.call(no.childNodes).forEach(function (filho) {
      if (filho.nodeType === 8) {
        no.removeChild(filho);
        return;
      }
      if (filho.nodeType !== 1) return;
      var tag = filho.tagName;
      if (REMOVER.test(tag)) {
        no.removeChild(filho);
        return;
      }
      limparNos(filho);
      if (!PERMITIDAS.test(tag)) {
        // Tag desconhecida: mantém o conteúdo, sem a tag.
        while (filho.firstChild) no.insertBefore(filho.firstChild, filho);
        no.removeChild(filho);
        return;
      }
      Array.prototype.slice.call(filho.attributes).forEach(function (attr) {
        var nome = attr.name.toLowerCase();
        var valor = attr.value.replace(/\s/g, '').toLowerCase();
        if (nome.indexOf('on') === 0 || ((nome === 'href' || nome === 'src') && valor.indexOf('javascript:') === 0)) {
          filho.removeAttribute(attr.name);
        }
      });
    });
  }

  function normalizarItens(lista) {
    return (Array.isArray(lista) ? lista : []).map(function (i) {
      return { id: String(i.id || novoId('item-')), texto: String(i.texto || ''), feito: i.feito === true };
    });
  }

  function corValida(c) {
    return CORES.some(function (x) { return x[0] === c; }) ? c : 'amarelo';
  }

  function tamanhoValido(t) {
    return TAMANHOS.some(function (x) { return x[0] === t; }) ? t : 'p';
  }

  function normalizarFeature(f) {
    return {
      id: String(f.id || novoId('feat-')),
      titulo: String(f.titulo || ''),
      descricao: String(f.descricao || ''),
      concluida: f.concluida === true,
      cor: corValida(f.cor),
      tamanho: tamanhoValido(f.tamanho),
      itens: normalizarItens(f.itens),
      html: limpar(f.html || ''),
    };
  }

  // Pasta: tem features e pode ter outras pastas dentro (pastas aninhadas, em qualquer nível).
  function normalizarPasta(c) {
    var lista = Array.isArray(c.features) ? c.features : [];
    var subpastas = Array.isArray(c.pastas) ? c.pastas : [];
    return {
      id: String(c.id || novoId('cat-')),
      nome: String(c.nome || 'Sem nome'),
      features: lista.map(normalizarFeature),
      pastas: subpastas.map(normalizarPasta),
    };
  }

  function normalizar(dados) {
    if (!dados || !Array.isArray(dados.categorias)) return null;
    return {
      versao: VERSAO,
      mostrarConcluidas: dados.mostrarConcluidas !== false,
      categorias: dados.categorias.map(normalizarPasta),
    };
  }

  // Versão 1: cada "nota" era um cartão com título, tamanho e texto. Vira uma feature com post-it.
  function migrarV1(dados) {
    if (!dados || !Array.isArray(dados.categorias)) return null;
    return normalizar({
      mostrarConcluidas: dados.mostrarConcluidas,
      categorias: dados.categorias.map(function (c) {
        return {
          id: c.id,
          nome: c.nome,
          features: (Array.isArray(c.notas) ? c.notas : []).map(function (n) {
            return {
              id: n.id,
              titulo: n.titulo,
              descricao: '',
              concluida: n.concluida,
              cor: 'amarelo',
              tamanho: n.tamanho,
              itens: [],
              html: n.html,
            };
          }),
        };
      }),
    });
  }

  // Fonte da verdade: o arquivo docs/explicacoes/dados/features.js (carregado por <script>).
  function carregar() {
    var normal = null;
    try {
      normal = normalizar(window.FEATURES_DADOS);
    } catch (e) {
      normal = null;
    }
    if (normal) {
      arquivoOk = true;
      return normal;
    }
    return semente();
  }

  // Cópia de trabalho deste navegador (localStorage). Não substitui o arquivo.
  // Devolve { dados, atual, alterada } ou null:
  // - atual: a cópia parte da versão do arquivo carregada agora;
  // - alterada: a cópia tem mudanças que ainda não foram gravadas no arquivo.
  function lerCache() {
    try {
      var bruto = localStorage.getItem(CHAVE);
      if (bruto) {
        var guardado = JSON.parse(bruto);
        if (guardado && guardado.dados) {
          var dados = normalizar(guardado.dados);
          if (!dados) return null;
          return { dados: dados, atual: guardado.base === baseArquivo, alterada: guardado.alterada !== false };
        }
        // Formato anterior: só os dados, sem registro de versão.
        var normal = normalizar(guardado);
        if (normal) return { dados: normal, atual: true, alterada: true };
      }
      var antigo = localStorage.getItem(CHAVE_V1);
      var v1 = antigo ? migrarV1(JSON.parse(antigo)) : null;
      if (v1) return { dados: v1, atual: true, alterada: true };
    } catch (e) {
      // Sem armazenamento ou dado corrompido: ignora a cópia.
    }
    return null;
  }

  function statusAtual() {
    return alteracoes
      ? 'Alterações não salvas no arquivo (Ctrl+S)'
      : 'Salvo no arquivo features.js';
  }

  // Compara duas versões só pelo conteúdo (normalizadas). "Mostrar concluídas" é preferência de visualização: não conta.
  function assinatura(dados) {
    var normal = normalizar(JSON.parse(JSON.stringify(dados)));
    if (normal) delete normal.mostrarConcluidas;
    return JSON.stringify(normal);
  }

  // Features e pastas do conteúdo, por id: para contar o que difere entre a cópia e o arquivo.
  function mapaDe(dados) {
    var feats = {};
    var pastas = {};
    (function percorrer(lista, paiId) {
      lista.forEach(function (c) {
        pastas[c.id] = JSON.stringify([c.nome, paiId]);
        c.features.forEach(function (f) { feats[f.id] = JSON.stringify([c.id, f]); });
        percorrer(c.pastas, c.id);
      });
    })(dados.categorias, null);
    return { features: feats, pastas: pastas };
  }

  // Quantos ids são diferentes entre dois mapas (sumiu, apareceu ou mudou).
  function quantosDiferentes(a, b) {
    var ids = Object.keys(a).concat(Object.keys(b));
    return ids.filter(function (id, i) { return ids.indexOf(id) === i && a[id] !== b[id]; }).length;
  }

  // Texto do aviso: "Diferenças: 2 features e 1 pasta." (vazio se não há diferença de conteúdo).
  function textoDiferencas(copia) {
    var daCopia = mapaDe(copia);
    var doArquivo = mapaDe(estado);
    var nf = quantosDiferentes(daCopia.features, doArquivo.features);
    var np = quantosDiferentes(daCopia.pastas, doArquivo.pastas);
    var partes = [];
    if (nf) partes.push(plural(nf, 'feature', 'features'));
    if (np) partes.push(plural(np, 'pasta', 'pastas'));
    return partes.length ? 'Diferenças: ' + partes.join(' e ') + '.' : '';
  }

  // Preferências de visualização ficam neste navegador, separadas do arquivo e da cópia de conteúdo.
  var CHAVE_VISTA = 'brasil-features-futuras-vista';

  function lerVista() {
    try {
      var v = JSON.parse(localStorage.getItem(CHAVE_VISTA) || 'null');
      return v && typeof v.mostrarConcluidas === 'boolean' ? v.mostrarConcluidas : null;
    } catch (e) {
      return null;
    }
  }

  function gravarVista() {
    try {
      localStorage.setItem(CHAVE_VISTA, JSON.stringify({ mostrarConcluidas: estado.mostrarConcluidas }));
    } catch (e) {
      // Sem armazenamento: a preferência vale só até recarregar a página.
    }
  }

  // Grava a cópia: a versão do arquivo de origem, os dados da tela e se há algo ainda não gravado no arquivo.
  function gravarCache() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ base: baseArquivo, alterada: alteracoes, dados: estado }));
    } catch (e) {
      // Sem armazenamento: o aviso de alterações não salvas continua valendo.
    }
  }

  function salvar() {
    alteracoes = true;
    gravarCache();
    mostrarStatus(statusAtual());
  }

  // "Ignorar" descarta as alterações que existem só neste navegador. Pede confirmação, porque não tem volta.
  function ignorarLocal() {
    if (!window.confirm('Descartar as alterações que existem só neste navegador? O arquivo features.js não muda.')) return;
    avisoEl.hidden = true;
    alteracoes = false;
    gravarCache();
    mostrarStatus(statusAtual());
  }

  // ---------- gravação no arquivo (File System Access API, Edge/Chrome) ----------

  function abrirBanco() {
    return new Promise(function (ok, erro) {
      var req = indexedDB.open('brasil-features', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('arquivo'); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { erro(req.error); };
    });
  }

  // Guarda a permissão de arquivo, para o próximo Ctrl+S gravar sem perguntar de novo.
  function guardarHandle(handle) {
    return abrirBanco().then(function (db) {
      return new Promise(function (ok, erro) {
        var tx = db.transaction('arquivo', 'readwrite');
        tx.objectStore('arquivo').put(handle, 'features');
        tx.oncomplete = function () { db.close(); ok(); };
        tx.onerror = function () { erro(tx.error); };
      });
    });
  }

  function lerHandle() {
    return abrirBanco().then(function (db) {
      return new Promise(function (ok, erro) {
        var req = db.transaction('arquivo', 'readonly').objectStore('arquivo').get('features');
        req.onsuccess = function () { db.close(); ok(req.result || null); };
        req.onerror = function () { db.close(); erro(req.error); };
      });
    });
  }

  // Usa o arquivo já escolhido, se a permissão continuar valendo; senão, pergunta qual é o arquivo.
  function obterHandle() {
    return lerHandle()
      .catch(function () { return null; })
      .then(function (handle) {
        if (handle) {
          return handle.queryPermission({ mode: 'readwrite' }).then(function (p) {
            if (p === 'granted') return handle;
            return handle.requestPermission({ mode: 'readwrite' }).then(function (r) {
              return r === 'granted' ? handle : escolherArquivo();
            });
          });
        }
        return escolherArquivo();
      });
  }

  function escolherArquivo() {
    return window.showSaveFilePicker({
      suggestedName: 'features.js',
      types: [{ description: 'Arquivo JavaScript', accept: { 'text/javascript': ['.js'] } }],
    }).then(function (handle) {
      // Se não der para guardar a permissão, a gravação atual continua valendo.
      return guardarHandle(handle)
        .catch(function () { return null; })
        .then(function () { return handle; });
    });
  }

  function conteudoDoArquivo() {
    return 'window.FEATURES_DADOS = ' + JSON.stringify(estado, null, 2) + ';\n';
  }

  function baixarArquivo() {
    var blob = new Blob([conteudoDoArquivo()], { type: 'text/javascript' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'features.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    mostrarStatus('Arquivo baixado: substitua docs/explicacoes/dados/features.js por ele');
  }

  function salvarNoArquivo() {
    if (gravando) return Promise.resolve();
    if (!arquivoOk) {
      mostrarStatus('Não consegui ler features.js nesta página. Gravar foi desligado para não apagar o arquivo: recarregue a página.');
      return Promise.resolve();
    }
    if (!window.showSaveFilePicker) {
      baixarArquivo();
      return Promise.resolve();
    }
    // Foto dos dados no momento do Ctrl+S: o que for editado durante a gravação fica como não salvo.
    var foto = assinatura(estado);
    var conteudo = conteudoDoArquivo();
    gravando = true;
    mostrarStatus('Gravando no arquivo…');
    return obterHandle()
      .then(function (handle) {
        return handle.createWritable().then(function (w) {
          return w.write(conteudo).then(function () { return w.close(); });
        });
      })
      .then(function () {
        baseArquivo = foto;
        alteracoes = assinatura(estado) !== foto;
        gravarCache();
        mostrarStatus(alteracoes ? 'Gravado, mas há alterações novas. Aperte Ctrl+S de novo.' : 'Salvo no arquivo features.js');
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') {
          mostrarStatus(statusAtual());
          return;
        }
        mostrarStatus('Não foi possível gravar o arquivo. Tente de novo ou use Exportar cópia.');
      })
      .then(function () { gravando = false; });
  }

  function agendarSalvar() {
    mostrarStatus('Salvando…');
    clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      salvar();
    }, 400);
  }

  // Ao sair da página, grava o que ainda estava na fila.
  window.addEventListener('pagehide', function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      salvar();
    }
  });

  function mostrarStatus(texto) {
    statusEl.textContent = texto;
  }

  // Procura uma pasta em qualquer nível da árvore.
  function acharPasta(lista, id) {
    for (var i = 0; i < lista.length; i += 1) {
      if (lista[i].id === id) return lista[i];
      var dentro = acharPasta(lista[i].pastas, id);
      if (dentro) return dentro;
    }
    return undefined;
  }

  function categoria(id) {
    return acharPasta(estado.categorias, id);
  }

  // Pastas do caminho até a pasta indicada, da raiz até ela (lista vazia na raiz ou se não existir).
  function trilhaDa(id) {
    function procurar(lista, anteriores) {
      for (var i = 0; i < lista.length; i += 1) {
        var caminho = anteriores.concat([lista[i]]);
        if (lista[i].id === id) return caminho;
        var dentro = procurar(lista[i].pastas, caminho);
        if (dentro) return dentro;
      }
      return null;
    }
    return (id && procurar(estado.categorias, [])) || [];
  }

  // Lista onde a pasta está (a raiz ou as subpastas do pai), a posição dela e o pai (null na raiz).
  function localDaPasta(id, lista, pai) {
    for (var i = 0; i < lista.length; i += 1) {
      if (lista[i].id === id) return { lista: lista, indice: i, pai: pai };
      var dentro = localDaPasta(id, lista[i].pastas, lista[i]);
      if (dentro) return dentro;
    }
    return null;
  }

  // A pasta que contém a feature.
  function pastaDaFeature(featId, lista) {
    for (var i = 0; i < lista.length; i += 1) {
      if (lista[i].features.some(function (f) { return f.id === featId; })) return lista[i];
      var dentro = pastaDaFeature(featId, lista[i].pastas);
      if (dentro) return dentro;
    }
    return null;
  }

  // Todas as pastas com o caminho completo ("Caminho eleitoral / Progressão e viabilidade").
  function listarPastas(lista, caminho, saida) {
    lista.forEach(function (c) {
      var nome = caminho ? caminho + ' / ' + c.nome : c.nome;
      saida.push({ id: c.id, caminho: nome });
      listarPastas(c.pastas, nome, saida);
    });
    return saida;
  }

  // Features da pasta e de todas as subpastas dela.
  function todasFeatures(c) {
    var lista = c.features.slice();
    c.pastas.forEach(function (p) { lista = lista.concat(todasFeatures(p)); });
    return lista;
  }

  function feature(catId, featId) {
    var c = categoria(catId);
    return c ? c.features.find(function (f) { return f.id === featId; }) : undefined;
  }

  function textoDe(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Inclinação fixa por post-it: o mesmo id sempre fica com o mesmo ângulo.
  function inclinacao(id) {
    var soma = 0;
    for (var i = 0; i < id.length; i += 1) soma += id.charCodeAt(i);
    return ((soma % 5) - 2) * 0.7;
  }

  // Contagem de itens feitos e não feitos, mostrada no post-it fechado.
  function contagem(f) {
    var feitos = f.itens.filter(function (i) { return i.feito; }).length;
    return { feitos: feitos, pendentes: f.itens.length - feitos, total: f.itens.length };
  }

  function montarContagem(f) {
    if (!f.itens.length) return null;
    var c = contagem(f);
    return el('span', {
      classe: 'ft-post-contagem',
      texto: '✓ ' + c.feitos + ' feitas · ○ ' + c.pendentes + ' não feitas',
    });
  }

  // Atualiza a prévia e a contagem do post-it no cartão, sem re-renderizar a página.
  function atualizarPost(f) {
    var post = document.querySelector('[data-feat="' + f.id + '"] .ft-post');
    if (!post) return;
    var previa = textoDe(f.html);
    post.querySelector('.ft-post-previa').textContent = previa || 'Clique para escrever…';
    post.classList.toggle('com-texto', !!previa);
    var antiga = post.querySelector('.ft-post-contagem');
    if (antiga) antiga.remove();
    var nova = montarContagem(f);
    if (nova) post.appendChild(nova);
  }

  // ---------- pesquisa ----------

  // Ignora maiúsculas e acentos: "negociacao" acha "Negociação".
  function normalizarBusca(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function palavrasDaBusca() {
    return normalizarBusca(buscaEl.value).trim().split(/\s+/).filter(Boolean);
  }

  function buscando() {
    return palavrasDaBusca().length > 0;
  }

  // Tudo o que a feature guarda: categoria, nome, descrição, anotações e itens.
  function textoBusca(c, f) {
    return normalizarBusca([c.nome, f.titulo, f.descricao, textoDe(f.html)]
      .concat(f.itens.map(function (i) { return i.texto; }))
      .join(' '));
  }

  // Trecho da fonte em volta da palavra achada, com a palavra destacada.
  function trechoDestacado(texto, palavra) {
    var pos = normalizarBusca(texto).indexOf(palavra);
    if (pos === -1) return null;
    var ini = Math.max(0, pos - 45);
    var fim = Math.min(texto.length, pos + palavra.length + 75);
    return el('span', {}, [
      document.createTextNode((ini > 0 ? '… ' : '') + texto.slice(ini, pos)),
      el('mark', { texto: texto.slice(pos, pos + palavra.length) }),
      document.createTextNode(texto.slice(pos + palavra.length, fim) + (fim < texto.length ? ' …' : '')),
    ]);
  }

  // Mostra no cartão o trecho que bate com a pesquisa nas anotações ou nos itens.
  function mostrarTrecho(art, f, palavras) {
    var notas = textoDe(f.html);
    var itens = f.itens.map(function (i) { return i.texto; }).join(' · ');
    var fonteNotas = palavras.some(function (p) { return normalizarBusca(notas).indexOf(p) !== -1; });
    var fonte = fonteNotas ? notas : itens;
    var achada = palavras.find(function (p) { return normalizarBusca(fonte).indexOf(p) !== -1; });
    var trecho = achada ? trechoDestacado(fonte, achada) : null;
    if (!trecho) return;
    var corpo = art.querySelector('.ft-feat-corpo');
    corpo.insertBefore(
      el('p', { classe: 'ft-busca-trecho' }, [el('b', { texto: fonteNotas ? 'Nas anotações: ' : 'No checklist: ' }), trecho]),
      corpo.querySelector('.ft-feat-rodape')
    );
  }

  // Esconde features e categorias que não batem com a pesquisa e mostra o trecho achado.
  function aplicarBusca() {
    var palavras = palavrasDaBusca();
    var filtrando = palavras.length > 0;
    var encontradas = 0;
    var total = 0;

    categoriasEl.querySelectorAll('.ft-feat').forEach(function (art) {
      var c = categoria(art.getAttribute('data-cat'));
      var f = c && feature(c.id, art.getAttribute('data-feat'));
      var casa = !!f && palavras.every(function (p) { return textoBusca(c, f).indexOf(p) !== -1; });
      total += 1;
      art.querySelectorAll('.ft-busca-trecho').forEach(function (t) { t.remove(); });
      art.hidden = filtrando && !casa;
      if (!casa) return;
      encontradas += 1;
      if (filtrando) mostrarTrecho(art, f, palavras);
    });
    buscaInfoEl.textContent = !filtrando
      ? ''
      : encontradas ? encontradas + ' de ' + total + ' features' : 'Nenhuma feature encontrada';
  }

  // ---------- montagem ----------

  function el(tag, props, filhos) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (k === 'texto') n.textContent = v;
      else if (k === 'classe') n.className = v;
      else if (k === 'attrs') Object.keys(v).forEach(function (a) { n.setAttribute(a, v[a]); });
      else n[k] = v;
    });
    (filhos || []).forEach(function (f) { n.appendChild(f); });
    return n;
  }

  // ---------- explorador de pastas ----------

  function render() {
    renderArvore();
    renderCaminho();
    renderCabecalho();
    renderConteudo();
    renderNav();
    aplicarBusca();
  }

  function plural(n, um, varias) {
    return n + ' ' + (n === 1 ? um : varias);
  }

  // "3 de 7 concluídas", no cabeçalho de cada pasta.
  function resumoConcluidas(lista) {
    var feitas = lista.filter(function (f) { return f.concluida; }).length;
    return el('span', { classe: 'ft-contagem', texto: feitas + ' de ' + lista.length + ' concluídas' });
  }

  // Abre uma pasta (null = raiz) e registra no histórico, como o Voltar de um explorador.
  function navegar(id) {
    if (id === atual && historico[posHist] === id) return;
    historico = historico.slice(0, posHist + 1);
    historico.push(id);
    posHist = historico.length - 1;
    mostrar(id);
  }

  // Troca a pasta aberta sem mexer no histórico (usado por Voltar e Avançar também).
  function mostrar(id) {
    atual = categoria(id) ? id : null;
    trilhaDa(atual).forEach(function (c) { expandidas[c.id] = true; });
    selecionada = null;
    render();
    animarConteudo();
  }

  function voltar() {
    if (posHist === 0) return;
    posHist -= 1;
    mostrar(historico[posHist]);
  }

  function avancar() {
    if (posHist >= historico.length - 1) return;
    posHist += 1;
    mostrar(historico[posHist]);
  }

  function subir() {
    var trilha = trilhaDa(atual);
    navegar(trilha.length > 1 ? trilha[trilha.length - 2].id : null);
  }

  // A área de conteúdo desliza ao trocar de pasta (a animação é do navegador, não do CSS).
  function animarConteudo() {
    if (reduzirMovimento) return;
    categoriasEl.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }

  function renderNav() {
    raiz.querySelector('[data-acao="voltar"]').disabled = posHist === 0;
    raiz.querySelector('[data-acao="avancar"]').disabled = posHist >= historico.length - 1;
    raiz.querySelector('[data-acao="subir"]').disabled = !atual;
  }

  // Árvore à esquerda: cada pasta com setinha para abrir ou fechar as subpastas.
  function noArvore(c, nivel) {
    var tem = c.pastas.length > 0;
    var seta = el('span', {
      classe: 'ft-arv-seta' + (tem ? '' : ' vazia') + (expandidas[c.id] ? ' aberta' : ''),
      texto: '▸',
      attrs: { 'data-seta': c.id, 'aria-hidden': 'true' },
    });
    var linha = el('button', {
      classe: 'ft-arv-linha' + (c.id === atual ? ' ativa' : ''),
      type: 'button',
      draggable: true,
      attrs: {
        'data-arv': c.id,
        'data-destino': c.id,
        'data-pasta': c.id,
        'data-arrastar': 'pasta',
        'aria-current': c.id === atual ? 'true' : 'false',
        title: c.nome,
        style: '--nivel:' + nivel,
      },
    }, [seta, iconePasta(false), el('span', { classe: 'ft-arv-nome', texto: c.nome })]);
    var filhos = el('div', {
      classe: 'ft-arv-filhos' + (expandidas[c.id] ? '' : ' ft-fechado'),
      attrs: { 'data-filhos': c.id },
    }, [el('div', {}, c.pastas.map(function (p) { return noArvore(p, nivel + 1); }))]);
    return el('div', { classe: 'ft-arv-no' }, [linha, filhos]);
  }

  function renderArvore() {
    arvoreEl.textContent = '';
    arvoreEl.appendChild(el('button', {
      classe: 'ft-arv-linha ft-arv-raiz' + (atual === null ? ' ativa' : ''),
      type: 'button',
      attrs: {
        'data-arv': 'raiz',
        'data-destino': 'raiz',
        'aria-current': atual === null ? 'true' : 'false',
        style: '--nivel:0',
      },
    }, [el('span', { classe: 'ft-arv-seta vazia', attrs: { 'aria-hidden': 'true' } }), iconePasta(true), el('span', { classe: 'ft-arv-nome', texto: 'Features' })]));
    arvoreEl.appendChild(el('div', { classe: 'ft-arv-filhos', attrs: { 'data-filhos': 'raiz' } }, [
      el('div', {}, estado.categorias.map(function (c) { return noArvore(c, 1); })),
    ]));
  }

  // Abre ou fecha as subpastas de uma linha da árvore, com a animação do CSS.
  function alternarNaArvore(id) {
    expandidas[id] = !expandidas[id];
    var filhos = arvoreEl.querySelector('[data-filhos="' + id + '"]');
    var seta = arvoreEl.querySelector('[data-seta="' + id + '"]');
    if (filhos) filhos.classList.toggle('ft-fechado', !expandidas[id]);
    if (seta) seta.classList.toggle('aberta', !!expandidas[id]);
  }

  // Caminho clicável no topo: Features › Caminho eleitoral › Progressão.
  function renderCaminho() {
    caminhoEl.textContent = '';
    if (buscando()) {
      caminhoEl.appendChild(el('span', { classe: 'ft-caminho-item atual', texto: 'Pesquisa em todas as pastas' }));
      return;
    }
    var partes = [{ id: null, nome: 'Features' }].concat(trilhaDa(atual));
    partes.forEach(function (p, i) {
      var ultima = i === partes.length - 1;
      if (i > 0) caminhoEl.appendChild(el('span', { classe: 'ft-caminho-sep', texto: '›', attrs: { 'aria-hidden': 'true' } }));
      caminhoEl.appendChild(el('button', {
        classe: 'ft-caminho-item' + (ultima ? ' atual' : ''),
        type: 'button',
        texto: p.nome,
        attrs: {
          'data-arv': p.id || 'raiz',
          'data-destino': p.id || 'raiz',
          'aria-current': ultima ? 'page' : 'false',
        },
      }));
    });
  }

  // Cabeçalho: nome da pasta aberta (editável), resumo e ações dela.
  function renderCabecalho() {
    cabecalhoEl.textContent = '';
    var c = categoria(atual);
    if (buscando()) {
      cabecalhoEl.appendChild(el('h3', { classe: 'ft-cab-titulo', texto: 'Resultados da pesquisa' }));
      return;
    }
    if (!c) {
      var tudo = [];
      estado.categorias.forEach(function (p) { tudo = tudo.concat(todasFeatures(p)); });
      cabecalhoEl.appendChild(el('div', { classe: 'ft-cat-titulo' }, [el('h3', { classe: 'ft-cab-titulo', texto: 'Features' }), resumoConcluidas(tudo)]));
      return;
    }
    var titulo = el('input', {
      classe: 'ft-titulo-cat',
      type: 'text',
      value: c.nome,
      attrs: { 'aria-label': 'Nome da pasta aberta', 'data-campo': 'nome-cat', 'data-cat': c.id },
    });
    cabecalhoEl.appendChild(el('div', { classe: 'ft-cat-titulo' }, [titulo, resumoConcluidas(todasFeatures(c))]));
    cabecalhoEl.appendChild(el('div', { classe: 'ft-cat-acoes' }, [
      el('button', { classe: 'ft-btn primario', type: 'button', texto: '+ Feature', attrs: { 'data-acao': 'nova-feature', 'data-cat': c.id } }),
      el('button', { classe: 'ft-btn perigo', type: 'button', texto: 'Excluir pasta', attrs: { 'data-acao': 'excluir-cat', 'data-cat': c.id } }),
    ]));
  }

  // Todas as features de todas as pastas, com o caminho de cada uma (usado na pesquisa).
  function featuresComCaminho(lista, caminho, saida) {
    lista.forEach(function (c) {
      var nome = caminho ? caminho + ' / ' + c.nome : c.nome;
      c.features.forEach(function (f) { saida.push({ c: c, f: f, caminho: nome }); });
      featuresComCaminho(c.pastas, nome, saida);
    });
    return saida;
  }

  // Conteúdo: na raiz, as pastas de primeiro nível; numa pasta, subpastas e features; na pesquisa, tudo em lista.
  function renderConteudo() {
    categoriasEl.textContent = '';
    if (buscando()) {
      var encontrados = featuresComCaminho(estado.categorias, '', []);
      categoriasEl.appendChild(encontrados.length
        ? el('div', { classe: 'ft-grade' }, encontrados.map(function (x) { return renderFeature(x.c, x.f, x.caminho); }))
        : el('p', { classe: 'ft-vazio', texto: 'Ainda não há features cadastradas.' }));
      return;
    }
    var c = categoria(atual);
    if (!c) {
      categoriasEl.appendChild(renderPastas(estado.categorias, 'Pastas', 'Nenhuma pasta ainda. Use “+ Nova pasta” para criar a primeira.'));
      return;
    }
    if (c.pastas.length) categoriasEl.appendChild(renderPastas(c.pastas, 'Subpastas', ''));
    categoriasEl.appendChild(renderGrade(c));
  }

  function renderPastas(lista, rotulo, vazio) {
    return el('section', { classe: 'ft-secao' }, [
      el('h4', { classe: 'ft-secao-rotulo', texto: rotulo }),
      lista.length
        ? el('div', { classe: 'ft-pastas-grade' }, lista.map(renderItemPasta))
        : el('p', { classe: 'ft-vazio', texto: vazio }),
    ]);
  }

  // Pasta como ícone grande: um clique seleciona, dois cliques (ou Enter) abre.
  function renderItemPasta(c) {
    var info = [plural(todasFeatures(c).length, 'feature', 'features')];
    if (c.pastas.length) info.push(plural(c.pastas.length, 'subpasta', 'subpastas'));
    var icone = iconePasta(false);
    icone.classList.add('ft-pasta-grande');
    return el('button', {
      classe: 'ft-item-pasta' + (c.id === selecionada ? ' selecionada' : ''),
      type: 'button',
      draggable: true,
      attrs: {
        'data-arrastar': 'pasta',
        'data-pasta': c.id,
        'data-destino': c.id,
        'data-abrir': c.id,
        'aria-label': 'Pasta ' + c.nome + ', ' + info.join(', ') + '. Clique duas vezes para abrir.',
        title: c.nome + ' (clique duas vezes para abrir)',
      },
    }, [icone, el('span', { classe: 'ft-item-nome', texto: c.nome }), el('span', { classe: 'ft-item-info', texto: info.join(' · ') })]);
  }

  // Features da pasta aberta. Ela é alvo de arraste: soltar numa posição reordena.
  function renderGrade(c) {
    var visiveis = c.features.filter(function (f) { return estado.mostrarConcluidas || !f.concluida; });
    var grade = el('div', { classe: 'ft-grade', attrs: { 'data-grade': c.id } }, visiveis.map(function (f) { return renderFeature(c, f); }));
    if (!visiveis.length) {
      grade.appendChild(el('p', {
        classe: 'ft-vazio',
        texto: c.features.length
          ? 'Todas as features desta pasta estão concluídas. Marque “Mostrar concluídas” para vê-las.'
          : 'Nenhuma feature nesta pasta. Use “+ Feature” ou arraste uma feature para cá.',
      }));
    }
    return el('section', { classe: 'ft-secao' }, [el('h4', { classe: 'ft-secao-rotulo', texto: 'Features' }), grade]);
  }

  // Ícone de pasta: fechada ou aberta (a aba de cima se levanta).
  var ICONE_PASTA = {
    fechada: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 6.5A2 2 0 0 1 4.5 4.5h4.6c.5 0 .98.2 1.33.56L11.9 6.5h7.6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2z" fill="currentColor"/></svg>',
    aberta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 6.5A2 2 0 0 1 4.5 4.5h4.6c.5 0 .98.2 1.33.56L11.9 6.5h7.6a2 2 0 0 1 2 2V9H6.3a2 2 0 0 0-1.9 1.4L2.5 17.5z" fill="currentColor" opacity=".55"/><path d="M5.6 10.6A2 2 0 0 1 7.5 9.2h14.2a1 1 0 0 1 .95 1.3l-2.2 6.9a2 2 0 0 1-1.9 1.4H4.5a1 1 0 0 1-.95-1.3z" fill="currentColor"/></svg>',
  };

  // O SVG vem só da constante acima (nunca de conteúdo do usuário), por isso pode ir por innerHTML.
  function iconePasta(aberta) {
    var icone = el('span', { classe: 'ft-pasta-icone', attrs: { 'aria-hidden': 'true' } });
    icone.innerHTML = aberta ? ICONE_PASTA.aberta : ICONE_PASTA.fechada;
    return icone;
  }

  // "caminho" só vem na pesquisa, para dizer em qual pasta a feature está.
  function renderFeature(c, f, caminho) {
    var concluida = el('label', { classe: 'ft-check' }, [
      el('input', { type: 'checkbox', checked: f.concluida, attrs: { 'data-campo': 'concluida' } }),
      el('span', { texto: 'Concluída' }),
    ]);
    var tamanho = el('select', {
      classe: 'ft-select',
      attrs: { 'aria-label': 'Tamanho do cartão', 'data-campo': 'tamanho' },
    }, TAMANHOS.map(function (t) {
      return el('option', { value: t[0], texto: t[1], selected: t[0] === f.tamanho });
    }));
    var titulo = el('input', {
      classe: 'ft-titulo-feat',
      type: 'text',
      value: f.titulo,
      placeholder: 'Nome da feature',
      attrs: { 'aria-label': 'Nome da feature', 'data-campo': 'titulo' },
    });
    var descricao = el('textarea', {
      classe: 'ft-desc-feat',
      rows: 2,
      value: f.descricao,
      placeholder: 'Descreva em uma ou duas frases',
      attrs: { 'aria-label': 'Descrição da feature', 'data-campo': 'descricao' },
    });
    var excluir = el('button', {
      classe: 'ft-btn ft-mini perigo',
      type: 'button',
      texto: 'Excluir feature',
      attrs: { 'data-acao': 'excluir-feat' },
    });
    var arrastar = el('button', {
      classe: 'ft-grip',
      type: 'button',
      texto: '⠿',
      draggable: true,
      attrs: { 'data-arrastar': 'feat', 'aria-label': 'Arrastar feature para outra pasta', title: 'Arraste para outra pasta' },
    });
    // Mover sem arrastar: escolhe a pasta de destino (também funciona no teclado).
    var mover = el('select', {
      classe: 'ft-select ft-mover',
      attrs: { 'aria-label': 'Mover feature para outra pasta', 'data-campo': 'mover' },
    }, [el('option', { value: '', texto: 'Mover para…' })].concat(
      listarPastas(estado.categorias, '', []).map(function (p) {
        return el('option', { value: p.id, texto: p.caminho, disabled: p.id === c.id });
      })
    ));
    var textoCard = el('div', { classe: 'ft-feat-corpo' }, [
      el('div', { classe: 'ft-feat-topo' }, [arrastar, concluida, tamanho]),
      titulo,
      descricao,
      el('div', { classe: 'ft-feat-rodape' }, [mover, excluir]),
    ]);
    if (caminho) textoCard.insertBefore(el('p', { classe: 'ft-feat-caminho', texto: caminho }), textoCard.firstChild);

    var previa = textoDe(f.html);
    var post = el('button', {
      classe: 'ft-post ft-cor-' + f.cor + (previa ? ' com-texto' : ''),
      type: 'button',
      attrs: {
        'data-acao': 'abrir-nota',
        'aria-label': 'Abrir post-it da feature ' + (f.titulo || 'sem nome'),
        style: '--giro:' + inclinacao(f.id) + 'deg',
      },
    }, [
      el('span', { classe: 'ft-post-rotulo', texto: 'Anotações' }),
      el('span', { classe: 'ft-post-previa', texto: previa || 'Clique para escrever…' }),
    ].concat(montarContagem(f) ? [montarContagem(f)] : []));

    return el('article', {
      classe: 'ft-feat ft-t-' + f.tamanho + (f.concluida ? ' feita' : ''),
      attrs: { 'data-cat': c.id, 'data-feat': f.id },
    }, [textoCard, post]);
  }

  // ---------- checklist dentro do post-it ----------

  function resumoChecklist(f) {
    var c = contagem(f);
    return c.total ? c.feitos + ' de ' + c.total + ' feitas' : 'sem itens';
  }

  function montarChecklist(f) {
    var lista = el('ul', { classe: 'ft-itens' });
    f.itens.forEach(function (it) {
      lista.appendChild(el('li', { classe: 'ft-item' + (it.feito ? ' feito' : ''), attrs: { 'data-item': it.id } }, [
        el('input', { type: 'checkbox', checked: it.feito, attrs: { 'data-campo': 'item-feito', 'aria-label': 'Item feito' } }),
        el('input', { classe: 'ft-item-texto', type: 'text', value: it.texto, attrs: { 'data-campo': 'item-texto', 'aria-label': 'Texto do item' } }),
        el('button', { classe: 'ft-btn ft-icone', type: 'button', texto: '×', attrs: { 'data-acao': 'remover-item', 'aria-label': 'Remover item', title: 'Remover item' } }),
      ]));
    });
    if (!f.itens.length) {
      lista.appendChild(el('li', { classe: 'ft-vazio', texto: 'Nenhum item ainda. Adicione abaixo o que precisa ser feito.' }));
    }
    return el('section', { classe: 'ft-checklist' }, [
      el('div', { classe: 'ft-checklist-topo' }, [
        el('h4', { texto: 'Checklist' }),
        el('span', { classe: 'ft-contagem', texto: resumoChecklist(f) }),
      ]),
      lista,
      el('div', { classe: 'ft-item-novo' }, [
        el('input', { type: 'text', placeholder: 'Novo item (Enter para adicionar)', attrs: { 'data-campo': 'novo-item', 'aria-label': 'Novo item' } }),
        el('button', { classe: 'ft-btn ft-mini', type: 'button', texto: 'Adicionar', attrs: { 'data-acao': 'adicionar-item' } }),
      ]),
    ]);
  }

  // Redesenha só o checklist da folha aberta (depois de adicionar, remover ou marcar um item).
  function redesenharChecklist(f) {
    var antigo = aberta.painel.querySelector('.ft-checklist');
    if (antigo) antigo.replaceWith(montarChecklist(f));
  }

  function adicionarItem() {
    if (!aberta) return;
    var f = feature(aberta.catId, aberta.featId);
    var campo = aberta.painel.querySelector('[data-campo="novo-item"]');
    if (!f || !campo) return;
    var texto = campo.value.trim();
    if (!texto) return;
    f.itens.push({ id: novoId('item-'), texto: texto, feito: false });
    salvar();
    redesenharChecklist(f);
    atualizarPost(f);
    aberta.painel.querySelector('[data-campo="novo-item"]').focus();
  }

  function removerItem(li) {
    if (!aberta) return;
    var f = feature(aberta.catId, aberta.featId);
    if (!f) return;
    var id = li.getAttribute('data-item');
    f.itens = f.itens.filter(function (i) { return i.id !== id; });
    salvar();
    redesenharChecklist(f);
    atualizarPost(f);
  }

  function marcarItem(li, feito) {
    if (!aberta) return;
    var f = feature(aberta.catId, aberta.featId);
    var item = f && f.itens.find(function (i) { return i.id === li.getAttribute('data-item'); });
    if (!item) return;
    item.feito = feito;
    salvar();
    redesenharChecklist(f);
    atualizarPost(f);
  }

  // ---------- folha aberta (post-it expandido) ----------

  function montarFolha(c, f) {
    var titulo = el('input', {
      classe: 'ft-folha-titulo',
      type: 'text',
      value: f.titulo,
      placeholder: 'Nome da feature',
      attrs: { 'aria-label': 'Nome da feature', 'data-campo': 'titulo-folha' },
    });
    var cores = el('div', { classe: 'ft-cores', attrs: { role: 'radiogroup', 'aria-label': 'Cor do post-it' } },
      CORES.map(function (cor) {
        return el('button', {
          classe: 'ft-cor-bolinha ft-cor-' + cor[0] + (cor[0] === f.cor ? ' ativa' : ''),
          type: 'button',
          title: cor[1],
          attrs: { 'aria-label': 'Cor ' + cor[1], 'aria-pressed': String(cor[0] === f.cor), 'data-cor': cor[0] },
        });
      })
    );
    var concluida = el('label', { classe: 'ft-check' }, [
      el('input', { type: 'checkbox', checked: f.concluida, attrs: { 'data-campo': 'concluida-folha' } }),
      el('span', { texto: 'Concluída' }),
    ]);
    var fechar = el('button', {
      classe: 'ft-btn ft-icone',
      type: 'button',
      texto: '×',
      attrs: { 'aria-label': 'Fechar post-it', title: 'Fechar (Esc)', 'data-acao': 'fechar-nota' },
    });
    var topo = el('header', { classe: 'ft-folha-topo' }, [titulo, cores, concluida, fechar]);

    var barra = el('div', { classe: 'ft-editor-barra' }, BOTOES.map(function (b) {
      var attrs = { 'data-cmd': b.cmd };
      if (b.valor) attrs['data-valor'] = b.valor;
      return el('button', { classe: 'ft-btn ft-mini', type: 'button', texto: b.rotulo, title: b.dica, attrs: attrs });
    }));

    var corpo = el('div', {
      classe: 'ft-corpo',
      attrs: { contenteditable: 'true', spellcheck: 'true', 'aria-label': 'Texto do post-it', 'data-campo': 'corpo' },
    });
    corpo.innerHTML = f.html;

    var rodape = el('footer', { classe: 'ft-folha-rodape' }, [
      el('span', { classe: 'ft-folha-dica', texto: 'Salvo automaticamente. Esc fecha.' }),
      el('button', { classe: 'ft-btn primario', type: 'button', texto: 'Concluir', attrs: { 'data-acao': 'fechar-nota' } }),
    ]);

    return el('div', {
      classe: 'ft-folha ft-cor-' + f.cor,
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Post-it da feature', 'data-cat': c.id, 'data-feat': f.id },
    }, [topo, montarChecklist(f), barra, corpo, rodape]);
  }

  // Abre o post-it: a folha cresce a partir da posição do post-it clicado.
  function abrirNota(origem, catId, featId) {
    var c = categoria(catId);
    var f = feature(catId, featId);
    if (!c || !f || aberta) return;

    var folha = montarFolha(c, f);
    camada.textContent = '';
    camada.appendChild(folha);
    camada.hidden = false;
    document.body.classList.add('ft-travado');
    aberta = { catId: catId, featId: featId, painel: folha, origem: origem };

    camada.getAnimations().forEach(function (a) { a.cancel(); });
    if (!reduzirMovimento) {
      var de = origem.getBoundingClientRect();
      var ate = folha.getBoundingClientRect();
      var dx = de.left - ate.left;
      var dy = de.top - ate.top;
      var sx = de.width / ate.width;
      var sy = de.height / ate.height;
      folha.animate(
        [
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ', ' + sy + ') rotate(' + inclinacao(featId) + 'deg)', opacity: 0.4, borderRadius: '6px' },
          { transform: 'none', opacity: 1, borderRadius: '16px' },
        ],
        { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
      camada.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      folha.querySelectorAll('.ft-folha-topo, .ft-editor-barra, .ft-corpo, .ft-folha-rodape').forEach(function (parte, i) {
        parte.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], {
          duration: 320,
          delay: 140 + i * 60,
          easing: 'ease-out',
          fill: 'backwards',
        });
      });
    }
    folha.scrollTop = 0;
    var corpoEl = folha.querySelector('.ft-corpo');
    if (corpoEl && window.matchMedia && !window.matchMedia('(pointer: coarse)').matches) {
      try {
        corpoEl.focus({ preventScroll: true });
      } catch (e) {
        // ignora se o navegador não suportar preventScroll
      }
    }
  }

  // Fecha a folha. Ela encolhe de volta até o post-it, se ele ainda existir.
  function fecharNota() {
    if (!aberta) return;
    var ref = aberta;
    aberta = null;
    var folha = ref.painel;
    var origem = document.querySelector('[data-feat="' + ref.featId + '"] .ft-post');
    var fim = function () {
      camada.hidden = true;
      camada.textContent = '';
      document.body.classList.remove('ft-travado');
      render();
    };

    if (reduzirMovimento || !origem || !folha.isConnected) {
      fim();
      return;
    }
    var de = folha.getBoundingClientRect();
    var ate = origem.getBoundingClientRect();
    var dx = ate.left - de.left;
    var dy = ate.top - de.top;
    var sx = ate.width / de.width;
    var sy = ate.height / de.height;
    var animacao = folha.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + sx + ', ' + sy + ') rotate(' + inclinacao(ref.featId) + 'deg)', opacity: 0.2 },
      ],
      { duration: 340, easing: 'cubic-bezier(.5,0,.75,0)' }
    );
    camada.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in' });
    animacao.onfinish = fim;
  }

  // ---------- ações ----------

  // Sincroniza o texto do post-it com a feature e atualiza a prévia no cartão, sem re-renderizar.
  function sincronizarFolha() {
    if (!aberta) return;
    var f = feature(aberta.catId, aberta.featId);
    if (!f) return;
    f.html = aberta.painel.querySelector('[data-campo="corpo"]').innerHTML;
    atualizarPost(f);
    agendarSalvar();
  }

  function executarComando(botao) {
    if (!aberta) return;
    var corpo = aberta.painel.querySelector('[data-campo="corpo"]');
    corpo.focus();
    var cmd = botao.getAttribute('data-cmd');
    if (cmd === 'tabela') {
      document.execCommand('insertHTML', false, TABELA_MODELO);
    } else {
      document.execCommand(cmd, false, botao.getAttribute('data-valor') || null);
    }
    sincronizarFolha();
  }

  // Sem paiId, cria pasta na raiz; com paiId, cria subpasta dentro dela.
  function novaCategoria(paiId) {
    var pai = paiId ? categoria(paiId) : null;
    var nome = window.prompt(pai ? 'Nome da subpasta dentro de “' + pai.nome + '”:' : 'Nome da nova pasta:');
    if (!nome || !nome.trim()) return;
    var nova = { id: novoId('cat-'), nome: nome.trim(), features: [], pastas: [] };
    (pai ? pai.pastas : estado.categorias).push(nova);
    salvar();
    render();
  }

  // Exclui a pasta aberta e volta para a pasta de cima (ou para a raiz).
  function excluirCategoria(catId) {
    var c = categoria(catId);
    var loc = localDaPasta(catId, estado.categorias, null);
    if (!c || !loc) return;
    var trilha = trilhaDa(catId);
    var paiId = trilha.length > 1 ? trilha[trilha.length - 2].id : null;
    var dentro = todasFeatures(c).length;
    var aviso = dentro
      ? ' e as ' + dentro + ' features dentro dela (incluindo subpastas)'
      : '';
    if (!window.confirm('Excluir a pasta “' + c.nome + '”' + aviso + '?')) return;
    loc.lista.splice(loc.indice, 1);
    salvar();
    navegar(paiId);
  }

  // Move uma feature para outra pasta, antes da feature indicada (ou no fim, se antesId for nulo).
  function moverFeature(featId, destinoId, antesId) {
    var origem = pastaDaFeature(featId, estado.categorias);
    var destino = categoria(destinoId);
    if (!origem || !destino) return;
    if (origem === destino && antesId === featId) return;
    var f = origem.features.find(function (x) { return x.id === featId; });
    var antes = capturarPosicoes();
    origem.features = origem.features.filter(function (x) { return x.id !== featId; });
    var pos = antesId ? destino.features.findIndex(function (x) { return x.id === antesId; }) : -1;
    if (pos === -1) destino.features.push(f);
    else destino.features.splice(pos, 0, f);
    salvar();
    render();
    animarMudanca(antes, 'f:' + featId);
  }

  // Move uma pasta para dentro de outra (destinoId nulo = raiz). Não entra em si mesma nem em descendente.
  function moverPasta(pastaId, destinoId) {
    var pasta = categoria(pastaId);
    var loc = localDaPasta(pastaId, estado.categorias, null);
    if (!pasta || !loc) return;
    if (destinoId === pastaId || (destinoId && acharPasta(pasta.pastas, destinoId))) return;
    var destino = destinoId ? categoria(destinoId) : null;
    if (destinoId && !destino) return;
    if ((destino ? destino.id : null) === (loc.pai ? loc.pai.id : null)) return;
    var antes = capturarPosicoes();
    loc.lista.splice(loc.indice, 1);
    (destino ? destino.pastas : estado.categorias).push(pasta);
    salvar();
    render();
    animarMudanca(antes, 'p:' + pastaId);
  }

  // ---------- animações de movimento ----------

  function chaveDo(n) {
    return n.hasAttribute('data-feat') ? 'f:' + n.getAttribute('data-feat') : 'p:' + n.getAttribute('data-pasta');
  }

  // Guarda onde cada feature e pasta está antes de mudar a árvore.
  function capturarPosicoes() {
    var mapa = {};
    raiz.querySelectorAll('.ft-feat, .ft-item-pasta').forEach(function (n) {
      mapa[chaveDo(n)] = n.getBoundingClientRect();
    });
    return mapa;
  }

  // Depois de redesenhar, cada item desliza do lugar antigo para o novo.
  // O item movido também ganha um brilho e uma leve ampliação.
  function animarMudanca(antes, movida) {
    if (reduzirMovimento) return;
    raiz.querySelectorAll('.ft-feat, .ft-item-pasta').forEach(function (n) {
      var chave = chaveDo(n);
      var ehMovida = chave === movida;
      var de = antes[chave];
      var ate = n.getBoundingClientRect();
      if (!de) {
        if (ehMovida) {
          n.animate([{ transform: 'scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.15)' });
        }
        return;
      }
      var dx = de.left - ate.left;
      var dy = de.top - ate.top;
      if (!dx && !dy && !ehMovida) return;
      var brilho = 'rgba(122, 162, 255, .45)';
      n.animate(
        ehMovida
          ? [
              { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(1.03)', boxShadow: '0 0 0 4px ' + brilho },
              { transform: 'none', boxShadow: '0 0 0 0 transparent' },
            ]
          : [{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'none' }],
        { duration: ehMovida ? 560 : 400, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    });
  }

  function novaFeature(catId) {
    var c = categoria(catId);
    if (!c) return;
    var id = novoId('feat-');
    // Pela normalização: a feature nova nasce com todos os campos (itens, tamanho) que o render lê.
    c.features.push(normalizarFeature({ id: id, titulo: 'Nova feature', cor: 'amarelo', html: '<p></p>' }));
    salvar();
    render();
    var titulo = raiz.querySelector('[data-feat="' + id + '"] [data-campo="titulo"]');
    if (titulo) {
      titulo.focus();
      titulo.select();
    }
  }

  function excluirFeature(art) {
    var c = categoria(art.getAttribute('data-cat'));
    if (!c) return;
    var id = art.getAttribute('data-feat');
    var f = feature(c.id, id);
    if (!f) return;
    if (!window.confirm('Excluir a feature “' + (f.titulo || 'sem nome') + '” e o post-it dela?')) return;
    c.features = c.features.filter(function (x) { return x.id !== id; });
    salvar();
    render();
  }

  function exportar() {
    var blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'features-futuras.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    mostrarStatus('Cópia exportada');
  }

  function importar(arquivo) {
    if (!window.confirm('Importar vai substituir as features deste navegador. Continuar?')) return;
    var leitor = new FileReader();
    leitor.onload = function () {
      try {
        var dados = JSON.parse(leitor.result);
        var normal = dados.versao === 2 ? normalizar(dados) : migrarV1(dados);
        if (!normal) throw new Error('formato inválido');
        estado = normal;
        salvar();
        render();
        mostrarStatus('Cópia importada');
      } catch (e) {
        mostrarStatus('Arquivo inválido. Escolha uma cópia exportada por esta página.');
      }
    };
    leitor.readAsText(arquivo);
  }

  // ---------- eventos ----------

  // Mantém a seleção do texto ao clicar nos botões da barra.
  camada.addEventListener('mousedown', function (e) {
    if (e.target.closest('[data-cmd]')) e.preventDefault();
  });

  camada.addEventListener('click', function (e) {
    var cmd = e.target.closest('[data-cmd]');
    if (cmd) {
      executarComando(cmd);
      return;
    }
    var cor = e.target.closest('[data-cor]');
    if (cor && aberta) {
      var f = feature(aberta.catId, aberta.featId);
      if (f) f.cor = cor.getAttribute('data-cor');
      aberta.painel.className = 'ft-folha ft-cor-' + (f ? f.cor : 'amarelo');
      aberta.painel.querySelectorAll('[data-cor]').forEach(function (b) {
        var ativa = b.getAttribute('data-cor') === (f ? f.cor : '');
        b.classList.toggle('ativa', ativa);
        b.setAttribute('aria-pressed', String(ativa));
      });
      agendarSalvar();
      return;
    }
    if (e.target.closest('[data-acao="adicionar-item"]')) {
      adicionarItem();
      return;
    }
    var remover = e.target.closest('[data-acao="remover-item"]');
    if (remover) {
      removerItem(remover.closest('[data-item]'));
      return;
    }
    if (e.target === camada) {
      fecharNota();
      return;
    }
    if (e.target.closest('[data-acao="fechar-nota"]')) fecharNota();
  });

  // Esc fecha a folha aberta.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && aberta) {
      e.preventDefault();
      fecharNota();
    }
  });

  camada.addEventListener('input', function (e) {
    var campo = e.target.getAttribute('data-campo');
    if (campo === 'corpo') {
      sincronizarFolha();
    } else if (campo === 'titulo-folha' && aberta) {
      var f = feature(aberta.catId, aberta.featId);
      if (f) f.titulo = e.target.value;
      var cartaoTitulo = document.querySelector('[data-feat="' + aberta.featId + '"] [data-campo="titulo"]');
      if (cartaoTitulo) cartaoTitulo.value = e.target.value;
      agendarSalvar();
    }
  });

  // ---------- arrastar e soltar ----------

  var arrastando = null; // { tipo: 'feat' | 'pasta', id } enquanto existe um arraste

  function marcarAlvo(alvo) {
    raiz.querySelectorAll('.ft-soltar').forEach(function (n) { if (n !== alvo) n.classList.remove('ft-soltar'); });
    if (alvo) alvo.classList.add('ft-soltar');
  }

  function limparArraste() {
    arrastando = null;
    document.body.classList.remove('ft-arrastando-ativo');
    raiz.querySelectorAll('.ft-arrastando, .ft-soltar').forEach(function (n) {
      n.classList.remove('ft-arrastando', 'ft-soltar');
    });
  }

  // Uma pasta não entra em si mesma nem em uma subpasta dela.
  function podeSoltarPasta(id) {
    var movida = categoria(arrastando.id);
    return !!movida && id !== movida.id && !acharPasta(movida.pastas, id);
  }

  // Onde o arraste está agora: uma pasta (ícone, linha da árvore ou caminho) ou a grade da pasta aberta.
  function alvoDoArraste(e) {
    var destino = e.target.closest ? e.target.closest('[data-destino]') : null;
    if (destino) {
      var valor = destino.getAttribute('data-destino');
      return { el: destino, id: valor === 'raiz' ? null : valor, grade: false };
    }
    var grade = e.target.closest ? e.target.closest('[data-grade]') : null;
    if (grade) return { el: grade, id: grade.getAttribute('data-grade'), grade: true };
    return null;
  }

  // Feature não pode ir para a raiz (a raiz só tem pastas). Pasta pode ir para a raiz.
  // Na grade, só reordena a pasta aberta, e só quando a pesquisa não está mostrando todas as pastas.
  function podeSoltarEm(alvo) {
    if (alvo.grade) return arrastando.tipo === 'feat' && !buscando();
    if (arrastando.tipo === 'feat') return alvo.id !== null;
    return alvo.id === null || podeSoltarPasta(alvo.id);
  }

  // Antes de qual feature a arrastada deve entrar (null = no fim da grade), pela posição do ponteiro.
  function antesDeQuem(grade, e) {
    var cartoes = grade.querySelectorAll(':scope > .ft-feat');
    for (var i = 0; i < cartoes.length; i += 1) {
      var r = cartoes[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2 || (e.clientY < r.bottom && e.clientX < r.left + r.width / 2)) {
        return cartoes[i].getAttribute('data-feat');
      }
    }
    return null;
  }

  raiz.addEventListener('dragstart', function (e) {
    var alca = e.target.closest ? e.target.closest('[data-arrastar]') : null;
    if (!alca) return;
    var tipo = alca.getAttribute('data-arrastar');
    var alvo = tipo === 'feat' ? alca.closest('.ft-feat') : alca.closest('[data-pasta]');
    if (!alvo) return;
    arrastando = {
      tipo: tipo,
      id: tipo === 'feat' ? alvo.getAttribute('data-feat') : alvo.getAttribute('data-pasta'),
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', arrastando.id);
    e.dataTransfer.setDragImage(alvo, 40, 24);
    document.body.classList.add('ft-arrastando-ativo');
    // Só depois da imagem do arraste ser capturada, o original fica esmaecido.
    requestAnimationFrame(function () { if (arrastando) alvo.classList.add('ft-arrastando'); });
  });

  raiz.addEventListener('dragover', function (e) {
    if (!arrastando) return;
    var alvo = alvoDoArraste(e);
    if (!alvo || !podeSoltarEm(alvo)) {
      marcarAlvo(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    marcarAlvo(alvo.el);
  });

  raiz.addEventListener('drop', function (e) {
    if (!arrastando) return;
    var alvo = alvoDoArraste(e);
    if (!alvo || !podeSoltarEm(alvo)) return;
    e.preventDefault();
    var origem = arrastando;
    var antesId = alvo.grade && origem.tipo === 'feat' ? antesDeQuem(alvo.el, e) : null;
    limparArraste();
    if (origem.tipo === 'feat') moverFeature(origem.id, alvo.id, antesId);
    else moverPasta(origem.id, alvo.id);
  });

  raiz.addEventListener('dragend', limparArraste);

  // Duplo clique abre a pasta; Enter também (para o teclado).
  raiz.addEventListener('dblclick', function (e) {
    var item = e.target.closest('[data-abrir]');
    if (item) navegar(item.getAttribute('data-abrir'));
  });

  raiz.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var item = e.target.closest ? e.target.closest('[data-abrir]') : null;
    if (!item) return;
    e.preventDefault();
    navegar(item.getAttribute('data-abrir'));
  });

  // Pesquisa: cada tecla refaz a lista; Esc limpa o campo.
  buscaEl.addEventListener('input', function () { render(); });
  buscaEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && buscaEl.value) {
      e.preventDefault();
      buscaEl.value = '';
      render();
    }
  });

  // Ctrl+S (ou Cmd+S) grava no arquivo, em vez de baixar a página.
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      salvarNoArquivo();
    }
  });

  // Avisa antes de fechar a aba com alterações que ainda não estão no arquivo.
  window.addEventListener('beforeunload', function (e) {
    if (alteracoes) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // "Usar estas" põe a cópia na tela e grava no arquivo. Sem isso, ao atualizar a página a faixa voltaria.
  function usarLocal() {
    var cache = lerCache();
    if (!cache) {
      avisoEl.hidden = true;
      return;
    }
    estado = cache.dados;
    alteracoes = true;
    avisoEl.hidden = true;
    render();
    gravarCache();
    salvarNoArquivo();
  }

  raiz.addEventListener('click', function (e) {
    var abrir = e.target.closest('[data-acao="abrir-nota"]');
    if (abrir) {
      var artigo = abrir.closest('.ft-feat');
      abrirNota(abrir, artigo.getAttribute('data-cat'), artigo.getAttribute('data-feat'));
      return;
    }
    // Seta da árvore abre e fecha subpastas; o resto da linha abre a pasta.
    var seta = e.target.closest('[data-seta]');
    if (seta) {
      alternarNaArvore(seta.getAttribute('data-seta'));
      return;
    }
    var arv = e.target.closest('[data-arv]');
    if (arv) {
      navegar(arv.getAttribute('data-arv') === 'raiz' ? null : arv.getAttribute('data-arv'));
      return;
    }
    var item = e.target.closest('.ft-item-pasta');
    if (item) {
      selecionada = item.getAttribute('data-pasta');
      raiz.querySelectorAll('.ft-item-pasta').forEach(function (n) { n.classList.toggle('selecionada', n === item); });
      return;
    }
    var acao = e.target.closest('[data-acao]');
    if (!acao) return;
    var tipo = acao.getAttribute('data-acao');
    if (tipo === 'salvar-arquivo') salvarNoArquivo();
    else if (tipo === 'usar-local') usarLocal();
    else if (tipo === 'ignorar-local') ignorarLocal();
    else if (tipo === 'nova-categoria') novaCategoria(atual);
    else if (tipo === 'voltar') voltar();
    else if (tipo === 'avancar') avancar();
    else if (tipo === 'subir') subir();
    else if (tipo === 'nova-feature') novaFeature(acao.getAttribute('data-cat'));
    else if (tipo === 'excluir-cat') excluirCategoria(acao.getAttribute('data-cat'));
    else if (tipo === 'excluir-feat') excluirFeature(acao.closest('.ft-feat'));
    else if (tipo === 'exportar') exportar();
    else if (tipo === 'importar') importarEl.click();
  });

  raiz.addEventListener('input', function (e) {
    var campo = e.target.getAttribute('data-campo');
    if (campo === 'titulo' || campo === 'descricao') {
      var artigo = e.target.closest('.ft-feat');
      var f = feature(artigo.getAttribute('data-cat'), artigo.getAttribute('data-feat'));
      if (f) {
        if (campo === 'titulo') f.titulo = e.target.value;
        else f.descricao = e.target.value;
      }
      agendarSalvar();
    } else if (campo === 'nome-cat') {
      var c = categoria(e.target.getAttribute('data-cat'));
      if (c) c.nome = e.target.value;
      agendarSalvar();
    }
  });

  raiz.addEventListener('change', function (e) {
    var alvo = e.target;
    if (alvo === importarEl) {
      if (alvo.files && alvo.files[0]) importar(alvo.files[0]);
      alvo.value = '';
      return;
    }
    var campo = alvo.getAttribute('data-campo');
    if (campo === 'concluida') {
      var artigo = alvo.closest('.ft-feat');
      var f = feature(artigo.getAttribute('data-cat'), artigo.getAttribute('data-feat'));
      if (!f) return;
      f.concluida = alvo.checked;
      salvar();
      render();
    } else if (campo === 'tamanho') {
      var cartao = alvo.closest('.ft-feat');
      var ft = feature(cartao.getAttribute('data-cat'), cartao.getAttribute('data-feat'));
      if (!ft) return;
      ft.tamanho = tamanhoValido(alvo.value);
      salvar();
      render();
    } else if (campo === 'mover') {
      var cartaoMover = alvo.closest('.ft-feat');
      if (alvo.value && cartaoMover) moverFeature(cartaoMover.getAttribute('data-feat'), alvo.value, null);
    } else if (campo === 'mostrar-concluidas') {
      // Preferência deste navegador: não marca o conteúdo como alterado.
      estado.mostrarConcluidas = alvo.checked;
      gravarVista();
      render();
    } else if (campo === 'nome-cat' || campo === 'titulo' || campo === 'descricao') {
      salvar();
      // Renomear a pasta aberta muda também a árvore e o caminho.
      if (campo === 'nome-cat') {
        renderArvore();
        renderCaminho();
      }
    }
  });

  // Concluída também pode ser marcada dentro da folha: o cartão é atualizado ao fechar.
  camada.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-campo') !== 'concluida-folha' || !aberta) return;
    var f = feature(aberta.catId, aberta.featId);
    if (!f) return;
    f.concluida = e.target.checked;
    salvar();
  });

  // Itens do checklist: marcar feito, editar o texto e Enter para adicionar.
  camada.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-campo') !== 'item-feito' || !aberta) return;
    marcarItem(e.target.closest('[data-item]'), e.target.checked);
  });

  camada.addEventListener('input', function (e) {
    if (e.target.getAttribute('data-campo') !== 'item-texto' || !aberta) return;
    var f = feature(aberta.catId, aberta.featId);
    var item = f && f.itens.find(function (i) { return i.id === e.target.closest('[data-item]').getAttribute('data-item'); });
    if (item) item.texto = e.target.value;
    agendarSalvar();
  });

  camada.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.getAttribute('data-campo') === 'novo-item') {
      e.preventDefault();
      adicionarItem();
    }
  });

  // Preferência de visualização deste navegador (não vem do arquivo).
  var vista = lerVista();
  if (vista !== null) estado.mostrarConcluidas = vista;
  raiz.querySelector('[data-campo="mostrar-concluidas"]').checked = estado.mostrarConcluidas;

  // Se este navegador tem uma cópia de conteúdo diferente do arquivo, oferece usá-la.
  // Só avisa se a cópia tem alterações pendentes e o conteúdo é diferente do arquivo.
  // Se a cópia já é igual ao arquivo, a marca de "alterada" é removida (senão o aviso voltaria sem motivo).
  var cache = lerCache();
  if (cache && cache.alterada) {
    if (assinatura(cache.dados) === assinatura(estado)) {
      gravarCache();
    } else {
      var detalhe = textoDiferencas(cache.dados);
      var frase = cache.atual
        ? 'Há anotações salvas só neste navegador que ainda não estão no arquivo. Quer usá-las?'
        : 'Há anotações feitas neste navegador numa versão anterior do arquivo. Quer usá-las mesmo assim?';
      avisoEl.querySelector('span').textContent = detalhe ? frase + ' ' + detalhe : frase;
      avisoEl.hidden = false;
    }
  }

  render();
  mostrarStatus(arquivoOk ? statusAtual() : 'features.js não carregou: gravar no arquivo está desligado nesta página.');
})();
