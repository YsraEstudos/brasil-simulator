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
})();
