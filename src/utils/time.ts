export function formatResetTime(ms: number, resetTime: Date): string {
  if (ms <= 0) {
    return 'Ready';
  }
  const totalMinutes = Math.ceil(ms / 60000);
  let duration = '';
  if (totalMinutes < 60) {
    duration = `${totalMinutes}m`;
  } else if (totalMinutes < 1440) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    duration = `${hours}h ${mins}m`;
  } else {
    const days = Math.floor(totalMinutes / 1440);
    const remHours = Math.floor((totalMinutes % 1440) / 60);
    duration = remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }

  const month = String(resetTime.getMonth() + 1).padStart(2, '0');
  const day = String(resetTime.getDate()).padStart(2, '0');
  const year = resetTime.getFullYear();
  const hours = String(resetTime.getHours()).padStart(2, '0');
  const minutes = String(resetTime.getMinutes()).padStart(2, '0');

  return `${duration} (${month}/${day}/${year} ${hours}:${minutes})`;
}

export function drawProgressBar(percentage: number): string {
  const total = 10;
  const clamped = Math.max(0, Math.min(100, percentage));
  const filled = Math.round((clamped / 100) * total);
  const empty = total - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}
