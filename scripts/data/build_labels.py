"""Gera as siglas, as capitais e o atlas de rótulos do globo e do mapa 2D (PLANO_GLOBO.md §3.4 e §7, PR 2).

Entrada (já gerada pelo build_globe.py):
  src/globe/data/ufs.json                   contornos simplificados das 27 UFs (lon/lat)
  src/data/scenarios/brasil_2027_01_v070.json   população por UF (prioridade dos rótulos)

Saídas:
  src/globe/data/capitals.json   as 27 capitais: { sigla, capital, lon, lat }
  src/globe/data/labels.json     âncora interior, área, prioridade e retângulos do atlas por UF
  assets/globe/labels.png        atlas RGBA com 27 siglas + 27 nomes de capital (branco com contorno escuro)

Fontes e status (registrados em docs/DATA_SOURCES.md §3.2):
  - Coordenadas das capitais: sede municipal (IBGE, "localidades"/sedes municipais), status PROVISORIO — valores
    digitados a partir de referências públicas, 3 casas decimais (~100 m); conferir contra o arquivo oficial quando
    o download das sedes entrar no pipeline.
  - Fonte do texto: DejaVu Sans Bold, licença livre (derivada da Bitstream Vera: uso e incorporação permitidos),
    localizada via matplotlib; os glifos entram rasterizados no atlas. Nenhuma fonte é baixada.
  - Dependências Python (`pip install matplotlib scipy Pillow numpy`): matplotlib fornece a fonte DejaVu Sans Bold;
    Pillow rasteriza os glifos e monta o atlas; NumPy processa os canais de imagem; SciPy calcula a transformada de
    distância usada no contorno do texto.

Convenções:
  - O atlas é desenhado em 2x o tamanho lógico (ATLAS_SCALE): w/h no JSON são pixels lógicos (px do atlas / 2).
  - u/v normalizados com origem no canto superior esquerdo do PNG (v cresce para baixo; use flipY = false).
  - Texto com alfa "reto" (não pré-multiplicado): fundo RGBA(0,0,0,0) fora dos glifos e cor limpa nas bordas.
  - Âncora = polo de inacessibilidade do maior anel da UF (busca em grade refinada, estilo polylabel), numa
    projeção com escala de longitude por cos(lat) — o centroide cai fora de UFs côncavas (RJ, ES, MA, PA...).
  - Prioridade = posto de população (1 = menos populosa … 27 = mais populosa); empate resolvido pela área.

Uso: python scripts/data/build_labels.py   (determinístico: duas execuções geram arquivos idênticos)
"""

from __future__ import annotations

import heapq
import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
UFS_JSON = ROOT_DIR / "src/globe/data/ufs.json"
SCENARIO = ROOT_DIR / "src/data/scenarios/brasil_2027_01_v070.json"
OUT_CAPITALS = ROOT_DIR / "src/globe/data/capitals.json"
OUT_LABELS = ROOT_DIR / "src/globe/data/labels.json"
OUT_ATLAS = ROOT_DIR / "assets/globe/labels.png"

# ---------------------------------------------------------------- parâmetros (nomeados, sem números soltos)

FONT_FILE = "DejaVuSans-Bold.ttf"  # vem com o matplotlib (mpl-data/fonts/ttf)
ATLAS_SCALE = 2  # o atlas é desenhado em 2x o tamanho lógico (nitidez em telas de alta densidade)
SIGLA_FONT_PX = 12  # tamanho lógico (px) da sigla
CAPITAL_FONT_PX = 10  # tamanho lógico (px) do nome da capital
SIGLA_STROKE = 3  # espessura do contorno escuro no atlas (px do atlas), por tamanho de fonte
CAPITAL_STROKE = 2
TEXT_FILL = (255, 255, 255)  # branco
TEXT_STROKE = (16, 20, 28)  # quase preto azulado: legível sobre qualquer cor de mapa
PACK_PADDING = 2  # px do atlas entre entradas (evita sangramento do filtro bilinear)
ATLAS_MAX_SIDE = 1024
ATLAS_MIN_SIDE = 128
UV_DECIMALS = 6  # casas decimais de u/v

