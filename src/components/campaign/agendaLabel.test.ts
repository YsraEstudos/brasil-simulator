import { describe, expect, it } from 'vitest';
import { loadContent, DEFAULT_SCENARIO_ID } from '@/content';
import { decisionLabel } from './agendaLabel';

const content = loadContent(DEFAULT_SCENARIO_ID);

describe('rótulo da agenda', () => {
  it('distingue ações por seus alvos e prioriza a proposta', () => {
    expect(decisionLabel({ policyId: 'visitar_estado', agendaCost: 1, params: { uf: 'SP' } }, content)).toBe(
      'Visitar o estado: SP',
    );
    expect(
      decisionLabel(
        { policyId: 'negociar_bloco', agendaCost: 1, params: { proposalId: 'projeto_1', blocId: 'bloco_x' } },
        content,
      ),
    ).toBe('Negociar com o bloco: projeto_1 · bloco_x');
  });
  it('mantém o nome base quando faltam alvos e preserva diretrizes e marcas', () => {
    expect(decisionLabel({ policyId: 'visitar_estado', agendaCost: 1, params: { uf: '' } }, content)).toBe(
      'Visitar o estado',
    );
    expect(
      decisionLabel({ policyId: 'definir_diretriz', agendaCost: 1, params: { policyId: 'desconhecida' } }, content),
    ).toBe('Diretriz: desconhecida');
    expect(decisionLabel({ policyId: 'marcar_governo', agendaCost: 1, params: { name: 'Minha marca' } }, content)).toBe(
      'Marca: Minha marca',
    );
  });
});
