import { formatNumber } from '@/components/ui/format';
import type { Country } from '@/globe/countries';

/**
 * Folha do país (PLANO_PAISES.md, Fase P1): a seção **Identidade**, montada a partir dos dados do globo (Natural Earth).
 * Só lê o país: nada daqui entra no motor nem no save. As seções das próximas fases aparecem como "em preparação".
 */

export type CountryRow = { label: string; value: string; note?: string };

export type CountryView = {
  title: string;
  /** "País", "Território de outro país", "Soberania em disputa"… */
  status: string;
  rows: CountryRow[];
  /** O que ainda vem nas próximas fases do plano. */
  upcoming: string;
  source: string;
  /** Resumo para o leitor de tela. */
  accessibilityLabel: string;
};

/** Texto da situação da unidade. */
export function countryStatusText(country: Pick<Country, 'status'>): string {
  switch (country.status) {
    case 'pais':
      return 'País';
    case 'territorio':
      return 'Território de outro país';
    case 'disputa':
      return 'Soberania em disputa';
    case 'antartida':
      return 'Sem soberania: regida pelo Tratado da Antártida';
  }
}

/** População com a unidade que se lê melhor: "1,40 bilhão", "45,0 milhões", "38 mil", "825 habitantes". */
export function formatPopulation(people: number): string {
  if (people >= 1e9) return `${formatNumber(people / 1e9, 2)} ${people >= 2e9 ? 'bilhões' : 'bilhão'}`;
  if (people >= 1e6) return `${formatNumber(people / 1e6, 1)} ${people >= 2e6 ? 'milhões' : 'milhão'}`;
  if (people >= 1e4) return `${formatNumber(people / 1e3, 0)} mil`;
  if (people <= 0) return 'Sem população permanente';
  return `${formatNumber(people, 0)} ${people === 1 ? 'habitante' : 'habitantes'}`;
}

/** Região: "América do Sul" (sub-região igual ao continente) ou "Caribe · América do Norte". */
export function regionText(country: Pick<Country, 'continent' | 'subregion'>): string {
  return country.subregion === country.continent ? country.continent : `${country.subregion} · ${country.continent}`;
}

export const UPCOMING_SECTIONS =
  'Economia, população e governo, matérias-primas e exportações e o comércio com o Brasil chegam nas próximas fases.';

export function buildCountryView(country: Country): CountryView {
  const capital = country.capital
    ? { label: 'Capital', value: country.capital.name, note: country.capital.note }
    : { label: 'Capital', value: '—', note: 'sem capital no dado' };
  const population = formatPopulation(country.population);
  const rows: CountryRow[] = [
    ...(country.status === 'territorio' && country.sovereign
      ? [{ label: 'Pertence a', value: country.sovereign }]
      : []),
    capital,
    { label: 'Região', value: regionText(country) },
    {
      label: 'População',
      value: population,
      note: country.population > 0 ? `estimativa de ${country.populationYear}` : undefined,
    },
    { label: 'Fronteira com o Brasil', value: country.bordersBrazil ? 'Sim' : 'Não' },
    {
      label: 'Distância de Brasília',
      value: `${formatNumber(country.distanceKm, 0)} km`,
      note: country.capital ? 'em linha reta até a capital' : 'em linha reta até o centro',
    },
  ];
  const status = countryStatusText(country);
  const spoken = rows.map((r) => `${r.label}: ${r.value}${r.note ? ` (${r.note})` : ''}`).join('. ');
  return {
    title: country.name,
    status,
    rows,
    upcoming: UPCOMING_SECTIONS,
    source: `Fonte: Natural Earth (domínio público). População estimada de ${country.populationYear}.`,
    accessibilityLabel: `${country.name}. ${status}. ${spoken}.`,
  };
}
