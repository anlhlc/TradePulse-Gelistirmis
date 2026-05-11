/**
 * Binance API Controller
 * Handles proxy requests to Binance Futures API
 */

const logger = require('../utils/logger');

/**
 * Get force orders (liquidations)
 */
async function getLiquidations(req, res) {
  try {
    const { symbol, startTime, limit } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter required' });
    }

    const queryParams = new URLSearchParams({
      symbol: symbol.toUpperCase(),
      limit: limit || '100'
    });

    if (startTime) {
      queryParams.append('startTime', startTime);
    }

    const url = `https://fapi.binance.com/fapi/v1/forceOrders?${queryParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TradePulse/2.0'
      }
    });

    if (!response.ok) {
      logger.warn(`Binance API response code: ${response.status}`);
      return res.json([]);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('Liquidations proxy error:', error.message);
    res.json([]);
  }
}

/**
 * Generic Binance API proxy
 * Passes through any futures API endpoint
 */
async function proxyRequest(req, res) {
  try {
    const endpoint = req.params.endpoint;
    const queryString = new URLSearchParams(req.query).toString();
    const url = `https://fapi.binance.com/fapi/v1/${endpoint}${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TradePulse/2.0'
      }
    });

    if (!response.ok) {
      logger.warn(`Binance API error: ${response.status} for endpoint ${endpoint}`);
      return res.status(response.status).json({ error: 'Binance API hatası' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    logger.error('Binance proxy hatası:', error.message);
    res.status(500).json({ error: 'Proxy hatası' });
  }
}

module.exports = {
  getLiquidations,
  proxyRequest
};
