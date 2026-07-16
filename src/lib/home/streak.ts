/**
 * Current streak (SPEC.md §4 "below the fold": "current streak") — consecutive
 * calendar days, ending today or yesterday, with at least one completed
 * session. Ending *yesterday* still counts as live: a user who trained
 * yesterday and hasn't yet trained today shouldn't see their streak reset to
 * zero the moment midnight passes and before they've had a chance to train.
 * It only breaks once a full day is skipped.
 */
export function calculateStreak(completedAt: string[], now: number): number {
  const days = new Set(completedAt.map((iso) => dayKey(new Date(iso))));

  let cursor = new Date(now);
  if (!days.has(dayKey(cursor))) {
    cursor = addDays(cursor, -1);
  }

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function addDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}
