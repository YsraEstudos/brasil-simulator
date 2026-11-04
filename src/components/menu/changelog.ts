/**
 * Histórico de atualizações (PLANO_QUICK_WINS.md, B55): aberto ao tocar no número da versão no menu principal.
 * Mais recente primeiro. Texto escrito à mão a cada versão; sem dados de rede.
 */

export interface ChangelogEntry {
  version: string;
  /** Data no formato dd/mm/aaaa. */
  date: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '04/11/2026',
    items: [
      'Carregar Jogo: fixar no topo, proteger contra exclusão, renomear, ordenar e filtrar campanhas.',
      'Salvar como, exportar e importar saves; recomeçar com as mesmas opções.',
      'Configurações: tema, acessibilidade, valores fiscais, globo, animações e restaurar padrões.',
      'Tela Como jogar com as instruções básicas.',
    ],
  },
];
