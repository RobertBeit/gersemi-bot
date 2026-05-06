const axios = require("axios");

const { parseYahooQuoteFromHtml } = require("../utils/yahooQuoteParser");

const YAHOO_QUOTE_URL = "https://finance.yahoo.com/quote";

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://finance.yahoo.com/",
  "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  Expires: "0",
};

const fetchLatestQuoteFromHtml = async (normalizedSymbol) => {
  const bust = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const url = `${YAHOO_QUOTE_URL}/${encodeURIComponent(normalizedSymbol)}?p=${encodeURIComponent(normalizedSymbol)}&_=${bust}`;

  const response = await axios.get(url, {
    headers: COMMON_HEADERS,
    timeout: 30000,
  });

  return parseYahooQuoteFromHtml(normalizedSymbol, response.data);
};

const fetchLatestQuote = async (symbol) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  return fetchLatestQuoteFromHtml(normalizedSymbol);
};

module.exports = {
  fetchLatestQuote,
};