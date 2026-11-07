export function money(cents) { return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
export function getLocalParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
export function isOpenAt(date, settings) {
  const p = getLocalParts(date);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[p.weekday];
  const days = (settings.opening_days || '2,3,4,5,6,0').split(',').map(Number);
  const hm = `${p.hour}:${p.minute}`;
  return days.includes(day) && hm >= (settings.opening_time || '13:30') && hm < (settings.closing_time || '22:00');
}
