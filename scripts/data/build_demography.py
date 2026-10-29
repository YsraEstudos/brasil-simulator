"""Gera dados compactos do Censo 2022 para o Brasil Simulator; executado apenas no build."""
import datetime
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

YOUNG = [93070, 93084, 93085, 93086]
WORKING = [93087, 93088, 93089, 93090, 93091, 93092, 93093, 93094, 93095]
OLDER = [93096, 93097, 93098, 49108, 49109, 60040, 60041, 6653]
UF = dict(zip(
    ['11','12','13','14','15','16','17','21','22','23','24','25','26','27','28','29',
     '31','32','33','35','41','42','43','50','51','52','53'],
    ['RO','AC','AM','RR','PA','AP','TO','MA','PI','CE','RN','PB','PE','AL','SE','BA',
     'MG','ES','RJ','SP','PR','SC','RS','MS','MT','GO','DF'], strict=True))
IDS = [100362, *YOUNG, *WORKING, *OLDER]
URL = ('https://apisidra.ibge.gov.br/values/t/9514/n3/all/v/93/p/2022/c2/6794/'
       'c286/113635/c287/' + ','.join(map(str, IDS)))


def main():
    with urlopen(URL, timeout=60) as response:
        raw = response.read()
    rows = json.loads(raw)[1:]
    grouped = {code: {} for code in UF}
    for row in rows:
        code, age = row['D1C'], int(row['D6C'])
        if code not in grouped or age not in IDS or age in grouped[code]:
            raise ValueError(f'linha inesperada ou duplicada: {code}, {age}')
        grouped[code][age] = int(row['V'])
    out = []
    for code, sigla in UF.items():
        values = grouped[code]
        if set(values) != set(IDS):
            raise ValueError(f'faixas ausentes em {sigla}')
        young, working, older = (sum(values[i] for i in group) for group in (YOUNG, WORKING, OLDER))
        if young + working + older != values[100362]:
            raise ValueError(f'faixas não fecham em {sigla}')
        out.append({'uf': sigla, 'total': values[100362], 'young': young, 'working': working, 'older': older})
    result = {
        'source': 'IBGE SIDRA, Censo Demográfico 2022, tabela 9514',
        'url': URL, 'period': '2022', 'unit': 'pessoas', 'status': 'OFICIAL_OBSERVADO',
        'retrievedAt': datetime.date.today().isoformat(), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
        'method': 'Sexo total; forma de declaração total; somas das faixas quinquenais 0–19, 20–64 e 65+.',
        'ufs': out,
    }
    target = Path(__file__).resolve().parents[2] / 'src/data/demography/census2022.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(out)} UFs; fonte sha256={result["sourceSha256"]}; {target}')


if __name__ == '__main__':
    main()
