const timeZone = 'Asia/Kolkata';
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone, day: '2-digit', month: '2-digit', year: 'numeric',
});
const eventDateFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone, day: 'numeric', month: 'short',
});
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
});

function validDate(value: string): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDate(date: Date): string {
  return dateFormatter.format(date).replaceAll('/', '-');
}

export function formatToDDMMYYYY(value = ''): string {
  if (/^\d{2}-\d{2}-\d{4}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('-');
  const date = validDate(value);
  return date ? formatDate(date) : '';
}

export function getTodayFormatted(): string {
  return formatDate(new Date());
}

export function formatEventDate(timestamp: string): string {
  const date = validDate(timestamp);
  if (!date) return 'Date unavailable';
  const parts = eventDateFormatter.formatToParts(date);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const month = parts.find((part) => part.type === 'month')?.value;
  const suffix = day >= 11 && day <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][day % 10] ?? 'th');
  return `${day}${suffix} ${month}`;
}

export function formatEventTime(timestamp: string): string {
  const date = validDate(timestamp);
  return date ? timeFormatter.format(date) : 'Time unavailable';
}