EARTH_RADIUS_KM = 6371.0088
POLYLABEL_PRECISION_DEG = 0.005  # ~500 m: bem abaixo de um pixel em qualquer zoom útil
COORD_DECIMALS = 3
HOLE_INSIDE_FRACTION = 0.98  # fração dos vértices de um anel que precisa cair dentro de outro para ser buraco
# Tolerância (graus) para a conferência capital-dentro-da-UF: os contornos foram simplificados (~2 km) e várias
# capitais são litorâneas (RJ, Recife, Salvador...), então o ponto pode cair a poucos metros do contorno.
CAPITAL_COAST_TOLERANCE_DEG = 0.03  # ~3 km

# ---------------------------------------------------------------- capitais (IBGE, sede municipal; PROVISORIO)

CAPITALS: dict[str, tuple[str, float, float]] = {
    # sigla: (capital, lon, lat)
    "RO": ("Porto Velho", -63.904, -8.762),
    "AC": ("Rio Branco", -67.810, -9.975),
    "AM": ("Manaus", -60.022, -3.119),
    "RR": ("Boa Vista", -60.673, 2.820),
    "PA": ("Belém", -48.504, -1.456),
    "AP": ("Macapá", -51.069, 0.035),
    "TO": ("Palmas", -48.334, -10.184),
    "MA": ("São Luís", -44.303, -2.530),
    "PI": ("Teresina", -42.802, -5.089),
    "CE": ("Fortaleza", -38.543, -3.717),
    "RN": ("Natal", -35.211, -5.795),
    "PB": ("João Pessoa", -34.863, -7.115),
    "PE": ("Recife", -34.877, -8.048),
    "AL": ("Maceió", -35.735, -9.666),
    "SE": ("Aracaju", -37.073, -10.947),
    "BA": ("Salvador", -38.501, -12.971),
    "MG": ("Belo Horizonte", -43.934, -19.917),
    "ES": ("Vitória", -40.313, -20.316),
    "RJ": ("Rio de Janeiro", -43.173, -22.907),
    "SP": ("São Paulo", -46.633, -23.551),
    "PR": ("Curitiba", -49.273, -25.428),
    "SC": ("Florianópolis", -48.548, -27.595),
    "RS": ("Porto Alegre", -51.218, -30.035),
    "MS": ("Campo Grande", -54.620, -20.470),
    "MT": ("Cuiabá", -56.097, -15.601),
    "GO": ("Goiânia", -49.264, -16.686),
    "DF": ("Brasília", -47.882, -15.794),
}


# ---------------------------------------------------------------- geometria

def ring_area_deg2(ring) -> float:
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i - 1][0], ring[i - 1][1]
        x2, y2 = ring[i][0], ring[i][1]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def point_in_ring(x: float, y: float, ring) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def dist_to_segment(px, py, ax, ay, bx, by) -> float:
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    t = 0.0 if len2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def dist_to_rings(x: float, y: float, rings) -> float:
    """Distância mínima do ponto às arestas dos anéis (mesmas unidades dos pontos)."""
    best = math.inf
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            d = dist_to_segment(x, y, ring[j][0], ring[j][1], ring[i][0], ring[i][1])
            if d < best:
                best = d
            j = i
    return best


def project_ring(ring, cos_lat: float):
    """Projeção local: x = lon * cos(lat de referência), y = lat (graus 'equivalentes')."""
    return [(p[0] * cos_lat, p[1]) for p in ring]


def polylabel(outer, holes, precision: float):
    """Polo de inacessibilidade (algoritmo polylabel, Mapbox) com buracos. Determinístico."""

    def signed_dist(x, y):
        d = dist_to_rings(x, y, [outer, *holes])
        inside = point_in_ring(x, y, outer) and not any(point_in_ring(x, y, h) for h in holes)
        return d if inside else -d

    xs = [p[0] for p in outer]
    ys = [p[1] for p in outer]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    width, height = maxx - minx, maxy - miny
    cell = min(width, height)
    if cell == 0:
        return (minx, miny, 0.0)
    half = cell / 2
    counter = 0
    heap: list = []

    def push(cx, cy, h):
        nonlocal counter
        d = signed_dist(cx, cy)
        # (-max, contador): a célula com maior potencial sai primeiro; o contador desempata de forma estável.
        heapq.heappush(heap, (-(d + h * math.sqrt(2)), counter, cx, cy, h, d))
        counter += 1

    x = minx
    while x < maxx:
        y = miny
        while y < maxy:
            push(x + half, y + half, half)
            y += cell
        x += cell

    # chute inicial: centro da caixa
    best = (signed_dist(minx + width / 2, miny + height / 2), minx + width / 2, miny + height / 2)
    while heap:
        _, _, cx, cy, h, d = heapq.heappop(heap)
        if d > best[0]:
            best = (d, cx, cy)
        if (d + h * math.sqrt(2)) - best[0] <= precision:
            continue
        h2 = h / 2
        for dx in (-h2, h2):
            for dy in (-h2, h2):
                push(cx + dx, cy + dy, h2)
    return (best[1], best[2], best[0])


