"""Gera os rasters pequenos do clima no globo (PLANO_GLOBO.md §3.2, §4.2; PR 10).

Não regera os tiles: lê só os contornos das UFs (IBGE) e os lagos do Natural Earth, os mesmos insumos de
`build_globe.py` (rodar `fetch_globe_data.py` antes), e escreve três arquivos pequenos sobre a mesma caixa da
quadtree (`ROOT`, 48° x 48°, 256 x 256 células de 0,1875° ≈ 20 km):

  src/globe/data/ufIndex.json            índice de UF (R8: 0 = fora do Brasil, 1…27 = `index` de ufs.json), RLE
  assets/globe/climate/water_mask.png    máscara de água (L8): 0 = terra brasileira, 255 = água ou fora do Brasil
  assets/globe/climate/cloud_noise.png   ruído fractal de nuvens (L8 256², ladrilhável)

O índice de UF é lido no JavaScript (monta a textura de clima uma vez por mês), por isso vai em JSON com RLE (o
React Native não decodifica PNG em memória); a máscara e o ruído só vão para a GPU, então são PNG. Água nunca é
detectada por cor: vem dos polígonos de lagos/represas do Natural Earth e da ausência de UF (mar e vizinhos).

Uso: python scripts/data/build_globe_climate.py [--raw CAMINHO_DO_data-raw]
"""

from __future__ import annotations

import argparse
import gzip
import json
import pathlib

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
OUT_ASSETS = ROOT_DIR / "assets/globe/climate"
OUT_SRC = ROOT_DIR / "src/globe/data"

# Deve coincidir com src/globe/config.ts (ROOT) e src/globe/climateGrid.ts (UF_GRID_SIZE).
ROOT = (-76.0, -36.0, -28.0, 12.0)  # oeste, sul, leste, norte
GRID = 256
SUPER = 4  # supersampling do desenho; o índice usa a amostra central, a máscara a média do bloco
NOISE_SEED = 20261021


def load_json(path: pathlib.Path):
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def geom_rings(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def draw_polygons(draw: ImageDraw.ImageDraw, polys, fill, size: int):
    deg = ROOT[2] - ROOT[0]
    for poly in polys:
        for i, ring in enumerate(poly):
            pts = np.asarray(ring, dtype=np.float64)
            xs = (pts[:, 0] - ROOT[0]) / deg * size
            ys = (ROOT[3] - pts[:, 1]) / deg * size
            draw.polygon(list(zip(xs.tolist(), ys.tolist())), fill=fill if i == 0 else 0)


def rle(values: np.ndarray) -> list[int]:
    """[valor, repetições, valor, repetições, …] da matriz achatada (linha a linha, norte primeiro)."""
    flat = values.ravel()
    change = np.flatnonzero(np.diff(flat)) + 1
    starts = np.concatenate(([0], change))
    counts = np.diff(np.concatenate((starts, [flat.size])))
    out: list[int] = []
    for s, c in zip(starts, counts):
        out += [int(flat[s]), int(c)]
    return out


def build_uf_and_water(raw: pathlib.Path):
    ufs = load_json(raw / "ibge/uf.geojson")["features"]
    ufs.sort(key=lambda f: int(f["properties"]["codarea"]))  # mesma ordem de build_globe.py (index = posição + 1)
    size = GRID * SUPER
    uf_img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(uf_img)
    for idx, f in enumerate(ufs, 1):
        draw_polygons(d, geom_rings(f["geometry"]), idx, size)
    uf_big = np.asarray(uf_img)

    lake_img = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(lake_img)
    for f in load_json(raw / "naturalearth/ne_10m_lakes.geojson")["features"]:
        draw_polygons(d, geom_rings(f["geometry"]), 255, size)
    lake_big = np.asarray(lake_img) > 0

    off = SUPER // 2
    uf_index = uf_big[off::SUPER, off::SUPER].copy()
    water_big = (uf_big == 0) | lake_big
    coverage = water_big.reshape(GRID, SUPER, GRID, SUPER).mean(axis=(1, 3))
    water = np.round(coverage * 255).astype(np.uint8)
    return uf_index, water, len(ufs)


def build_cloud_noise() -> np.ndarray:
    """Ruído fractal ladrilhável (modo 'wrap'): 4 oitavas de ruído branco suavizado, esticado ao intervalo 0–255."""
    rng = np.random.default_rng(NOISE_SEED)
    acc = np.zeros((GRID, GRID), np.float64)
    for sigma, amp in ((20.0, 1.0), (10.0, 0.55), (5.0, 0.3), (2.5, 0.16)):
        g = ndimage.gaussian_filter(rng.standard_normal((GRID, GRID)), sigma, mode="wrap")
        acc += amp * g / g.std()
    lo, hi = np.percentile(acc, [1, 99])
    return (np.clip((acc - lo) / (hi - lo), 0, 1) * 255).round().astype(np.uint8)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=pathlib.Path, default=ROOT_DIR / "data-raw")
    args = parser.parse_args()

    uf_index, water, count = build_uf_and_water(args.raw)
    OUT_SRC.mkdir(parents=True, exist_ok=True)
    OUT_ASSETS.mkdir(parents=True, exist_ok=True)

    payload = {"size": GRID, "box": list(ROOT), "ufs": count, "rle": rle(uf_index)}
    (OUT_SRC / "ufIndex.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    Image.fromarray(water, "L").save(OUT_ASSETS / "water_mask.png", optimize=True)
    Image.fromarray(build_cloud_noise(), "L").save(OUT_ASSETS / "cloud_noise.png", optimize=True)

    for path in (OUT_SRC / "ufIndex.json", OUT_ASSETS / "water_mask.png", OUT_ASSETS / "cloud_noise.png"):
        print(f"{path.relative_to(ROOT_DIR)}: {path.stat().st_size / 1024:.1f} KiB")
    print(f"UFs no índice: {sorted(set(uf_index.ravel().tolist()) - {0})[:3]}… ({count}); água: {(water > 127).mean():.1%}")


if __name__ == "__main__":
    main()
