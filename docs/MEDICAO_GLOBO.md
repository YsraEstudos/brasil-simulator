# Medição do globo no moto g20 (PR 0 do Globo vivo)

Referência: [PLANO_GLOBO.md](PLANO_GLOBO.md) §3.2, §3.3 e §7 (PR 0). Objetivo: registrar números de referência **antes** de qualquer mudança na GPU, para comparar antes/depois nos PRs seguintes.

A medição é feita **principalmente pelo PC, via adb** (`scripts/perf/medir-globo.ps1`). O overlay dentro do app fica como apoio, só para o que o adb não enxerga (§5).

## 1. Build de preview (EAS) e instalação

O projeto **não** usa `expo-dev-client`; a medição é feita com o APK **preview** (build de release, JS minificado, sem Metro), que não precisa dele. O perfil `development` do `eas.json` só serve se o dev client for adicionado no futuro (não foi instalado neste PR). O Expo Go serve apenas de indicação, nunca de medida.

1. `npx eas-cli@latest login`.
2. Primeira vez: `npx eas-cli@latest init` (feito **pelo autor**: grava `extra.eas.projectId` no `app.json`; não foi inventado aqui).
3. `npx eas-cli@latest build --platform android --profile preview` (gera um APK; o perfil já define `EXPO_PUBLIC_GLOBE_STATS=1`, que liga o overlay).
4. Baixe o APK pelo link/QR do EAS e instale no moto g20 (permitir "instalar apps desconhecidos"), ou `adb install -r app.apk`.

## 2. Preparar o adb

1. No celular: Configurações > Sobre o telefone > toque 7× em "Número da versão"; depois Opções do desenvolvedor > **Depuração USB**. Conecte o cabo e aceite a chave RSA.
2. O `adb.exe` fica em `C:\Users\<você>\AppData\Local\Android\Sdk\platform-tools\adb.exe`. O script procura no PATH e, se não achar, nesse caminho; senão passe `-Adb <caminho>`.
3. Teste: `adb devices` deve listar o aparelho como `device`.
4. Requisitos: PowerShell 7 (`pwsh`) e Node no PATH (o cálculo das estatísticas é `scripts/perf/parseLatency.mjs`).
5. O pacote Android vem de `expo.android.package` do `app.json`; se não existir ali (hoje não existe), passe `-Package`.

Com o cabo USB o aparelho carrega, o que altera bateria e temperatura. Para sessões longas, prefira `adb tcpip 5555` + `adb connect <ip>:5555` (Wi-Fi) e desconecte o cabo.

## 3. Rodar o script

Da raiz do repositório, com o app aberto na tela do globo (Painel), aparelho carregado > 50%, brilho fixo, app reiniciado antes de cada rodada:

```powershell
pwsh scripts/perf/medir-globo.ps1 -Package <id.do.pacote> -Scenario arrastar -Seconds 60
```

Parâmetros: `-Package`, `-Scenario` (obrigatório), `-Seconds` (60), `-Out` (`docs/medicoes/`), `-Adb`, `-Layer` (força a camada, se a detecção falhar), `-PollSeconds` (1,5).

Cada execução grava `docs/medicoes/<data>_<cenario>.csv` (intervalo bruto entre quadros) e acrescenta uma linha a `docs/medicoes/resultados.md`.

| Cenário | Comando (`-Scenario`) | O que fazer no aparelho |
| --- | --- | --- |
| Aquecimento | (sem medir) | Abrir o Painel e esperar os tiles carregarem (nível máximo estabilizar). |
| Arrastar | `arrastar` (60 s) | Girar e dar zoom sem parar, do Brasil inteiro até uma UF e de volta. |
| Repouso | `repouso` (60 s) | Não tocar. Esperado: **~0 quadros** (sem laço); qualquer quadro novo é problema. |
| Camadas/subtelas | `camadas` (60 s) | Trocar as camadas do mapa e entrar/sair das subtelas (Gabinete, Congresso, Economia). |
| Sessão | `sessao-inicio`, `sessao-meio`, `sessao-fim` (60 s cada, em 0, ~15 e ~30 min) | Uso normal entre as medições; interessa a deriva de temperatura, bateria e PSS. |

Para a sessão de 15–30 min, uma única chamada `-Seconds 1800` também funciona (o script consulta a cada 1,5 s e deduplica); nesse caso as estatísticas cobrem o período todo.

## 4. O que cada métrica significa (e seus limites)

