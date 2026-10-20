import { describe, expect, it } from 'vitest';

import { lonLatToVec3 } from './geo';
import { INDICES_PER_QUAD, QuadKind, VERTS_PER_QUAD, buildLabelQuadBuffers, writeVisibility } from './labelQuads';
import { CAPITAL_DOT_GAP_PX, CAPITAL_DOT_PX, LABELS, PIN_SIZE_PX } from './labels';

const buffers = buildLabelQuadBuffers();

describe('buildLabelQuadBuffers', () => {
  it('por UF: sigla, pin, ponto e nome da capital (4 quadriláteros), 108 no total', () => {
    expect(LABELS).toHaveLength(27);
    expect(buffers.quadCount).toBe(27 * 4);
    expect(buffers.groups).toHaveLength(27 * 3);
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
      for (const kind of ['sigla', 'pin', 'capital'])
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
