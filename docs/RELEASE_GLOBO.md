# Globo — roteiro de release no moto g20 (PR 14c)

Status: **metas propostas; medição no aparelho pendente**. Nenhum número desta tabela foi medido no moto g20 nesta entrega. O globo só está pronto para homologação depois de os PRs anteriores e 14a/14b/14c estarem integrados.

## Build e identificação

1. Na árvore limpa do candidato, registrar `git rev-parse HEAD`, versão do app, ID/link da build EAS, versão do Android, resolução/densidade, RAM disponível e temperatura inicial. Nunca medir outro SHA e atribuí-lo ao candidato.
2. `npx eas-cli@latest login`; se ainda não vinculado, `npx eas-cli@latest init`. Configurar identificador Android e vínculo EAS na conta do autor; não há credenciais inventadas no repositório.
3. `npx eas-cli@latest build --platform android --profile preview`. O perfil preview já habilita o contador com `EXPO_PUBLIC_GLOBE_STATS=1`. É APK de release, sem Metro. Expo Go não é referência de release.
4. Instalar o APK no moto g20. Usar [MEDICAO_GLOBO.md](MEDICAO_GLOBO.md) e `scripts/perf/medir-globo.ps1` para coletar frames apresentados e memória do processo pelo adb. O overlay mostra intervalos entre callbacks do R3F, não tempo exclusivo de GPU: conferir ambos.

