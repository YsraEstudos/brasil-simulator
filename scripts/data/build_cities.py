"""Gera a lista dos maiores municípios para as luzes das cidades à noite (PLANO_GLOBO.md §4.3, PR 6).

Entrada (já gerada pelo build_globe.py):
  src/globe/data/ufs.json   contornos simplificados das 27 UFs (lon/lat), só para conferir as coordenadas

Saída:
  src/globe/data/cities.json   ~150 municípios: { name, uf, lon, lat, pop }, do mais ao menos populoso

Fonte e status (registrados em docs/DATA_SOURCES.md §3.3):
  - Município, UF, coordenadas da sede (lon/lat, 3 casas decimais, ~100 m) e população: aproximação dos 150
    municípios mais populosos do Censo 2022 do IBGE (SIDRA, tabela 4709). Sem acesso de rede no pipeline, a tabela
    abaixo foi DIGITADA de memória a partir de valores públicos, com a população arredondada ao milhar (pode errar por
    alguns milhares): status PROVISORIO.
    O que importa para o uso (pontos de luz com tamanho por log da população) é a ordem de grandeza; o corte nos 150
    maiores pode trocar um município de ~230 mil habitantes por outro de tamanho igual. Conferir contra o arquivo
    oficial quando o download do Censo/sedes entrar no pipeline.
  - É um dado só visual: não entra no motor nem no cenário.

Uso: python scripts/data/build_cities.py   (determinístico: duas execuções geram arquivos idênticos)
"""

from __future__ import annotations

import json
import math
import pathlib

ROOT_DIR = pathlib.Path(__file__).resolve().parents[2]
UFS_JSON = ROOT_DIR / "src/globe/data/ufs.json"
OUT_CITIES = ROOT_DIR / "src/globe/data/cities.json"

CITY_COUNT = 150
# Tolerância (graus) para a conferência sede-dentro-da-UF: os contornos foram simplificados (~2 km) e muitas sedes
# são litorâneas, então o ponto pode cair a poucos metros do contorno.
COAST_TOLERANCE_DEG = 0.05  # ~5 km

# ---------------------------------------------------------------- tabela (Censo 2022 arredondado; PROVISORIO)

