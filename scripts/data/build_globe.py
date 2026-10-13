"""Gera os assets do globo a partir de data-raw/ (rodar fetch_globe_data.py antes).

Saídas:
  assets/globe/world.jpg                 textura mundial (equiretangular, 4096x2048)
  assets/globe/tiles/{z}/{x}/{y}.jpg     cor estilizada do Brasil (256x256)
  assets/globe/tiles/{z}/{x}/{y}.png     altitude para deslocamento da malha (65x65, 16 bits em R/G)
  src/globe/data/tileIndex.ts            manifesto com require() de cada tile (Metro exige requires estáticos)
  src/globe/data/ufs.json                siglas, nomes e contornos simplificados das UFs (para toque/rótulos)

Quadtree geográfica: raiz = ROOT (48° x 48°), nível z divide em 2^z x 2^z tiles; x cresce para leste,
y cresce para sul. No nível MAX_LEVEL cada pixel tem 48/(256*32) ≈ 0,0059° (~650 m).

Uso: python scripts/data/build_globe.py
"""

from __future__ import annotations

import gzip
import json
import math
import pathlib
import shutil

import numpy as np
import shapefile
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT_DIR / "data-raw"
OUT_ASSETS = ROOT_DIR / "assets/globe"
OUT_SRC = ROOT_DIR / "src/globe/data"

# Deve coincidir com src/globe/config.ts
ROOT = (-76.0, -36.0, -28.0, 12.0)  # oeste, sul, leste, norte
MAX_LEVEL = 5
TILE = 256
GRID = 64  # células da malha por tile → 65x65 amostras de altitude
SIZE = TILE * 2**MAX_LEVEL  # 8192 px no raster-base
RES = (ROOT[2] - ROOT[0]) / SIZE  # graus por pixel
HEIGHT_OFFSET = 500.0  # altitude codificada = (h + 500) * 10 em uint16
STRIP = 1024

# Paleta estilizada por bioma (código IBGE CD_Bioma)
BIOME_COLORS = {
    1: (46, 104, 46),  # Amazônia — floresta densa
    2: (190, 172, 112),  # Caatinga — seca, arbustiva
    3: (150, 160, 82),  # Cerrado — savana
    4: (66, 130, 62),  # Mata Atlântica
    5: (146, 182, 100),  # Pampa — campos
    6: (104, 150, 112),  # Pantanal — áreas úmidas
}
BIOME_TEXTURE = {1: 0.10, 2: 0.07, 3: 0.09, 4: 0.09, 5: 0.05, 6: 0.06}  # contraste do ruído de vegetação
HIGHLAND = np.array([158, 160, 120], np.float32)  # campos de altitude
ROCK = np.array([140, 128, 112], np.float32)
WATER = np.array([62, 120, 176], np.float32)
SHALLOW_SEA = np.array([101, 153, 189], np.uint8)  # tom raso do oceano do NE2 após desaturate_world


# ---------------------------------------------------------------- utilidades geográficas

def lon_to_px(lon):
    return (np.asarray(lon) - ROOT[0]) / RES


def lat_to_px(lat):
    return (ROOT[3] - np.asarray(lat)) / RES


def pixel_lonlat_rows(r0: int, r1: int):
    lons = ROOT[0] + (np.arange(SIZE) + 0.5) * RES
    lats = ROOT[3] - (np.arange(r0, r1) + 0.5) * RES
    return lons, lats


def load_json(path: pathlib.Path):
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw.decode("utf-8"))


