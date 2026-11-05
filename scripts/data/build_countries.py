"""Gera os países do globo: nomes, fronteiras, índice do toque e atlas de nomes (PLANO_PAISES.md, Fase P1).

Entrada (baixada por `scripts/data/fetch_globe_data.py`, em data-raw/naturalearth/):
  ne_10m_admin_0_countries_bra.geojson      unidades de país do Natural Earth, **ponto de vista do Brasil**
  ne_10m_populated_places.geojson           capitais (FEATURECLA "Admin-0 capital"), com o nome em português
  ne_50m_admin_0_boundary_lines_land.geojson  fronteiras terrestres

Saídas (não editar à mão):
  src/globe/data/countries.json       por país: id, nome, situação, continente, sub-região, população, capital, âncora do
                                      nome, zoom mínimo, prioridade, vizinho do Brasil, distância de Brasília, retângulo
                                      do atlas e o contorno simplificado (destaque da seleção)
  src/globe/data/countryIndex.json    grade equiretangular do mundo (RLE, linha 0 no norte): 0 = mar ou Brasil, 1…N =
                                      posição do país em `countries.json` + 1. Lida só na CPU (toque) e nunca filtrada
  src/globe/data/countryBorders.json  fronteiras terrestres simplificadas, em polilinhas [lon, lat, lon, lat, …]
  assets/globe/countryLabels.png      atlas dos nomes em campo de distância, um nome por canal (R, G ou B), 2x o tamanho lógico

Fontes e status (registrados em docs/DATA_SOURCES.md §3.4): Natural Earth, domínio público. Nomes em português do
campo NAME_PT, com as correções de `NAME_FIXES` para o uso brasileiro (PROVISORIO: revisar a lista inteira).

Uso: python scripts/data/build_countries.py   (determinístico: duas execuções geram arquivos idênticos)
"""

from __future__ import annotations

import json
import math
import pathlib
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import numpy as np
from scipy import ndimage

from build_labels import (  # noqa: E402
    PACK_PADDING,
    dist_to_rings,
    dump,
    load_font,
    point_in_ring,
    polylabel,
    project_ring,
    shelf_pack,
)

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT_DIR / "data-raw" / "naturalearth"
IN_COUNTRIES = RAW / "ne_10m_admin_0_countries_bra.geojson"
IN_PLACES = RAW / "ne_10m_populated_places.geojson"
IN_BORDERS = RAW / "ne_50m_admin_0_boundary_lines_land.geojson"
OUT_COUNTRIES = ROOT_DIR / "src/globe/data/countries.json"
OUT_INDEX = ROOT_DIR / "src/globe/data/countryIndex.json"
OUT_BORDERS = ROOT_DIR / "src/globe/data/countryBorders.json"
OUT_ATLAS = ROOT_DIR / "assets/globe/countryLabels.png"

# ---------------------------------------------------------------- parâmetros (nomeados, sem números soltos)

BRAZIL_ID = "BRA"
# Brasília, para a distância (Praça dos Três Poderes, 3 casas).
BRASILIA = (-47.861, -15.800)
EARTH_RADIUS_KM = 6371.0088

INDEX_CELL_DEG = 0.2  # lado da célula da grade do toque (~22 km no equador)
OUTLINE_TOLERANCE_DEG = 0.1  # Douglas-Peucker do contorno do destaque (~11 km: é só o traço da seleção)
OUTLINE_MIN_RING_AREA_DEG2 = 0.3  # anel menor que isto some do destaque (fica o maior anel do país, sempre)
OUTLINE_MAX_RINGS = 12  # no máximo os 12 maiores anéis por país (o Canadá tem centenas de ilhas)
BORDER_TOLERANCE_DEG = 0.02  # Douglas-Peucker das fronteiras (~2 km)
COORD_DECIMALS = 2  # 0,01° ≈ 1 km
NEIGHBOR_CELL_DEG = 0.05  # vértices a menos de uma célula disto contam como divisa com o Brasil
NEIGHBOR_MIN_SHARED = 5
POLYLABEL_PRECISION_DEG = 0.005
ANCHOR_SEA_TOLERANCE_DEG = 1.5  # âncora no mar entre as ilhas de um arquipélago: até ~150 km do país  # células em comum para contar como vizinho (descarta o toque de um vértice só)