# (município, UF, lon, lat, população em milhares)
CITIES: list[tuple[str, str, float, float, int]] = [
    ("São Paulo", "SP", -46.633, -23.550, 11452),
    ("Rio de Janeiro", "RJ", -43.173, -22.907, 6211),
    ("Brasília", "DF", -47.882, -15.794, 2817),
    ("Fortaleza", "CE", -38.543, -3.732, 2429),
    ("Salvador", "BA", -38.511, -12.971, 2418),
    ("Belo Horizonte", "MG", -43.938, -19.920, 2316),
    ("Manaus", "AM", -60.022, -3.119, 2064),
    ("Curitiba", "PR", -49.271, -25.430, 1774),
    ("Recife", "PE", -34.877, -8.047, 1489),
    ("Goiânia", "GO", -49.254, -16.680, 1437),
    ("Porto Alegre", "RS", -51.230, -30.033, 1333),
    ("Belém", "PA", -48.504, -1.456, 1303),
    ("Guarulhos", "SP", -46.533, -23.463, 1292),
    ("Campinas", "SP", -47.061, -22.906, 1139),
    ("São Luís", "MA", -44.303, -2.530, 1038),
    ("Maceió", "AL", -35.735, -9.666, 957),
    ("Campo Grande", "MS", -54.646, -20.469, 898),
    ("São Gonçalo", "RJ", -43.054, -22.827, 897),
    ("Teresina", "PI", -42.802, -5.089, 866),
    ("João Pessoa", "PB", -34.863, -7.115, 834),
    ("São Bernardo do Campo", "SP", -46.565, -23.694, 810),
    ("Duque de Caxias", "RJ", -43.311, -22.786, 808),
    ("Nova Iguaçu", "RJ", -43.451, -22.759, 786),
    ("Natal", "RN", -35.209, -5.795, 751),
    ("Santo André", "SP", -46.538, -23.664, 749),
    ("Osasco", "SP", -46.791, -23.532, 729),
    ("Sorocaba", "SP", -47.458, -23.502, 724),
    ("Uberlândia", "MG", -48.277, -18.919, 713),
    ("Ribeirão Preto", "SP", -47.810, -21.178, 699),
    ("São José dos Campos", "SP", -45.886, -23.223, 697),
    ("Cuiabá", "MT", -56.097, -15.601, 651),
    ("Jaboatão dos Guararapes", "PE", -35.015, -8.113, 644),
    ("Contagem", "MG", -44.054, -19.932, 622),
    ("Feira de Santana", "BA", -38.966, -12.267, 617),
    ("Joinville", "SC", -48.844, -26.304, 616),
    ("Aracaju", "SE", -37.073, -10.947, 603),
    ("Londrina", "PR", -51.163, -23.310, 556),
    ("Juiz de Fora", "MG", -43.350, -21.764, 541),
    ("Florianópolis", "SC", -48.548, -27.595, 537),
    ("Aparecida de Goiânia", "GO", -49.247, -16.823, 528),
    ("Serra", "ES", -40.307, -20.121, 521),
    ("Campos dos Goytacazes", "RJ", -41.324, -21.752, 484),
    ("Belford Roxo", "RJ", -43.399, -22.764, 483),
    ("Niterói", "RJ", -43.103, -22.883, 482),
    ("São José do Rio Preto", "SP", -49.379, -20.812, 480),
    ("Ananindeua", "PA", -48.372, -1.366, 479),
    ("Vila Velha", "ES", -40.292, -20.330, 468),
    ("Caxias do Sul", "RS", -51.179, -29.168, 464),
    ("Porto Velho", "RO", -63.904, -8.762, 460),
    ("Mogi das Cruzes", "SP", -46.188, -23.522, 452),
    ("Macapá", "AP", -51.069, 0.035, 443),
    ("Jundiaí", "SP", -46.884, -23.186, 443),
    ("São João de Meriti", "RJ", -43.372, -22.804, 441),
    ("Piracicaba", "SP", -47.649, -22.725, 423),
    ("Campina Grande", "PB", -35.881, -7.230, 419),
    ("Santos", "SP", -46.333, -23.960, 419),
    ("Mauá", "SP", -46.461, -23.667, 418),
    ("Montes Claros", "MG", -43.861, -16.735, 414),
    ("Boa Vista", "RR", -60.673, 2.820, 413),
    ("Betim", "MG", -44.198, -19.968, 412),
    ("Maringá", "PR", -51.939, -23.420, 410),
    ("Anápolis", "GO", -48.953, -16.327, 399),
    ("Diadema", "SP", -46.623, -23.686, 393),
    ("Carapicuíba", "SP", -46.836, -23.522, 387),
    ("Petrolina", "PE", -40.500, -9.389, 387),
    ("Bauru", "SP", -49.061, -22.314, 379),
    ("Caruaru", "PE", -35.976, -8.284, 378),
    ("Vitória da Conquista", "BA", -40.839, -14.866, 371),
    ("Itaquaquecetuba", "SP", -46.348, -23.486, 369),
    ("Rio Branco", "AC", -67.810, -9.975, 365),
    ("Blumenau", "SC", -49.066, -26.919, 361),
    ("Ponta Grossa", "PR", -50.162, -25.095, 358),
    ("Caucaia", "CE", -38.653, -3.736, 356),
    ("Cariacica", "ES", -40.420, -20.264, 353),
    ("Franca", "SP", -47.401, -20.539, 353),
    ("Praia Grande", "SP", -46.403, -24.006, 350),
    ("Olinda", "PE", -34.855, -8.009, 350),
    ("Cascavel", "PR", -53.455, -24.956, 348),
    ("Canoas", "RS", -51.174, -29.917, 348),
    ("Paulista", "PE", -34.873, -7.940, 342),
    ("Uberaba", "MG", -47.932, -19.748, 337),
    ("Santarém", "PA", -54.708, -2.443, 332),
    ("Ribeirão das Neves", "MG", -44.087, -19.767, 330),
    ("São Vicente", "SP", -46.392, -23.963, 330),
    ("São José dos Pinhais", "PR", -49.206, -25.532, 330),
    ("Vitória", "ES", -40.338, -20.315, 323),
    ("Barueri", "SP", -46.876, -23.511, 316),
    ("Taubaté", "SP", -45.556, -23.026, 311),
    ("Suzano", "SP", -46.311, -23.543, 307),
    ("Palmas", "TO", -48.334, -10.184, 302),
    ("Camaçari", "BA", -38.325, -12.699, 300),
    ("Limeira", "SP", -47.401, -22.565, 292),
    ("Várzea Grande", "MT", -56.133, -15.647, 290),
    ("Guarujá", "SP", -46.256, -23.994, 288),
    ("Juazeiro do Norte", "CE", -39.316, -7.213, 286),
    ("Foz do Iguaçu", "PR", -54.588, -25.547, 285),
    ("Sumaré", "SP", -47.267, -22.822, 280),
    ("Petrópolis", "RJ", -43.178, -22.505, 279),
    ("Imperatriz", "MA", -47.492, -5.526, 273),
    ("Taboão da Serra", "SP", -46.791, -23.609, 274),
    ("Cotia", "SP", -46.919, -23.604, 274),
    ("Santa Maria", "RS", -53.807, -29.684, 272),
    ("São José", "SC", -48.636, -27.614, 270),
    ("Parauapebas", "PA", -49.904, -6.068, 268),
    ("Marabá", "PA", -49.118, -5.368, 267),
    ("Gravataí", "RS", -50.993, -29.944, 265),
    ("Mossoró", "RN", -37.344, -5.188, 265),
    ("Itajaí", "SC", -48.677, -26.907, 264),
    ("Volta Redonda", "RJ", -44.104, -22.523, 262),
    ("Governador Valadares", "MG", -41.949, -18.851, 257),
    ("Indaiatuba", "SP", -47.218, -23.090, 256),
    ("São Carlos", "SP", -47.890, -22.018, 255),
    ("Chapecó", "SC", -52.619, -27.100, 255),
    ("Parnamirim", "RN", -35.263, -5.915, 253),
    ("Embu das Artes", "SP", -46.852, -23.649, 251),
    ("Macaé", "RJ", -41.787, -22.371, 246),
    ("Rondonópolis", "MT", -54.636, -16.470, 245),
    ("São José de Ribamar", "MA", -44.054, -2.547, 245),
    ("Dourados", "MS", -54.806, -22.221, 243),
    ("Araraquara", "SP", -48.176, -21.794, 242),
    ("Jacareí", "SP", -45.966, -23.305, 240),
    ("Juazeiro", "BA", -40.499, -9.416, 237),
    ("Marília", "SP", -49.946, -22.214, 237),
    ("Americana", "SP", -47.331, -22.738, 237),
    ("Hortolândia", "SP", -47.214, -22.858, 237),
    ("Maracanaú", "CE", -38.626, -3.877, 234),
    ("Arapiraca", "AL", -36.661, -9.752, 234),
    ("Colombo", "PR", -49.224, -25.292, 232),
    ("Divinópolis", "MG", -44.884, -20.139, 231),
    ("Itapevi", "SP", -46.935, -23.549, 232),
    ("Cabo Frio", "RJ", -42.019, -22.879, 230),
    ("Ipatinga", "MG", -42.537, -19.468, 228),
    ("Sete Lagoas", "MG", -44.247, -19.466, 227),
    ("Novo Hamburgo", "RS", -51.131, -29.688, 227),
    ("Rio Verde", "GO", -50.924, -17.793, 226),
    ("Presidente Prudente", "SP", -51.389, -22.126, 226),
    ("Itaboraí", "RJ", -42.859, -22.744, 224),
    ("Viamão", "RS", -51.023, -30.081, 224),
    ("Palhoça", "SC", -48.670, -27.645, 223),
    ("Águas Lindas de Goiás", "GO", -48.281, -15.762, 218),
    ("São Leopoldo", "RS", -51.147, -29.760, 217),
    ("Criciúma", "SC", -49.370, -28.678, 214),
    ("Luziânia", "GO", -47.950, -16.253, 209),
    ("Passo Fundo", "RS", -52.406, -28.262, 206),
    ("Lauro de Freitas", "BA", -38.322, -12.894, 203),
    ("Sobral", "CE", -40.350, -3.689, 203),
    ("Cabo de Santo Agostinho", "PE", -35.000, -8.287, 203),
    ("Araçatuba", "SP", -50.433, -21.209, 200),
    ("Rio Claro", "SP", -47.561, -22.411, 200),
    # Logo abaixo do corte (o script ordena por população e fica com os 150 primeiros):
    ("Valparaíso de Goiás", "GO", -47.980, -16.070, 198),
    ("Sinop", "MT", -55.503, -11.864, 196),
    ("Nossa Senhora do Socorro", "SE", -37.126, -10.855, 192),
    ("Castanhal", "PA", -47.920, -1.297, 192),
    ("Rio Grande", "RS", -52.098, -32.035, 191),
    ("Itabuna", "BA", -39.280, -14.788, 186),
    ("Araguaína", "TO", -48.207, -7.192, 183),
    ("Jaraguá do Sul", "SC", -49.071, -26.486, 182),
    ("Guarapuava", "PR", -51.458, -25.395, 182),
]


