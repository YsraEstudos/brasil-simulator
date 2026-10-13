import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Balanceamento (ECONOMIC_MODEL.md §9): roda as campanhas de scripts/sim/ em Node, sem interface.
export default defineConfig({
  resolve: {
    // Mesmo atalho do vitest.config.mts: "@/..." → src/
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['scripts/sim/**/*.sim.ts'],
    environment: 'node',
    // As tabelas são o resultado do script: mostrar o console mesmo com o teste passando.
    disableConsoleIntercept: true,
    // 50 sementes × 12 meses + 20 × 48 meses para cada estratégia: bem acima do padrão de 5 s.
    testTimeout: 600_000,
  },
});
