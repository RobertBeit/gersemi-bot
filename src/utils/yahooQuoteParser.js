const QUOTE_PRICE_REGEX = /<section data-testid="quote-price">[\s\S]*?<span class="price[^"]*" data-testid="qsp-price">\s*([^<\s]+(?:,[^<\s]+)*)\s*<\/span>/i;
const TITLE_REGEX = /<title>([^<]+?)\s*\(([^)]+)\)\s+Stock Price/i;
const MARKET_STATE_REGEX = /<div slot="marketTimeNotice"[^>]*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/i;
const CURRENCY_REGEX = /currency\"\s*:\s*\"([^\"]+)\"/i;
const RATE_LIMIT_REGEX = /(Too Many Requests|Edge:\s*Too Many Requests)/i;
const MAX_OPEN_MARKET_QUOTE_AGE_SECONDS = 120;

const parseNumber = (value) => Number(String(value).replace(/,/g, ""));

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getSymbolScopedRegularMarketPrice = (symbol, html) => {
  const escaped = escapeRegex(symbol.toUpperCase());

  const symbolFirstPattern = new RegExp(
    `"symbol"\\s*:\\s*"${escaped}"[\\s\\S]{0,1500}?"regularMarketPrice"\\s*:\\s*\\{\\s*"raw"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`,
    "i"
  );
  const priceFirstPattern = new RegExp(
    `"regularMarketPrice"\\s*:\\s*\\{\\s*"raw"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)[\\s\\S]{0,1500}?"symbol"\\s*:\\s*"${escaped}"`,
    "i"
  );

  const symbolFirstMatch = html.match(symbolFirstPattern);
  if (symbolFirstMatch) {
    return Number(symbolFirstMatch[1]);
  }

  const priceFirstMatch = html.match(priceFirstPattern);
  if (priceFirstMatch) {
    return Number(priceFirstMatch[1]);
  }

  return null;
};

const getSymbolQuoteWindow = (symbol, html) => {
  const escaped = escapeRegex(symbol.toUpperCase());
  const symbolPattern = new RegExp(`"symbol"\\s*:\\s*"${escaped}"`, "i");
  const match = symbolPattern.exec(html);
  if (!match || typeof match.index !== "number") {
    return null;
  }

  const start = Math.max(0, match.index - 2000);
  const end = Math.min(html.length, match.index + 12000);
  return html.slice(start, end);
};

