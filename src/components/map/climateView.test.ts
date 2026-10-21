import { describe, expect, it } from 'vitest';

import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { createInitialState, rainfallNormal, toCalendar } from '@/engine';
import { buildClimateTexels, cloudCover, heavyRain } from '@/globe/climateTexture';
import { UFS } from '@/globe/ufs';

import {
  buildClimateMapData,
  buildClimateOverlay,
  climateCalendarMonth,
  DROUGHT_HATCH_FROM,
  HEAVY_RAIN_HATCH_FROM,
  NO_CLIMATE_OVERLAY,
  RAIN_CLOUD_ICON_FROM,
} from './climateView';
import { cloudIconPlacements, hatchedPaths } from './flatClimate';
import { buildRegionalMapViewModel } from './regionalMapViewModel';

// PLANO_GLOBO.md §3.4 e §4.2: do clima do motor para o globo (textura) e para o mapa 2D (hachura e ícone).

const content = loadContent(DEFAULT_SCENARIO_ID);
const neutral = createInitialState({ content, difficulty: 'estrategica', seed: 1 });

function withClimate(over: Record<string, { rain?: number; dryness?: number }>, monthIndex = neutral.monthIndex) {
  return {
    ...neutral,
    monthIndex,
    climate: { ...neutral.climate, ufs: neutral.climate.ufs.map((u) => ({ ...u, ...over[u.id] })) },
  };
}

describe('clima para o globo', () => {
  it('o mês do clima é o último mês jogado (no mês 0, o da posse)', () => {
    expect(climateCalendarMonth(0)).toBe(toCalendar(0).month);
    expect(climateCalendarMonth(1)).toBe(toCalendar(0).month);
    expect(climateCalendarMonth(5)).toBe(toCalendar(4).month);
  });

  it('um valor por UF na posição do índice do ufs.json; a nuvem sai da normal do mês e da anomalia', () => {
    const state = withClimate({ BA: { rain: 0.4, dryness: 0.7 } }, 3);
    const data = buildClimateMapData(state, content)!;
    expect(data.values[0]).toBeUndefined();
    expect(data.values).toHaveLength(28);
    const ba = UFS.find((u) => u.sigla === 'BA')!;
    const month = climateCalendarMonth(3);
    expect(data.values[ba.index]).toEqual({
      cloud: cloudCover(rainfallNormal(content.climatology, 'BA', month), 0.4),
      dryness: 0.7,
      heavyRain: heavyRain(0.4),
    });
    for (const uf of UFS) expect(data.values[uf.index], uf.sigla).toBeDefined();
    expect(data.seed).toBe(3);
  });

  it('clima neutro: seca e chuva forte zeradas em todas as UFs e a textura sai com G = B = 0', () => {
    const data = buildClimateMapData(neutral, content)!;
    for (const v of data.values) {
      if (!v) continue;
      expect(v.dryness).toBe(0);
      expect(v.heavyRain).toBe(0);
    }
    const texels = buildClimateTexels({ values: data.values });
    for (let i = 0; i < texels.length; i += 4) expect([texels[i + 1], texels[i + 2]]).toEqual([0, 0]);
  });

  it('a chave muda com o clima e com o mês, e só com eles', () => {
    const a = buildClimateMapData(withClimate({ BA: { dryness: 0.5 } }, 4), content)!;
    const same = buildClimateMapData(withClimate({ BA: { dryness: 0.5 } }, 4), content)!;
    const otherClimate = buildClimateMapData(withClimate({ BA: { dryness: 0.6 } }, 4), content)!;
    const otherMonth = buildClimateMapData(withClimate({ BA: { dryness: 0.5 } }, 5), content)!;
    expect(same.key).toBe(a.key);
    expect(otherClimate.key).not.toBe(a.key);
    expect(otherMonth.key).not.toBe(a.key);
  });

  it('sem UFs no clima não há o que desenhar', () => {
    expect(buildClimateMapData({ ...neutral, climate: { ...neutral.climate, ufs: [] } }, content)).toBeNull();
  });
});

describe('clima no mapa 2D', () => {
  const climate = withClimate({
    BA: { rain: -0.3, dryness: 0.8 },
    PI: { rain: 0, dryness: 0.5 },
    CE: { rain: 0, dryness: 0.49 },
    RS: { rain: 0.5, dryness: 0 },
    SC: { rain: 0.3, dryness: 0 },
    PR: { rain: 0.15, dryness: 0 },
    SP: { rain: 0.14, dryness: 0 },
  }).climate;

  it('Seca: hachura a seca forte (≥ 50%) e só ela', () => {
    expect(buildClimateOverlay(climate, 'seca', true).hatched).toEqual(['PI', 'BA']);
    expect(DROUGHT_HATCH_FROM).toBe(0.5);
  });

  it('Chuva: hachura a chuva forte (≥ +30%); a seca não hachura nessa camada', () => {
    expect(buildClimateOverlay(climate, 'chuva', true).hatched).toEqual(['SC', 'RS']);
    expect(HEAVY_RAIN_HATCH_FROM).toBe(0.3);
  });

  it('outras camadas e o Satélite não hachuram', () => {
    for (const layer of [null, 'aprovacao', 'renda', 'alinhamento']) {
      expect(buildClimateOverlay(climate, layer, true).hatched, String(layer)).toEqual([]);
    }
  });

  it('ícone de nuvem nas UFs com chuva acima do normal (≥ +15%), em qualquer camada', () => {
    for (const layer of [null, 'seca', 'chuva', 'aprovacao']) {
      expect(buildClimateOverlay(climate, layer, true).clouds, String(layer)).toEqual(['PR', 'SC', 'RS']);
    }
    expect(RAIN_CLOUD_ICON_FROM).toBe(0.15);
  });

  it('"Nuvens" desligada: nenhum ícone (a hachura, que é dado da camada, continua)', () => {
    const o = buildClimateOverlay(climate, 'seca', false);
    expect(o.clouds).toEqual([]);
    expect(o.hatched).toEqual(['PI', 'BA']);
  });

  it('clima neutro: nada a desenhar (o mesmo objeto vazio, sem alocar)', () => {
    expect(buildClimateOverlay(neutral.climate, 'seca', true)).toBe(NO_CLIMATE_OVERLAY);
    expect(buildClimateOverlay(neutral.climate, 'chuva', true)).toBe(NO_CLIMATE_OVERLAY);
  });

  it('o modelo do mapa carrega a escolha; sem ela, vazio', () => {
    const overlay = buildClimateOverlay(climate, 'seca', true);
    expect(buildRegionalMapViewModel({ climate: overlay }).climate).toBe(overlay);
    expect(buildRegionalMapViewModel().climate).toBe(NO_CLIMATE_OVERLAY);
  });

  it('as siglas escolhidas existem no mapa plano e têm posição e caminho', () => {
    const overlay = buildClimateOverlay(climate, 'seca', true);
    expect(hatchedPaths(overlay.hatched).map((h) => h.sigla)).toEqual(overlay.hatched);
    for (const h of hatchedPaths(overlay.hatched)) expect(h.d.length).toBeGreaterThan(10);
    const icons = cloudIconPlacements(overlay.clouds);
    expect(icons.map((i) => i.sigla)).toEqual(overlay.clouds);
    for (const i of icons) {
      expect(Number.isFinite(i.x) && Number.isFinite(i.y)).toBe(true);
      expect(i.scale).toBeGreaterThan(0);
    }
    expect(hatchedPaths(['XX'])).toEqual([]);
    expect(cloudIconPlacements(['XX'])).toEqual([]);
  });
});