# Fronteiras desenhadas: todas as terrestres. Limites de arrendamento e sobreposições ficam de fora.
BORDER_CLASSES = {
    "International boundary (verify)",
    "Disputed (please verify)",
    "Line of control (please verify)",
    "Indefinite (please verify)",
    "Indeterminant frontier",
}

LABEL_FONT_FILE = "DejaVuSans.ttf"  # a versão normal (mais estreita que a negrito das UFs): cabe num atlas de 1024x512
LABEL_FONT_PX = 10  # tamanho lógico (px) do nome do país, menor que a sigla da UF (12)
# Atlas de **campo de distância** (SDF): cada nome ocupa um só canal (R, G ou B), então três nomes dividem o mesmo pixel
# e o PNG é opaco (sem alfa: o navegador não estraga o RGB de pixel transparente). O shader tira dali o texto e o
# contorno escuro (cor em `shaders.ts`). 248 nomes num RGBA comum pediriam 1024x1024 (4 MiB); assim cabem em ~1 MiB.
ATLAS_SCALE = 2  # o atlas é desenhado em 2x o tamanho lógico
SDF_SPREAD = 4  # px do atlas codificados de cada lado do traço: valor 0,5 = borda da letra, 0 = 4 px fora
SDF_SUPERSAMPLE = 2  # a distância é calculada em 2x e reduzida (borda mais lisa)
LABEL_STROKE = 2  # contorno em px do atlas; o shader lê o mesmo valor (COUNTRY_LABEL_STROKE)
ATLAS_MAX_SIDE = 1024
ATLAS_MAX_AREA = 1024 * 512  # teto da meta de memória nova do PLANO_GLOBO §3.3 (2 MiB em RGBA, sem mipmaps)
UV_DECIMALS = 6
CHANNELS = 3

# O que o Brasil reconhece como vizinho (fato público); o script confere contra os contornos.
BRAZIL_NEIGHBORS = {"ARG", "BOL", "COL", "FRA", "GUY", "PER", "PRY", "SUR", "URY", "VEN"}

# Correções de nome para o português do Brasil (o NAME_PT do Natural Earth mistura usos de Portugal).
NAME_FIXES = {
    "VNM": "Vietnã",
    "IRL": "Irlanda",
    "MUS": "Maurício",
    "FRO": "Ilhas Faroé",
    "SXM": "São Martinho (Países Baixos)",
    "MAF": "São Martinho (França)",
    "BLM": "São Bartolomeu",
    "PGA": "Ilhas Spratly",  # o NAME_PT do Natural Earth diz "Ilha Wake", que é outra ilha
    "ESB": "Dhekelia",
    "WSB": "Akrotiri",
    "USG": "Base de Guantánamo",
    "UMI": "Ilhas Menores dos EUA",
    "IOA": "Territórios Australianos do Índico",
    "ATF": "Terras Austrais Francesas",
    "SGS": "Geórgia do Sul",
    "CZE": "Tchéquia",
    "KOR": "Coreia do Sul",
    "MKD": "Macedônia do Norte",
}

# Capital oficial onde o Natural Earth marca mais de uma (o nome é o NAME do arquivo de lugares).
CAPITAL_PICK = {
    "BEN": "Porto-Novo",
    "BOL": "Sucre",
    "CIV": "Yamoussoukro",
    "MMR": "Naypyidaw",
    "ZAF": "Pretoria",
    "NLD": "Amsterdam",
    "TZA": "Dodoma",
    "LKA": "Sri Jayawardenepura Kotte",
    "NGA": "Abuja",
    "SWZ": "Mbabane",
    "MYS": "Kuala Lumpur",
    "PHL": "Manila",
    "JPN": "Tokyo",
    "CHL": "Santiago",
    "MAR": "Rabat",
}
# Capital sem a marca do Natural Earth no ponto de vista do Brasil: fica sem capital no globo.
CAPITAL_SKIP = {"SAH"}
CAPITAL_NAME_FIXES = {
    "Mebabane": "Mbabane",
    "Kotte": "Sri Jayawardenepura Kotte",
    "Port of Spain": "Porto de Espanha",
}
# Capital cujo reconhecimento internacional é disputado: a ficha avisa.
CAPITAL_NOTES = {"ISR": "status internacional em disputa"}

