const getRandomDecimal = (minimum, maximum) => {
  return minimum + Math.random() * (maximum - minimum);
};

const createRandomTradeDecision = ({ quote, portfolio }) => {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    return {
      action: "hold",
      quantity: 0,
      reason: "Missing quote price",
    };
  }

  const maxAffordableShares = portfolio.cash / quote.price;
  const proposedQuantity = Number(getRandomDecimal(0.1, 5).toFixed(4));

  const canBuy = maxAffordableShares > 0.1;
  const canSell = portfolio.positionShares > 0.0001;

  if (canBuy && (!canSell || Math.random() < 0.5)) {
    const buyQuantity = Math.min(proposedQuantity, maxAffordableShares);
    return {
      action: "buy",
      quantity: Number(buyQuantity.toFixed(4)),
      reason: "Random strategy selected buy",
    };
  }

  if (canSell) {
    const sellQuantity = Math.min(proposedQuantity, portfolio.positionShares);
    return {
      action: "sell",
      quantity: Number(sellQuantity.toFixed(4)),
      reason: "Random strategy selected sell",
    };
  }

  return {
    action: "hold",
    quantity: 0,
    reason: "No valid trade available",
  };
};

module.exports = {
  createRandomTradeDecision,
};