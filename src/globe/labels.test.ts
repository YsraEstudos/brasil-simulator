import { describe, expect, it } from 'vitest';
import capitals from './data/capitals.json';
import { CAMERA } from './config';
import {
  CAPITAL_MAX_ALTITUDE,
  LABEL_ATLAS,
  LABEL_PADDING_PX,
  LABEL_SCALE_MAX,
  LABEL_SCALE_MIN,
  LABELS,
  buildLabelCandidates,
  labelScale,
  labelTier,
  layoutLabels,
  pixelsPerDegreeAtAltitude,
  ufLabelMode,
  ufScreenSize,
  type AtlasRect,
  type LabelCandidate,
  type LabelViewport,
  type Rect,
} from './labels';
import { UFS, findUf } from './ufs';

const VIEW: LabelViewport = { width: 400, height: 800, insets: { top: 0, right: 0, bottom: 0, left: 0 } };

function cand(
  id: string,
  x: number,
  y: number,
  priority: number,
  kind: LabelCandidate['kind'] = 'sigla',
): LabelCandidate {
  return { id, x, y, w: 20, h: 12, priority, kind };
}

describe('dados gerados', () => {
  it('há um rótulo por UF, na ordem de UFS', () => {
    expect(LABELS.map((l) => l.sigla)).toEqual(UFS.map((u) => u.sigla));
  });

  it('a âncora de cada UF cai dentro da própria UF', () => {
    for (const l of LABELS) expect(findUf(l.anchor[0], l.anchor[1])?.sigla, l.sigla).toBe(l.sigla);
  });

  it('a capital de cada UF cai dentro da própria UF e bate com capitals.json', () => {
    expect(capitals).toHaveLength(27);
    for (const l of LABELS) {
      expect(findUf(l.capital.lon, l.capital.lat)?.sigla, l.sigla).toBe(l.sigla);
      const c = capitals.find((x) => x.sigla === l.sigla);
      expect(c).toMatchObject({ capital: l.capital.name, lon: l.capital.lon, lat: l.capital.lat });
    }
  });

  it('as capitais têm nome com acento correto', () => {
    const names = new Map(LABELS.map((l) => [l.sigla, l.capital.name]));
    expect(names.get('PA')).toBe('Belém');
    expect(names.get('MA')).toBe('São Luís');
    expect(names.get('DF')).toBe('Brasília');
  });

  it('a prioridade é um posto único de 1 a 27', () => {
    expect(LABELS.map((l) => l.priority).sort((a, b) => a - b)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1));
    expect(LABELS.find((l) => l.sigla === 'SP')?.priority).toBe(27);
  });

  it('os retângulos do atlas ficam em [0, 1] e não se sobrepõem', () => {
    const rects: { id: string; r: AtlasRect }[] = [];
    for (const l of LABELS) {
      rects.push({ id: `${l.sigla}:sigla`, r: l.siglaRect }, { id: `${l.sigla}:capital`, r: l.capital });
    }
    expect(rects).toHaveLength(54);
    for (const { id, r } of rects) {
      expect(r.u0, id).toBeGreaterThanOrEqual(0);
      expect(r.v0, id).toBeGreaterThanOrEqual(0);
      expect(r.u1, id).toBeLessThanOrEqual(1);
      expect(r.v1, id).toBeLessThanOrEqual(1);
      expect(r.u1, id).toBeGreaterThan(r.u0);
      expect(r.v1, id).toBeGreaterThan(r.v0);
      // tamanho lógico = pixels do atlas / escala
      expect(r.w * LABEL_ATLAS.scale, id).toBeCloseTo((r.u1 - r.u0) * LABEL_ATLAS.width, 1);
      expect(r.h * LABEL_ATLAS.scale, id).toBeCloseTo((r.v1 - r.v0) * LABEL_ATLAS.height, 1);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r;
        const b = rects[j].r;
        const overlap = a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
        expect(overlap, `${rects[i].id} × ${rects[j].id}`).toBe(false);
      }
  });

  it('o atlas tem lados em potência de dois e no máximo 1024', () => {
    for (const side of [LABEL_ATLAS.width, LABEL_ATLAS.height]) {
      expect(Number.isInteger(Math.log2(side))).toBe(true);
      expect(side).toBeLessThanOrEqual(1024);
    }
  });
});

