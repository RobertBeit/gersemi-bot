const axios = require("axios");

const { parseYahooQuoteFromHtml } = require("../utils/yahooQuoteParser");

const STOOQ_URL = "https://stooq.com/q/l/";
const YAHOO_QUOTE_URL = "https://finance.yahoo.com/quote";

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

// Primary: Stooq CSV — free, no API key, real-time prices during market hours.
const fetchLatestQuoteFromStooq = async (normalizedSymbol) => {
  const stooqSymbol = `${normalizedSymbol.toLowerCase()}.us`;
  const response = await axios.get(STOOQ_URL, {
    params: { s: stooqSymbol, f: "sd2t2ohlcvn", h: "", e: "csv" },
    headers: { ...COMMON_HEADERS, Accept: "text/csv,text/plain,*/*" },
    timeout: 10000,
  });

  const text = String(response.data || "").trim();
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error(`Stooq returned no data for ${normalizedSymbol}`);
  }

  // Symbol,Date,Time,Open,High,Low,Close,Volume,Name
  const parts = lines[1].split(",");
  const close = Number(parts[6]);
  const dateStr = String(parts[1] || "").trim();
  const timeStr = String(parts[2] || "").trim();
  const shortName = (parts[8] || "").trim() || normalizedSymbol;

  if (!Number.isFinite(close) || close <= 0) {
    throw new Error(`Stooq returned invalid price for ${normalizedSymbol}: ${parts[6]}`);
  }

  let quoteTimestamp = null;
  let quoteAgeSeconds = null;
  if (dateStr && timeStr) {
    // Stooq timestamps are in CET/CEST (UTC+1/+2). Try UTC+2 (CEST summer) first,
    // then UTC+1, and pick whichever gives a non-future, same-day result.
    const offsets = ["+02:00", "+01:00", "+00:00"];
    for (const offset of offsets) {
      const parsed = new Date(`${dateStr}T${timeStr}${offset}`);
      if (!Number.isFinite(parsed.getTime())) continue;
      const ageMs = Date.now() - parsed.getTime();
      if (ageMs >= 0 && ageMs < 86400000) { // non-future, within 24h
        quoteTimestamp = parsed.toISOString();
        quoteAgeSeconds = Math.floor(ageMs / 1000);
        break;
      }
    }
    // If still null, just record the timestamp without age
    if (!quoteTimestamp) {
      const parsed = new Date(`${dateStr}T${timeStr}+02:00`);
      quoteTimestamp = Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }
  }

  const isStale = Number.isFinite(quoteAgeSeconds) && quoteAgeSeconds > 120;

  return {
    symbol: normalizedSymbol,
    price: close,
    currency: "USD",
    shortName,
    marketState: "REGULAR",
    source: "stooq-csv",
    quoteTimestamp,
    quoteAgeSeconds,
    isStale,
    fetchedAt: new Date().toISOString(),
  };
};

// Fallback: Yahoo Finance HTML scraping if Stooq is unavailable.
const fetchLatestQuoteFromHtml = async (normalizedSymbol) => {
  const bust = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const url = `${YAHOO_QUOTE_URL}/${encodeURIComponent(normalizedSymbol)}?p=${encodeURIComponent(normalizedSymbol)}&_=${bust}`;
  const response = await axios.get(url, {
    headers: { ...COMMON_HEADERS, Accept: "text/html,application/xhtml+xml,*/*", Referer: "https://finance.yahoo.com/" },
    timeout: 30000,
  });
  return parseYahooQuoteFromHtml(normalizedSymbol, response.data);
};

const fetchLatestQuote = async (symbol) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  try {
    return await fetchLatestQuoteFromStooq(normalizedSymbol);
  } catch (stooqError) {
    const htmlQuote = await fetchLatestQuoteFromHtml(normalizedSymbol);
    htmlQuote.stooqError = stooqError?.message || "stooq unavailable";
    return htmlQuote;
  }
};

module.exports = {
  fetchLatestQuote,
};