# Situação da unidade: país, território de outro país, soberania em disputa ou Antártida.
STATUS_OVERRIDES = {"TWN": "disputa", "ISR": "pais", "ATA": "antartida"}

CONTINENTS = {
    "Africa": "África",
    "Asia": "Ásia",
    "Europe": "Europa",
    "North America": "América do Norte",
    "South America": "América do Sul",
    "Oceania": "Oceania",
    "Antarctica": "Antártida",
    "Seven seas (open ocean)": "Ilhas oceânicas",
}
SUBREGIONS = {
    "Northern Africa": "Norte da África",
    "Eastern Africa": "África Oriental",
    "Middle Africa": "África Central",
    "Southern Africa": "África Austral",
    "Western Africa": "África Ocidental",
    "Caribbean": "Caribe",
    "Central America": "América Central",
    "South America": "América do Sul",
    "Northern America": "América do Norte",
    "Central Asia": "Ásia Central",
    "Eastern Asia": "Leste Asiático",
    "South-Eastern Asia": "Sudeste Asiático",
    "Southern Asia": "Sul da Ásia",
    "Western Asia": "Oriente Médio",
    "Eastern Europe": "Europa Oriental",
    "Northern Europe": "Norte da Europa",
    "Southern Europe": "Sul da Europa",
    "Western Europe": "Europa Ocidental",
    "Australia and New Zealand": "Austrália e Nova Zelândia",
    "Melanesia": "Melanésia",
    "Micronesia": "Micronésia",
    "Polynesia": "Polinésia",
    "Antarctica": "Antártida",
    "Seven seas (open ocean)": "Ilhas oceânicas",
}


# ---------------------------------------------------------------- geometria


def load(path: pathlib.Path):
    if not path.is_file():
        raise SystemExit(f"falta {path}: rode python scripts/data/fetch_globe_data.py")
    return json.loads(path.read_text(encoding="utf-8"))


def rings_of(geometry) -> list[list[list[float]]]:
    """Anéis externos (sem buracos: os enclaves são outros países, pintados depois na grade)."""
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    if geometry["type"] == "MultiPolygon":
        return [poly[0] for poly in geometry["coordinates"]]
    raise SystemExit(f"geometria inesperada: {geometry['type']}")


def lines_of(geometry) -> list[list[list[float]]]:
    if geometry["type"] == "LineString":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiLineString":
        return geometry["coordinates"]
    raise SystemExit(f"geometria inesperada: {geometry['type']}")


def ring_area_deg2(ring) -> float:
    a = 0.0
    for i in range(len(ring)):
        a += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]
    return abs(a) / 2


def simplify(points, tolerance: float):
    """Douglas-Peucker iterativo (sem recursão: os anéis do Canadá e da Rússia são longos)."""
    n = len(points)
    if n < 3:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a][0], points[a][1]
        bx, by = points[b][0], points[b][1]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, best_i = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i][0], points[i][1]
            if norm == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > best:
                best, best_i = d, i
        if best > tolerance:
            keep[best_i] = True
            stack.append((a, best_i))
            stack.append((best_i, b))
    return [p for p, k in zip(points, keep) if k]


def flat(points) -> list[float]:
    out: list[float] = []
    for p in points:
        out.append(round(p[0], COORD_DECIMALS))
        out.append(round(p[1], COORD_DECIMALS))
    return out


