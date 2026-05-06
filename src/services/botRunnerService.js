const { fetchLatestQuote } = require("./yahooFinanceQuoteService");
const {
  createPaperPortfolio,
  resetPortfolioIfNeeded,
  executeTrade,
  appendEquityPoint,
  getPortfolioSnapshot,
} = require("./paperTradingService");
const { createRandomTradeDecision } = require("../strategies/randomTradeStrategy");

const TEST_TRADE_INTERVAL_MS = 10000;

const sessions = new Map();

const toPublicSession = (session) => ({
  symbol: session.symbol,
  startedAt: session.startedAt,
  updatedAt: session.updatedAt,
  updateSequence: session.updateSequence,
  pollIntervalMs: session.pollIntervalMs,
  pollHintMs: 10000,
  status: session.status,
  lastDecision: session.lastDecision,
  lastTrade: session.lastTrade,
  lastError: session.lastError,
  lastQuote: session.lastQuote,
  portfolio: getPortfolioSnapshot(session.portfolio, session.lastQuote, {
    tradeLimit: 100,
    historyLimit: 350,
  }),
  resets: session.portfolio.resets,
});

const runTradingCycle = async (session) => {
  if (session.isCycling) {
    return;
  }

  session.isCycling = true;

  try {
    const cycleExecutedAt = new Date().toISOString();
    const quote = await fetchLatestQuote(session.symbol);
    const portfolioSnapshot = getPortfolioSnapshot(session.portfolio, quote);
    const decision = createRandomTradeDecision({
      quote,
      portfolio: portfolioSnapshot,
    });
    const trade = executeTrade(session.portfolio, decision, quote, cycleExecutedAt);

    const wasReset = resetPortfolioIfNeeded(session.portfolio);
    if (wasReset) {
      session.lastError = `Portfolio reset triggered (reset #${session.portfolio.resets}): cash depleted to ${portfolioSnapshot.equity}. Restarted with $${session.portfolio.initialCash}`;
    }

    session.lastQuote = quote;
    session.lastDecision = decision;
    session.lastTrade = trade;
    appendEquityPoint(session.portfolio, quote);
    if (!wasReset) {
      session.lastError = null;
    }
    session.updatedAt = cycleExecutedAt;
    session.updateSequence += 1;
  } catch (error) {
    session.lastError = error.message || "Unknown trading cycle error";
    session.updatedAt = new Date().toISOString();
    session.updateSequence += 1;
  } finally {
    session.isCycling = false;
  }
};

const createSession = (symbol) => ({
  symbol,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  pollIntervalMs: TEST_TRADE_INTERVAL_MS,
  status: "running",
  updateSequence: 0,
  portfolio: createPaperPortfolio(),
  lastDecision: null,
  lastTrade: null,
  lastError: null,
  lastQuote: null,
  intervalId: null,
  isCycling: false,
});

const startBotSession = async (symbol) => {
  const existingSession = sessions.get(symbol);
  if (existingSession) {
    return toPublicSession(existingSession);
  }

  const session = createSession(symbol);
  sessions.set(symbol, session);

  await runTradingCycle(session);

  session.intervalId = setInterval(() => {
    runTradingCycle(session).catch((error) => {
      session.lastError = error.message || "Interval execution failed";
    });
  }, session.pollIntervalMs);

  return toPublicSession(session);
};

const stopBotSession = (symbol) => {
  const session = sessions.get(symbol);
  if (!session) {
    return null;
  }

  clearInterval(session.intervalId);
  session.status = "stopped";
  session.updatedAt = new Date().toISOString();
  sessions.delete(symbol);

  return toPublicSession(session);
};

const getSessionStatus = (symbol) => {
  const session = sessions.get(symbol);
  return session ? toPublicSession(session) : null;
};

const getAllSessionStatuses = () => Array.from(sessions.values()).map(toPublicSession);

module.exports = {
  startBotSession,
  stopBotSession,
  getSessionStatus,
  getAllSessionStatuses,
};