- **p50/p95/p99, fps, quadros > 100 ms:** vêm de `dumpsys SurfaceFlinger --latency "<camada da SurfaceView>"`, ou seja, **quadros realmente apresentados do globo**. O script acha a camada em `SurfaceFlinger --list` (nome com o pacote e `SurfaceView`), consulta a cada ~1,5 s (o buffer guarda só 128 quadros), junta as janelas sem repetir instantes e calcula os intervalos entre apresentações consecutivas. Linhas zeradas ou `9223372036854775807` são ignoradas. Pausas > 500 ms entre quadros (laço parado, renderização sob demanda) **não entram** nas estatísticas, mesma regra de `frameStats.ts`; o fps é quadros por segundo *de tempo ativo*, não média da janela inteira.
- **Por que não `dumpsys gfxinfo ... framestats`:** ele mede os quadros da UI (HWUI/thread de UI), não os da `SurfaceView` do expo-gl onde o globo desenha. Serviria só para medir a UI React Native.
- **Limites do SurfaceFlinger:** mede *apresentação* (o que chegou à tela), não o tempo de GPU nem de CPU por quadro; quadros em fila podem chegar em rajada. Em Android 12+ a camada pode vir com sufixo `(BLAST)`; no Android 11 é uma só. Se a camada for recriada, o script tenta reencontrá-la.
- **PSS (MB):** `TOTAL PSS` de `dumpsys meminfo <pacote>`, memória total atribuída ao processo.
- **Graphics (MB):** linha `Graphics` do App Summary (alternativa: `GL mtrack`). É memória gráfica **atribuída** ao processo pelo driver; nem todo driver Mali reporta tudo, então é uma aproximação da memória de GPU, não VRAM exata.
- **CPU (%):** `top -b -n 2 -d 1 -p <pid>` em algumas amostras espaçadas; 100% = um núcleo (o Unisoc T700 tem 8). Amostra pontual: serve para comparar cenários, não é média precisa.
- **Bateria e temperatura:** `dumpsys battery` (nível; temperatura em décimos de °C). `dumpsys thermalservice` dá outras sondas (CPU, pele etc.) **quando o aparelho expõe**; se não, o script usa só a temperatura da bateria e avisa. Com cabo USB a bateria sobe: compare apenas medições com a mesma conexão.

## 5. Overlay no app (apoio)

Só para o que o adb não vê: **chamadas de desenho, triângulos, programas, texturas/geometrias (contagem, não VRAM), tiles/cache/nível (LOD)**. Os tempos de quadro do overlay (p50/p95/p99, qps) servem de conferência, mas a referência é o adb.

- Em desenvolvimento (`__DEV__`) o contador já vem ligado. Em release liga com `EXPO_PUBLIC_GLOBE_STATS=1` (`GLOBE_STATS_ENABLED` em `src/globe/config.ts`, inlinado no build). Sem a variável, o jogador não vê nada.
- Fica no canto superior esquerdo do Painel. Publica no máximo 2×/s; chamadas e triângulos vêm do quadro anterior.

## 6. Registro

`docs/medicoes/resultados.md` recebe automaticamente os números do adb. Complemente à mão, por cenário e rodada, o que só o overlay mostra. Aparelho: moto g20, Android ___, build ___ (commit ___), data ___.

| Cenário | Chamadas | Triângulos | Programas | Texturas | Geometrias | Tiles/nível (LOD) | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Arrastar | | | | | | | |
| Repouso | | | | | | | |
| Camadas/subtelas | | | | | | | |
| Sessão (início/meio/fim) | | | | | | | |

## 7. Avançado (opcional): Perfetto

Para ver frequência de GPU e contadores Mali ao longo do tempo (se o kernel/driver expuser): grave um trace de 30 s com o app em foco e abra em <https://ui.perfetto.dev>.

```powershell
adb shell "perfetto -o /data/misc/perfetto-traces/globo.pftrace -t 30s sched freq gfx view power gpu/gpu_frequency"
adb pull /data/misc/perfetto-traces/globo.pftrace docs/medicoes/
```

No Android 11 o Perfetto já vem no sistema (`adb shell perfetto --help` confere). Categorias `gpu/*` e contadores Mali só aparecem se o driver os publicar. Não é requisito do PR 0.

## 8. Metas iniciais (a confirmar com estes números)

- Econômico 3D: >= 30 fps ao arrastar e p95 < 50 ms.
- Parado: sem laço de quadros (nenhum quadro novo em 60 s de repouso).
- Memória de GPU nova <= 2 MB fora do perfil Alto.
- Quadros longos (> 100 ms): zero fora do carregamento de tiles.

## 9. Falhas gráficas

`GlobeView` aceita `onGlFailure?: (reason: 'context-lost' | 'init-error', detail?: string) => void`.

- `init-error`: erro de compilação/link de shader (`gl.debug.onShaderError`), em todas as plataformas. Em dev também vai para o console.
- `context-lost`: **só na web** (evento `webglcontextlost` no canvas). O expo-gl nativo não expõe perda de contexto (a `GLView` nativa não tem `onContextLost`), então no Android isso não é detectado. Falha ao criar o contexto antes do `Canvas` existir também não passa por aqui.
- A queda para o mapa 2D é feita por quem usa o callback (PR 1); este PR só avisa.

## 10. Testes do cálculo

`npx vitest run scripts/perf` testa `parseLatency.mjs` com amostra no formato do `--latency` (CRLF, linhas zeradas e INT64_MAX, janelas sobrepostas, pausas e quadros longos). O `.ps1` só foi verificado estaticamente (sintaxe) fora do aparelho.