def haversine_km(a, b) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def extent_deg(ring) -> list[float]:
    """Largura × altura da caixa do maior anel, em graus "equivalentes" (largura × cos da latitude média)."""
    xs = [q[0] for q in ring]
    ys = [q[1] for q in ring]
    cos_lat = math.cos(math.radians((min(ys) + max(ys)) / 2))
    return [round((max(xs) - min(xs)) * cos_lat, 2), round(max(ys) - min(ys), 2)]


# ---------------------------------------------------------------- dados


def status_of(p) -> str:
    if p["ADM0_A3"] in STATUS_OVERRIDES:
        return STATUS_OVERRIDES[p["ADM0_A3"]]
    if p["TYPE"] in ("Disputed", "Indeterminate"):
        return "disputa"
    if p["HOMEPART"] != 1:
        return "territorio"
    return "pais"


def capitals(places) -> dict[str, dict]:
    found: dict[str, list] = {}
    for f in places["features"]:
        p = f["properties"]
        if not p["FEATURECLA"].startswith("Admin-0 capital"):
            continue
        found.setdefault(p["ADM0_A3"], []).append(p)
    out = {}
    for adm0, items in found.items():
        if adm0 in CAPITAL_SKIP:
            continue
        if adm0 in CAPITAL_PICK:
            pick = [p for p in items if p["NAME"] == CAPITAL_PICK[adm0]]
            if len(pick) != 1:
                raise SystemExit(f"capital escolhida de {adm0} não encontrada: {CAPITAL_PICK[adm0]}")
            chosen = pick[0]
        else:
            main = [p for p in items if p["FEATURECLA"] == "Admin-0 capital"] or items
            if len(main) > 1:
                raise SystemExit(f"{adm0} tem {len(main)} capitais: escolha uma em CAPITAL_PICK")
            chosen = main[0]
        name = chosen["NAME_PT"] or chosen["NAME"]
        name = CAPITAL_NAME_FIXES.get(name, name)
        out[adm0] = {"name": name, "lon": round(chosen["LONGITUDE"], 3), "lat": round(chosen["LATITUDE"], 3)}
    return out


def neighbor_ids(features) -> set[str]:
    """Unidades com vértices na mesma célula de vértices do Brasil (a divisa aparece nos dois contornos)."""

    def cells(geometry):
        out = set()
        for ring in rings_of(geometry):
            for x, y in ring:
                out.add((math.floor(x / NEIGHBOR_CELL_DEG), math.floor(y / NEIGHBOR_CELL_DEG)))
        return out

    brazil = next(f for f in features if f["properties"]["ADM0_A3"] == BRAZIL_ID)
    near = set()
    for cx, cy in cells(brazil["geometry"]):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                near.add((cx + dx, cy + dy))
    out = set()
    for f in features:
        adm0 = f["properties"]["ADM0_A3"]
        if adm0 == BRAZIL_ID:
            continue
        if len(cells(f["geometry"]) & near) >= NEIGHBOR_MIN_SHARED:
            out.add(adm0)
    return out


# ---------------------------------------------------------------- atlas de campo de distância