# ---------------------------------------------------------------- geometria

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


def dist_to_ring(x: float, y: float, ring) -> float:
    best = math.inf
    for i in range(len(ring)):
        ax, ay = ring[i - 1][0], ring[i - 1][1]
        bx, by = ring[i][0], ring[i][1]
        dx, dy = bx - ax, by - ay
        len2 = dx * dx + dy * dy
        t = 0.0 if len2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / len2))
        best = min(best, math.hypot(x - (ax + t * dx), y - (ay + t * dy)))
    return best


def check_inside_uf(ufs: dict[str, dict], name: str, uf: str, lon: float, lat: float) -> str | None:
    """Mensagem de problema se a sede cai longe da própria UF; `None` se está ok (dentro ou no litoral simplificado)."""
    if uf not in ufs:
        return f"{name}: UF desconhecida {uf}"
    rings = ufs[uf]["polygons"]
    if any(point_in_ring(lon, lat, r) for r in rings):
        return None
    near = min(dist_to_ring(lon, lat, r) for r in rings)
    if near > COAST_TOLERANCE_DEG:
        return f"{name}/{uf} ({lon}, {lat}) fora do polígono (a {near:.3f}° do contorno)"
    print(f"  aviso: {name}/{uf} a {near:.4f}° do contorno (litoral simplificado)")
    return None


