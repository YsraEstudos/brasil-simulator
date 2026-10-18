import { DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace } from 'three';

/**
 * Texturas da mesa geradas em código (sem imagens para baixar ou empacotar): pequenas, em potência de 2,
 * criadas uma vez por montagem. Funcionam igual na web e no expo-gl (DataTexture RGBA de 8 bits).
 */

type Rgb = readonly [number, number, number];

/** Ruído estável por coordenada inteira (0–1). */
function noise(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function texture(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  const tex = new DataTexture(data, width, height, RGBAFormat);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const mix = (a: Rgb, b: Rgb, t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Madeira escura com veios ao longo do eixo u. */
export function woodTexture() {
  const light: Rgb = [122, 78, 46];
  const dark: Rgb = [62, 36, 20];
  const tex = texture(128, 128, (x, y) => {
    const wobble = Math.sin(x * 0.07 + Math.sin(y * 0.21) * 1.6) * 3;
    const grain = 0.5 + 0.5 * Math.sin((y + wobble) * 0.55 + noise(0, y) * 2);
    const fine = noise(x >> 2, y) * 0.18;
    const [r, g, b] = mix(dark, light, Math.min(1, grain * 0.75 + fine));
    return [r, g, b, 255];
  });
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

/** Mancha radial (sombras falsas e poças de luz): cor fixa, transparência caindo do centro para a borda. */
export function radialTexture(color: Rgb, falloff = 2) {
  const size = 64;
  return texture(size, size, (x, y) => {
    const dx = (x + 0.5) / size - 0.5;
    const dy = (y + 0.5) / size - 0.5;
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
    const a = Math.pow(1 - d, falloff);
    return [color[0], color[1], color[2], Math.round(a * 255)];
  });
}

/** Jornal dobrado visto de longe: cabeçalho, foto e colunas de texto em cinza. */
export function newspaperTexture() {
  const w = 128;
  const h = 256;
  const paper: Rgb = [236, 228, 208];
  const ink: Rgb = [60, 54, 46];
  return texture(w, h, (x, y) => {
    const m = 8;
    const inside = x >= m && x < w - m && y >= m && y < h - m;
    let c: [number, number, number] = [...paper];
    if (inside) {
      if (y < 30) c = y > 12 && y < 26 && x > 20 && x < w - 20 ? mix(paper, ink, 0.85) : c;
      else if (y === 32 || y === 34) c = mix(paper, ink, 0.6);
      else if (y > 40 && y < 52 && x < w - 24) c = mix(paper, ink, 0.75);
      else if (y > 58 && y < 120 && x > m && x < 74) c = mix(paper, [120, 110, 96], 0.55 + noise(x >> 3, y >> 3) * 0.2);
      else {
        const col = Math.floor((x - m) / ((w - 2 * m) / 3));
        const gap = (x - m) % Math.floor((w - 2 * m) / 3) < 3;
        const inPhoto = y < 124 && x < 78;
        if (!gap && !inPhoto && y % 5 < 2 && noise(col, y) > 0.08) c = mix(paper, ink, 0.38);
      }
    }
    const shade = 1 - noise(x >> 4, y >> 4) * 0.05;
    return [c[0] * shade, c[1] * shade, c[2] * shade, 255];
  });
}

/** Tela do notebook com a rede social aberta (cabeçalho e cartões), vista de longe. */
export function screenTexture() {
  const w = 64;
  const h = 64;
  const bg: Rgb = [18, 26, 22];
  const card: Rgb = [32, 46, 38];
  const accent: Rgb = [232, 201, 106];
  return texture(w, h, (x, y) => {
    if (y < 8) return [...(x > 4 && x < 18 && y > 2 && y < 6 ? accent : mix(bg, card, 0.8)), 255];
    const row = (y - 10) % 14;
    const inCard = y >= 10 && row < 12 && x > 4 && x < w - 4;
    if (!inCard) return [...bg, 255];
    if (row > 2 && row < 7 && x > 6 && x < 12) return [...mix(card, accent, 0.5), 255];
    if ((row === 4 || row === 7) && x > 14 && x < (row === 4 ? 40 : 54))
      return [...mix(card, [210, 210, 200], 0.55), 255];
    return [...card, 255];
  });
}

/** Teclado: grade de teclas escuras. */
export function keyboardTexture() {
  const w = 128;
  const h = 64;
  return texture(w, h, (x, y) => {
    const key = x % 9 > 0 && y % 11 > 0 && y < 56 && x > 2 && x < w - 2;
    const c: Rgb = key ? [24, 26, 30] : [44, 48, 54];
    return [c[0], c[1], c[2], 255];
  });
}
