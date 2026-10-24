import { describe, expect, it } from 'vitest';

import { lonLatToVec3 } from './geo';
import {
  INDICES_PER_QUAD,
  QuadKind,
  VERTS_PER_QUAD,
  buildLabelQuadBuffers,
  writeMarkerAttributes,
  writeVisibility,
} from './labelQuads';
import { CAPITAL_DOT_GAP_PX, CAPITAL_DOT_PX, LABELS, MARKER_ATLAS, PIN_SIZE_PX } from './labels';
import {
  MARKER_BADGE_OFFSET_PX,
  MARKER_BOX_PX,
  MARKER_COLORS,
  hexToRgb,
  markerColor,
  type GlobeMarker,
} from './markers';

const buffers = buildLabelQuadBuffers();

describe('buildLabelQuadBuffers', () => {
  it('por UF: sigla, pin, ponto e nome da capital (4 quadriláteros) e, depois, marcador e selo (4): 216 no total', () => {
    expect(LABELS).toHaveLength(27);
    expect(buffers.quadCount).toBe(27 * 4 + 27 * 4);
    expect(buffers.groups).toHaveLength(27 * 3 + 27 * 2);
  });

  it('os arrays têm o tamanho certo para um único BufferGeometry', () => {
    const q = buffers.quadCount;
    expect(buffers.positions).toHaveLength(q * VERTS_PER_QUAD * 3);
    expect(buffers.corners).toHaveLength(q * VERTS_PER_QUAD * 2);
    expect(buffers.uvs).toHaveLength(q * VERTS_PER_QUAD * 2);
    expect(buffers.kinds).toHaveLength(q * VERTS_PER_QUAD);
    expect(buffers.indices).toHaveLength(q * INDICES_PER_QUAD);
    // índices de 16 bits bastam e nenhum aponta para fora
    expect(q * VERTS_PER_QUAD).toBeLessThan(65536);
    expect(Math.max(...buffers.indices)).toBe(q * VERTS_PER_QUAD - 1);
  });

  it('os ids são os de buildLabelCandidates e os grupos cobrem todos os quadriláteros sem sobrepor', () => {
    const ids = new Set(buffers.groups.map((g) => g.id));
    for (const l of LABELS)
      for (const kind of ['sigla', 'pin', 'capital', 'marker', 'badge'])
        expect(ids.has(`${l.sigla}:${kind}`), `${l.sigla}:${kind}`).toBe(true);
    let next = 0;
    for (const g of buffers.groups) {
      expect(g.firstQuad).toBe(next);
      next += g.quadCount;
    }
    expect(next).toBe(buffers.quadCount);
  });

  it('cada vértice guarda a direção unitária do ponto na esfera, igual nos 4 cantos do quadrilátero', () => {
    for (let v = 0; v < buffers.quadCount * VERTS_PER_QUAD; v++) {
      const len = Math.hypot(buffers.positions[v * 3], buffers.positions[v * 3 + 1], buffers.positions[v * 3 + 2]);
      expect(len).toBeCloseTo(1, 5);
    }
    const sp = LABELS.find((l) => l.sigla === 'SP')!;
    const group = buffers.groups.find((g) => g.id === 'SP:sigla')!;
    const expected = lonLatToVec3(sp.anchor[0], sp.anchor[1], 1);
    for (let k = 0; k < VERTS_PER_QUAD; k++) {
      const v = group.firstQuad * VERTS_PER_QUAD + k;
      expect(buffers.positions[v * 3]).toBeCloseTo(expected[0], 5);
      expect(buffers.positions[v * 3 + 1]).toBeCloseTo(expected[1], 5);
      expect(buffers.positions[v * 3 + 2]).toBeCloseTo(expected[2], 5);
    }
  });

  it('a sigla é um quadrilátero centrado no âncora, com o tamanho lógico e o retângulo do atlas', () => {
    const sp = LABELS.find((l) => l.sigla === 'SP')!;
    const g = buffers.groups.find((x) => x.id === 'SP:sigla')!;
    const v = g.firstQuad * VERTS_PER_QUAD;
    const c = buffers.corners;
    expect([c[v * 2], c[v * 2 + 1]]).toEqual([-sp.siglaRect.w / 2, -sp.siglaRect.h / 2]);
    expect([c[(v + 3) * 2], c[(v + 3) * 2 + 1]]).toEqual([sp.siglaRect.w / 2, sp.siglaRect.h / 2]);
    const t = buffers.uvs;
    expect([t[v * 2], t[v * 2 + 1]]).toEqual([sp.siglaRect.u0, sp.siglaRect.v0].map(Math.fround));
    expect([t[(v + 3) * 2], t[(v + 3) * 2 + 1]]).toEqual([sp.siglaRect.u1, sp.siglaRect.v1].map(Math.fround));
    expect(buffers.kinds[v]).toBe(QuadKind.Text);
  });

  it('o pin é um círculo de PIN_SIZE_PX no âncora; a capital é ponto (no ponto) + nome logo abaixo', () => {
    const df = LABELS.find((l) => l.sigla === 'DF')!;
    const pin = buffers.groups.find((x) => x.id === 'DF:pin')!;
    const pv = pin.firstQuad * VERTS_PER_QUAD;
    expect(buffers.kinds[pv]).toBe(QuadKind.Pin);
    expect(buffers.corners[pv * 2]).toBe(-PIN_SIZE_PX / 2);
    expect(buffers.corners[(pv + 3) * 2]).toBe(PIN_SIZE_PX / 2);

    const cap = buffers.groups.find((x) => x.id === 'DF:capital')!;
    expect(cap.quadCount).toBe(2);
    const dv = cap.firstQuad * VERTS_PER_QUAD;
    expect(buffers.kinds[dv]).toBe(QuadKind.Dot);
    expect(buffers.corners[dv * 2]).toBe(-CAPITAL_DOT_PX / 2);
    const nv = (cap.firstQuad + 1) * VERTS_PER_QUAD;
    expect(buffers.kinds[nv]).toBe(QuadKind.Text);
    // topo do nome = base do ponto + folga; base do nome = topo + altura do texto (a caixa do candidato)
    expect(buffers.corners[nv * 2 + 1]).toBeCloseTo(CAPITAL_DOT_PX / 2 + CAPITAL_DOT_GAP_PX, 6);
    expect(buffers.corners[(nv + 3) * 2 + 1]).toBeCloseTo(CAPITAL_DOT_PX / 2 + CAPITAL_DOT_GAP_PX + df.capital.h, 6);
    // o nome fica centrado no ponto da capital
    expect(buffers.corners[nv * 2] + buffers.corners[(nv + 3) * 2]).toBeCloseTo(0, 6);
  });

  it('é determinístico', () => {
    const again = buildLabelQuadBuffers();
    expect(again.positions).toEqual(buffers.positions);
    expect(again.uvs).toEqual(buffers.uvs);
  });
});

