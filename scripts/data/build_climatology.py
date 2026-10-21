"""Gera a climatologia do clima do motor: normais de chuva por UF x mes e teleconexao ENSO (PLANO_GLOBO.md §6.1, PR 7).

Entrada: nenhuma (as tabelas moram neste arquivo; sem acesso de rede no pipeline).

Saida:
  src/data/climate/climatologia.json   { id, version, rain: { meta, ufs: [{ id, region, mm: [12] }] },
                                         enso: { meta, teleconnection: { regiao: { estacao: coeficiente } } } }

Fonte e status (registrados em docs/DATA_SOURCES.md §4.3) -- TUDO `PROVISORIO`:
  - Normais de chuva: o alvo e a media por UF das Normais Climatologicas 1991-2020 do INMET (precipitacao acumulada
    mensal, em mm). O arquivo oficial NAO foi importado: os 27 x 12 valores abaixo foram DIGITADOS a partir do
    conhecimento publico da climatologia brasileira (totais tipicos de capitais e do interior de cada estado, e o regime
    sazonal de cada regiao), arredondados a 5 mm. Podem errar por dezenas de mm num mes e por ~10-15% no total anual.
    O que importa para o jogo e o REGIME (quando chove, quanto) e a ordem de grandeza, nao a medida de uma estacao.
    Os regimes que a tabela precisa preservar (e que `validate()` confere): Amazonia umida de dez a mai e mais seca de
    jun a nov; semiarido do Nordeste seco de jun a dez (chuva concentrada de jan a mai, ou de abr a jul no litoral
    leste; set a nov seco em todo o NE setentrional); Brasil Central chuvoso de out a mar e seco de mai a set; Sudeste de verao chuvoso; Sul sem estacao seca.
  - Teleconexao ENSO: coeficiente de anomalia de chuva (fracao da normal) por macrorregiao x estacao para ENSO = +1
    (El Nino forte). Sinais da literatura geral (CPTEC/INPE e NOAA/CPC sobre os impactos do El Nino e da La Nina no
    Brasil): El Nino seca o Norte e o Nordeste na respectiva estacao chuvosa e molha o Sul (sobretudo na primavera);
    a La Nina e aproximadamente o inverso (resposta linear e simetrica: simplificacao do jogo). Magnitudes sao ordem
    de grandeza de design, nao estimativas estatisticas.
  - E um dado do conteudo (nao do cenario): a climatologia nao depende da versao do cenario, entao fica numa tabela
    compartilhada em vez de duplicar um cenario novo so para ela.

Estacoes (hemisferio sul, meteorologicas): verao = dez-fev, outono = mar-mai, inverno = jun-ago, primavera = set-nov.

Uso: python scripts/data/build_climatology.py   (deterministico: duas execucoes geram arquivos identicos)
"""

from __future__ import annotations

import json
import pathlib

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
OUT_JSON = ROOT_DIR / "src/data/climate/climatologia.json"

DATA_ID = "climatologia_br"
DATA_VERSION = "0.1.0"

REGIONS = ["norte", "nordeste", "centro_oeste", "sudeste", "sul"]
SEASONS = ["verao", "outono", "inverno", "primavera"]
# Meses (1-12) de cada estacao, conforme o docstring.
SEASON_MONTHS = {
    "verao": [12, 1, 2],
    "outono": [3, 4, 5],
    "inverno": [6, 7, 8],
    "primavera": [9, 10, 11],
}

# ---------------------------------------------------------------- normais de chuva (mm/mes, jan..dez; PROVISORIO)

