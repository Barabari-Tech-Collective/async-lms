/**
 * Unified grade calculation helper.
 * Computes normalized score (0-100%) from rubric breakdown when available,
 * with fallback to raw marks.
 */
export function getEffectiveScore(item: any): number | null {
  if (!item) return null;
  const status = (item.status || '').toLowerCase();
  if (
    status === 'evaluating' ||
    status === 'pending' ||
    status === 'running' ||
    status === 'unevaluated' ||
    status === 'cancelled' ||
    status === 'stopped' ||
    status === 'failed'
  ) {
    return null;
  }

  let breakdown = null;
  if (item.feedback) {
    let fb = item.feedback;
    if (typeof fb === 'string') {
      try { fb = JSON.parse(fb); } catch {}
    }
    if (fb && typeof fb === 'object') {
      breakdown = fb.breakdown || fb.rubric_breakdown;
    }
  }

  if (Array.isArray(breakdown) && breakdown.length > 0) {
    const max = breakdown.reduce((acc: number, it: any) => acc + Number(it.max ?? it.max_marks ?? it.weight ?? 0), 0);
    const sum = breakdown.reduce((acc: number, it: any) => acc + Number(it.score ?? it.awarded ?? it.points ?? it.marks ?? 0), 0);
    if (max > 0) {
      return Math.min(100, Math.round((sum / max) * 100 * 100) / 100);
    }
    if (!isNaN(sum) && sum > 0) return Math.min(100, Math.round(sum * 100) / 100);
  }

  return Number(item.marks ?? 0);
}

