const {
  startBotSession,
  stopBotSession,
  getSessionStatus,
  getAllSessionStatuses,
} = require("../services/botRunnerService");
const { fetchLatestQuote } = require("../services/yahooFinanceQuoteService");

const normalizeSymbol = (symbol) => (symbol || "").trim().toUpperCase();

const startBot = async (request, response) => {
  const symbol = normalizeSymbol(request.body?.symbol);

  if (!symbol) {
    return response.status(400).json({ error: "symbol is required" });
  }

  try {
    const session = await startBotSession(symbol);
    return response.status(200).json(session);
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Failed to start bot session",
    });
  }
};

const stopBot = (request, response) => {
  const symbol = normalizeSymbol(request.body?.symbol);

  if (!symbol) {
    return response.status(400).json({ error: "symbol is required" });
  }

  const stopped = stopBotSession(symbol);
  if (!stopped) {
    return response.status(404).json({ error: `No active session for ${symbol}` });
  }

  return response.status(200).json(stopped);
};

const getBotStatus = (request, response) => {
  const symbol = normalizeSymbol(request.params?.symbol);
  const sinceUpdatedAt = request.query?.sinceUpdatedAt;

  if (!symbol) {
    return response.status(200).json({ sessions: getAllSessionStatuses() });
  }

  const session = getSessionStatus(symbol);
  if (!session) {
    return response.status(404).json({ error: `No session found for ${symbol}` });
  }

  if (sinceUpdatedAt && session.updatedAt && session.updatedAt <= sinceUpdatedAt) {
    return response.status(200).json({
      symbol,
      unchanged: true,
      updatedAt: session.updatedAt,
      updateSequence: session.updateSequence,
      pollHintMs: session.pollHintMs,
      status: session.status,
    });
  }

  return response.status(200).json(session);
};

const getLatestQuote = async (request, response) => {
  const symbol = normalizeSymbol(request.params?.symbol);

  if (!symbol) {
    return response.status(400).json({ error: "symbol is required" });
  }

  try {
    const quote = await fetchLatestQuote(symbol);
    return response.status(200).json(quote);
  } catch (error) {
    return response.status(500).json({
      error: error.message || "Failed to fetch latest quote",
    });
  }
};

module.exports = {
  startBot,
  stopBot,
  getBotStatus,
  getLatestQuote,
};