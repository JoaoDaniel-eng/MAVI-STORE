import { getLocalParts, isOpenAt } from './time.js';
// Regra única de agendamento: a lista de horários que o site mostra e a validação do pedido usam as mesmas funções,
// então o cliente nunca vê (nem consegue enviar) um dia ou horário em que a loja não abre.
export const SLOT_STEP_MINUTES = 15;
export const SCHEDULE_DAYS_AHEAD = 14;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const toMinutes = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
export const openingDaysOf = settings => String(settings.opening_days || '2,3,4,5,6,0').split(',').map(Number);
// Diferença (em ms) entre o relógio de São Paulo e o UTC naquele instante.
function offsetMs(date) {
  const p = getLocalParts(date);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(date.getTime() / 60000) * 60000;
}
// Converte "dia + hora no relógio de São Paulo" para o instante real (UTC).
export function saoPauloToDate(year, month, day, hour, minute) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess));
  return new Date(guess - offsetMs(new Date(first)));
}
// "terça a domingo" / "segunda, quarta e sexta".
export function describeOpeningDays(settings) {
  const open = new Set(openingDaysOf(settings)), flags = WEEK_ORDER.map(d => open.has(d));
  const runs = [];
  flags.forEach((on, i) => { if (on) { if (i > 0 && flags[i - 1]) runs[runs.length - 1].push(WEEK_ORDER[i]); else runs.push([WEEK_ORDER[i]]); } });
  if (!runs.length) return 'nenhum dia';
  if (runs.length === 1 && runs[0].length > 2) return `${DAY_NAMES[runs[0][0]]} a ${DAY_NAMES[runs[0].at(-1)]}`;
  const names = runs.flat().map(d => DAY_NAMES[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
// Texto de erro ou null. Vale para pedido novo e para troca de horário na edição.
export function validateScheduledAt(value, settings, now = new Date()) {
  if (typeof value !== 'string' || !value.trim())
    return 'Data de agendamento inválida.';
  const when = new Date(value);
  if (Number.isNaN(when.getTime()))
    return 'Data de agendamento inválida.';
  const minMinutes = Number(settings.minimum_schedule_minutes || 30);
  if (when.getTime() < now.getTime() + minMinutes * 60000)
    return `Agende com pelo menos ${minMinutes} minutos de antecedência.`;
  if (!isOpenAt(when, settings))
    return `A loja não abre nesse dia ou horário. Funcionamos de ${describeOpeningDays(settings)}, das ${settings.opening_time || '13:30'} às ${settings.closing_time || '22:00'}. Escolha um dos horários disponíveis.`;
  return null;
}
// Dias e horários que o cliente pode escolher agora.
export function buildScheduleSlots(settings, now = new Date(), { daysAhead = SCHEDULE_DAYS_AHEAD, step = SLOT_STEP_MINUTES } = {}) {
  const open = toMinutes(settings.opening_time || '13:30'), close = toMinutes(settings.closing_time || '22:00');
  const earliest = now.getTime() + Number(settings.minimum_schedule_minutes || 30) * 60000;
  const today = getLocalParts(now), days = [], labels = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' });
  const openDays = new Set(openingDaysOf(settings));
  for (let i = 0; i <= daysAhead; i++) {
    const base = new Date(Date.UTC(+today.year, +today.month - 1, +today.day + i));
    if (!openDays.has(base.getUTCDay()))
      continue;
    const slots = [];
    for (let t = open; t < close; t += step) {
      const at = saoPauloToDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), Math.floor(t / 60), t % 60);
      if (at.getTime() >= earliest && isOpenAt(at, settings))
        slots.push({ value: at.toISOString(), time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` });
    }
    if (slots.length)
      days.push({ date: base.toISOString().slice(0, 10), label: labels.format(base), slots });
  }
  return days;
}
