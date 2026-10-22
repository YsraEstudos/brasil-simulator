# PR 14 — Leitura, acessibilidade e consolidação

Base: PR 13 (`1fe5502`), incluindo LOD do #33. Execução sem subagentes.

- [x] 14a: modelo puro de busca sem acentos, filtro regional, resumo ponderado, ranking nacional e comparação; integrar lista/cartão/modelo dos três mapas.
- [x] 14b: preferência persistente de movimento; Sol em 1,5 s; bloquear inércia, pulso e nuvens animadas; rótulos de acessibilidade, faixas numéricas e texto escalável.
- [x] 14c: reaproveitar instrumentação do PR 0 com amostragem única; fallback gráfico; simulações 48/96/240 meses fora do check; roteiro de release moto g20.
- [x] Verificar testes, typecheck, lint, formatação e revisar diff; registrar limites de homologação real.

O histórico antigo não será preenchido por estimativa. Meses sem o indicador exibirão lacuna. A medição real e TalkBack no aparelho permanecem etapas de homologação do autor.

Validação local: 210 campanhas e 26.880 meses, sem violação. Ver [RELEASE_GLOBO.md](RELEASE_GLOBO.md) para metas, calibração autorizada e limites de homologação. Teste web: busca/filtro/cartão/comparação, 320/360/400 px em 130%, variação após encerrar mês e perda real do contexto WebGL com estado da campanha preservado. O ambiente reutilizou node_modules via junction; a URL do worker SQLite foi reescrita no navegador de teste para contornar o caminho externo do Metro. Não é uma mudança no produto.