# (UF, macrorregiao, [jan, fev, mar, abr, mai, jun, jul, ago, set, out, nov, dez]) -- mesma ordem do cenario.
RAIN_MM: list[tuple[str, str, list[int]]] = [
    ("RO", "norte", [300, 300, 300, 250, 100, 30, 25, 50, 120, 210, 250, 300]),
    ("AC", "norte", [290, 290, 280, 220, 110, 50, 40, 50, 100, 190, 230, 270]),
    ("AM", "norte", [270, 290, 310, 290, 230, 120, 85, 60, 80, 120, 170, 230]),
    ("RR", "norte", [40, 30, 45, 100, 250, 300, 280, 200, 120, 90, 80, 70]),
    ("PA", "norte", [270, 320, 350, 320, 220, 110, 85, 60, 60, 80, 100, 170]),
    ("AP", "norte", [270, 330, 370, 380, 330, 230, 200, 100, 50, 40, 60, 150]),
    ("TO", "norte", [260, 240, 260, 160, 40, 5, 5, 10, 50, 140, 220, 270]),
    ("MA", "nordeste", [220, 260, 310, 300, 170, 70, 50, 25, 30, 45, 65, 130]),
    ("PI", "nordeste", [160, 170, 220, 180, 60, 15, 10, 5, 15, 45, 80, 120]),
    ("CE", "nordeste", [100, 135, 200, 205, 115, 65, 35, 10, 8, 10, 15, 50]),
    ("RN", "nordeste", [35, 60, 110, 150, 120, 100, 75, 35, 15, 10, 10, 20]),
    ("PB", "nordeste", [35, 65, 110, 140, 110, 110, 85, 45, 25, 15, 15, 25]),
    ("PE", "nordeste", [55, 80, 130, 160, 140, 135, 105, 55, 30, 25, 25, 45]),
    ("AL", "nordeste", [60, 85, 125, 175, 200, 185, 140, 90, 55, 40, 35, 55]),
    ("SE", "nordeste", [60, 85, 130, 165, 185, 165, 120, 85, 55, 40, 40, 55]),
    ("BA", "nordeste", [105, 90, 110, 110, 60, 40, 35, 25, 35, 70, 135, 125]),
    ("MG", "sudeste", [245, 140, 140, 65, 30, 10, 10, 15, 40, 110, 210, 260]),
    ("ES", "sudeste", [150, 90, 110, 100, 70, 50, 50, 45, 60, 110, 200, 210]),
    ("RJ", "sudeste", [175, 130, 145, 125, 85, 60, 55, 50, 75, 95, 130, 175]),
    ("SP", "sudeste", [245, 205, 160, 80, 70, 50, 40, 35, 75, 115, 140, 200]),
    ("PR", "sul", [190, 170, 130, 120, 120, 105, 90, 85, 130, 150, 140, 170]),
    ("SC", "sul", [190, 170, 150, 115, 110, 105, 115, 110, 140, 160, 140, 160]),
    ("RS", "sul", [130, 130, 120, 110, 115, 140, 140, 145, 150, 140, 115, 120]),
    ("MS", "centro_oeste", [205, 175, 150, 100, 90, 50, 40, 40, 80, 130, 150, 200]),
    ("MT", "centro_oeste", [260, 240, 245, 140, 45, 12, 8, 15, 60, 140, 210, 270]),
    ("GO", "centro_oeste", [260, 210, 210, 110, 35, 8, 5, 10, 45, 140, 220, 280]),
    ("DF", "centro_oeste", [235, 190, 205, 125, 35, 8, 10, 12, 45, 165, 235, 245]),
]

# Faixa plausivel do total anual por macrorregiao (mm), conferida em `validate()`.
ANNUAL_RANGE_MM = {
    "norte": (1500, 3000),
    "nordeste": (700, 1700),
    "centro_oeste": (1200, 1900),
    "sudeste": (1100, 1600),
    "sul": (1400, 1900),
}

# ---------------------------------------------------------------- teleconexao ENSO (PROVISORIO)

