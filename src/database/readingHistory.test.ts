import { expect, it } from 'vitest';
import { DEFAULT_SCENARIO_ID, loadContent } from '@/content';
import { advanceMonth, createInitialState } from '@/engine';
import { createCampaign, loadRegionalHistory, recordMonth } from './campaignRepository';
import { migrate } from './migrate';
import { openNodeDatabase } from './nodeDatabase';

it('grava observações no mês 0 e no mês seguinte e mantém lacunas antigas', async () => {
  const db = openNodeDatabase();
  try {
    await migrate(db);
    const content = loadContent(DEFAULT_SCENARIO_ID);
    const state = createInitialState({ content, seed: 17, difficulty: 'estrategica' });
    await createCampaign(db, {
      id: 'reading',
      name: 'Leitura',
      scenarioVersion: content.scenario.version,
      state,
      content,
    });
    const result = advanceMonth(state, { decisions: [] }, content);
    await recordMonth(db, 'reading', result, { content });
    const history = await loadRegionalHistory(db, 'reading');
    expect(history).toHaveLength(2);
    expect(history[0].observations?.CE?.aprovacao).toBeCloseTo(state.regions.ufs.find((u) => u.id === 'CE')!.approval);
    expect(history[1].observations?.CE?.chuva).toBeCloseTo(result.state.climate.ufs.find((u) => u.id === 'CE')!.rain);
    expect(history[1].observations?.CE?.intencao).toBeTypeOf('number');
    await db.run('UPDATE regional_indicator_history SET point_json = ? WHERE campaign_id = ? AND month_index = 0', [
      JSON.stringify({ CE: [0.5, 0.1, 0, 0.05, 0] }),
      'reading',
    ]);
    expect((await loadRegionalHistory(db, 'reading'))[0].observations?.CE?.chuva).toBeUndefined();
  } finally {
    await db.close();
  }
});
