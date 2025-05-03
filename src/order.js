const { performScan } = require('../src/scanner')
const { ORDER_SETTINGS, CONFIG } = require('../src/config')
const { binanceClient } = require('../src/clients')
const { sendTelegramMessage } = require('../src/telegramService')
const stateManager = require('../src/stateManager')
const telegramCommands = require('../src/telegramCommands')

class Order {
  constructor() {
    this.isRunning = false
    this.dailyOrderLimit = ORDER_SETTINGS.MAX_ORDERS_PER_DAY || Infinity
    this.scanOrderLimit = ORDER_SETTINGS.ORDER_LIMIT_PER_SCAN || Infinity
  }

  async checkExistingPosition(symbol) {
    try {
      const positions = await binanceClient.futuresPositionRisk()
      return positions.some((p) => p.symbol === symbol && Math.abs(parseFloat(p.positionAmt)) > 0)
    } catch (error) {
      console.error('Lỗi kiểm tra vị thế:', error)
      return false
    }
  }

  async logBalance() {
    try {
      const balances = await binanceClient.futuresAccountBalance()
      const usdtBalance = balances.find((b) => b.asset === 'USDT')

      const walletBalance = parseFloat(usdtBalance.balance)
      const availableBalance = parseFloat(usdtBalance.availableBalance)

      const { initialCapital } = stateManager.getState()
      const currentCapital = initialCapital ?? walletBalance

      if (!initialCapital) {
        stateManager.setStateAndSaveToFile({
          initialCapital: walletBalance,
        })
      }

      const unrealizedProfit = await this.getUnrealizedProfit()
      const currentTotal = walletBalance + unrealizedProfit

      const profit = currentTotal - currentCapital
      const profitPercent = ((profit / currentCapital) * 100).toFixed(2)

      const profitMessage = `
💰 Số dư khả dụng: ${availableBalance.toFixed(2)} USDT
📈 Lợi nhuận: ${isNaN(profit) ? 0 : profit.toFixed(2)} USDT (${isNaN(profitPercent) ? 0 : profitPercent}%)
      `
      return {
        availableBalance,
        profit: isNaN(profit) ? 0 : profit.toFixed(2),
        profitPercent: isNaN(profitPercent) ? 0 : profitPercent,
      }
    } catch (error) {
      console.error('Lỗi khi log balance:', error)
      await sendTelegramMessage(`🔴 Lỗi khi kiểm tra balance: ${error.message}`)
      return { availableBalance: 0, profit: 0, profitPercent: 0 }
    }
  }

  async getUnrealizedProfit() {
    const positions = await binanceClient.futuresPositionRisk()
    return positions.reduce((sum, p) => sum + parseFloat(p.unrealizedProfit), 0)
  }

  async placeOrder(signal) {
    const { orderPlacementEnabled, ordersPlacedToday, totalOrders, totalCapital } = stateManager.getState()
    if (!orderPlacementEnabled) return
    if (ordersPlacedToday >= this.dailyOrderLimit) {
      const limitMessage = `⚠️ Đạt giới hạn ${this.dailyOrderLimit} lệnh/ngày`
      //  console.log(limitMessage)
      await sendTelegramMessage(limitMessage)
      return
    }
    const { symbol, price, decision, TP_ROI, SL_ROI } = signal

    if (await this.checkExistingPosition(symbol)) {
      const existMessage = `🟡 Bỏ qua ${symbol} - Đang có vị thế mở`
      //  console.log(existMessage)
      await sendTelegramMessage(existMessage)
      return
    }

    try {
      // Kiểm tra margin type
      await this.setMarginType(symbol)

      // Đặt lệnh chính
      const { quantity, side } = await this.prepareOrder(symbol, price, decision)
      await binanceClient.futuresOrder({ symbol, side, type: 'MARKET', quantity })
      let tpPriceOrder
      let slPriceOrder

      // Đặt TP/SL
      try {
        const { tpPrice, slPrice } = await this.setTPSL(symbol, side, price, TP_ROI, SL_ROI)
        tpPriceOrder = tpPrice
        slPriceOrder = slPrice
      } catch (tpSlError) {
        await this.closePositionImmediately(symbol, quantity, side)
        throw new Error(`Lỗi TP/SL: ${tpSlError.message}`)
      }

      stateManager.setStateAndSaveToFile({
        ordersPlacedToday: ordersPlacedToday + 1,
        totalOrders: totalOrders + 1,
        totalCapital: totalCapital + ORDER_SETTINGS.QUANTITY,
      })
      const orderMessage = `📈 Đã mở ${side} ${symbol} | Giá vào: ${price.toFixed(4)} | SL: ${slPriceOrder.toFixed(
        4,
      )} | TP: ${tpPriceOrder.toFixed(4)} | KL: ${quantity}`
      //  console.log(orderMessage)
      await sendTelegramMessage(orderMessage)
    } catch (error) {
      await this.handleOrderError(error, symbol)
    }
  }

  async closePositionImmediately(symbol, quantity, side) {
    try {
      const closeSide = side === 'BUY' ? 'SELL' : 'BUY'
      await binanceClient.futuresOrder({
        symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: Math.abs(quantity),
      })
      await sendTelegramMessage(`⚠️ Đã đóng lệnh ${symbol} do lỗi TP/SL`)
    } catch (closeError) {
      await sendTelegramMessage(`🔴 Lỗi khi đóng lệnh ${symbol}: ${closeError.message}`)
    }
  }

  async setMarginType(symbol) {
    try {
      await binanceClient.futuresMarginType({ symbol, marginType: 'ISOLATED' })
    } catch (error) {
      if (!error.message.includes('No need')) {
        await sendTelegramMessage(`🔴 Lỗi set margin type cho ${symbol}: ${error.message}`)
        throw error
      }
    }
  }

