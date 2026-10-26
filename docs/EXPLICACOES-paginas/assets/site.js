// Busca e menu do site. Os dados vêm do bloco <script type="application/json" id="indice">, gerado pelo build.
(function () {
  'use strict';

  var dados = [];
  try {
    dados = JSON.parse(document.getElementById('indice').textContent);
  } catch (e) {
    dados = [];
  }

  // Sem acento e minúsculas, para que "economia" encontre "Economia".
  function norm(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function ligarBusca(wrap) {
    var input = wrap.querySelector('[data-busca]');
    var box = wrap.querySelector('[data-resultados]');
    if (!input || !box) return;

    function renderizar() {
      var termos = norm(input.value.trim()).split(/\s+/).filter(Boolean);
      box.textContent = '';
      if (!termos.length) {
        box.hidden = true;
        return;
      }
      var achados = dados
        .filter(function (d) {
          var alvo = norm(d.t + ' ' + d.s + ' ' + d.g);
          return termos.every(function (t) {
            return alvo.indexOf(t) !== -1;
          });
        })
        .slice(0, 12);

      if (!achados.length) {
        var vazio = document.createElement('p');
        vazio.className = 'vazio';
        vazio.textContent = 'Nada encontrado.';
        box.appendChild(vazio);
      }
      achados.forEach(function (d) {
        var a = document.createElement('a');
        a.href = d.h;
        var titulo = document.createElement('strong');
        titulo.textContent = d.t;
        var grupo = document.createElement('span');
        grupo.textContent = d.g;
        a.appendChild(titulo);
        a.appendChild(grupo);
        box.appendChild(a);
      });
      box.hidden = false;
    }

    input.addEventListener('input', renderizar);
    input.addEventListener('focus', renderizar);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        input.value = '';
        renderizar();
        input.blur();
      }
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) box.hidden = true;
    });
  }

  document.querySelectorAll('.busca-wrap').forEach(ligarBusca);

  // Tecla "/" leva o foco para a busca, como em sites de documentação.
  document.addEventListener('keydown', function (e) {
    var ativo = document.activeElement;
    var digitando = ativo && (/input|textarea|select/i.test(ativo.tagName) || ativo.isContentEditable);
    if (e.key === '/' && !digitando) {
      var primeira = document.querySelector('[data-busca]');
      if (primeira) {
        e.preventDefault();
        primeira.focus();
      }
    }
  });

  // Índice em gaveta, nas telas estreitas.
  var botao = document.querySelector('[data-menu]');
  var layout = document.querySelector('.layout');
  if (botao && layout) {
    botao.addEventListener('click', function () {
      var aberto = layout.classList.toggle('menu-aberto');
      botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    });
  }

  // Janela de detalhe de cada alavanca: o conteúdo vem do <template> cujo id está em data-alavanca.
  var janela = null;

  // Calculadora de alíquota dentro da janela. Premissas em data-* (R$ milhões por ano; PIB em R$ milhões).
  // Base efetiva = base + ΔC, com ΔC = −razão × (alíquota − atual) × base. Arrecadação = alíquota × base efetiva.
  // Caixa = arrecadação − arrecadação de hoje. Hiato = (mult_consumo × −caixa + mult_credito × ΔC) / PIB.
  var PASSO_ALIQUOTA = 0.05;
  var TETO_ALIQUOTA = 1.5;

  function bi(valorMi) {
    return (valorMi / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function casas(valor) {
    return Math.abs(valor).toFixed(2).replace('.', ',');
  }

  function pctTexto(valor) {
    return valor.toFixed(2).replace('.', ',') + '%';
  }

  function sinal(valor) {
    return valor >= 0 ? '+' : '−';
  }

  function calcular(s, aliquotaPct) {
    var base = Number(s.dataset.base);
    var pib = Number(s.dataset.pib);
    var atual = Number(s.dataset.atual) / 100;
    var a = aliquotaPct / 100;
    var credito = -Number(s.dataset.razao) * (a - atual) * base;
    var arrecadacao = a * (base + credito);
    var caixa = arrecadacao - atual * base;
    return {
      credito: credito,
      arrecadacao: arrecadacao,
      arrecadacaoLinear: a * base,
      caixa: caixa,
      hiato: (Number(s.dataset.multConsumo) * -caixa + Number(s.dataset.multCredito) * credito) / pib * 100,
      primario: (caixa / pib) * 100,
    };
  }

  function marcar(s, nome, texto, valor) {
    var campo = s.querySelector('[data-saida="' + nome + '"]');
    campo.textContent = texto;
    var cartao = campo.closest('.sim-cartao');
    if (valor === null || Math.abs(valor) < 1e-9) cartao.dataset.sinal = 'neutro';
    else cartao.dataset.sinal = valor > 0 ? 'pos' : 'neg';
  }

  // Curva da arrecadação de 0% a 1,5%: linha azul com encolhimento, tracejada sem ele, bolinha na escolha.
  function desenharCurva(s, escolhaPct) {
    var svg = s.querySelector('[data-saida="curva"]');
    var W = 320, H = 180, E = 44, D = 12, T = 12, F = 28;
    var base = Number(s.dataset.base);
    var atualPct = Number(s.dataset.atual);
    var yMax = (TETO_ALIQUOTA / 100) * base / 1000;

    function X(p) {
      return E + (p / TETO_ALIQUOTA) * (W - E - D);
    }
    function Y(v) {
      return T + (H - T - F) * (1 - v / yMax);
    }

    var azul = [];
    var tracejada = [];
    for (var i = 0; i <= 30; i++) {
      var p = i * PASSO_ALIQUOTA;
      var r = calcular(s, p);
      azul.push(X(p).toFixed(1) + ',' + Y(r.arrecadacao / 1000).toFixed(1));
      tracejada.push(X(p).toFixed(1) + ',' + Y(r.arrecadacaoLinear / 1000).toFixed(1));
    }
    var escolha = calcular(s, escolhaPct);

    var desenho = '';
    [0, yMax / 2, yMax].forEach(function (v) {
      desenho += '<line x1="' + E + '" x2="' + (W - D) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" style="stroke: var(--border)"/>';
      desenho += '<text x="' + (E - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end" style="fill: var(--muted); font-size: 10px">' + Math.round(v) + '</text>';
    });
    [0, 0.5, 1, 1.5].forEach(function (p) {
      desenho += '<text x="' + X(p) + '" y="' + (H - 8) + '" text-anchor="middle" style="fill: var(--muted); font-size: 10px">' + pctTexto(p) + '</text>';
    });
    desenho += '<line x1="' + X(atualPct) + '" x2="' + X(atualPct) + '" y1="' + T + '" y2="' + Y(0) + '" style="stroke: var(--muted); stroke-dasharray: 2 3"/>';
    desenho += '<text x="' + (X(atualPct) + 4) + '" y="' + (T + 10) + '" style="fill: var(--muted); font-size: 10px">hoje</text>';
    desenho += '<polyline points="' + tracejada.join(' ') + '" style="fill: none; stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 5 4"/>';
    desenho += '<polyline points="' + azul.join(' ') + '" style="fill: none; stroke: var(--accent); stroke-width: 2.5"/>';
    desenho += '<circle cx="' + X(escolhaPct) + '" cy="' + Y(escolha.arrecadacao / 1000) + '" r="6" style="fill: var(--parc); stroke: var(--surface); stroke-width: 2"/>';
    svg.innerHTML = desenho;
  }

  function atualizarSimuladores(raiz) {
    raiz.querySelectorAll('.simulador').forEach(function (s) {
      var campo = s.querySelector('[data-campo="aliquota"]');
      var comparar = s.querySelector('[data-campo="comparar"]').checked;
      var x = parseFloat(String(campo.value).replace(',', '.'));
      if (!isFinite(x)) x = 0;
      var r = calcular(s, x);

      s.querySelector('[data-saida="aliquota-texto"]').textContent = pctTexto(x);
      var linha = s.querySelector('[data-saida="receita-linear"]');
      linha.hidden = !comparar;
      linha.textContent = 'Sem o crédito encolher: R$ ' + bi(r.arrecadacaoLinear) + ' bi';

      marcar(s, 'caixa', sinal(r.caixa) + 'R$ ' + bi(Math.abs(r.caixa)) + ' bi (' + sinal(r.primario) + casas(r.primario) + '% do PIB)', r.caixa);
      marcar(s, 'receita', 'R$ ' + bi(r.arrecadacao) + ' bi', null);
      marcar(s, 'credito', sinal(r.credito) + 'R$ ' + bi(Math.abs(r.credito)) + ' bi', r.credito);
      marcar(s, 'hiato', sinal(r.hiato) + casas(r.hiato) + ' p.p.', r.hiato);
      marcar(s, 'primario', sinal(r.primario) + casas(r.primario) + '% do PIB', r.primario);
      desenharCurva(s, x);

      var veredito;
      if (Math.abs(r.caixa) < 1000) {
        veredito = 'Igual ao de hoje: nada muda.';
      } else if (r.caixa < 0) {
        veredito = 'Corte: o caixa perde R$ ' + bi(-r.caixa) + ' bi. Em troca, o crédito ganha R$ ' + bi(r.credito) + ' bi e a atividade sobe ' + casas(r.hiato) + ' p.p.';
      } else {
        veredito = 'Alta: o caixa ganha R$ ' + bi(r.caixa) + ' bi. Em troca, o crédito perde R$ ' + bi(-r.credito) + ' bi e a atividade cai ' + casas(r.hiato) + ' p.p.';
      }
      if (x >= 1.25) veredito += ' Perto do teto: cada passo a mais rende menos e tira mais crédito.';
      s.querySelector('[data-saida="veredito"]').textContent = veredito;
    });
  }

  function criarJanela() {
    janela = document.createElement('dialog');
    janela.className = 'janela-alavanca';
    janela.innerHTML =
      '<div class="janela-topo"><button type="button" class="janela-fechar">Fechar</button></div>' +
      '<div class="janela-corpo"></div>';
    janela.querySelector('.janela-fechar').addEventListener('click', function () {
      janela.close();
    });
    // Clique no fundo escuro fecha; atalhos da calculadora (data-predef / data-ajuste) ajustam o controle.
    janela.addEventListener('click', function (e) {
      if (e.target === janela) {
        janela.close();
        return;
      }
      var botao = e.target.closest ? e.target.closest('[data-predef], [data-ajuste]') : null;
      if (!botao) return;
      var campo = botao.closest('.simulador').querySelector('[data-campo="aliquota"]');
      var valor = botao.hasAttribute('data-ajuste')
        ? parseFloat(campo.value) + Number(botao.dataset.ajuste)
        : Number(botao.dataset.predef);
      valor = Math.min(TETO_ALIQUOTA, Math.max(0, Math.round(valor / PASSO_ALIQUOTA) * PASSO_ALIQUOTA));
      campo.value = valor.toFixed(2);
      atualizarSimuladores(janela);
    });
    janela.addEventListener('input', function () {
      atualizarSimuladores(janela);
    });
    janela.addEventListener('change', function () {
      atualizarSimuladores(janela);
    });
    document.body.appendChild(janela);
  }

  document.querySelectorAll('[data-alavanca]').forEach(function (botaoAlavanca) {
    botaoAlavanca.addEventListener('click', function () {
      var modelo = document.getElementById(botaoAlavanca.getAttribute('data-alavanca'));
      if (!modelo || !modelo.content) return;
      if (!janela) criarJanela();
      var corpo = janela.querySelector('.janela-corpo');
      corpo.textContent = '';
      corpo.appendChild(modelo.content.cloneNode(true));
      atualizarSimuladores(corpo);
      janela.showModal();
      janela.querySelector('.janela-fechar').focus();
    });
  });
})();