def geom_rings(geom):
    """Anéis externos e buracos de um GeoJSON Polygon/MultiPolygon como [(rings)]."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def draw_polygons(draw: ImageDraw.ImageDraw, polys, fill, scale=1.0, ox=0.0, oy=0.0):
    for poly in polys:
        for i, ring in enumerate(poly):
            pts = np.asarray(ring, dtype=np.float64)
            xs = (lon_to_px(pts[:, 0]) - ox) * scale
            ys = (lat_to_px(pts[:, 1]) - oy) * scale
            draw.polygon(list(zip(xs.tolist(), ys.tolist())), fill=fill if i == 0 else 0)


# ---------------------------------------------------------------- rasters-base

def build_height() -> np.ndarray:
    """Altitude (m) no grid-base, reprojetando os tiles Terrarium (Web Mercator)."""
    print("altitude…")

    def mosaic(z):
        d = RAW / f"terrarium/{z}"
        xs = sorted(int(p.name) for p in d.iterdir())
        ys = sorted({int(p.stem) for x in xs for p in (d / str(x)).iterdir()})
        img = np.zeros((len(ys) * 256, len(xs) * 256), np.float32)
        for i, x in enumerate(xs):
            for j, y in enumerate(ys):
                a = np.asarray(Image.open(d / f"{x}/{y}.png").convert("RGB"), np.float32)
                img[j * 256:(j + 1) * 256, i * 256:(i + 1) * 256] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
        return img, xs[0], ys[0], z

    def sample(m, lons, lats):
        img, x0, y0, z = m
        n = 2**z * 256
        fx = (lons + 180.0) / 360.0 * n - x0 * 256 - 0.5
        fy = (1.0 - np.arcsinh(np.tan(np.radians(lats))) / math.pi) / 2.0 * n - y0 * 256 - 0.5
        return ndimage.map_coordinates(img, [fy, fx], order=1, mode="nearest")

    fine = mosaic(8)
    coarse = mosaic(3)
    fine_lon0 = fine[1] * 256 / (2**8 * 256) * 360 - 180
    fine_lon1 = (fine[1] * 256 + fine[0].shape[1]) / (2**8 * 256) * 360 - 180

    def merc_lat(py, z):
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * py / (2**z * 256)))))

    fine_lat0 = merc_lat(fine[2] * 256, 8)
    fine_lat1 = merc_lat(fine[2] * 256 + fine[0].shape[0], 8)

    H = np.zeros((SIZE, SIZE), np.float32)
    for r0 in range(0, SIZE, STRIP):
        r1 = min(SIZE, r0 + STRIP)
        lons, lats = pixel_lonlat_rows(r0, r1)
        LO, LA = np.meshgrid(lons, lats)
        inside = (LO > fine_lon0) & (LO < fine_lon1) & (LA < fine_lat0) & (LA > fine_lat1)
        h = sample(coarse, LO.ravel(), LA.ravel()).reshape(LO.shape)
        if inside.any():
            h[inside] = sample(fine, LO[inside], LA[inside])
        H[r0:r1] = h
    return H


def build_masks(ufs):
    print("biomas e UFs…")
    biome = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(biome)
    sf = shapefile.Reader(str(RAW / "ibge/Biomas_250mil/lm_bioma_250"), encoding="utf-8")
    for shape_rec in sf.iterShapeRecords():
        code = int(shape_rec.record["CD_Bioma"])
        geom = shape_rec.shape.__geo_interface__
        draw_polygons(d, geom_rings(geom), code)

    uf = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(uf)
    for idx, f in enumerate(ufs, 1):
        draw_polygons(d, geom_rings(f["geometry"]), idx)
    B = np.asarray(biome).copy()
    U = np.asarray(uf).copy()
    # Biomas e UFs têm litorais ligeiramente diferentes: preencher bioma faltante com o vizinho.
    for _ in range(40):
        missing = (U > 0) & (B == 0)
        if not missing.any():
            break
        grown = ndimage.grey_dilation(B, size=(3, 3))
        B[missing] = grown[missing]
    B[(U > 0) & (B == 0)] = 3  # resto (ilhas oceânicas): Cerrado como padrão neutro
    B[U == 0] = 0
    return B, U


def build_ne2_crop() -> np.ndarray:
    print("Natural Earth II…")
    ne = Image.open(RAW / "naturalearth/NE2_50M_SR_W/NE2_50M_SR_W/NE2_50M_SR_W.tif").convert("RGB")
    px_per_deg = ne.width / 360.0
    box = (
        (ROOT[0] + 180) * px_per_deg,
        (90 - ROOT[3]) * px_per_deg,
        (ROOT[2] + 180) * px_per_deg,
        (90 - ROOT[1]) * px_per_deg,
    )
    return np.asarray(ne.resize((SIZE, SIZE), Image.BICUBIC, box=box))


class FractalNoise:
    """Ruído fractal determinístico (soma de oitavas interpoladas), amostrável por faixas."""

    def __init__(self, seed=7):
        rng = np.random.default_rng(seed)
        self.octaves = []
        amp = 1.0
        for cells in (16, 64, 256, 1024, 4096):
            g = rng.standard_normal((cells, cells)).astype(np.float32)
            self.octaves.append((Image.fromarray(g, mode="F"), cells, amp))
            amp *= 0.8
        self.total = sum(a for _, _, a in self.octaves)

    def rows(self, r0: int, r1: int) -> np.ndarray:
        out = np.zeros((r1 - r0, SIZE), np.float32)
        for img, cells, amp in self.octaves:
            k = cells / SIZE
            part = img.resize((SIZE, r1 - r0), Image.BICUBIC, box=(0, r0 * k, cells, r1 * k))
            out += np.asarray(part) * amp
        out /= self.total
        return np.clip(out / 0.45, -1, 1)


def desaturate_world(rgb: np.ndarray) -> np.ndarray:
    """Tom neutro para áreas fora do Brasil (mesma função no globo e nos tiles)."""
    f = rgb.astype(np.float32)
    gray = f @ np.array([0.299, 0.587, 0.114], np.float32)
    water = (f[..., 2] - f[..., 0]) > 50
    land = f * 0.45 + gray[..., None] * 0.55
    land = land * 0.85 + 255 * 0.12
    out = np.where(water[..., None], f * 0.9, land)
    return np.clip(out, 0, 255).astype(np.uint8)


def hillshade(H: np.ndarray, zfactor: float, cell_m: float) -> np.ndarray:
    gy, gx = np.gradient(H * zfactor, cell_m)
    slope = np.hypot(gx, gy)
    shade = np.zeros_like(H)
    # multidirecional: noroeste dominante + oeste e norte suaves (convenção cartográfica)
    for az, w in ((315, 0.6), (270, 0.2), (360, 0.2)):
        a = math.radians(az)
        lx, ly, lz = math.sin(a) * math.cos(math.radians(45)), math.cos(a) * math.cos(math.radians(45)), math.sin(math.radians(45))
        nz = 1.0 / np.sqrt(1 + gx**2 + gy**2)
        shade += w * np.clip((-gx * lx + gy * ly) * nz + lz * nz, 0, 1)
    return shade, slope


def build_color(H, B, U, NE2, water_mask) -> np.ndarray:
    print("cores estilizadas…")
    color = np.empty((SIZE, SIZE, 3), np.uint8)
    noise = FractalNoise()
    lut = np.zeros((8, 3), np.float32)
    tex = np.zeros(8, np.float32)
    for k, c in BIOME_COLORS.items():
        lut[k] = c
        tex[k] = BIOME_TEXTURE[k]
    cell_m = RES * 111_000
    pad = 64
    for r0 in range(0, SIZE, STRIP):
        r1 = min(SIZE, r0 + STRIP)
        a0, a1 = max(0, r0 - pad), min(SIZE, r1 + pad)
        sl = slice(r0 - a0, r0 - a0 + (r1 - r0))
        h_pad = np.maximum(H[a0:a1], 0)
        shade_fine, slope = hillshade(h_pad, 3.0, cell_m)
        shade_broad, _ = hillshade(ndimage.gaussian_filter(h_pad, 12), 6.0, cell_m)
        shade = 0.55 * shade_fine[sl] + 0.45 * shade_broad[sl]
        slope = slope[sl]
        h = h_pad[sl]
        b = B[r0:r1]
        u = U[r0:r1]
        n = noise.rows(r0, r1)
        # Transição suave entre biomas (ecótonos): borrar a cor-base ~5 km
        base_pad = lut[B[a0:a1]]
        for c in range(3):
            base_pad[..., c] = ndimage.gaussian_filter(base_pad[..., c], 8)
        base = base_pad[sl]
        # campos de altitude e rocha
        hi = np.clip((h - 900) / 900, 0, 1)[..., None]
        base = base * (1 - hi * 0.7) + HIGHLAND * hi * 0.7
        rock = np.clip((slope - 0.25) / 0.5, 0, 1)[..., None] * 0.6
        base = base * (1 - rock) + ROCK * rock
        # textura de vegetação (copas, manchas) e áreas alagáveis do Pantanal
        base *= (1 + n[..., None] * tex[b][..., None])
        wet = ((b == 6) & (n > 0.35) & (slope < 0.02))[..., None]
        base = np.where(wet, base * 0.5 + WATER * 0.5, base)
        lit = base * (0.55 + 0.6 * shade[..., None])
        brazil = np.clip(lit, 0, 255)
        w = water_mask[r0:r1, :, None].astype(np.float32) / 255
        brazil = brazil * (1 - w) + WATER * w
        world = desaturate_world(NE2[r0:r1])
        # O litoral do Natural Earth (1:50m) é grosseiro: onde a altitude é ≤ 0 fora do Brasil, é mar.
        ne_water = (NE2[r0:r1, :, 2].astype(np.int16) - NE2[r0:r1, :, 0]) > 50
        coastal_sea = (h <= 0) & (u == 0) & ~ne_water
        world[coastal_sea] = SHALLOW_SEA
        color[r0:r1] = np.where((u > 0)[..., None], brazil, world).astype(np.uint8)
    return color


def build_water_mask() -> np.ndarray:
    """Lagos e represas no raster-base (rios são desenhados por nível em draw_lines_overlay)."""
    print("lagos…")
    img = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(img)
    lakes = load_json(RAW / "naturalearth/ne_10m_lakes.geojson")
    for f in lakes["features"]:
        draw_polygons(d, geom_rings(f["geometry"]), 255)
    return np.asarray(img.filter(ImageFilter.GaussianBlur(0.6))).copy()


def line_parts(geom):
    if geom is None:
        return []
    if geom["type"] == "LineString":
        return [geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        return geom["coordinates"]
    return []


# ---------------------------------------------------------------- tiles

def tile_bounds(z, x, y):
    span = (ROOT[2] - ROOT[0]) / 2**z
    w = ROOT[0] + x * span
    n = ROOT[3] - y * span
    return w, n - span, w + span, n


def tiles_to_build(coverage: np.ndarray):
    """Nível 0–1 completos; abaixo, todos os filhos de tiles que tocam o Brasil (com folga)."""
    result = {0: [(0, 0)]}
    for z in range(1, MAX_LEVEL + 1):
        result[z] = []
        for (px_, py_) in result[z - 1]:
            n = 2 ** (z - 1)
            size = SIZE // n
            block = coverage[py_ * size:(py_ + 1) * size, px_ * size:(px_ + 1) * size]
            if z <= 1 or block.any():
                for dx in (0, 1):
                    for dy in (0, 1):
                        result[z].append((px_ * 2 + dx, py_ * 2 + dy))
    return result


def draw_lines_overlay(img: Image.Image, z, x, y, ufs, rivers, brazil_outline):
    """Divisas e rios redesenhados em cada nível para manter espessura legível."""
    ss = 2
    w = TILE * ss
    span_px = SIZE / 2**z
    ox, oy = x * span_px, y * span_px
    scale = TILE / span_px * ss
    big = img.resize((w, w), Image.BICUBIC)
    over = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    max_rank = {0: 2, 1: 3, 2: 5, 3: 7, 4: 9, 5: 12}[z]
    for rank, line in rivers:
        if rank > max_rank:
            continue
        pts = np.asarray(line)
        xs = (lon_to_px(pts[:, 0]) - ox) * scale
        ys = (lat_to_px(pts[:, 1]) - oy) * scale
        if xs.max() < 0 or xs.min() > w or ys.max() < 0 or ys.min() > w:
            continue
        width = max(1, int(round((max_rank + 2 - rank) * 0.5 * ss / 2 + 1)))
        d.line(list(zip(xs.tolist(), ys.tolist())), fill=(62, 120, 176, 230), width=width, joint="curve")
    for ring in ufs:
        xs = (lon_to_px(ring[:, 0]) - ox) * scale
        ys = (lat_to_px(ring[:, 1]) - oy) * scale
        if xs.max() < 0 or xs.min() > w or ys.max() < 0 or ys.min() > w:
            continue
        d.line(list(zip(xs.tolist(), ys.tolist())), fill=(255, 250, 235, 150), width=ss, joint="curve")
    land_border, coastline = brazil_outline
    for lines, fill, width in ((coastline, (235, 245, 250, 140), ss), (land_border, (255, 214, 90, 230), 2 * ss)):
        for ring in lines:
            xs = (lon_to_px(ring[:, 0]) - ox) * scale
            ys = (lat_to_px(ring[:, 1]) - oy) * scale
            if xs.max() < 0 or xs.min() > w or ys.max() < 0 or ys.min() > w:
                continue
            d.line(list(zip(xs.tolist(), ys.tolist())), fill=fill, width=width, joint="curve")
    big = Image.alpha_composite(big.convert("RGBA"), over).convert("RGB")
    return big.resize((TILE, TILE), Image.LANCZOS)


def encode_heights(h: np.ndarray) -> Image.Image:
    v = np.clip(np.round((h + HEIGHT_OFFSET) * 10), 0, 65535).astype(np.uint16)
    rgb = np.zeros(v.shape + (3,), np.uint8)
    rgb[..., 0] = v >> 8
    rgb[..., 1] = v & 0xFF
    return Image.fromarray(rgb, "RGB")


def main() -> None:
    ufs_geo = load_json(RAW / "ibge/uf.geojson")["features"]
    meta = {int(m["id"]): m for m in load_json(RAW / "ibge/uf_metadata.json")}
    ufs_geo.sort(key=lambda f: int(f["properties"]["codarea"]))

    H = build_height()
    B, U = build_masks(ufs_geo)
    # Relevo: só o Brasil é deslocado; fora dele a altitude decai a zero em ~0,5° para encaixar no globo plano.
    dist = ndimage.distance_transform_edt(U == 0).astype(np.float32)
    coverage = dist < 64
    fade = np.clip(1 - dist / 80, 0, 1)
    del dist
    fade = fade * fade * (3 - 2 * fade)
    H_disp = np.maximum(H, 0) * fade
    del fade

    water = build_water_mask()
    water[U == 0] = 0
    NE2 = build_ne2_crop()
    color = build_color(H, B, U, NE2, water)
    del NE2, water, B

    # Contornos vetoriais para sobreposição: separar litoral (vértice perto do mar) de fronteira terrestre.
    sea_near = ndimage.binary_dilation((H <= 0) & (U == 0), iterations=4)
    del H
    uf_rings, outer = split_uf_edges(ufs_geo)
    land_border, coastline = [], []
    for line in outer:
        cx = np.clip(lon_to_px(line[:, 0]).astype(int), 0, SIZE - 1)
        cy = np.clip(lat_to_px(line[:, 1]).astype(int), 0, SIZE - 1)
        at_sea = sea_near[cy, cx]
        start = 0
        for i in range(1, len(line) + 1):
            if i == len(line) or at_sea[i] != at_sea[start]:
                seg = line[max(0, start - 1):i]
                if len(seg) > 1:
                    (coastline if at_sea[start] else land_border).append(seg)
                start = i
    del sea_near
    brazil_rings = (land_border, coastline)
    rivers = []
    for f in load_json(RAW / "naturalearth/ne_10m_rivers_lake_centerlines.geojson")["features"]:
        rank = f["properties"].get("scalerank") or 10
        for line in line_parts(f["geometry"]):
            pts = np.asarray(line)
            if pts[:, 0].max() < ROOT[0] or pts[:, 0].min() > ROOT[2] or pts[:, 1].max() < ROOT[1] or pts[:, 1].min() > ROOT[3]:
                continue
            rivers.append((rank, line))

    if (OUT_ASSETS / "tiles").exists():
        shutil.rmtree(OUT_ASSETS / "tiles")
    OUT_SRC.mkdir(parents=True, exist_ok=True)

    plan = tiles_to_build(coverage)
    del coverage, U
    color_img = Image.fromarray(color)
    del color
    pyramid_h = [H_disp]
    for _ in range(MAX_LEVEL):
        prev = pyramid_h[-1]
        pyramid_h.append(prev.reshape(prev.shape[0] // 2, 2, prev.shape[1] // 2, 2).mean(axis=(1, 3)))
    pyramid_h.reverse()  # índice = nível z: SIZE/2^(MAX_LEVEL-z) px

    # Tiles agrupados em blocos (atlas) para reduzir o número de arquivos:
    # nível 0 = 1x1, nível 1 = 2x2, nível ≥ 2 = 4x4 tiles por arquivo. Os tiles de um bloco são vizinhos
    # geográficos, então a filtragem bilinear entre células do atlas é correta.
    tiles = []
    blocks = {}
    for z in range(MAX_LEVEL + 1):
        n = block_side(z)
        for (x, y) in plan[z]:
            blocks.setdefault((z, x // n, y // n), []).append((x, y))
    for i, ((z, bx, by), members) in enumerate(sorted(blocks.items())):
        n = block_side(z)
        span_px = SIZE // 2**z
        hz = pyramid_h[z]
        atlas = Image.new("RGB", (n * TILE, n * TILE))
        hatlas = np.zeros((n * (GRID + 1), n * (GRID + 1)), np.float32)
        for cy in range(n):
            for cx in range(n):
                x, y = bx * n + cx, by * n + cy
                box = (x * span_px, y * span_px, (x + 1) * span_px, (y + 1) * span_px)
                tile = color_img.crop(box).resize((TILE, TILE), Image.BOX)
                tile = draw_lines_overlay(tile, z, x, y, uf_rings, rivers, brazil_rings)
                atlas.paste(tile, (cx * TILE, cy * TILE))
                # altitude nas 65x65 posições exatas da malha (cantos de pixels no nível z)
                gx = x * TILE + np.arange(GRID + 1) * (TILE / GRID) - 0.5
                gy = y * TILE + np.arange(GRID + 1) * (TILE / GRID) - 0.5
                GY, GX = np.meshgrid(gy, gx, indexing="ij")
                hs = ndimage.map_coordinates(hz, [GY, GX], order=1, mode="nearest")
                hatlas[cy * (GRID + 1):(cy + 1) * (GRID + 1), cx * (GRID + 1):(cx + 1) * (GRID + 1)] = hs
                if (x, y) in members:
                    tiles.append((z, x, y, float(hs.max())))
        d = OUT_ASSETS / f"tiles/{z}"
        d.mkdir(parents=True, exist_ok=True)
        atlas.save(d / f"{bx}_{by}.jpg", quality=82, optimize=True, progressive=False)
        encode_heights(hatlas).save(d / f"{bx}_{by}.png", optimize=True)
        print(f"  bloco {i + 1}/{len(blocks)}")
    total = len(tiles)

    write_manifest(tiles, sorted(blocks))
    write_ufs(ufs_geo, meta)
    build_world_texture()
    print(f"concluído: {total} tiles")


def split_uf_edges(ufs_geo):
    """Separa as arestas das UFs em (divisas internas, contorno do Brasil).

    Aresta compartilhada por duas UFs = divisa interna; aresta única = fronteira ou litoral.
    """
    from collections import Counter

    def key(a, b):
        k = (tuple(np.round(a, 6)), tuple(np.round(b, 6)))
        return k if k[0] <= k[1] else (k[1], k[0])

    edges = Counter()
    rings = []
    for f in ufs_geo:
        for poly in geom_rings(f["geometry"]):
            ring = np.asarray(poly[0])
            rings.append(ring)
            for a, b in zip(ring[:-1], ring[1:]):
                edges[key(a, b)] += 1
    internal, outer = [], []
    seen_internal = set()
    for ring in rings:
        cur, cur_kind = [], None
        for a, b in zip(ring[:-1], ring[1:]):
            k = key(a, b)
            kind = "outer" if edges[k] == 1 else "internal"
            if kind == "internal" and k in seen_internal:
                kind = None  # já desenhada pela UF vizinha
            elif kind == "internal":
                seen_internal.add(k)
            if kind != cur_kind and cur:
                (outer if cur_kind == "outer" else internal).append(np.asarray(cur))
                cur = []
            cur_kind = kind
            if kind is not None:
                if not cur:
                    cur.append(a)
                cur.append(b)
        if cur:
            (outer if cur_kind == "outer" else internal).append(np.asarray(cur))
    return [r for r in internal if len(r) > 1], [r for r in outer if len(r) > 1]


def block_side(z: int) -> int:
    """Tiles por lado de cada bloco (atlas) no nível z. Deve coincidir com src/globe/config.ts."""
    return min(4, 2**z)


def write_manifest(tiles, blocks):
    lines = [
        "// Gerado por scripts/data/build_globe.py — não editar à mão.",
        "/* eslint-disable */",
        "/** Blocos (atlas) por chave 'z/bx/by'. */",
        "export const BLOCK_ASSETS: Record<string, { color: number; height: number }> = {",
    ]
    for z, bx, by in blocks:
        p = f"../../../assets/globe/tiles/{z}/{bx}_{by}"
        lines.append(f"  '{z}/{bx}/{by}': {{ color: require('{p}.jpg'), height: require('{p}.png') }},")
    lines += ["};", "", "/** Tiles existentes ('z/x/y') e altitude máxima em metros. */", "export const TILE_MAX_HEIGHT: Record<string, number> = {"]
    for z, x, y, mh in tiles:
        lines.append(f"  '{z}/{x}/{y}': {mh:.0f},")
    lines.append("};")
    (OUT_SRC / "tileIndex.ts").write_text("\n".join(lines) + "\n", encoding="utf-8")


def simplify(ring: np.ndarray, tol: float) -> list:
    """Douglas–Peucker simples."""
    if len(ring) < 3:
        return ring.tolist()
    a, b = ring[0], ring[-1]
    ab = b - a
    norm = float(np.hypot(*ab))
    rel = ring - a
    if norm < 1e-12:  # anel fechado: usar distância ao ponto inicial
        d = np.hypot(rel[:, 0], rel[:, 1])
    else:
        d = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / norm
    i = int(np.argmax(d))
    if d[i] > tol:
        return simplify(ring[: i + 1], tol)[:-1] + simplify(ring[i:], tol)
    return [a.tolist(), b.tolist()]


def write_ufs(ufs_geo, meta):
    out = []
    for idx, f in enumerate(ufs_geo, 1):
        code = int(f["properties"]["codarea"])
        m = meta[code]
        polys = []
        for poly in geom_rings(f["geometry"]):
            ring = np.asarray(poly[0])
            s = simplify(ring, 0.02)
            if len(s) >= 4:
                polys.append([[round(p[0], 3), round(p[1], 3)] for p in s])
        allpts = np.concatenate([np.asarray(p) for p in polys])
        out.append({
            "index": idx,
            "code": code,
            "sigla": m["sigla"],
            "nome": m["nome"],
            "regiao": m["regiao"]["nome"],
            "centroid": [round(float(allpts[:, 0].mean()), 3), round(float(allpts[:, 1].mean()), 3)],
            "polygons": polys,
        })
    (OUT_SRC / "ufs.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build_world_texture():
    print("textura mundial…")
    ne = Image.open(RAW / "naturalearth/NE2_50M_SR_W/NE2_50M_SR_W/NE2_50M_SR_W.tif").convert("RGB")
    ne = ne.resize((4096, 2048), Image.LANCZOS)
    rgb = desaturate_world(np.asarray(ne))
    OUT_ASSETS.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).save(OUT_ASSETS / "world.jpg", quality=85, optimize=True)


if __name__ == "__main__":
    main()