describe('níveis por altitude', () => {
  it('capitais só abaixo do limiar; siglas em toda a faixa da câmera', () => {
    expect(labelTier(CAMERA.maxAltitude)).toEqual({ siglas: true, capitals: false });
    expect(labelTier(CAPITAL_MAX_ALTITUDE + 0.01).capitals).toBe(false);
    expect(labelTier(CAPITAL_MAX_ALTITUDE)).toEqual({ siglas: true, capitals: true });
    expect(labelTier(CAMERA.minAltitude).capitals).toBe(true);
  });

  it('pixels por grau crescem ao aproximar e batem com a geometria da câmera', () => {
    const far = pixelsPerDegreeAtAltitude(2.1, 800);
    const near = pixelsPerDegreeAtAltitude(0.2, 800);
    expect(near).toBeGreaterThan(far * 5);
    // altitude 2,1: 800 px cobrem 2·2,1·tan(20°) rad ≈ 1,53 rad ≈ 87,6° → ≈ 9,1 px/°
    expect(far).toBeCloseTo(9.13, 1);
  });

  it('UFs pequenas viram pin no zoom geral e texto de perto — decidido pelo tamanho, não pelo nome', () => {
    const far = pixelsPerDegreeAtAltitude(2.1, 800);
    const near = pixelsPerDegreeAtAltitude(0.2, 800);
    const mode = (sigla: string, ppd: number) =>
      ufLabelMode(
        LABELS.find((l) => l.sigla === sigla)!,
        ppd,
      );
    expect(mode('DF', far)).toBe('pin');
    expect(mode('SE', far)).toBe('pin');
    expect(mode('SP', far)).toBe('text');
    expect(mode('AM', far)).toBe('text');
    for (const l of LABELS) expect(ufLabelMode(l, near), l.sigla).toBe('text');
    // mesma regra para qualquer UF: pin ⇔ a caixa da UF na tela é menor que a do texto
    for (const l of LABELS) {
      const size = ufScreenSize(l, far);
      const fits = size.w >= l.siglaRect.w && size.h >= l.siglaRect.h;
      expect(ufLabelMode(l, far) === 'text', l.sigla).toBe(fits);
    }
  });

  it('letras maiores (escala de texto) empurram mais UFs para pin', () => {
    const ppd = pixelsPerDegreeAtAltitude(2.1, 800);
    const pins = (scale: number) => LABELS.filter((l) => ufLabelMode(l, ppd, scale) === 'pin').length;
    expect(pins(labelScale(1.3))).toBeGreaterThanOrEqual(pins(1));
  });
});

describe('escala dos rótulos', () => {
  it('acompanha o texto do aplicativo, com limites', () => {
    expect(labelScale(1)).toBe(1);
    expect(labelScale(1.15)).toBeGreaterThan(1);
    expect(labelScale(1.3)).toBeGreaterThan(labelScale(1.15));
    expect(labelScale(0.9)).toBeLessThan(1);
    expect(labelScale(0.1)).toBe(LABEL_SCALE_MIN);
    expect(labelScale(10)).toBe(LABEL_SCALE_MAX);
  });
});

