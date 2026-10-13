"""Baixa os dados brutos usados para gerar o globo e os tiles do Brasil.

Saída: data-raw/ (ignorado pelo git). Pode ser executado de novo: arquivos
já baixados são pulados.

Uso: python scripts/data/fetch_globe_data.py
"""

from __future__ import annotations

import concurrent.futures as cf
import math
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / "data-raw"

TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

# Cobertura de elevação detalhada (lon/lat) — Brasil com folga, inclui Fernando de Noronha.
BRAZIL_BOUNDS = (-75.0, -34.5, -32.0, 6.0)
BRAZIL_ZOOM = 8
WORLD_ZOOM = 3

FILES = {
    "naturalearth/NE2_50M_SR_W.zip": "https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip",
    "naturalearth/ne_10m_rivers_lake_centerlines.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
    "naturalearth/ne_10m_lakes.geojson": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson",
    "ibge/Biomas_250mil.zip": "https://geoftp.ibge.gov.br/informacoes_ambientais/estudos_ambientais/biomas/vetores/Biomas_250mil.zip",
    "ibge/uf.geojson": "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&intrarregiao=UF&qualidade=maxima",
    "ibge/uf_metadata.json": "https://servicodados.ibge.gov.br/api/v1/localidades/estados",
}


def download(url: str, dest: pathlib.Path) -> str:
    if dest.exists() and dest.stat().st_size > 0:
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "brasil-simulator-data-pipeline"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        while chunk := resp.read(1 << 16):
            out.write(chunk)
    tmp.replace(dest)
    return "ok"


def lonlat_to_tile(lon: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    x = int((lon + 180.0) / 360.0 * n)
    lat_r = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n)
    return x, y


def terrarium_jobs() -> list[tuple[str, pathlib.Path]]:
    jobs = []
    n = 2**WORLD_ZOOM
    for x in range(n):
        for y in range(n):
            jobs.append((TERRARIUM_URL.format(z=WORLD_ZOOM, x=x, y=y), RAW / f"terrarium/{WORLD_ZOOM}/{x}/{y}.png"))
    w, s, e, nn = BRAZIL_BOUNDS
    x0, y0 = lonlat_to_tile(w, nn, BRAZIL_ZOOM)
    x1, y1 = lonlat_to_tile(e, s, BRAZIL_ZOOM)
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            jobs.append((TERRARIUM_URL.format(z=BRAZIL_ZOOM, x=x, y=y), RAW / f"terrarium/{BRAZIL_ZOOM}/{x}/{y}.png"))
    return jobs


def main() -> None:
    jobs = [(url, RAW / rel) for rel, url in FILES.items()] + terrarium_jobs()
    print(f"{len(jobs)} arquivos")
    failed = []
    with cf.ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(download, url, dest): url for url, dest in jobs}
        for i, fut in enumerate(cf.as_completed(futures), 1):
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001 — registrar e continuar
                failed.append((futures[fut], exc))
            if i % 100 == 0:
                print(f"  {i}/{len(jobs)}")

    for name in ("naturalearth/NE2_50M_SR_W.zip", "ibge/Biomas_250mil.zip"):
        zpath = RAW / name
        out = zpath.with_suffix("")
        if zpath.exists() and not out.exists():
            with zipfile.ZipFile(zpath) as zf:
                zf.extractall(out)

    if failed:
        print("FALHAS:")
        for url, exc in failed:
            print(f"  {url}: {exc}")
        raise SystemExit(1)
    print("concluído")


if __name__ == "__main__":
    main()