  async prepareOrder(symbol, price, decision) {
    const quantity = await this.calculateQuantity(symbol, price)
    if (quantity <= 0) throw new Error('Số lượng không hợp lệ')

    await binanceClient.futuresLeverage({
      symbol,
      leverage: ORDER_SETTINGS.LEVERAGE,
    })

    return {
      quantity,
      side: decision === 'Long' ? 'BUY' : 'SELL',
    }
  }

  async calculateQuantity(symbol, price) {
    const exchangeInfo = await binanceClient.futuresExchangeInfo()
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol)
    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE')
    return (
      Math.floor((ORDER_SETTINGS.QUANTITY * ORDER_SETTINGS.LEVERAGE) / price / lotSizeFilter.stepSize) *
      lotSizeFilter.stepSize
    )
  }

  async setTPSL(symbol, side, entryPrice, TP_ROI, SL_ROI) {
    try {
      const { tp: tpPriceRaw, sl: slPriceRaw } = this.calculateTpSlPrices({
        entryPrice,
        tpRoiPercent: TP_ROI,
        slRoiPercent: Math.abs(SL_ROI),
        side,
      })

      let tpPrice = tpPriceRaw
      let slPrice = slPriceRaw
      const symbolInfo = (await binanceClient.futuresExchangeInfo()).symbols.find((s) => s.symbol === symbol)
      const priceFilter = symbolInfo.filters.find((f) => f.filterType === 'PRICE_FILTER')
      const tickSize = parseFloat(priceFilter.tickSize)
      tpPrice = Math.round(tpPrice / tickSize) * tickSize
      slPrice = Math.round(slPrice / tickSize) * tickSize
      await this.placeTPSLOrder(symbol, side, tpPrice, 'TAKE_PROFIT_MARKET')
      await this.placeTPSLOrder(symbol, side, slPrice, 'STOP_MARKET')
      return { tpPrice, slPrice }
    } catch (error) {
      await sendTelegramMessage(`🔴 Lỗi đặt TP/SL cho ${symbol}: ${error.message}`)
      throw error
    }
  }

  calculateTpSlPrices({ entryPrice, tpRoiPercent, slRoiPercent, side }) {
    const tpChange = tpRoiPercent / ORDER_SETTINGS.LEVERAGE / 100
    const slChange = slRoiPercent / ORDER_SETTINGS.LEVERAGE / 100

    if (side === 'BUY') {
      return {
        tp: entryPrice * (1 + tpChange),
        sl: entryPrice * (1 - slChange),
      }
    } else {
      return {
        tp: entryPrice * (1 - tpChange),
        sl: entryPrice * (1 + slChange),
      }
    }
  }

  placeTPSLOrder(symbol, side, price, type) {
    return binanceClient.futuresOrder({
      symbol,
      side: side === 'BUY' ? 'SELL' : 'BUY',
      type,
      stopPrice: price.toFixed(4),
      closePosition: true,
    })
  }

  async handleOrderError(error, symbol) {
    const message = `🔴 Lỗi đặt lệnh ${symbol}: ${error.message}`
    console.error(message)
    await sendTelegramMessage(message)
  }

  async execute() {
    if (this.isRunning) return
    this.isRunning = true
    stateManager.syncStateFromFile()

    try {
      stateManager.resetDailyOrders() // Check and reset daily orders

      const signals = (await performScan()) || []
      if (!signals || signals?.length === 0) {
        const noSignalMessage = 'Không có tín hiệu nào để giao dịch.'
        //console.log(noSignalMessage)
        await sendTelegramMessage(noSignalMessage)
        return
      }
      const filteredSignals = signals.sort((a, b) => b.TP_ROI - a.TP_ROI).slice(0, this.scanOrderLimit)

      for (const signal of filteredSignals) {
        await this.placeOrder(signal)
      }
      if (signals.length > this.scanOrderLimit) {
        const skipped = signals.slice(this.scanOrderLimit).map((s) => s.symbol)
        const limitMessage = `⚠️ Vượt giới hạn ${this.scanOrderLimit} lệnh/lần, bỏ qua: ${skipped.join(', ')}`
        await sendTelegramMessage(limitMessage)
        // console.log(limitMessage)
      }
    } finally {
      this.isRunning = false
    }
  }

  async generateReport() {
    const { ordersPlacedToday, totalOrders, totalCapital } = stateManager.getState()
    const balanceInfo = await this.logBalance()

    return `
📊 Báo cáo 
• Số lệnh đã đặt trong ngày: ${
      !isFinite(this.dailyOrderLimit) ? ordersPlacedToday : `${ordersPlacedToday}/${this.dailyOrderLimit}`
    }
• Tổng Số lệnh đã đặt: ${totalOrders}
• Tổng Lợi nhuận: ${balanceInfo.profit} USDT (${balanceInfo.profitPercent}%)
• Tổng vốn đã vào: ${totalCapital.toFixed(4)} USDT
• Vốn mỗi lệnh: ${ORDER_SETTINGS.QUANTITY} USDT
• Đòn bẩy: ${ORDER_SETTINGS.LEVERAGE}x
• Số lệnh đặt tối đa mỗi ngày: ${!isFinite(this.dailyOrderLimit) ? 'Không giới hạn' : this.dailyOrderLimit}
• Số lệnh đặt tối đa mỗi lần quét: ${!isFinite(this.scanOrderLimit) ? 'Không giới hạn' : this.scanOrderLimit}
    `
  }
  start() {
    setInterval(() => {
      this.execute()
    }, CONFIG.SCAN_INTERVAL)
    this.execute()
  }
}

const order = new Order()
telegramCommands(order)
order.start()
