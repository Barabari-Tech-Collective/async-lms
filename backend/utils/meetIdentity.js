function normalizeMeetUserId(value) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.startsWith('users/') ? trimmed : `users/${trimmed}`;
}

module.exports = { normalizeMeetUserId };
