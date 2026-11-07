import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleSlots, validateScheduledAt, saoPauloToDate, describeOpeningDays } from './schedule.js';
import { isOpenAt } from './time.js';
// Loja: terça a domingo, 13:30 às 22:00 (segunda fechada).
const settings = { opening_days: '2,3,4,5,6,0', opening_time: '13:30', closing_time: '22:00', minimum_schedule_minutes: '30' };
const now = new Date('2026-11-02T15:00:00Z'); // segunda 12:00 em São Paulo
test('converte horário de São Paulo para o instante certo', () => {
  assert.equal(saoPauloToDate(2026, 11, 3, 13, 30).toISOString(), '2026-11-03T16:30:00.000Z');
  assert.equal(saoPauloToDate(2026, 11, 3, 0, 0).toISOString(), '2026-11-03T03:00:00.000Z');
});
test('nenhum horário oferecido cai em dia ou hora de loja fechada', () => {
  const days = buildScheduleSlots(settings, now);
  assert.ok(days.length > 0);
  for (const d of days) for (const s of d.slots) assert.equal(isOpenAt(new Date(s.value), settings), true, s.value);
});
test('segunda-feira não aparece e o primeiro dia é terça às 13:30', () => {
  const days = buildScheduleSlots(settings, now);
  assert.equal(days[0].date, '2026-11-03');
  assert.equal(days[0].slots[0].time, '13:30');
  assert.equal(days[0].slots.at(-1).time, '21:45');
  assert.ok(!days.some(d => d.date === '2026-11-09'));
  assert.match(days[0].label, /terça-feira, 03\/11/);
});
test('respeita a antecedência mínima no mesmo dia', () => {
  const tuesday = new Date('2026-11-03T17:10:00Z'); // terça 14:10
  const today = buildScheduleSlots(settings, tuesday).find(d => d.date === '2026-11-03');
  assert.equal(today.slots[0].time, '14:45');
  assert.equal(buildScheduleSlots({ ...settings, minimum_schedule_minutes: '120' }, tuesday)[0].slots[0].time, '16:15');
});
test('depois do fechamento o dia some da lista', () => {
  const late = new Date('2026-11-04T00:30:00Z'); // terça 21:30
  assert.ok(!buildScheduleSlots(settings, late).some(d => d.date === '2026-11-03'));
});
test('janela de horário inválida não gera horários', () => {
  assert.deepEqual(buildScheduleSlots({ ...settings, opening_time: '22:00', closing_time: '13:30' }, now), []);
});
test('validação recusa segunda, antes de abrir, no fechamento e fora de hora', () => {
  assert.equal(validateScheduledAt('2026-11-09T17:00:00Z', settings, now) !== null, true); // segunda 14h
  assert.match(validateScheduledAt('2026-11-09T17:00:00Z', settings, now), /não abre/);
  assert.notEqual(validateScheduledAt('2026-11-03T15:30:00Z', settings, now), null); // terça 12:30
  assert.notEqual(validateScheduledAt('2026-11-04T01:00:00Z', settings, now), null); // terça 22:00 (exclusivo)
  assert.notEqual(validateScheduledAt('2026-11-03T05:00:00Z', settings, now), null); // terça 02:00
});
test('validação aceita horário aberto e recusa o inválido ou muito próximo', () => {
  assert.equal(validateScheduledAt('2026-11-03T17:00:00Z', settings, now), null);
  assert.match(validateScheduledAt('lixo', settings, now), /inválida/);
  assert.match(validateScheduledAt(12345, settings, now), /inválida/);
  assert.match(validateScheduledAt(null, settings, now), /inválida/);
  assert.match(validateScheduledAt('2026-11-02T15:10:00Z', settings, now), /antecedência/);
});
test('todo horário oferecido passa na validação', () => {
  for (const d of buildScheduleSlots(settings, now)) for (const s of d.slots) assert.equal(validateScheduledAt(s.value, settings, now), null, s.value);
});
test('descreve os dias de funcionamento', () => {
  assert.equal(describeOpeningDays(settings), 'terça a domingo');
  assert.equal(describeOpeningDays({ opening_days: '1,3,5' }), 'segunda, quarta e sexta');
  assert.equal(describeOpeningDays({ opening_days: '0,1,2,3,4,5,6' }), 'segunda a domingo');
});
