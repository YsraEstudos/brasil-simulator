import { describe, expect, it } from 'vitest';
import { governmentCalendar } from './governmentCalendar';

const options = { electionMonth: 45, copomMonths: [1, 3, 5, 6, 7, 9, 11, 12], honeymoonMonths: 6, casual: false };

describe('calendário do governo', () => {
  it('acompanha a eleição geral nos dois mandatos e após o pleito', () => {
    expect(governmentCalendar(0, options).electionIn).toBe(45);
    expect(governmentCalendar(45, options).electionIn).toBe(0);
    expect(governmentCalendar(46, options).electionIn).toBe(47);
    expect(governmentCalendar(48, options).electionIn).toBe(45);
    expect(governmentCalendar(93, options).electionIn).toBe(0);
    expect(governmentCalendar(0, { ...options, electionMonth: undefined }).electionIn).toBeNull();
  });
  it('respeita o recesso, casual e lua de mel em cada posse', () => {
    expect(governmentCalendar(0, options)).toMatchObject({ recess: true, honeymoonLeft: 6 });
    expect(governmentCalendar(5, options).honeymoonLeft).toBe(1);
    expect(governmentCalendar(6, options).honeymoonLeft).toBe(0);
    expect(governmentCalendar(48, options).honeymoonLeft).toBe(6);
    expect(governmentCalendar(0, { ...options, casual: true }).recess).toBe(false);
  });
  it('marca o início do ano eleitoral, datas de vedação e ausência de vedação casual', () => {
    expect(governmentCalendar(36, options).electionYear).toMatchObject({ election: 45, banStart: 42, banEnd: 44 });
    expect(governmentCalendar(37, options).electionYear).toBeNull();
    expect(governmentCalendar(84, options).electionYear?.election).toBe(93);
    expect(governmentCalendar(36, { ...options, casual: true }).electionYear?.banStart).toBeNull();
  });
  it('encontra Copom e lembretes orçamentários na passagem de ano', () => {
    expect(governmentCalendar(11, options).nextCopom).toBe(11);
    expect(governmentCalendar(12, options).nextCopom).toBe(12);
    expect(governmentCalendar(3, options).budget.map((x) => x.name)).toEqual(['LDO']);
    expect(governmentCalendar(7, options).budget.map((x) => x.name)).toEqual(['PLOA']);
    expect(governmentCalendar(12, options).budget).toEqual([]);
  });
});
