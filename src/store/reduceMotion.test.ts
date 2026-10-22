import { expect, it } from 'vitest';
import { openNodeDatabase } from '@/database/nodeDatabase';
import { migrate } from '@/database/migrate';
import { createGameStore } from './gameStore';

it('reduzir movimento persiste fora da campanha e volta após reiniciar a store', async () => {
  const db = openNodeDatabase();
  await migrate(db);
  const openDb = async () => ({ ...db, close: async () => {} });
  try {
    const first = createGameStore({ openDb, random: () => 0.5 });
    await first.getState().init();
    expect(first.getState().reduceMotion).toBe(false);
    expect(await first.getState().setReduceMotion(true)).toBe(true);
    const second = createGameStore({ openDb, random: () => 0.5 });
    await second.getState().init();
    expect(second.getState().reduceMotion).toBe(true);
    expect(second.getState().active).toBeNull();
  } finally {
    await db.close();
  }
});