describe('writeVisibility', () => {
  it('liga só os quadriláteros dos rótulos mostrados e conta os rótulos', () => {
    const target = new Float32Array(buffers.quadCount * VERTS_PER_QUAD).fill(7);
    const count = writeVisibility(target, buffers.groups, new Set(['SP:sigla', 'DF:capital']));
    expect(count).toBe(2);
    expect(target.reduce((s, x) => s + x, 0)).toBe((1 + 2) * VERTS_PER_QUAD);
    const sp = buffers.groups.find((g) => g.id === 'SP:sigla')!;
    expect(target[sp.firstQuad * VERTS_PER_QUAD]).toBe(1);
    const df = buffers.groups.find((g) => g.id === 'DF:capital')!;
    expect(target[(df.firstQuad + 1) * VERTS_PER_QUAD + 3]).toBe(1);
  });

  it('ignora ids que não existem e zera tudo com o conjunto vazio', () => {
    const target = new Float32Array(buffers.quadCount * VERTS_PER_QUAD).fill(1);
    expect(writeVisibility(target, buffers.groups, new Set(['XX:sigla']))).toBe(0);
    expect(target.every((x) => x === 0)).toBe(true);
  });
});

describe('marcadores no mesmo buffer (PR 11)', () => {
  const slot = (sigla: string) => buffers.markerSlots.get(sigla)!;
  const quadStart = (q: number) => q * VERTS_PER_QUAD;

  it('vêm depois de todos os rótulos (desenham por cima), uma chamada de desenho só', () => {
    const labelQuads = Math.max(
      ...buffers.groups.filter((g) => /:(sigla|pin|capital)$/.test(g.id)).map((g) => g.firstQuad + g.quadCount),
    );
    for (const l of LABELS) {
      expect(slot(l.sigla).marker).toBeGreaterThanOrEqual(labelQuads);
      expect(slot(l.sigla).badge).toBe(slot(l.sigla).marker + 2);
    }
    expect(buffers.quadCount * VERTS_PER_QUAD).toBeLessThan(65536);
  });

  it('o disco (caixa com folga para o anel do pulso) e o glifo ficam centrados no âncora da UF', () => {
    const { marker } = slot('SP');
    const c = buffers.corners;
    const disc = quadStart(marker);
    expect(buffers.kinds[disc]).toBe(QuadKind.Marker);
    expect([c[disc * 2], c[disc * 2 + 1]]).toEqual([-MARKER_BOX_PX / 2, -MARKER_BOX_PX / 2]);
    const glyph = quadStart(marker + 1);
    expect(buffers.kinds[glyph]).toBe(QuadKind.Text);
    expect(c[glyph * 2] + c[(glyph + 3) * 2]).toBeCloseTo(0, 6);
    expect(c[glyph * 2 + 1] + c[(glyph + 3) * 2 + 1]).toBeCloseTo(0, 6);
    // a direção na esfera é a do âncora, igual à da sigla
    const sigla = buffers.groups.find((g) => g.id === 'SP:sigla')!;
    for (const k of [0, 1, 2]) {
      expect(buffers.positions[disc * 3 + k]).toBe(buffers.positions[quadStart(sigla.firstQuad) * 3 + k]);
    }
  });

  it('o selo fica no canto superior direito do disco, com o número por cima', () => {
    const { badge } = slot('CE');
    const c = buffers.corners;
    const disc = quadStart(badge);
    expect(buffers.kinds[disc]).toBe(QuadKind.Badge);
    const cx = (c[disc * 2] + c[(disc + 3) * 2]) / 2;
    const cy = (c[disc * 2 + 1] + c[(disc + 3) * 2 + 1]) / 2;
    expect([cx, cy]).toEqual([MARKER_BADGE_OFFSET_PX.x, MARKER_BADGE_OFFSET_PX.y]);
    expect(buffers.kinds[quadStart(badge + 1)]).toBe(QuadKind.Text);
  });

  const marker = (sigla: string, over: Partial<GlobeMarker> = {}): GlobeMarker => ({
    sigla,
    kind: 'event',
    critical: false,
    count: 1,
    pulse: false,
    ...over,
  });

  it('writeMarkerAttributes: cor, glifo, pulso e número do selo sem mexer na geometria', () => {
    const b = buildLabelQuadBuffers();
    const before = { positions: b.positions.slice(), corners: b.corners.slice(), kinds: b.kinds.slice() };
    writeMarkerAttributes(b, [marker('CE', { critical: true, pulse: true, count: 3 }), marker('RS', { kind: 'news' })]);
    const s = b.markerSlots;
    const tint = (q: number) => [...b.tints.slice(q * VERTS_PER_QUAD * 3, q * VERTS_PER_QUAD * 3 + 3)];
    const uv = (q: number) => [b.uvs[q * VERTS_PER_QUAD * 2], b.uvs[q * VERTS_PER_QUAD * 2 + 1]];
    const f = (n: number) => Math.fround(n);

    const ce = s.get('CE')!;
    expect(tint(ce.marker)).toEqual(hexToRgb(markerColor(marker('CE', { critical: true }))).map(f));
    expect(uv(ce.marker + 1)).toEqual([f(MARKER_ATLAS.glyphs.event.u0), f(MARKER_ATLAS.glyphs.event.v0)]);
    expect(b.pulses[ce.marker * VERTS_PER_QUAD]).toBe(1);
    // o pulso é do disco; o glifo e o selo não pulsam
    expect(b.pulses[(ce.marker + 1) * VERTS_PER_QUAD]).toBe(0);
    expect(tint(ce.badge)).toEqual(hexToRgb(MARKER_COLORS.badge).map(f));
    expect(uv(ce.badge + 1)).toEqual([f(MARKER_ATLAS.counts['3'].u0), f(MARKER_ATLAS.counts['3'].v0)]);

    const rs = s.get('RS')!;
    expect(uv(rs.marker + 1)).toEqual([f(MARKER_ATLAS.glyphs.news.u0), f(MARKER_ATLAS.glyphs.news.v0)]);
    expect(b.pulses[rs.marker * VERTS_PER_QUAD]).toBe(0);

    expect(b.positions).toEqual(before.positions);
    expect(b.corners).toEqual(before.corners);
    expect(b.kinds).toEqual(before.kinds);
  });

  it('sem marcadores o pulso zera; um grupo de dez ou mais usa o selo "9+"', () => {
    const b = buildLabelQuadBuffers();
    writeMarkerAttributes(b, [marker('CE', { pulse: true })]);
    expect(b.pulses.some((x) => x === 1)).toBe(true);
    writeMarkerAttributes(b, [marker('AM', { count: 12 })]);
    expect(b.pulses.some((x) => x === 1)).toBe(false);
    const am = b.markerSlots.get('AM')!;
    const plus = MARKER_ATLAS.counts['9+'];
    expect(b.uvs[(am.badge + 1) * VERTS_PER_QUAD * 2]).toBe(Math.fround(plus.u0));
  });
});