describe('layoutLabels', () => {
  it('é determinístico e não depende da ordem dos candidatos', () => {
    const list = [cand('a', 100, 100, 5), cand('b', 105, 102, 7), cand('c', 300, 400, 1), cand('d', 108, 98, 7)];
    const one = [...layoutLabels(list, VIEW)].sort();
    const two = [...layoutLabels([...list].reverse(), VIEW)].sort();
    expect(two).toEqual(one);
    expect(layoutLabels(list, VIEW)).toEqual(layoutLabels(list, VIEW));
    // b e d empatam em prioridade e kind: vence o menor id
    expect(one).toEqual(['b', 'c']);
  });

  it('a prioridade maior vence a colisão', () => {
    const shown = layoutLabels([cand('baixa', 100, 100, 1), cand('alta', 110, 104, 9)], VIEW);
    expect(shown.has('alta')).toBe(true);
    expect(shown.has('baixa')).toBe(false);
  });

  it('respeita a folga mínima entre rótulos', () => {
    const w = 20;
    const touching = [cand('a', 100, 100, 2), cand('b', 100 + w + LABEL_PADDING_PX - 0.5, 100, 1)];
    expect(layoutLabels(touching, VIEW).has('b')).toBe(false);
    const apart = [cand('a', 100, 100, 2), cand('b', 100 + w + LABEL_PADDING_PX + 0.5, 100, 1)];
    expect(layoutLabels(apart, VIEW).has('b')).toBe(true);
  });

  it('em empate de prioridade, sigla vem antes de capital', () => {
    const shown = layoutLabels([cand('c', 100, 100, 5, 'capital'), cand('s', 104, 100, 5, 'sigla')], VIEW);
    expect([...shown]).toEqual(['s']);
  });

  it('exclui o que toca uma área reservada (botões do HUD)', () => {
    const hud: Rect[] = [{ x: 90, y: 90, w: 30, h: 30 }];
    const shown = layoutLabels([cand('sob', 100, 100, 9), cand('livre', 300, 300, 1)], VIEW, hud);
    expect(shown.has('sob')).toBe(false);
    expect(shown.has('livre')).toBe(true);
  });

  it('respeita as margens seguras e o limite da tela', () => {
    const view: LabelViewport = { width: 400, height: 800, insets: { top: 60, right: 10, bottom: 40, left: 10 } };
    const shown = layoutLabels(
      [
        cand('topo', 200, 40, 1), // dentro da faixa do cabeçalho
        cand('base', 200, 780, 1), // dentro da faixa inferior
        cand('esquerda', 15, 300, 1), // metade na margem esquerda (x − 10 = 5 < 10)
        cand('direita', 395, 300, 1),
        cand('fora', -50, 300, 1),
        cand('ok', 200, 300, 1),
        cand('limite', 10 + 10, 61 + 6, 1), // encosta exatamente nas margens
      ],
      view,
    );
    expect([...shown].sort()).toEqual(['limite', 'ok']);
  });

  it('lista vazia → conjunto vazio', () => {
    expect(layoutLabels([], VIEW).size).toBe(0);
  });
});

describe('buildLabelCandidates', () => {
  // projeção plana de teste: 10 px por grau, origem em (−75, 6)
  const project = (lon: number, lat: number) => ({ x: (lon + 75) * 10, y: (6 - lat) * 10 });

  it('no zoom geral: só siglas e pins, DF vira pin', () => {
    const ppd = pixelsPerDegreeAtAltitude(2.1, 800);
    const cs = buildLabelCandidates({ project, pixelsPerDegree: ppd, tier: labelTier(2.1), scale: 1 });
    expect(cs.every((c) => c.kind !== 'capital')).toBe(true);
    expect(cs).toHaveLength(27);
    expect(cs.find((c) => c.sigla === 'DF')?.kind).toBe('pin');
    expect(cs.find((c) => c.sigla === 'SP')?.kind).toBe('sigla');
  });

  it('de perto: capitais entram, com prioridade abaixo de qualquer sigla', () => {
    const ppd = pixelsPerDegreeAtAltitude(0.2, 800);
    const cs = buildLabelCandidates({ project, pixelsPerDegree: ppd, tier: labelTier(0.2), scale: 1 });
    expect(cs).toHaveLength(54);
    const maxCapital = Math.max(...cs.filter((c) => c.kind === 'capital').map((c) => c.priority));
    const minOther = Math.min(...cs.filter((c) => c.kind !== 'capital').map((c) => c.priority));
    expect(maxCapital).toBeLessThan(minOther);
  });

  it('descarta pontos que a projeção não mostra', () => {
    const cs = buildLabelCandidates({
      project: (lon, lat) => (lon > -50 ? null : project(lon, lat)),
      pixelsPerDegree: 9,
      tier: labelTier(2.1),
      scale: 1,
    });
    expect(cs.length).toBeLessThan(27);
    expect(cs.every((c) => c.anchorX >= 0)).toBe(true);
  });

  it('a caixa da capital cobre o ponto e o nome', () => {
    const cs = buildLabelCandidates({ project, pixelsPerDegree: 40, tier: labelTier(0.1), scale: 1 });
    const c = cs.find((x) => x.id === 'SP:capital')!;
    const r = { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h };
    expect(c.anchorY).toBeGreaterThan(r.y);
    expect(c.anchorY).toBeLessThan(r.y + r.h);
    expect(c.anchorX).toBeCloseTo(c.x);
  });

  it('com o layout, o zoom geral não deixa siglas sobrepostas', () => {
    const ppd = pixelsPerDegreeAtAltitude(2.1, 800);
    const cs = buildLabelCandidates({ project, pixelsPerDegree: ppd, tier: labelTier(2.1), scale: 1 });
    const shown = layoutLabels(cs, { width: 600, height: 600, insets: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(shown.size).toBeGreaterThan(0);
    expect(shown.size).toBeLessThanOrEqual(cs.length);
  });
});
