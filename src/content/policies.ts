import type { Policy } from '@/types/policy';

/** Catálogo de políticas (src/data/policies/*.json), validado ao carregar. Preenchido pelo agente de políticas. */
export const POLICIES: Readonly<Record<string, Policy>> = {};
