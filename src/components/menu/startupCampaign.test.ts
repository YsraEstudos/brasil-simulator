import { describe, expect, it } from 'vitest';

import { lastActiveCampaignId, startupCampaignId, type StartupCampaign } from './startupCampaign';

function campaign(id: string, over: Partial<StartupCampaign> & { updatedAt?: string } = {}): StartupCampaign {
  return {
    id,
    status: 'ativa',
    lastPlayedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('última campanha ativa (abrir direto ao iniciar)', () => {
  it('escolhe a ativa com o maior lastPlayedAt', () => {
    const list = [
      campaign('antiga', { lastPlayedAt: '2026-02-01T10:00:00.000Z' }),
      campaign('recente', { lastPlayedAt: '2026-03-05T10:00:00.000Z' }),
      campaign('meio', { lastPlayedAt: '2026-02-20T10:00:00.000Z' }),
    ];
    expect(lastActiveCampaignId(list)).toBe('recente');
  });

  it('sem lastPlayedAt, usa updatedAt', () => {
    const list = [
      campaign('a', { updatedAt: '2026-04-01T00:00:00.000Z' }),
      campaign('b', { updatedAt: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(lastActiveCampaignId(list)).toBe('b');
  });

  it('lastPlayedAt vale sobre updatedAt (mesmo quando é mais antigo que o updatedAt de outra)', () => {
    const list = [
      campaign('jogada', { lastPlayedAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }),
      campaign('gravada', { lastPlayedAt: null, updatedAt: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(lastActiveCampaignId(list)).toBe('jogada');
  });

  it('ignora campanhas encerradas, mesmo que sejam as mais recentes', () => {
    const list = [
      campaign('encerrada', { status: 'encerrada', lastPlayedAt: '2026-09-01T00:00:00.000Z' }),
      campaign('ativa', { lastPlayedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(lastActiveCampaignId(list)).toBe('ativa');
  });

  it('sem nenhuma ativa (ou lista vazia), retorna null', () => {
    expect(lastActiveCampaignId([])).toBeNull();
    expect(lastActiveCampaignId([campaign('x', { status: 'encerrada' })])).toBeNull();
  });

  it('data inválida não ganha de uma válida', () => {
    const list = [
      campaign('ruim', { lastPlayedAt: 'não é data' }),
      campaign('boa', { lastPlayedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    expect(lastActiveCampaignId(list)).toBe('boa');
  });

  it('empate: vale a primeira da lista', () => {
    const same = '2026-07-07T07:07:07.000Z';
    const list = [campaign('primeira', { lastPlayedAt: same }), campaign('segunda', { lastPlayedAt: same })];
    expect(lastActiveCampaignId(list)).toBe('primeira');
  });
});

describe('decisão de abertura ao iniciar', () => {
  const list = [campaign('ativa', { lastPlayedAt: '2026-02-01T00:00:00.000Z' })];

  it('com a opção ligada e a store pronta, abre a campanha ativa', () => {
    expect(startupCampaignId({ status: 'pronto', openLastCampaign: true, campaigns: list })).toBe('ativa');
  });

  it('com a opção desligada, fica no menu', () => {
    expect(startupCampaignId({ status: 'pronto', openLastCampaign: false, campaigns: list })).toBeNull();
  });

  it('com a store ainda iniciando ou com erro, fica no menu', () => {
    expect(startupCampaignId({ status: 'iniciando', openLastCampaign: true, campaigns: list })).toBeNull();
    expect(startupCampaignId({ status: 'erro', openLastCampaign: true, campaigns: list })).toBeNull();
  });

  it('sem campanha ativa, fica no menu', () => {
    expect(
      startupCampaignId({
        status: 'pronto',
        openLastCampaign: true,
        campaigns: [campaign('x', { status: 'encerrada' })],
      }),
    ).toBeNull();
  });
});
