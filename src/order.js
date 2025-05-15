const { performScan } = require('../src/scanner')
const { ORDER_SETTINGS, CONFIG } = require('../src/config')
const { binanceTestClient: binanceClient } = require('../src/clients')
const { sendTelegramMessage } = require('../src/telegramService')
const stateManager = require('../src/stateManager')
const telegramCommands = require('../src/telegramCommands')
const { log } = require('../src/utils')
const positionManager = require('./positionManager')

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
      log('error', 'Lỗi kiểm tra vị thế:', error)
      await sendTelegramMessage('Lỗi kiểm tra vị thế:', error?.message)
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
      log('log', profitMessage)
      return {
        availableBalance,
        profit: isNaN(profit) ? 0 : profit.toFixed(2),
        profitPercent: isNaN(profitPercent) ? 0 : profitPercent,
      }
    } catch (error) {
      log('error', 'Lỗi khi log balance:', error)
      await sendTelegramMessage(`🔴 Lỗi khi kiểm tra balance: ${error.message}`)
      return { availableBalance: 0, profit: 0, profitPercent: 0 }
    }
  }

  async calculateCurrentROI(position) {
    try {
      const entryPrice = parseFloat(position.entryPrice)
      const markPrice = parseFloat(position.markPrice)
      const leverage = ORDER_SETTINGS.LEVERAGE

      if (position.side === 'BUY') {
        return ((markPrice - entryPrice) / entryPrice) * leverage * 100
      }
      return ((entryPrice - markPrice) / entryPrice) * leverage * 100
    } catch (error) {
      log('error', 'Lỗi tính ROI:', error)
      await sendTelegramMessage(`'Lỗi tính ROI:': ${error.message}`)
      return 0
    }
  }

  async monitorAndClosePositions() {
    try {
      const positions = await positionManager.syncWithBinance()
      for (const position of positions) {
        try {
          const now = Date.now()
          const timeElapsed = now - position.entryTime
          const roi = await this.calculateCurrentROI(position)

          let closeReason = ''
          if (roi <= -10) closeReason = 'SL'
          else if (roi >= position.TP_ROI) closeReason = 'TP'
          else if (timeElapsed >= 86400000) closeReason = '24H'

          if (closeReason) {
            await this.closePosition(position, closeReason, roi)
            positionManager.removePosition(position.symbol)
          }
        } catch (error) {
          log('error', `Lỗi xử lý position ${position.symbol}:`, error)
          await sendTelegramMessage(`Lỗi xử lý position ${position.symbol}: ${error.message}`)
        }
      }
    } catch (error) {
      log('error', 'Lỗi tổng khi giám sát positions:', error)
      await sendTelegramMessage(`Lỗi tổng khi giám sát positions: ${error.message}`)
    }
  }

  async closePosition(position, reason, roi) {
    try {
      const closeSide = position.side === 'BUY' ? 'SELL' : 'BUY'
      await binanceClient.futuresOrder({
        symbol: position.symbol,
        side: closeSide,
        type: 'MARKET',
        quantity: Math.abs(position.quantity),
      })

      const message = [
        `🔐 Đóng lệnh ${position.symbol}`,
        `Lý do: ${reason}`,
        `ROI: ${roi.toFixed(2)}%`,
        `Thời gian giữ: ${Math.floor((Date.now() - position.entryTime) / 3600000)}h`,
      ].join(' | ')

      await sendTelegramMessage(message)
      log('log', message)
    } catch (error) {
      log('error', `Lỗi đóng lệnh ${position.symbol}:`, error)
      await sendTelegramMessage(`🔴 Lỗi đóng lệnh ${position.symbol}: ${error.message}`)
    }
  }

  async getUnrealizedProfit() {
    try {
      const positions = await binanceClient.futuresPositionRisk()
      if (!Array.isArray(positions) || positions.length === 0) {
        return 0
      }

      const totalUnrealizedProfit = positions.reduce((sum, p) => {
        const profit = parseFloat(p.unRealizedProfit)
        if (Number.isNaN(profit)) {
          return sum // Skip invalid values
        }
        return sum + profit
      }, 0)

      return totalUnrealizedProfit
    } catch (error) {
      log('error', `getUnrealizedProfit - Error stack: ${error.stack}`)
      return 0 // Fallback to 0 on error
    }
  }
  async placeOrder(signal) {
    const { orderPlacementEnabled, ordersPlacedToday, totalOrders, totalCapital } = stateManager.getState()
    if (!orderPlacementEnabled) return
    if (ordersPlacedToday >= this.dailyOrderLimit) {
      const limitMessage = `⚠️ Đạt giới hạn ${this.dailyOrderLimit} lệnh/ngày`
      log('log', limitMessage)
      await sendTelegramMessage(limitMessage)
      return
    }
    const { symbol, price, decision, TP_ROI, SL_ROI } = signal

    try {
      // Kiểm tra margin type
      await this.setMarginType(symbol)

      // Đặt lệnh chính
      const { quantity, side } = await this.prepareOrder(symbol, price, decision)
      await binanceClient.futuresOrder({ symbol, side, type: 'MARKET', quantity })

      // let tpPriceOrder
      // let slPriceOrder

      // // Đặt TP/SL
      // try {
      //   const { tpPrice, slPrice } = await this.setTPSL(symbol, side, price, TP_ROI, SL_ROI)
      //   tpPriceOrder = tpPrice
      //   slPriceOrder = slPrice
      // } catch (tpSlError) {
      //   await this.closePositionImmediately(symbol, quantity, side)
      //   const error = `Lỗi TP/SL: ${tpSlError.message}`
      //   log('error', error)
      //   throw new Error(tpSlError)
      // }

      // Lấy thông tin position từ Binance
      const positions = await binanceClient.futuresPositionRisk({ symbol })
      const positionInfo = positions.find((p) => p.symbol === symbol)

      // Lưu vào PositionManager
      positionManager.addPosition({
        symbol,
        entryTime: Date.now(),
        entryPrice: parseFloat(positionInfo.entryPrice),
        markPrice: parseFloat(positionInfo.markPrice),
        TP_ROI,
        side,
        quantity: parseFloat(positionInfo.positionAmt),
      })

      stateManager.setStateAndSaveToFile({
        ordersPlacedToday: ordersPlacedToday + 1,
        totalOrders: totalOrders + 1,
        totalCapital: totalCapital + ORDER_SETTINGS.QUANTITY,
      })

      const orderMessage = `📈 Đã mở ${side} ${symbol} | Giá vào: ${price.toFixed(4)} | KL: ${quantity}`
      log('log', orderMessage)
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
      const tpSlError = `⚠️ Đã đóng lệnh ${symbol} do lỗi TP/SL`
      log('error', tpSlError)
      await sendTelegramMessage(tpSlError)
    } catch (closeError) {
      const tpSlError = `🔴 Lỗi khi đóng lệnh ${symbol}: ${closeError.message}`
      log('error', tpSlError)
      await sendTelegramMessage(tpSlError)
    }
  }

  async setMarginType(symbol) {
    try {
      await binanceClient.futuresMarginType({ symbol, marginType: 'ISOLATED' })
    } catch (error) {
      if (!error.message.includes('No need')) {
        const marginError = `🔴 Lỗi set margin type cho ${symbol}: ${error.message}`
        log('error', marginError)
        await sendTelegramMessage(marginError)
        throw error
      }
    }
  }

  async prepareOrder(symbol, price, decision) {
    const quantity = await this.calculateQuantity(symbol, price)
    if (quantity <= 0) {
      const quantityError = 'Số lượng không hợp lệ'
      log('error', quantityError)
      throw new Error(quantityError)
    }

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

      // Kiểm tra giá TP/SL
      if (side === 'BUY') {
        if (tpPriceRaw <= entryPrice || slPriceRaw >= entryPrice) {
          throw new Error(`TP/SL không hợp lệ: TP=${tpPriceRaw}, SL=${slPriceRaw}, Entry=${entryPrice}`)
        }
      } else {
        if (tpPriceRaw >= entryPrice || slPriceRaw <= entryPrice) {
          throw new Error(`TP/SL không hợp lệ: TP=${tpPriceRaw}, SL=${slPriceRaw}, Entry=${entryPrice}`)
        }
      }

      // Lấy tickSize và làm tròn
      const symbolInfo = (await binanceClient.futuresExchangeInfo()).symbols.find((s) => s.symbol === symbol)
      const priceFilter = symbolInfo.filters.find((f) => f.filterType === 'PRICE_FILTER')
      const tickSize = parseFloat(priceFilter.tickSize)
      let tpPrice = Math.round(tpPriceRaw / tickSize) * tickSize
      let slPrice = Math.round(slPriceRaw / tickSize) * tickSize

      // Đặt lệnh TP/SL
      await this.placeTPSLOrder(symbol, side, tpPrice, 'TAKE_PROFIT_MARKET')
      await this.placeTPSLOrder(symbol, side, slPrice, 'STOP_MARKET')
      return { tpPrice, slPrice }
    } catch (error) {
      const tpSlError = `🔴 Lỗi đặt TP/SL cho ${symbol}: ${error.message}`
      log('error', tpSlError)
      await sendTelegramMessage(tpSlError)
      throw error
    }
  }
  calculateTpSlPrices({ entryPrice, tpRoiPercent, slRoiPercent, side }) {
    const tpChange = tpRoiPercent / ORDER_SETTINGS.LEVERAGE / 100
    const slChange = slRoiPercent / ORDER_SETTINGS.LEVERAGE / 100

    let tpPrice, slPrice
    if (side === 'BUY') {
      tpPrice = entryPrice * (1 + tpChange)
      slPrice = entryPrice * (1 - slChange)
    } else {
      tpPrice = entryPrice * (1 - tpChange)
      slPrice = entryPrice * (1 + slChange)
    }

    return { tp: tpPrice, sl: slPrice }
  }

  placeTPSLOrder(symbol, side, price, type) {
    const orderSide = side === 'BUY' ? 'SELL' : 'BUY'

    return binanceClient.futuresOrder({
      symbol,
      side: orderSide,
      type,
      stopPrice: price.toFixed(4),
      closePosition: true,
    })
  }

  async handleOrderError(error, symbol) {
    const message = `🔴 Lỗi đặt lệnh ${symbol}: ${error.message}`
    log('error', message)
    await sendTelegramMessage(message)
  }

  async execute() {
    if (this.isRunning) return
    this.isRunning = true

    try {
      stateManager.resetDailyOrders() // Check and reset daily orders
      stateManager.syncStateFromFile()

      const signals = (await performScan()) || []
      if (!signals || signals?.length === 0) {
        const noSignalMessage = 'Không có tín hiệu nào để giao dịch.'
        log('log', noSignalMessage)
        await sendTelegramMessage(noSignalMessage)
        return
      }

      // Lọc tín hiệu chưa có vị thế mở
      const validSignals = []
      for (const signal of signals) {
        if (!(await this.checkExistingPosition(signal.symbol))) {
          validSignals.push(signal)
        } else {
          const existMessage = `🟡 Bỏ qua ${signal.symbol} - Đang có vị thế mở`
          log('log', existMessage)
          await sendTelegramMessage(existMessage)
        }
      }

      // Sắp xếp và áp dụng scanOrderLimit cho các tín hiệu hợp lệ
      const filteredSignals = validSignals
        .sort((a, b) => Number(b.TP_ROI) - Number(a.TP_ROI))
        .slice(0, this.scanOrderLimit)

      // Đặt lệnh cho các tín hiệu đã lọc
      for (const signal of filteredSignals) {
        log('log', signal)
        await this.placeOrder(signal)
      }

      // Thông báo nếu có tín hiệu bị bỏ qua do scanOrderLimit
      if (validSignals.length > this.scanOrderLimit) {
        const skipped = validSignals.slice(this.scanOrderLimit).map((s) => s.symbol)
        const limitMessage = `⚠️ Vượt giới hạn ${this.scanOrderLimit} lệnh/lần, bỏ qua: ${skipped.join(', ')}`
        log('log', limitMessage)
        await sendTelegramMessage(limitMessage)
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

    setInterval(() => {
      this.monitorAndClosePositions()
    }, 180000)
  }
}

const order = new Order()
telegramCommands(order)
order.start()
