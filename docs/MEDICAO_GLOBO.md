# Medição do globo no moto g20 (PR 0 do Globo vivo)

Referência: [PLANO_GLOBO.md](PLANO_GLOBO.md) §3.2, §3.3 e §7 (PR 0). Objetivo: registrar números de referência **antes** de qualquer mudança na GPU, para comparar antes/depois nos PRs seguintes.

## 1. Build de preview (EAS) e instalação

O projeto **não** usa `expo-dev-client`; a medição é feita com o APK **preview** (build de release, JS minificado, sem Metro), que não precisa dele. O perfil `development` do `eas.json` só serve se o dev client for adicionado no futuro (não foi instalado neste PR). O Expo Go serve apenas de indicação, nunca de medida.

1. `npm i -g eas-cli` e `eas login`.
2. Primeira vez: `eas init` (feito **pelo autor**: grava `extra.eas.projectId` no `app.json`; não foi inventado aqui).
3. `eas build --platform android --profile preview` (gera um APK; o perfil já define `EXPO_PUBLIC_GLOBE_STATS=1`).
4. Baixe o APK pelo link/QR do EAS e instale no moto g20 (permitir "instalar apps desconhecidos"), ou `adb install -r app.apk`.

## 2. Contador de desempenho (overlay)

- Em desenvolvimento (`__DEV__`) o contador já vem ligado.
- Em release liga com `EXPO_PUBLIC_GLOBE_STATS=1` (lido em `src/globe/config.ts` como `GLOBE_STATS_ENABLED`, inlinado em tempo de build). Sem a variável, o jogador não vê nada.
- Aparece no canto superior esquerdo do Painel: tiles/cache/nível; ms por quadro p50/p95/p99, qps, quadros longos (> 100 ms) desde a montagem; chamadas de desenho, triângulos, programas; texturas e geometrias (**contagem, não VRAM**).
- O laço é sob demanda: só entram quadros realmente desenhados (janela dos últimos 300 intervalos; pausa > 500 ms entre quadros não conta). Publica no máximo 2×/s e só se algo mudou; chamadas e triângulos vêm do quadro anterior.
- Memória do processo, temperatura e bateria **não** são medidas pelo app: ler com `adb shell dumpsys meminfo <pacote>`, `adb shell dumpsys battery` (temperatura em décimos de °C) ou pelas configurações do aparelho.

## 3. Protocolo (aparelho carregado > 50%, brilho fixo, modo avião opcional, app fechado antes)

Anotar temperatura e bateria no início e no fim de cada cenário.

1. **Aquecimento:** abrir o Painel, esperar os tiles carregarem (nível máximo estabilizar).
2. **Arrastar 60 s:** girar e dar zoom continuamente, do Brasil inteiro até uma UF e de volta.
3. **Repouso 60 s:** sem tocar; confirmar que **não há laço de quadros** (os números ficam parados).
4. **Alternar camadas/subtelas:** trocar as camadas do mapa e entrar/sair das subtelas (Gabinete, Congresso, Economia) por 60 s.
5. **Sessão longa 15–30 min:** uso normal; registrar no começo, no meio e no fim (aquecimento térmico e bateria).

## 4. Tabela de registro

Uma linha por cenário e por rodada. Aparelho: moto g20, Android ___, build ___ (commit ___), data ___.

| Cenário | p50 (ms) | p95 (ms) | p99 (ms) | qps | Quadros longos | Chamadas | Triângulos | Programas | Texturas | Geometrias | Memória (MB) | Temp. (°C) | Bateria (%) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Arrastar 60 s | | | | | | | | | | | | | |
| Repouso 60 s | | | | | | | | | | | | | |
| Camadas/subtelas | | | | | | | | | | | | | |
| Sessão (início) | | | | | | | | | | | | | |
| Sessão (meio) | | | | | | | | | | | | | |
| Sessão (fim) | | | | | | | | | | | | | |

## 5. Metas iniciais (a confirmar com estes números)

- Econômico 3D: >= 30 qps ao arrastar e p95 < 50 ms.
- Parado: sem laço de quadros (nenhum quadro novo em 60 s de repouso).
- Memória de GPU nova <= 2 MB fora do perfil Alto.
- Quadros longos (> 100 ms): zero fora do carregamento de tiles.

## 6. Falhas gráficas

`GlobeView` aceita `onGlFailure?: (reason: 'context-lost' | 'init-error', detail?: string) => void`.

- `init-error`: erro de compilação/link de shader (`gl.debug.onShaderError`), em todas as plataformas. Em dev também vai para o console.
- `context-lost`: **só na web** (evento `webglcontextlost` no canvas). O expo-gl nativo não expõe perda de contexto (a `GLView` nativa não tem `onContextLost`), então no Android isso não é detectado. Falha ao criar o contexto antes do `Canvas` existir também não passa por aqui.
- A queda para o mapa 2D é feita por quem usa o callback (PR 1); este PR só avisa.