# ---------------------------------------------------------------- principal

def main() -> None:
    ufs = {u["sigla"]: u for u in json.loads(UFS_JSON.read_text(encoding="utf-8"))}
    names = [c[0] for c in CITIES]
    if len(set(names)) != len(names):
        raise SystemExit("nomes de município repetidos na tabela")
    problems = [p for c in CITIES if (p := check_inside_uf(ufs, c[0], c[1], c[2], c[3]))]
    if problems:
        raise SystemExit("sedes fora das UFs:\n  " + "\n  ".join(problems))
    if len(CITIES) < CITY_COUNT:
        raise SystemExit(f"a tabela tem {len(CITIES)} municípios, menos que os {CITY_COUNT} pedidos")
    top = sorted(CITIES, key=lambda c: (-c[4], c[0]))[:CITY_COUNT]
    out = [
        {"name": name, "uf": uf, "lon": lon, "lat": lat, "pop": pop_k * 1000}
        for name, uf, lon, lat, pop_k in top
    ]
    # Um município por linha: o diff mostra exatamente o que mudou.
    body = ",\n".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in out)
    OUT_CITIES.write_bytes(f"[\n{body}\n]\n".encode("utf-8"))  # LF também no Windows
    print(f"{len(out)} municípios -> {OUT_CITIES.relative_to(ROOT_DIR)} (menor: {out[-1]['name']}, {out[-1]['pop']})")


if __name__ == "__main__":
    main()