Referências: [EAS Build](https://docs.expo.dev/build/introduction/), [Expo GL SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/gl-view/).

## Metas propostas

| Medida | Econômico 3D | Equilibrado | Alto | Essencial 2D / leve |
| --- | --- | --- | --- | --- |
| Arrastar por 60 s, depois do aquecimento | ≥ 30 qps | ≥ 30 qps | ≥ 30 qps; descer se não sustentar | Sem GL; interação sem travas perceptíveis |
| p50 / p95 / p99, arrasto | ≤ 33,4 / < 50 / ≤ 100 ms | idem | idem | medir frames apresentados via adb |
| Quadros > 100 ms após aquecimento | < 1% | < 1% | < 1% | < 1% |
| Repouso 60 s | sem callbacks R3F contínuos | idem, nuvens estáticas | nuvens animadas ≤ 30 qps quando visíveis | sem GL |
| Fundo, outra subtela ou app pausado | sem laço R3F | idem | idem | sem GL |
| Memória do processo | medir PSS e pico; estabilizar entre 10 e 30 min | idem | idem | idem |
| Retorno ao mesmo zoom após 30 min | sem crescimento persistente de PSS: investigar > 10% ou > 20 MiB sobre o minuto 10 | idem | idem | idem |
| Memória GPU adicional de efeitos | ≤ 2 MiB fora do Alto, contabilizada por dimensões/formato | idem | medir separadamente | não se aplica |

`renderer.info` mostra contagens de texturas, geometrias, programas, chamadas e triângulos, **não bytes de VRAM**. PSS inclui memória além do JS; não somar PSS com estimativas de GPU. Os limites de memória e p99 são critérios iniciais de engenharia, sujeitos à homologação real.

## Matriz e roteiro

- Brilho fixo, bateria > 50%, mesma orientação, mesmo save e mês, mesma rota de gesto e temperaturas semelhantes. Fazer três rodadas por caso, reiniciando o app; registrar todas, inclusive a pior. Anotar cabo USB/carregamento ou Wi-Fi adb.
- Aquecer até compilar shaders e cessar carregamento de tiles. Medir Brasil geral, CE, DF/SE/AL e zoom próximo do solo. Arrastar 60 s; depois repousar 60 s. Repetir com cada perfil fixo e com Automático, registrando as trocas.
- Repetir com satélite, aprovação, inclinação, intenção, resultado, chuva e seca. Alternar lista, cartão, comparação e subtelas. Testar fallback para 2D mantendo mês, agenda e campanha.
- Sessão de 30 min: alternar 60 s de gesto, 60 s de repouso e entrada/saída de subtela. Coletar PSS, temperatura, chamadas, texturas, tiles e percentis nos minutos 0/10/20/30. Repetir com nuvens desligadas e movimento reduzido.
- No Alto, comparar nuvens desligadas / estáticas (movimento reduzido) / animadas. No mesmo enquadramento comparar sem pins / pins estáticos / novo marcador crítico pulsando. Não somar deltas obtidos em rodadas com temperaturas diferentes.

| Custo isolado (mesmo save, zoom e temperatura) | Meta inicial | Δ p50 | Δ p95 | Δ PSS | Observação |
| --- | --- | --- | --- | --- | --- |
| Nuvens estáticas versus desligadas | Δ p95 ≤ 2 ms; GPU dentro do orçamento | pendente | pendente | pendente | Equilibrado |
| Nuvens animadas versus estáticas | ≤ 30 qps da animação, sem laço quando ocultas | pendente | pendente | pendente | Alto |
| Marcadores estáticos versus sem marcadores | Δ p95 ≤ 1 ms | pendente | pendente | pendente | mesmo atlas dos rótulos |
| Pulso versus marcadores estáticos | Δ p95 ≤ 2 ms; cessa ao fim; zero com movimento reduzido | pendente | pendente | pendente | novo crítico |
| Sol no encerramento do mês | 1,5 s; cessa ao fim; zero com movimento reduzido | pendente | pendente | pendente | hora fixa |

## Tiles após #33

LOD usa **pixels físicos**, multiplicando pela densidade real; o teto de DPR do perfil só é aplicado na web. Não comparar números antigos que usavam pixels lógicos.

| Perfil | Cache (blocos) | Downloads simultâneos | Nível máximo | Limiar px físico/texel | Tiles Brasil | Tiles CE | Tiles solo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Econômico 3D | 12 | 2 | 4 | 2,0 | pendente | pendente | pendente |
| Equilibrado | 20 | 4 | 5 | 1,25 | pendente | pendente | pendente |
| Alto | 28 | 4 | 5 | 0,9 | pendente | pendente | pendente |
| Essencial 2D / leve | não usa tiles GL | — | — | — | 27 polígonos | idem | idem |

| SHA / build / perfil / cenário | qps | p50 | p95 | p99 | >100ms | PSS inicial / 10 / 30 min | Pico PSS | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| preencher por rodada | pendente | pendente | pendente | pendente | pendente | pendente | pendente | não medido |

## Acessibilidade e recuperação

No moto g20, validar TalkBack com lista, camada e selos: nome completo, valor, posição e referência; segunda UF da comparação; ícones de eventos/notícias/nuvens e retorno do foco ao fechar. Verificar 320/360/400 dp e texto 90/100/115/130%, mais o ajuste do sistema. A tabela de comparação tem rolagem horizontal deliberada; as células e o cartão quebram linhas.

Ativar movimento reduzido e encerrar um mês; não deve haver transição solar, pulso, deriva de nuvem ou inércia. O perfil Alto continua permitindo nuvem estática. Abrir subtela e mandar app ao fundo: laços devem parar.

Na web, forçar `WEBGL_lose_context` e confirmar fallback. O shader watcher também trata falha de compilação. O expo-gl nativo não expõe `onContextLost`: há verificação de `isContextLost` nos frames quando suportada, além do ErrorBoundary. Uma falha de driver que não chegue ao JS ainda precisa ser homologada no aparelho; não existe garantia de detectar crash nativo de processo pelo React.

## Estabilidade e calibração

`npm run sim:globe`: 48/96/240 meses, sete sementes (`1,2,3,4,5,17,2027`) e dez estilos, incluindo Defesa Civil financiada. A cada mês: finitude de todo o estado, D7, clima e prevenção, contas fiscais e dívida abaixo de **300% do PIB**; cada turno eleitoral fecha com o nacional (1e-9). Esse teto é guarda provisória de estabilidade, não limite legal nem saturação aplicada ao motor. Campanhas de 240 meses extrapolam a duração jogável atual para testar o motor, inclusive após derrotas; não são homologação da navegação de uma campanha de 20 anos.

A investigação autorizada da pressão no BC encontrou: custo 0,05 de credibilidade por ato × repetição anual causava perda de 5–20 p.p. a cada pressão trimestral; a credibilidade saturada elevava o risco, juros e dívida. O padrão foi recalibrado para 0,01 (1–4 p.p.), intervalo de sensibilidade 0,005–0,05. Equações, sorteios e custo de agenda permanecem os mesmos. A pressão continua reduzindo credibilidade e elevando risco; não há perdão ou clamp de dívida. No experimento de sete sementes, o máximo da dívida em 240 meses foi de 329,41% para 278,89% do PIB. É calibração de jogo, sem pretensão de estimativa empírica.

Reproduzir a sensibilidade: `npm exec -- vitest run --config vitest.balance.config.mts scripts/sim/bcCalibration.sim.ts`. O custo antigo e as alternativas ficam explícitos. A suíte longa está fora de `npm run check`.

Resultado local: 210 campanhas, 26.880 meses, 560 eleições gerais verificadas, nenhuma violação; prevenção não nula em cada horizonte. Homologação de desempenho, bateria e TalkBack no moto g20 continua **pendente**.