def ring_area_km2(ring) -> float:
    """Área aproximada em km² (equivalente local por cos(lat) médio; erro de poucos % em UFs grandes)."""
    lat0 = sum(p[1] for p in ring) / len(ring)
    k = math.radians(1) * EARTH_RADIUS_KM
    return ring_area_deg2(project_ring(ring, math.cos(math.radians(lat0)))) * k * k


# ---------------------------------------------------------------- âncoras e áreas

def uf_geometry(ufs):
    """Por UF: maior anel, buracos (anéis de outras UFs inteiramente dentro dele — GO envolve o DF) e extensão."""
    all_rings = [(u["sigla"], r) for u in ufs for r in u["polygons"]]
    out = {}
    for u in ufs:
        rings = u["polygons"]
        main = max(rings, key=ring_area_deg2)
        bx = [p[0] for p in main]
        by = [p[1] for p in main]
        holes = []
        for sigla, other in all_rings:
            if sigla == u["sigla"]:
                continue
            # Buraco = anel de outra UF quase todo dentro deste (GO envolve o DF). Vizinhas só dividem divisa:
            # metade dos vértices fica fora e elas não entram.
            ox = [p[0] for p in other]
            oy = [p[1] for p in other]
            if not (min(bx) <= min(ox) and max(ox) <= max(bx) and min(by) <= min(oy) and max(oy) <= max(by)):
                continue
            inside = sum(point_in_ring(p[0], p[1], main) for p in other)
            if inside >= HOLE_INSIDE_FRACTION * len(other):
                holes.append(other)
        lat0 = sum(by) / len(by)
        cos_lat = math.cos(math.radians(lat0))
        out[u["sigla"]] = {"main": main, "holes": holes, "lat0": lat0, "cos": cos_lat}
    return out


def compute_anchor(geom) -> tuple[float, float, float]:
    cos_lat = geom["cos"]
    outer = project_ring(geom["main"], cos_lat)
    holes = [project_ring(h, cos_lat) for h in geom["holes"]]
    x, y, d = polylabel(outer, holes, POLYLABEL_PRECISION_DEG)
    return round(x / cos_lat, COORD_DECIMALS), round(y, COORD_DECIMALS), d


def uf_area_km2(ufs, geoms) -> dict[str, float]:
    areas = {}
    for u in ufs:
        total = sum(ring_area_km2(r) for r in u["polygons"])
        # os buracos (GO envolve o DF) não contam para GO; o DF conta no DF
        total -= sum(ring_area_km2(h) for h in geoms[u["sigla"]]["holes"])
        areas[u["sigla"]] = total
    return areas


def uf_extent_deg(geom) -> tuple[float, float]:
    """Largura x altura da caixa do maior anel, em graus 'equivalentes' (longitude * cos(lat))."""
    xs = [p[0] for p in geom["main"]]
    ys = [p[1] for p in geom["main"]]
    return (max(xs) - min(xs)) * geom["cos"], max(ys) - min(ys)


# ---------------------------------------------------------------- capitais

def check_capitals(ufs, geoms) -> list[dict]:
    """Confere cada capital contra o polígono da própria UF; falha alto se estiver fora (além da tolerância)."""
    out = []
    problems = []
    siglas = {u["sigla"] for u in ufs}
    if set(CAPITALS) != siglas:
        raise SystemExit(f"capitais não batem com as UFs: faltam {sorted(siglas - set(CAPITALS))}")
    for u in ufs:
        name, lon, lat = CAPITALS[u["sigla"]]
        # Dentro de algum anel da UF, mas não de um buraco (GO envolve o DF; Brasília é do DF).
        inside = any(point_in_ring(lon, lat, r) for r in u["polygons"]) and not any(
            point_in_ring(lon, lat, h) for h in geoms[u["sigla"]]["holes"]
        )
        if not inside:
            near = min(dist_to_rings(lon, lat, [r]) for r in u["polygons"])
            if near > CAPITAL_COAST_TOLERANCE_DEG:
                problems.append(f"{u['sigla']} {name} ({lon}, {lat}) fora do polígono (a {near:.3f}° do contorno)")
            else:
                print(f"  aviso: {u['sigla']} {name} a {near:.4f}° do contorno (litoral simplificado)")
        out.append({"sigla": u["sigla"], "capital": name, "lon": lon, "lat": lat})
    if problems:
        raise SystemExit("capitais fora dos polígonos:\n  " + "\n  ".join(problems))
    return out