const readRawPrice = (block, key) => {
  if (!block) return null;
  const pattern = new RegExp(`"${escapeRegex(key)}"\\s*:\\s*\\{\\s*"raw"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i");
  const match = block.match(pattern);
  return match ? Number(match[1]) : null;
};

const readRawTimestamp = (block, key) => {
  if (!block) return null;
  const pattern = new RegExp(`"${escapeRegex(key)}"\\s*:\\s*\\{\\s*"raw"\\s*:\\s*([0-9]{10})`, "i");
  const match = block.match(pattern);
  return match ? Number(match[1]) : null;
};

const readStringField = (block, key) => {
  if (!block) return null;
  const pattern = new RegExp(`"${escapeRegex(key)}"\\s*:\\s*"([^\"]+)"`, "i");
  const match = block.match(pattern);
  return match ? match[1] : null;
};

const parseMarketStateTimestamp = (marketStateText) => {
  if (!marketStateText) return null;

  const match = marketStateText.match(/As of\s+(\d{1,2}:\d{2}:\d{2}\s+[AP]M)\s+([A-Z]{3})/i);
  if (!match) return null;

  const timePart = match[1];
  const tzAbbrev = match[2];
  const nyDate = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const parsed = new Date(`${nyDate} ${timePart} ${tzAbbrev}`);

  return Number.isFinite(parsed.getTime()) ? Math.floor(parsed.getTime() / 1000) : null;
};

const pickMostRecentQuote = ({
  marketState,
  regularPrice,
  regularTime,
  prePrice,
  preTime,
  postPrice,
  postTime,
}) => {
  const normalizedState = String(marketState || "").toUpperCase();

  if (normalizedState.includes("REGULAR") && Number.isFinite(regularPrice)) {
    return { price: regularPrice, quoteTime: regularTime };
  }

  if (normalizedState.includes("PRE") && Number.isFinite(prePrice)) {
    return { price: prePrice, quoteTime: preTime };
  }

  if (normalizedState.includes("POST") && Number.isFinite(postPrice)) {
    return { price: postPrice, quoteTime: postTime };
  }

  if (Number.isFinite(postPrice)) return { price: postPrice, quoteTime: postTime };
  if (Number.isFinite(prePrice)) return { price: prePrice, quoteTime: preTime };
  if (Number.isFinite(regularPrice)) return { price: regularPrice, quoteTime: regularTime };

  return { price: null, quoteTime: null };
};

const parseFromQuoteMarkup = (symbol, html) => {
  if (!html || RATE_LIMIT_REGEX.test(html)) {
    throw new Error(`Yahoo Finance rate-limited quote page for ${symbol}`);
  }

  const titleMatch = html.match(TITLE_REGEX);
  const titleSymbol = titleMatch?.[2]?.trim()?.toUpperCase();
  if (titleSymbol && titleSymbol !== symbol.toUpperCase()) {
    throw new Error(`Yahoo quote page symbol mismatch. Expected ${symbol}, found ${titleSymbol}`);
  }

  const marketStateMatch = html.match(MARKET_STATE_REGEX);
  const currencyMatch = html.match(CURRENCY_REGEX);
  const symbolWindow = getSymbolQuoteWindow(symbol, html);
  const symbolScopedPrice = getSymbolScopedRegularMarketPrice(symbol, html);
  const regularPrice = readRawPrice(symbolWindow, "regularMarketPrice");
  const regularTime = readRawTimestamp(symbolWindow, "regularMarketTime");
  const prePrice = readRawPrice(symbolWindow, "preMarketPrice");
  const preTime = readRawTimestamp(symbolWindow, "preMarketTime");
  const postPrice = readRawPrice(symbolWindow, "postMarketPrice");
  const postTime = readRawTimestamp(symbolWindow, "postMarketTime");
  const symbolMarketState = readStringField(symbolWindow, "marketState");
  const marketState = symbolMarketState || (marketStateMatch ? marketStateMatch[1].trim() : "UNKNOWN");
  const mostRecentSymbolQuote = pickMostRecentQuote({
    marketState,
    regularPrice,
    regularTime,
    prePrice,
    preTime,
    postPrice,
    postTime,
  });
  const priceMatch = html.match(QUOTE_PRICE_REGEX);
  if (!Number.isFinite(mostRecentSymbolQuote.price) && !Number.isFinite(symbolScopedPrice) && !priceMatch) {
    throw new Error(`Unable to parse Yahoo Finance quote page for ${symbol}`);
  }

  const quoteSectionPrice = priceMatch ? parseNumber(priceMatch[1]) : null;
  const parsedPrice = Number.isFinite(quoteSectionPrice)
    ? quoteSectionPrice
    : Number.isFinite(mostRecentSymbolQuote.price)
      ? mostRecentSymbolQuote.price
      : Number.isFinite(symbolScopedPrice)
        ? symbolScopedPrice
        : null;

  if (!Number.isFinite(parsedPrice)) {
    throw new Error(`Unable to parse numeric Yahoo quote for ${symbol}`);
  }

  const marketOpen = /market\s+open/i.test(marketState) || String(marketState).toUpperCase().includes("REGULAR");
  const marketStateEpoch = parseMarketStateTimestamp(marketState);
  const effectiveQuoteEpoch = Number.isFinite(mostRecentSymbolQuote.quoteTime)
    ? mostRecentSymbolQuote.quoteTime
    : marketStateEpoch;
  const quoteAgeSeconds = Number.isFinite(effectiveQuoteEpoch)
    ? Math.floor(Date.now() / 1000) - effectiveQuoteEpoch
    : null;

  const isStale = marketOpen
    ? !Number.isFinite(quoteAgeSeconds) || quoteAgeSeconds > MAX_OPEN_MARKET_QUOTE_AGE_SECONDS
    : false;

  return {
    symbol,
    price: parsedPrice,
    currency: currencyMatch ? currencyMatch[1] : "USD",
    shortName: titleMatch ? titleMatch[1].trim() : symbol,
    marketState,
    source: "yahoo-finance-html",
    quoteTimestamp: Number.isFinite(effectiveQuoteEpoch)
      ? new Date(effectiveQuoteEpoch * 1000).toISOString()
      : null,
    quoteAgeSeconds: Number.isFinite(quoteAgeSeconds) ? quoteAgeSeconds : null,
    isStale,
    fetchedAt: new Date().toISOString(),
  };
};

const parseYahooQuoteFromHtml = (symbol, html) => parseFromQuoteMarkup(symbol, html);

module.exports = {
  parseYahooQuoteFromHtml,
};