import { parsePolicy, type Policy } from '@/types/policy';

import contingenciamento from '@/data/policies/contingenciamento.json';
import gastosTributariosRevisao from '@/data/policies/gastos_tributarios_revisao.json';
import infraestruturaCreditoAdicional from '@/data/policies/infraestrutura_credito_adicional.json';
import iofCreditoReducao from '@/data/policies/iof_credito_reducao.json';
import irpfTabela from '@/data/policies/irpf_tabela.json';
import reformaAdministrativa from '@/data/policies/reforma_administrativa.json';
import segurancaCooperacao from '@/data/policies/seguranca_cooperacao.json';
import transferenciaRendaAmpliacao from '@/data/policies/transferencia_renda_ampliacao.json';

/** Catálogo de políticas (src/data/policies/*.json), validado ao carregar: um JSON inválido é erro de desenvolvimento. */
const RAW: readonly unknown[] = [
  infraestruturaCreditoAdicional,
  iofCreditoReducao,
  irpfTabela,
  contingenciamento,
  transferenciaRendaAmpliacao,
  segurancaCooperacao,
  gastosTributariosRevisao,
  reformaAdministrativa,
];

function loadPolicies(raw: readonly unknown[]): Record<string, Policy> {
  const result: Record<string, Policy> = {};
  const errors: string[] = [];
  for (const item of raw) {
    const r = parsePolicy(item);
    if (!r.ok) {
      const id = typeof item === 'object' && item !== null && 'id' in item ? String(item.id) : '(sem id)';
      errors.push(...r.errors.map((e) => `${id} -> ${e}`));
      continue;
    }
    if (result[r.policy.id]) {
      errors.push(`${r.policy.id} -> id duplicado`);
      continue;
    }
    result[r.policy.id] = r.policy;
  }
  if (errors.length > 0) throw new Error(`política inválida:\n${errors.join('\n')}`);
  return result;
}

export const POLICIES: Readonly<Record<string, Policy>> = loadPolicies(RAW);
