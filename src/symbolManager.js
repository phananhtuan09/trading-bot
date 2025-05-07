const { binanceClient } = require('./clients')
const { STRATEGY_CONFIG } = require('./config')
const { log } = require('./utils')

let symbolCache = {
  lastUpdated: 0,
  symbols: [],
}

async function fetchAllSymbols() {
  try {
    log('log', '🔄 Đang cập nhật danh sách symbols cho futures...')
    const exchangeInfo = await binanceClient.futuresExchangeInfo()

    const validSymbols = exchangeInfo.symbols
      .filter(
        (s) =>
          s.status === 'TRADING' && // Chỉ lấy symbol đang giao dịch
          s.contractType === 'PERPETUAL' && // Chỉ lấy hợp đồng perpetual
          s.quoteAsset === 'USDT', // Quote asset là USDT
      )
      .map((s) => s.symbol)

    symbolCache = {
      lastUpdated: Date.now(),
      symbols: validSymbols,
    }

    log('log', `✅ Đã cập nhật ${validSymbols.length} symbols cho futures`)
    return validSymbols
  } catch (error) {
    log('error', '❌ Lỗi cập nhật symbols cho futures:', error.message)
    return []
  }
}

async function getSymbols() {
  if (Date.now() - symbolCache.lastUpdated > STRATEGY_CONFIG.EXCHANGE_INFO_CACHE_TIME) {
    return await fetchAllSymbols()
  }
  return symbolCache.symbols
}

module.exports = { fetchAllSymbols, getSymbols }