# Anomalia de chuva (fracao da normal) para ENSO = +1 (El Nino forte). Negativo = mais seco. La Nina: sinal invertido.
TELECONNECTION: dict[str, dict[str, float]] = {
    # Amazonia: El Nino reduz a chuva, sobretudo no verao-outono austral e na primavera (Norte/leste da bacia).
    "norte": {"verao": -0.12, "outono": -0.15, "inverno": -0.05, "primavera": -0.12},
    # Nordeste: o impacto maior e no norte do NE em fev-mai (outono); litoral leste no inverno e fraco.
    "nordeste": {"verao": -0.10, "outono": -0.20, "inverno": -0.03, "primavera": -0.08},
    # Centro-Oeste: sinal fraco e pouco consistente; estacao seca no inverno quase nao muda em mm.
    "centro_oeste": {"verao": -0.03, "outono": -0.04, "inverno": 0.0, "primavera": -0.03},
    # Sudeste: transicao; leve excesso no sul da regiao no inverno-primavera, norte de MG mais seco no verao.
    "sudeste": {"verao": -0.02, "outono": 0.03, "inverno": 0.05, "primavera": 0.06},
    # Sul: El Nino molha, o sinal mais forte do pais, maximo na primavera.
    "sul": {"verao": 0.05, "outono": 0.12, "inverno": 0.15, "primavera": 0.25},
}

# Sinais minimos que a tabela precisa respeitar (conferidos em `validate()`): fundamento fisico, nao calibracao.
EXPECTED_SIGNS = {("norte", "outono"): -1, ("nordeste", "outono"): -1, ("sul", "primavera"): +1}
TELECONNECTION_MAX_ABS = 0.35

# ---------------------------------------------------------------- validacao


def validate() -> None:
    problems: list[str] = []
    ids = [u[0] for u in RAIN_MM]
    if len(ids) != 27 or len(set(ids)) != 27:
        problems.append(f"esperadas 27 UFs distintas, ha {len(set(ids))}")
    for uf, region, mm in RAIN_MM:
        if region not in REGIONS:
            problems.append(f"{uf}: macrorregiao desconhecida {region}")
        if len(mm) != 12:
            problems.append(f"{uf}: {len(mm)} meses em vez de 12")
        if any((not isinstance(v, (int, float))) or v <= 0 for v in mm):
            problems.append(f"{uf}: todo mes precisa ter chuva positiva")
        lo, hi = ANNUAL_RANGE_MM.get(region, (0, 0))
        if not lo <= sum(mm) <= hi:
            problems.append(f"{uf}: total anual {sum(mm)} mm fora de {lo}-{hi} ({region})")

    by_uf = {uf: mm for uf, _, mm in RAIN_MM}

    def total(uf: str, months: range | list[int]) -> int:
        return sum(by_uf[uf][m - 1] for m in months)

    # Amazonia: umida de dez a mai, mais seca de jun a nov (norte do hemisferio, RR, tem o regime invertido).
    for uf in ["RO", "AC", "AM", "PA", "AP", "TO"]:
        if total(uf, [12, 1, 2, 3, 4, 5]) <= 1.8 * total(uf, range(6, 12)):
            problems.append(f"{uf}: Amazonia deveria ter dez-mai bem mais chuvoso que jun-nov")
    if total("RR", range(5, 9)) <= total("RR", [12, 1, 2, 3]):
        problems.append("RR: estacao chuvosa de mai a ago")
    # Semiarido e Nordeste setentrional: chuva de jan a mai (ou abr-jul no litoral leste), seco de set a dez.
    for uf in ["PI", "CE", "RN", "PB", "PE"]:
        if total(uf, [9, 10, 11]) >= 0.15 * sum(by_uf[uf]):
            problems.append(f"{uf}: set-nov deveria ser a estacao seca do Nordeste")
    # Brasil Central e Sudeste: verao chuvoso, inverno seco.
    for uf in ["MT", "GO", "DF", "MG", "TO"]:
        if total(uf, [12, 1, 2]) <= 3 * total(uf, [6, 7, 8]):
            problems.append(f"{uf}: verao deveria ter bem mais de tres vezes a chuva do inverno")
    # Sul: sem estacao seca (nenhum mes abaixo de 80 mm; razao max/min < 2,4).
    for uf in ["PR", "SC", "RS"]:
        mm = by_uf[uf]
        if min(mm) < 80 or max(mm) / min(mm) >= 2.4:
            problems.append(f"{uf}: o Sul nao tem estacao seca (min {min(mm)}, max {max(mm)})")

    if set(TELECONNECTION) != set(REGIONS):
        problems.append("teleconexao precisa cobrir exatamente as 5 macrorregioes")
    for region, seasons in TELECONNECTION.items():
        if set(seasons) != set(SEASONS):
            problems.append(f"{region}: teleconexao precisa das 4 estacoes")
        for season, c in seasons.items():
            if abs(c) > TELECONNECTION_MAX_ABS:
                problems.append(f"{region}/{season}: |coeficiente| {c} acima de {TELECONNECTION_MAX_ABS}")
    for (region, season), sign in EXPECTED_SIGNS.items():
        if TELECONNECTION[region][season] * sign <= 0:
            problems.append(f"{region}/{season}: sinal contrario ao da literatura geral")

    if problems:
        raise SystemExit("climatologia invalida:\n  " + "\n  ".join(problems))


