/**
 * Date and Time utilities for deadline and timestamp formatting
 */

/**
 * Converts a Date object or ISO string into a local 'YYYY-MM-DDTHH:mm' string
 * suitable for <input type="datetime-local" />.
 */
export function toLocalDatetimeInputString(dateInput?: Date | string | null): string {
  if (!dateInput) return '';
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dt.getTime())) return '';

  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const hours = String(dt.getHours()).padStart(2, '0');
  const minutes = String(dt.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Formats a Date or date string to a human-readable "MMM d, yyyy, h:mm a" format.
 * Example: "Oct 25, 2026, 05:30 PM"
 */
export function formatDateTime(
  dateInput?: Date | string | null,
  fallback = 'No Due Date',
): string {
  if (!dateInput) return fallback;
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dt.getTime())) return fallback;

  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a Date or date string to "MMM d, yyyy".
 * Example: "Oct 25, 2026"
 */
export function formatDate(
  dateInput?: Date | string | null,
  fallback = 'No Due Date',
): string {
  if (!dateInput) return fallback;
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dt.getTime())) return fallback;

  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Checks whether a given date is in the past.
 */
export function isPastDate(dateInput?: Date | string | null): boolean {
  if (!dateInput) return false;
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dt.getTime())) return false;
  return dt.getTime() < Date.now();
}

/**
 * Returns formatted relative due time and status.
 */
export function getDueStatus(dateInput?: Date | string | null): {
  isOverdue: boolean;
  label: string;
} {
  if (!dateInput) return { isOverdue: false, label: 'No Due Date' };
  const dt = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(dt.getTime())) return { isOverdue: false, label: 'No Due Date' };

  const diff = dt.getTime() - Date.now();
  if (diff <= 0) {
    const overdueMs = Math.abs(diff);
    const overdueDays = Math.floor(overdueMs / (1000 * 60 * 60 * 24));
    const overdueHours = Math.floor(
      (overdueMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    if (overdueDays > 0) {
      return { isOverdue: true, label: `Overdue by ${overdueDays}d` };
    }
    if (overdueHours > 0) {
      return { isOverdue: true, label: `Overdue by ${overdueHours}h` };
    }
    return { isOverdue: true, label: 'Overdue' };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
  );
  if (days > 1) {
    return { isOverdue: false, label: `Due in ${days} days` };
  }
  if (days === 1) {
    return { isOverdue: false, label: `Due tomorrow` };
  }
  if (hours > 0) {
    return { isOverdue: false, label: `Due in ${hours}h` };
  }
  return { isOverdue: false, label: `Due soon` };
}
