import { HEIGHT_OFFSET, HEIGHT_SCALE, ROOT, TILE_GRID } from './config';
import { LABEL_MIN_FACING } from './labelLayout';
import { QuadKind } from './labelQuads';
import { LIGHTS_FULL_BELOW, LIGHTS_OFF_ABOVE, NIGHT_FLOOR, TERMINATOR_FROM, TERMINATOR_TO } from './visualClock';

const f = (n: number) => n.toFixed(6);

/** Sombreamento suave de "luz de câmera", igual no globo e nos tiles para não haver emenda. */
const SHADE = /* glsl */ `
float viewShade(vec3 normal, vec3 pos) {
  return 0.80 + 0.20 * max(dot(normal, normalize(cameraPosition - pos)), 0.0);
}`;

/**
 * Dia e noite (PLANO_GLOBO.md §4.1), igual no globo e nos tiles para não haver emenda: o vertex shader calcula
 * `dot(normal da esfera, Sol)` (ou 2.0 com "Sempre dia", que deixa o dia pleno sem ramo no fragmento) e o fragmento
 * aplica a faixa do terminador. As constantes vêm de `visualClock.ts`, as mesmas do mapa 2D e dos testes.
 */
const SUN_VERTEX = /* glsl */ `
uniform vec3 uSunDir; // direção do Sol (ponto subsolar) no referencial do globo
uniform float uSunOn; // 0 = sem iluminação ("Sempre dia")
varying float vSun;
float sunDot(vec3 normal) {
  return uSunOn > 0.5 ? dot(normal, uSunDir) : 2.0;
}`;

const SUN_FRAGMENT = /* glsl */ `
varying float vSun;
float sunLight(float ndl) {
  return ${f(NIGHT_FLOOR)} + ${f(1 - NIGHT_FLOOR)} * smoothstep(${f(TERMINATOR_FROM)}, ${f(TERMINATOR_TO)}, ndl);
}`;

export const tileVertexShader = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform vec4 uBounds;      // oeste, norte, leste, sul (radianos)
uniform sampler2D uHeight; // atlas de n×n células de 65x65; altitude em 16 bits (R alto, G baixo), flipY ativo
uniform vec3 uCell;         // célula do tile no atlas (x, y a partir do topo) e n
uniform float uHeightScale; // exagero / raio da Terra em metros
uniform float uSkirt;       // profundidade da saia (esconde frestas entre níveis)
varying vec2 vUv;
varying float vShade;
${SHADE}
${SUN_VERTEX}
void main() {
  vec2 uv = position.xy;   // u para leste, v para sul
  float lon = mix(uBounds.x, uBounds.z, uv.x);
  float lat = mix(uBounds.y, uBounds.w, uv.y);
  int cells = ${TILE_GRID + 1};
  int rows = int(uCell.z) * cells;
  ivec2 tc = ivec2(int(uCell.x) * cells + int(uv.x * ${f(TILE_GRID)} + 0.5),
                   rows - 1 - (int(uCell.y) * cells + int(uv.y * ${f(TILE_GRID)} + 0.5)));
  vec4 t = texelFetch(uHeight, tc, 0);
  float h = (floor(t.r * 255.0 + 0.5) * 256.0 + floor(t.g * 255.0 + 0.5)) / ${f(HEIGHT_SCALE)} - ${f(HEIGHT_OFFSET)};
  float cl = cos(lat);
  vec3 dir = vec3(cl * cos(lon), sin(lat), -cl * sin(lon));
  vec3 p = dir * (1.0 + max(h, 0.0) * uHeightScale - position.z * uSkirt);
  vUv = vec2((uCell.x + uv.x) / uCell.z, 1.0 - (uCell.y + uv.y) / uCell.z);
  vShade = viewShade(dir, p);
  vSun = sunDot(dir);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const tileFragmentShader = /* glsl */ `
precision mediump float;
uniform sampler2D uColor;
varying vec2 vUv;
varying float vShade;
${SUN_FRAGMENT}
void main() {
  gl_FragColor = vec4(texture2D(uColor, vUv).rgb * (vShade * sunLight(vSun)), 1.0);
}`;

export const globeVertexShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vShade;
${SHADE}
${SUN_VERTEX}
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vShade = viewShade(normalize(wp.xyz), wp.xyz);
  vSun = sunDot(normalize(wp.xyz));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/** O globo esconde a caixa do Brasil quando os tiles já cobrem a área. */
export const globeFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uWorld;
uniform float uHideBox;
varying vec2 vUv;
varying float vShade;
${SUN_FRAGMENT}
void main() {
  float lon = vUv.x * 360.0 - 180.0;
  float lat = vUv.y * 180.0 - 90.0;
  if (uHideBox > 0.5 && lon > ${f(ROOT.west)} && lon < ${f(ROOT.east)} && lat > ${f(ROOT.south)} && lat < ${f(ROOT.north)}) discard;
  gl_FragColor = vec4(texture2D(uWorld, vUv).rgb * (vShade * sunLight(vSun)), 1.0);
}`;

/**
 * Luzes das cidades: um `Points` só (uma chamada de desenho), brilho aditivo e tamanho por log da população
 * (`aWeight`, 0,3–1). A posição é a direção na esfera. Só aparecem no lado noturno (`dot(normal, Sol)` abaixo do
 * terminador) e no hemisfério visível; sem teste de profundidade (o relevo exagerado cobriria os pontos) mas com o
 * descarte do hemisfério oculto, como o mapa de calor. Não são iluminadas pela luz de câmera.
 */
export const cityLightsVertexShader = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform float uRadius;   // raio em que os pontos flutuam
uniform float uPointPx;  // diâmetro, em px do aparelho, do maior município
uniform float uZoom;     // 1 no zoom geral, cresce ao aproximar
attribute float aWeight;
varying float vAlpha;
void main() {
  vec3 dir = normalize(position);
  vec3 p = dir * uRadius;
  float facing = dot(dir, normalize(cameraPosition - p));
  float night = 1.0 - smoothstep(${f(LIGHTS_FULL_BELOW)}, ${f(LIGHTS_OFF_ABOVE)}, dot(dir, uSunDir));
  vAlpha = night * (0.55 + 0.45 * aWeight);
  gl_PointSize = uPointPx * uZoom * aWeight;
  gl_Position = (facing < 0.0 || night <= 0.0)
    ? vec4(2.0, 2.0, 2.0, 1.0) // fora do volume de recorte: o ponto some
    : projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const cityLightsFragmentShader = /* glsl */ `
precision mediump float;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0; // 0 no centro, 1 na borda
  float glow = pow(clamp(1.0 - d, 0.0, 1.0), 1.3);
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.48), glow * vAlpha);
}`;

export const atmosphereVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(wp.xyz);
  vView = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const atmosphereFragmentShader = /* glsl */ `
