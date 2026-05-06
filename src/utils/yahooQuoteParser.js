const QUOTE_PRICE_REGEX = /<section data-testid="quote-price">[\s\S]*?<span class="price[^"]*" data-testid="qsp-price">\s*([^<\s]+(?:,[^<\s]+)*)\s*<\/span>/i;
const TITLE_REGEX = /<title>([^<]+?)\s*\(([^)]+)\)\s+Stock Price/i;
const MARKET_STATE_REGEX = /<div slot="marketTimeNotice"[^>]*>\s*<span[^>]*>\s*([^<]+?)\s*<\/span>/i;
const CURRENCY_REGEX = /currency\"\s*:\s*\"([^\"]+)\"/i;
const RATE_LIMIT_REGEX = /(Too Many Requests|Edge:\s*Too Many Requests)/i;

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
  const symbolScopedPrice = getSymbolScopedRegularMarketPrice(symbol, html);
  const priceMatch = html.match(QUOTE_PRICE_REGEX);
  if (!Number.isFinite(symbolScopedPrice) && !priceMatch) {
    throw new Error(`Unable to parse Yahoo Finance quote page for ${symbol}`);
  }

  const parsedPrice = Number.isFinite(symbolScopedPrice)
    ? symbolScopedPrice
    : parseNumber(priceMatch[1]);

  return {
    symbol,
    price: parsedPrice,
    currency: currencyMatch ? currencyMatch[1] : "USD",
    shortName: titleMatch ? titleMatch[1].trim() : symbol,
    marketState: marketStateMatch ? marketStateMatch[1].trim() : "UNKNOWN",
    source: "yahoo-finance-html",
    fetchedAt: new Date().toISOString(),
  };
};

const parseYahooQuoteFromHtml = (symbol, html) => parseFromQuoteMarkup(symbol, html);

module.exports = {
  parseYahooQuoteFromHtml,
};