import { HEIGHT_OFFSET, HEIGHT_SCALE, ROOT, TILE_GRID } from './config';

const f = (n: number) => n.toFixed(6);

/** Sombreamento suave de "luz de câmera", igual no globo e nos tiles para não haver emenda. */
const SHADE = /* glsl */ `
float viewShade(vec3 normal, vec3 pos) {
  return 0.80 + 0.20 * max(dot(normal, normalize(cameraPosition - pos)), 0.0);
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
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const tileFragmentShader = /* glsl */ `
precision mediump float;
uniform sampler2D uColor;
varying vec2 vUv;
varying float vShade;
void main() {
  gl_FragColor = vec4(texture2D(uColor, vUv).rgb * vShade, 1.0);
}`;

export const globeVertexShader = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vShade;
${SHADE}
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vShade = viewShade(normalize(wp.xyz), wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

/** O globo esconde a caixa do Brasil quando os tiles já cobrem a área. */
export const globeFragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D uWorld;
uniform float uHideBox;
varying vec2 vUv;
varying float vShade;
void main() {
  float lon = vUv.x * 360.0 - 180.0;
  float lat = vUv.y * 180.0 - 90.0;
  if (uHideBox > 0.5 && lon > ${f(ROOT.west)} && lon < ${f(ROOT.east)} && lat > ${f(ROOT.south)} && lat < ${f(ROOT.north)}) discard;
  gl_FragColor = vec4(texture2D(uWorld, vUv).rgb * vShade, 1.0);
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