def render_sdf(text: str, font) -> np.ndarray:
    """Campo de distância do texto (0–1, 0,5 na borda), em px do atlas, com folga para o contorno e o filtro."""
    ss = SDF_SUPERSAMPLE
    pad = (SDF_SPREAD + 1) * ss
    l, t, r, b = font.getbbox(text)
    w, h = (r - l) + 2 * pad, (b - t) + 2 * pad
    # tamanho múltiplo do supersample, para a redução não cortar pixel
    w += (-w) % ss
    h += (-h) % ss
    img = Image.new("L", (w, h), 0)
    ImageDraw.Draw(img).text((pad - l, pad - t), text, font=font, fill=255)
    inside = np.asarray(img, np.float32) >= 128
    signed = ndimage.distance_transform_edt(inside) - ndimage.distance_transform_edt(~inside)  # px supersampled
    signed = signed / ss  # px do atlas
    field = np.clip(0.5 + signed / (2 * SDF_SPREAD), 0.0, 1.0)
    return field.reshape(h // ss, ss, w // ss, ss).mean(axis=(1, 3))


def pack_sdf_atlas(fields: dict[str, np.ndarray]):
    """Divide os nomes em três grupos de área parecida (um por canal) e acha o menor atlas onde os três cabem."""
    groups: list[list[str]] = [[] for _ in range(CHANNELS)]
    area = [0] * CHANNELS
    for key in sorted(fields, key=lambda k: (-fields[k].size, k)):
        g = min(range(CHANNELS), key=lambda i: (area[i], i))
        groups[g].append(key)
        area[g] += (fields[key].shape[0] + PACK_PADDING) * (fields[key].shape[1] + PACK_PADDING)
    sides = [128 * 2**i for i in range(4) if 128 * 2**i <= ATLAS_MAX_SIDE]
    combos = sorted(((w, h) for w in sides for h in sides), key=lambda c: (c[0] * c[1], abs(c[0] - c[1]), c[0]))
    for w, h in combos:
        if w * h > ATLAS_MAX_AREA:
            break
        packs = [shelf_pack([(k, fields[k].shape[1], fields[k].shape[0]) for k in g], w, h) for g in groups]
        if any(pk is None for pk in packs):
            continue
        atlas = np.zeros((h, w, CHANNELS), np.uint8)
        where = {}
        for channel, pk in enumerate(packs):
            for key, (x, y) in pk.items():
                f = fields[key]
                atlas[y : y + f.shape[0], x : x + f.shape[1], channel] = np.rint(f * 255).astype(np.uint8)
                where[key] = (x, y, channel)
        return atlas, where
    raise SystemExit(f"os nomes não cabem num atlas de até {ATLAS_MAX_AREA} px")


def sdf_rect(place, field: np.ndarray, atlas_w: int, atlas_h: int) -> dict:
    x, y, channel = place
    h, w = field.shape
    return {
        "u0": round(x / atlas_w, UV_DECIMALS),
        "v0": round(y / atlas_h, UV_DECIMALS),
        "u1": round((x + w) / atlas_w, UV_DECIMALS),
        "v1": round((y + h) / atlas_h, UV_DECIMALS),
        "w": w / ATLAS_SCALE,
        "h": h / ATLAS_SCALE,
        "channel": channel,
    }


# ---------------------------------------------------------------- grade do toque


def index_grid(features, order: list[str]) -> tuple[int, int, list[int]]:
    width = round(360 / INDEX_CELL_DEG)
    height = round(180 / INDEX_CELL_DEG)
    img = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(img)
    value = {adm0: i + 1 for i, adm0 in enumerate(order)}

    def px(lon, lat):
        return ((lon + 180) / INDEX_CELL_DEG, (90 - lat) / INDEX_CELL_DEG)

    # Maior primeiro: enclaves (Lesoto, Vaticano, San Marino) e ilhas pequenas são pintados por cima. O Brasil vale 0
    # (o toque nele é das UFs).
    by_area = sorted(
        features,
        key=lambda f: (-sum(ring_area_deg2(r) for r in rings_of(f["geometry"])), f["properties"]["ADM0_A3"]),
    )
    for f in by_area:
        adm0 = f["properties"]["ADM0_A3"]
        v = value.get(adm0, 0)
        for ring in rings_of(f["geometry"]):
            pts = [px(x, y) for x, y in ring]
            if len(pts) >= 3:
                draw.polygon(pts, fill=v, outline=v)
    data = list(img.getdata())
    rle: list[int] = []
    run_value, run = data[0], 0
    for v in data:
        if v == run_value:
            run += 1
        else:
            rle += [run_value, run]
            run_value, run = v, 1
    rle += [run_value, run]
    return width, height, rle


def cell_of(grid_w: int, grid_h: int, lon: float, lat: float) -> int:
    x = min(grid_w - 1, max(0, math.floor((lon + 180) / INDEX_CELL_DEG)))
    y = min(grid_h - 1, max(0, math.floor((90 - lat) / INDEX_CELL_DEG)))
    return y * grid_w + x


def decode(rle: list[int], length: int) -> list[int]:
    out: list[int] = []
    for i in range(0, len(rle), 2):
        out.extend([rle[i]] * rle[i + 1])
    if len(out) != length:
        raise SystemExit("RLE do índice de países com tamanho errado")
    return out


# ---------------------------------------------------------------- main


def main() -> None:
    countries = load(IN_COUNTRIES)["features"]
    places = load(IN_PLACES)
    borders = load(IN_BORDERS)["features"]

    ids = [f["properties"]["ADM0_A3"] for f in countries]
    if len(set(ids)) != len(ids):
        raise SystemExit("ADM0_A3 repetido no Natural Earth")
    others = sorted(i for i in ids if i != BRAZIL_ID)
    if len(others) > 255:
        raise SystemExit("mais de 255 unidades: o índice não cabe em um byte")
    by_id = {f["properties"]["ADM0_A3"]: f for f in countries}

    print("vizinhos…")
    neighbors = neighbor_ids(countries)
    if neighbors != BRAZIL_NEIGHBORS:
        raise SystemExit(f"vizinhos do Brasil diferentes do esperado: {sorted(neighbors ^ BRAZIL_NEIGHBORS)}")

    print("capitais…")
    caps = capitals(places)

    # Prioridade dos nomes: quem aparece mais cedo no Natural Earth (MIN_LABEL menor) e, no empate, o mais populoso.
    rank = sorted(
        others,
        key=lambda i: (by_id[i]["properties"]["MIN_LABEL"], -by_id[i]["properties"]["POP_EST"], i),
    )
    priority = {adm0: len(rank) - n for n, adm0 in enumerate(rank)}  # 1 = o menos importante

    print("atlas…")
    font = load_font(LABEL_FONT_PX * ATLAS_SCALE * SDF_SUPERSAMPLE, LABEL_FONT_FILE)
    names = {}
    for adm0 in others:
        p = by_id[adm0]["properties"]
        names[adm0] = NAME_FIXES.get(adm0) or p["NAME_PT"] or p["NAME"]
    fields = {adm0: render_sdf(names[adm0], font) for adm0 in others}
    atlas, places_in_atlas = pack_sdf_atlas(fields)
    OUT_ATLAS.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, "RGB").save(OUT_ATLAS, format="PNG", optimize=True)
    atlas_h, atlas_w = atlas.shape[:2]

    print("grade do toque…")
    grid_w, grid_h, rle = index_grid(countries, others)
    grid = decode(rle, grid_w * grid_h)

    print("contornos…")
    out = []
    for n, adm0 in enumerate(others):
        f = by_id[adm0]
        p = f["properties"]
        anchor = [round(p["LABEL_X"], 3), round(p["LABEL_Y"], 3)]
        rings = rings_of(f["geometry"])
        if not any(point_in_ring(anchor[0], anchor[1], r) for r in rings):
            # Arquipélagos: o Natural Earth põe o nome no mar entre as ilhas. Vale, se ficar perto do país.
            gap = dist_to_rings(anchor[0], anchor[1], rings)
            if gap > ANCHOR_SEA_TOLERANCE_DEG:
                # Longe demais: o nome vai para o polo de inacessibilidade da maior ilha.
                main_ring = max(rings, key=ring_area_deg2)
                cos_lat = math.cos(math.radians(sum(q[1] for q in main_ring) / len(main_ring)))
                x, y, _ = polylabel(project_ring(main_ring, cos_lat), [], POLYLABEL_PRECISION_DEG)
                print(f"  aviso: âncora de {adm0} a {gap:.2f}° do país; vai para a maior ilha")
                anchor = [round(x / cos_lat, 3), round(y, 3)]
        biggest = max(rings, key=ring_area_deg2)
        outline = []
        for r in sorted(rings, key=ring_area_deg2, reverse=True)[:OUTLINE_MAX_RINGS]:
            if r is not biggest and ring_area_deg2(r) < OUTLINE_MIN_RING_AREA_DEG2:
                continue
            s = simplify(r, OUTLINE_TOLERANCE_DEG)
            if len(s) >= 4:
                outline.append(flat(s))
        if not outline:
            outline.append(flat(biggest))
        status = status_of(p)
        sovereign = None
        if status == "territorio":
            home = [g for g in countries if g["properties"]["SOV_A3"] == p["SOV_A3"] and g["properties"]["HOMEPART"] == 1]
            if len(home) != 1:
                raise SystemExit(f"país soberano de {adm0} ({p['SOV_A3']}) não encontrado")
            sovereign = NAME_FIXES.get(home[0]["properties"]["ADM0_A3"]) or home[0]["properties"]["NAME_PT"]
        capital = caps.get(adm0) or caps.get(p["ISO_A3"])
        if capital and adm0 in CAPITAL_NOTES:
            capital = {**capital, "note": CAPITAL_NOTES[adm0]}
        where = capital or {"lon": anchor[0], "lat": anchor[1]}
        if p["CONTINENT"] not in CONTINENTS or p["SUBREGION"] not in SUBREGIONS:
            raise SystemExit(f"continente ou sub-região sem tradução em {adm0}: {p['CONTINENT']} / {p['SUBREGION']}")
        out.append(
            {
                "id": adm0,
                "index": n + 1,
                "name": names[adm0],
                "status": status,
                **({"sovereign": sovereign} if sovereign else {}),
                "continent": CONTINENTS[p["CONTINENT"]],
                "subregion": SUBREGIONS[p["SUBREGION"]],
                "population": round(p["POP_EST"]),
                "populationYear": p["POP_YEAR"],
                "capital": capital,
                "anchor": anchor,
                "minZoom": p["MIN_LABEL"],
                "extent": extent_deg(biggest),
                "priority": priority[adm0],
                "bordersBrazil": adm0 in neighbors,
                "distanceKm": round(haversine_km(BRASILIA, (where["lon"], where["lat"]))),
                "rect": sdf_rect(places_in_atlas[adm0], fields[adm0], atlas_w, atlas_h),
                "outline": outline,
            }
        )
    # Quase todo país tem ao menos uma célula na grade; os minúsculos também são tocados pelo nome.
    present = set(grid)
    missing = [c["id"] for c in out if c["index"] not in present]
    if missing:
        # Dividem a célula com um vizinho maior (São Martinho tem duas metades numa ilha de 87 km²): o toque é pelo nome.
        print(f"  aviso: sem célula própria na grade (toque só pelo nome): {missing}")

    print("fronteiras…")
    lines = []
    for f in borders:
        if f["properties"]["FEATURECLA"] not in BORDER_CLASSES:
            continue
        for line in lines_of(f["geometry"]):
            s = simplify(line, BORDER_TOLERANCE_DEG)
            if len(s) >= 2:
                lines.append(flat(s))
    lines.sort(key=lambda l: (l[0], l[1], len(l)))

    dump(
        OUT_COUNTRIES,
        {
            "atlas": {"width": atlas_w, "height": atlas_h, "scale": ATLAS_SCALE, "spread": SDF_SPREAD, "stroke": LABEL_STROKE},
            "countries": out,
        },
    )
    dump(OUT_INDEX, {"width": grid_w, "height": grid_h, "cellDeg": INDEX_CELL_DEG, "rle": rle})
    dump(OUT_BORDERS, {"lines": lines})
    vertices = sum(len(l) // 2 for l in lines)
    print(
        f"{len(out)} unidades; atlas {atlas_w}x{atlas_h} ({OUT_ATLAS.stat().st_size} bytes); "
        f"countries.json {OUT_COUNTRIES.stat().st_size} bytes; índice {OUT_INDEX.stat().st_size} bytes "
        f"({len(rle) // 2} trechos); fronteiras {len(lines)} linhas, {vertices} vértices "
        f"({OUT_BORDERS.stat().st_size} bytes)"
    )
    no_capital = [c["id"] for c in out if c["capital"] is None and c["status"] == "pais"]
    print(f"países sem capital: {no_capital}")


if __name__ == "__main__":
    sys.exit(main())