# ---------------------------------------------------------------- saida

SOURCE_NOTE = (
    "Digitado a partir do conhecimento público da climatologia (alvo: Normais Climatológicas 1991–2020 do INMET, "
    "média por UF); arquivo oficial não importado. Gerado por scripts/data/build_climatology.py."
)


def build() -> dict:
    return {
        "id": DATA_ID,
        "version": DATA_VERSION,
        "rain": {
            "meta": {
                "unit": "mm/mês",
                "status": "PROVISORIO",
                "series": "Precipitação acumulada mensal normal (1991–2020), média por UF",
                "method": "aproximação de design por regime regional, arredondada a 5 mm (tabela em build_climatology.py)",
                "note": SOURCE_NOTE,
            },
            "ufs": [{"id": uf, "region": region, "mm": mm} for uf, region, mm in RAIN_MM],
        },
        "enso": {
            "meta": {
                "unit": "fração da normal por unidade de ENSO",
                "status": "PROVISORIO",
                "series": "Anomalia de chuva por macrorregião e estação para ENSO = +1 (El Niño); La Niña inverte o sinal",
                "method": "sinais da literatura geral (CPTEC/INPE, NOAA/CPC); magnitudes de design",
                "note": "Estações austrais: verão dez–fev, outono mar–mai, inverno jun–ago, primavera set–nov. "
                + SOURCE_NOTE,
            },
            "teleconnection": TELECONNECTION,
        },
    }


def main() -> None:
    validate()
    data = build()
    lines = ["{"]
    lines.append(f'  "id": {json.dumps(data["id"])},')
    lines.append(f'  "version": {json.dumps(data["version"])},')
    lines.append('  "rain": {')
    lines.append(f'    "meta": {json.dumps(data["rain"]["meta"], ensure_ascii=False)},')
    lines.append('    "ufs": [')
    rows = [json.dumps(u, ensure_ascii=False, separators=(",", ":")) for u in data["rain"]["ufs"]]
    lines.append(",\n".join("      " + r for r in rows))
    lines.append("    ]")
    lines.append("  },")
    lines.append('  "enso": {')
    lines.append(f'    "meta": {json.dumps(data["enso"]["meta"], ensure_ascii=False)},')
    lines.append('    "teleconnection": {')
    tele = [
        f'      {json.dumps(r)}: {json.dumps(data["enso"]["teleconnection"][r], separators=(",", ":"))}'
        for r in REGIONS
    ]
    lines.append(",\n".join(tele))
    lines.append("    }")
    lines.append("  }")
    lines.append("}")
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))  # LF também no Windows
    totals = {uf: sum(mm) for uf, _, mm in RAIN_MM}
    print(f"27 UFs x 12 meses -> {OUT_JSON.relative_to(ROOT_DIR)}")
    print("total anual (mm): " + ", ".join(f"{uf} {t}" for uf, t in totals.items()))


if __name__ == "__main__":
    main()