# ---------------------------------------------------------------- prioridade

def priorities(ufs, areas) -> dict[str, int]:
    scenario = json.loads(SCENARIO.read_text(encoding="utf-8"))
    pop = {r["id"]: r["population"] for r in scenario["regions"]["ufs"]}
    if set(pop) != {u["sigla"] for u in ufs}:
        raise SystemExit("o cenário não tem população para todas as UFs")
    order = sorted(pop, key=lambda s: (pop[s], areas[s], s))  # menos populosa primeiro
    return {s: i + 1 for i, s in enumerate(order)}


# ---------------------------------------------------------------- atlas

def load_font(size: int) -> ImageFont.FreeTypeFont:
    """DejaVu Sans Bold, localizada pelo matplotlib (que a traz embutida). Sem alternativa silenciosa."""
    try:
        import matplotlib
    except ImportError:
        raise SystemExit(
            "matplotlib não encontrado: ele traz a fonte DejaVu Sans Bold usada no atlas. "
            "Instale com: pip install matplotlib"
        )
    path = pathlib.Path(matplotlib.__file__).parent / "mpl-data" / "fonts" / "ttf" / FONT_FILE
    if not path.is_file():
        raise SystemExit(
            f"fonte {FONT_FILE} não encontrada em {path}. Reinstale o matplotlib: pip install --force-reinstall matplotlib"
        )
    return ImageFont.truetype(str(path), size)


