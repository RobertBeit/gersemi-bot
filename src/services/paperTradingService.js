const { initialCash } = require("../config/env");

const createPaperPortfolio = () => ({
  cash: initialCash,
  positionShares: 0,
  averageCost: 0,
  trades: [],
  equityHistory: [],
  realizedPnl: 0,
  resets: 0,
  initialCash,
});

const resetPortfolioIfNeeded = (portfolio) => {
  if (portfolio.cash <= 0) {
    portfolio.cash = portfolio.initialCash;
    portfolio.positionShares = 0;
    portfolio.averageCost = 0;
    portfolio.resets += 1;
    return true;
  }
  return false;
};

const createTradeRecord = ({ symbol, side, quantity, price, reason, executedAt }) => ({
  id: `${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  symbol,
  side,
  quantity,
  price,
  notional: Number((quantity * price).toFixed(2)),
  reason,
  executedAt: executedAt || new Date().toISOString(),
});

const getPnlSnapshot = (portfolio, quote) => {
  const markPrice = quote?.price || 0;
  const marketValue = Number((portfolio.positionShares * markPrice).toFixed(2));
  const unrealizedPnl = Number(((markPrice - portfolio.averageCost) * portfolio.positionShares).toFixed(2));
  const totalPnl = Number((portfolio.realizedPnl + unrealizedPnl).toFixed(2));
  const returnPct = portfolio.initialCash > 0
    ? Number(((totalPnl / portfolio.initialCash) * 100).toFixed(2))
    : 0;

  return {
    realizedPnl: Number(portfolio.realizedPnl.toFixed(2)),
    unrealizedPnl,
    totalPnl,
    returnPct,
    marketValue,
  };
};

const appendEquityPoint = (portfolio, quote) => {
  const pnl = getPnlSnapshot(portfolio, quote);
  const point = {
    timestamp: new Date().toISOString(),
    equity: Number((portfolio.cash + pnl.marketValue).toFixed(2)),
    cash: portfolio.cash,
    marketValue: pnl.marketValue,
    totalPnl: pnl.totalPnl,
    realizedPnl: pnl.realizedPnl,
    unrealizedPnl: pnl.unrealizedPnl,
    returnPct: pnl.returnPct,
    price: quote?.price || null,
  };

  portfolio.equityHistory.push(point);
  if (portfolio.equityHistory.length > 800) {
    portfolio.equityHistory.splice(0, portfolio.equityHistory.length - 800);
  }

  return point;
};

const executeTrade = (portfolio, decision, quote, executedAt) => {
  if (!decision || decision.action === "hold" || decision.quantity <= 0) {
    return null;
  }

  const quantity = Number(decision.quantity);
  const price = Number(quote.price);

  if (decision.action === "buy") {
    const totalCost = quantity * price;
    if (totalCost > portfolio.cash) {
      return null;
    }

    const totalShares = portfolio.positionShares + quantity;
    const totalPositionCost = portfolio.averageCost * portfolio.positionShares + totalCost;

    portfolio.cash = Number((portfolio.cash - totalCost).toFixed(2));
    portfolio.positionShares = Number((totalShares).toFixed(4));
    portfolio.averageCost = Number((totalPositionCost / totalShares).toFixed(4));

    const trade = createTradeRecord({
      symbol: quote.symbol,
      side: "buy",
      quantity,
      price,
      reason: decision.reason,
      executedAt,
    });
    portfolio.trades.unshift(trade);
    return trade;
  }

  if (decision.action === "sell") {
    if (quantity > portfolio.positionShares) {
      return null;
    }

    const proceeds = quantity * price;
    portfolio.cash = Number((portfolio.cash + proceeds).toFixed(2));
    const realizedPnl = Number(((price - portfolio.averageCost) * quantity).toFixed(2));
    portfolio.realizedPnl = Number((portfolio.realizedPnl + realizedPnl).toFixed(2));
    portfolio.positionShares = Number((portfolio.positionShares - quantity).toFixed(4));
    if (Math.abs(portfolio.positionShares) < 0.0001) {
      portfolio.positionShares = 0;
      portfolio.averageCost = 0;
    }

    const trade = createTradeRecord({
      symbol: quote.symbol,
      side: "sell",
      quantity,
      price,
      reason: decision.reason,
      executedAt,
    });
    trade.realizedPnl = realizedPnl;
    portfolio.trades.unshift(trade);
    return trade;
  }

  return null;
};

const getPortfolioSnapshot = (portfolio, quote, options = {}) => {
  const tradeLimit = options.tradeLimit ?? 25;
  const historyLimit = options.historyLimit ?? 250;
  const pnl = getPnlSnapshot(portfolio, quote);
  return {
    cash: portfolio.cash,
    initialCash: portfolio.initialCash,
    positionShares: portfolio.positionShares,
    averageCost: portfolio.averageCost,
    marketValue: pnl.marketValue,
    equity: Number((portfolio.cash + pnl.marketValue).toFixed(2)),
    realizedPnl: pnl.realizedPnl,
    unrealizedPnl: pnl.unrealizedPnl,
    totalPnl: pnl.totalPnl,
    returnPct: pnl.returnPct,
    tradeCount: portfolio.trades.length,
    trades: portfolio.trades.slice(0, tradeLimit),
    equityHistory: portfolio.equityHistory.slice(-historyLimit),
  };
};

module.exports = {
  createPaperPortfolio,
  resetPortfolioIfNeeded,
  executeTrade,
  appendEquityPoint,
  getPnlSnapshot,
  getPortfolioSnapshot,
};