const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

module.exports = {
  port: parseNumber(process.env.PORT, 3002),
  pollIntervalMs: parseNumber(process.env.BOT_POLL_INTERVAL_MS, 10000),
  initialCash: parseNumber(process.env.BOT_INITIAL_CASH, 10000),
};