def render_text(text: str, font: ImageFont.FreeTypeFont, stroke: int) -> Image.Image:
    """Texto branco com contorno escuro, RGBA com alfa reto (sem franja escura nas bordas).

    O contorno sai da distância (px) ao glifo: cobertura 1 até `stroke` px, com 1 px de suavização na borda.
    """
    l, t, r, b = font.getbbox(text)
    pad = stroke + 1
    w, h = (r - l) + 2 * pad, (b - t) + 2 * pad
    fill_img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(fill_img).text((pad - l, pad - t), text, font=font, fill=255)
    af = np.asarray(fill_img, np.float32) / 255.0
    dist = ndimage.distance_transform_edt(af < 0.5)
    as_ = np.maximum(af, np.clip(stroke + 0.5 - dist, 0.0, 1.0))
    alpha = af + as_ * (1.0 - af)
    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    fill = np.array(TEXT_FILL, np.float32)
    dark = np.array(TEXT_STROKE, np.float32)
    rgb = (fill * af[..., None] + dark * (as_ * (1.0 - af))[..., None]) / safe
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = np.rint(rgb).astype(np.uint8)
    rgba[..., 3] = np.rint(alpha * 255.0).astype(np.uint8)
    rgba[alpha == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def shelf_pack(sizes: list[tuple[str, int, int]], side_w: int, side_h: int):
    """Empacotamento em prateleiras (altura decrescente). Devolve {chave: (x, y)} ou None se não couber."""
    order = sorted(sizes, key=lambda s: (-s[2], -s[1], s[0]))
    pos = {}
    x = y = shelf_h = 0
    for key, w, h in order:
        if w + 2 * PACK_PADDING > side_w:
            return None
        if x + w + PACK_PADDING > side_w:  # nova prateleira
            x = 0
            y += shelf_h
            shelf_h = 0
        if shelf_h == 0:
            shelf_h = h + PACK_PADDING
        pos[key] = (x + PACK_PADDING, y + PACK_PADDING)
        x += w + PACK_PADDING
        shelf_h = max(shelf_h, h + PACK_PADDING)
        if y + PACK_PADDING + h + PACK_PADDING > side_h:
            return None
    if y + shelf_h > side_h:
        return None
    return pos


def build_atlas(entries: list[tuple[str, Image.Image]]):
    sizes = [(k, im.width, im.height) for k, im in entries]
    sides = []
    s = ATLAS_MIN_SIDE
    while s <= ATLAS_MAX_SIDE:
        sides.append(s)
        s *= 2
    # menor área primeiro; empate: o mais quadrado (largura primeiro)
    combos = sorted(((w, h) for w in sides for h in sides), key=lambda c: (c[0] * c[1], abs(c[0] - c[1]), c[0]))
    for w, h in combos:
        pos = shelf_pack(sizes, w, h)
        if pos is not None:
            atlas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            for k, im in entries:
                atlas.paste(im, pos[k])
            return atlas, pos
    raise SystemExit(f"os rótulos não cabem em {ATLAS_MAX_SIDE}x{ATLAS_MAX_SIDE}")


def round_up(v: float) -> float:
    return round(v, UV_DECIMALS)


def rect(pos, im: Image.Image, atlas: Image.Image) -> dict:
    x, y = pos
    return {
        "u0": round_up(x / atlas.width),
        "v0": round_up(y / atlas.height),
        "u1": round_up((x + im.width) / atlas.width),
        "v1": round_up((y + im.height) / atlas.height),
        "w": im.width / ATLAS_SCALE,
        "h": im.height / ATLAS_SCALE,
    }


# ---------------------------------------------------------------- main

def dump(path: pathlib.Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    ufs = json.loads(UFS_JSON.read_text(encoding="utf-8"))
    geoms = uf_geometry(ufs)

    print("capitais…")
    capitals = check_capitals(ufs, geoms)
    dump(OUT_CAPITALS, capitals)

    print("âncoras…")
    anchors = {u["sigla"]: compute_anchor(geoms[u["sigla"]]) for u in ufs}
    for u in ufs:
        ax, ay, _ = anchors[u["sigla"]]
        inside_own = any(point_in_ring(ax, ay, r) for r in u["polygons"]) and not any(
            point_in_ring(ax, ay, h) for h in geoms[u["sigla"]]["holes"]
        )
        if not inside_own:
            raise SystemExit(f"âncora de {u['sigla']} fora do próprio polígono: {ax}, {ay}")
    areas = uf_area_km2(ufs, geoms)
    prio = priorities(ufs, areas)

    print("atlas…")
    sigla_font = load_font(SIGLA_FONT_PX * ATLAS_SCALE)
    capital_font = load_font(CAPITAL_FONT_PX * ATLAS_SCALE)
    entries: list[tuple[str, Image.Image]] = []
    for u in ufs:
        entries.append((f"s:{u['sigla']}", render_text(u["sigla"], sigla_font, SIGLA_STROKE)))
        entries.append((f"c:{u['sigla']}", render_text(CAPITALS[u["sigla"]][0], capital_font, CAPITAL_STROKE)))
    atlas, pos = build_atlas(entries)
    images = dict(entries)
    OUT_ATLAS.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT_ATLAS, format="PNG", optimize=True)

    labels = []
    for u in ufs:
        s = u["sigla"]
        name, lon, lat = CAPITALS[s]
        ext_w, ext_h = uf_extent_deg(geoms[s])
        cap_rect = rect(pos[f"c:{s}"], images[f"c:{s}"], atlas)
        labels.append(
            {
                "sigla": s,
                "nome": u["nome"],
                "anchor": [anchors[s][0], anchors[s][1]],
                "areaKm2": round(areas[s]),
                "extent": [round(ext_w, 2), round(ext_h, 2)],
                "priority": prio[s],
                "siglaRect": rect(pos[f"s:{s}"], images[f"s:{s}"], atlas),
                "capital": {"name": name, "lon": lon, "lat": lat, **cap_rect},
            }
        )
    dump(
        OUT_LABELS,
        {
            "atlas": {"width": atlas.width, "height": atlas.height, "scale": ATLAS_SCALE},
            "ufs": labels,
        },
    )
    print(f"atlas {atlas.width}x{atlas.height}, {OUT_ATLAS.stat().st_size} bytes; labels.json {OUT_LABELS.stat().st_size} bytes")
    for l in labels:
        print(f"  {l['sigla']} anchor={l['anchor']} area={l['areaKm2']} prio={l['priority']} ext={l['extent']}")


if __name__ == "__main__":
    sys.exit(main())