precision mediump float;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  // Esfera desenhada pelo lado de dentro: −dot vai de ~0,35 (limbo do globo) a 0 (borda externa)
  float d = -dot(vNormal, vView);
  float a = pow(clamp(d / 0.35, 0.0, 1.0), 1.6) * 0.85;
  gl_FragColor = vec4(vec3(0.38, 0.64, 1.0) * a, a);
}`;

/**
 * Mapa de calor das UFs: cor chapada translúcida, desenhada por cima do relevo (sem teste de profundidade) e
 * descartada no hemisfério de trás do globo, que de outra forma apareceria através da Terra.
 */
export const fillVertexShader = /* glsl */ `
varying float vFacing;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vFacing = dot(normalize(wp.xyz), normalize(cameraPosition - wp.xyz));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const fillFragmentShader = /* glsl */ `
precision mediump float;
uniform vec3 uColor;
uniform float uOpacity;
varying float vFacing;
void main() {
  if (vFacing < 0.0) discard;
  gl_FragColor = vec4(uColor, uOpacity);
}`;

/**
 * Rótulos do globo (siglas, pins, capitais): uma malha só. Cada quadrilátero repete a direção do ponto na esfera
 * (`position`) e o canto em px lógicos (`aCorner`): o ponto é projetado e o canto somado já em tela, então o tamanho
 * não depende da distância. O centro+canto é arredondado ao pixel do aparelho (texto nítido). Some o que está no
 * hemisfério oculto (`facing`) ou foi recusado pelo layout na CPU (`aVisible`).
 */
export const labelVertexShader = /* glsl */ `
precision highp float;
uniform vec2 uViewport; // tamanho da tela em px lógicos
uniform float uRadius;  // raio em que os rótulos flutuam
uniform float uScale;   // labelScale(textScale)
uniform float uDpr;
attribute vec2 aCorner;
attribute vec2 aUv;
attribute float aKind;
attribute float aVisible;
varying vec2 vUv;
varying float vKind;
void main() {
  vUv = vec2(aUv.x, 1.0 - aUv.y); // o atlas tem origem no topo; a textura sobe com flipY
  vKind = aKind;
  vec3 dir = normalize(position);
  vec3 p = dir * uRadius;
  float facing = dot(dir, normalize(cameraPosition - p));
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  if (aVisible < 0.5 || facing < ${f(LABEL_MIN_FACING)} || clip.w <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // fora do volume de recorte: o triângulo some
    return;
  }
  vec2 px = clip.xy / clip.w * 0.5 * uViewport + vec2(aCorner.x, -aCorner.y) * uScale;
  px = floor(px * uDpr + 0.5) / uDpr;
  gl_Position = vec4(px * 2.0 / uViewport, 0.0, 1.0);
}`;

/** Texto do atlas (alfa reto) ou círculo com contorno (pin e ponto da capital), sem textura. */
export const labelFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vKind;
void main() {
  if (vKind < ${f(QuadKind.Pin - 0.5)}) {
    gl_FragColor = texture2D(uAtlas, vUv);
    return;
  }
  // Círculo: d = 0 no centro, 1 na borda; contorno escuro por fora, miolo branco (igual ao texto do atlas).
  float d = length(vUv - 0.5) * 2.0;
  float aa = max(fwidth(d), 0.02);
  float inner = vKind > ${f(QuadKind.Pin + 0.5)} ? 0.52 : 0.6;
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  float fill = 1.0 - smoothstep(inner - aa, inner, d);
  vec3 color = mix(vec3(0.063, 0.078, 0.110), vec3(1.0), fill);
  gl_FragColor = vec4(color, alpha);
}`;
