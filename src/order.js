const { performScan } = require('../src/scanner')
const { ORDER_SETTINGS, CONFIG } = require('../src/config')
const { binanceTestClient: binanceClient } = require('../src/clients') // Import binanceClient nếu muốn đặt lệnh trên tk thực
const { sendTelegramMessage } = require('../src/telegramService')
const stateManager = require('../src/stateManager')
const telegramCommands = require('../src/telegramCommands')
const logger = require('../src/logger')
const schedule = require('node-schedule')

class Order {
  constructor() {
    this.isRunning = false
    this.dailyOrderLimit = ORDER_SETTINGS.MAX_ORDERS_PER_DAY || Infinity
    this.scanOrderLimit = ORDER_SETTINGS.ORDER_LIMIT_PER_SCAN || Infinity
  }

  // Kiểm tra xem cặp giao dịch có vị thế đang mở hay không
  async checkExistingPosition(symbol) {
    try {
      const positions = await binanceClient.futuresPositionRisk()
      return positions.some((p) => p.symbol === symbol && Math.abs(parseFloat(p.positionAmt)) > 0)
    } catch (error) {
      logger.error(`Lỗi kiểm tra vị thế: ${error?.message}`)
      //  await sendTelegramMessage('Lỗi kiểm tra vị thế:', error?.message)
      return false
    }
  }
  // Show thông tin số dư và lợi nhuận
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
      logger.info(profitMessage)
      return {
        availableBalance,
        profit: isNaN(profit) ? 0 : profit.toFixed(2),
        profitPercent: isNaN(profitPercent) ? 0 : profitPercent,
      }
    } catch (error) {
      logger.error(`Lỗi khi log balance: ${error?.message}`)
      //   await sendTelegramMessage(`🔴 Lỗi khi kiểm tra balance: ${error.message}`)
      return { availableBalance: 0, profit: 0, profitPercent: 0 }
    }
  }

  // Lấy tổng lợi nhuận chưa thực hiện từ các vị thế
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
      const errorMessage = `Lỗi lấy tổng lợi nhuận chưa thực hiện từ các vị thế: ${error.message}`
      logger.error(errorMessage)
      //  await sendTelegramMessage(errorMessage)
      return 0 // Fallback to 0 on error
    }
  }

  // Đặt lệnh giao dịch dựa trên tín hiệu
  async placeOrder(signal) {
    const { orderPlacementEnabled, ordersPlacedToday, totalOrders, totalCapital } = stateManager.getState()
    if (!orderPlacementEnabled) {
      const disabledMessage = '⚠️ Chứ năng đặt lệnh đã bị tắt nên bỏ qua'
      logger.error(disabledMessage)
      await sendTelegramMessage(disabledMessage)
      return
    }
    if (ordersPlacedToday >= this.dailyOrderLimit) {
      const limitMessage = `⚠️ Đạt giới hạn ${this.dailyOrderLimit} lệnh/ngày. Nên không vào lệnh`
      logger.error(limitMessage)
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

      let tpPriceOrder
      let slPriceOrder

      // Đặt TP/SL
      try {
        const { tpPrice, slPrice } = await this.setTPSL(symbol, side, price, TP_ROI, SL_ROI)
        tpPriceOrder = tpPrice
        slPriceOrder = slPrice
      } catch (tpSlError) {
        await this.closePositionImmediately(symbol, quantity, side)
        const error = `Lỗi TP/SL: ${tpSlError.message}`
        logger.error(error)
        //  await sendTelegramMessage(error)
        throw new Error(tpSlError)
      }

      stateManager.setStateAndSaveToFile({
        ordersPlacedToday: ordersPlacedToday + 1,
        totalOrders: totalOrders + 1,
        totalCapital: totalCapital + ORDER_SETTINGS.QUANTITY,
      })
      const orderMessage = `📈 Đã mở ${side} ${symbol} | Giá vào: ${price.toFixed(4)} | SL: ${slPriceOrder.toFixed(
        4,
      )} | TP: ${tpPriceOrder.toFixed(4)} | KL: ${quantity}`

      logger.info('log', orderMessage)
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
      logger.error(tpSlError)

      //   await sendTelegramMessage(tpSlError)
    } catch (closeError) {
      const tpSlError = `🔴 Lỗi khi đóng lệnh ${symbol}: ${closeError.message}`
      logger.error(tpSlError)
      //    await sendTelegramMessage(tpSlError)
    }
  }

  // Thiết lập loại margin (ISOLATED) cho cặp giao dịch
  async setMarginType(symbol) {
    try {
      await binanceClient.futuresMarginType({ symbol, marginType: 'ISOLATED' })
    } catch (error) {
      if (!error.message.includes('No need')) {
        const marginError = `🔴 Lỗi set margin type cho ${symbol}: ${error.message}`
        logger.error(marginError)
        //    await sendTelegramMessage(marginError)
        throw error
      }
    }
  }

  // Tính số lượng giao dịch dựa trên giá và cấu hình
  async prepareOrder(symbol, price, decision) {
    const quantity = await this.calculateQuantity(symbol, price)
    if (quantity <= 0) {
      const quantityError = 'Số lượng không hợp lệ'
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
    const stepSize = parseFloat(lotSizeFilter.stepSize)

    // Tính toán số lượng chính xác với làm tròn xuống
    const rawQty = (ORDER_SETTINGS.QUANTITY * ORDER_SETTINGS.LEVERAGE) / price
    const quantity = Math.floor(rawQty / stepSize) * stepSize

    // return Math.max(quantity, parseFloat(lotSizeFilter.minQty)) // Đảm bảo đạt minQty
    return quantity // Đảm bảo đạt minQty
  }
  // Thiết lập giá chốt lời (TP) và cắt lỗ (SL)
  async setTPSL(symbol, side, entryPrice, TP_ROI, SL_ROI) {
    try {
      // Calculate raw TP/SL prices
      const { tp: tpPriceRaw, sl: slPriceRaw } = this.calculateTpSlPrices({
        entryPrice,
        tpRoiPercent: TP_ROI,
        slRoiPercent: Math.abs(SL_ROI),
        side,
      })

      // Validate raw TP/SL prices
      if (side === 'BUY') {
        if (tpPriceRaw <= entryPrice || slPriceRaw >= entryPrice) {
          throw new Error(`Invalid TP/SL: TP=${tpPriceRaw}, SL=${slPriceRaw}, Entry=${entryPrice}`)
        }
      } else {
        if (tpPriceRaw >= entryPrice || slPriceRaw <= entryPrice) {
          throw new Error(`Invalid TP/SL: TP=${tpPriceRaw}, SL=${slPriceRaw}, Entry=${entryPrice}`)
        }
      }

      // Get tickSize from exchange info
      const symbolInfo = (await binanceClient.futuresExchangeInfo()).symbols.find((s) => s.symbol === symbol)
      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found in exchange info`)
      }
      const priceFilter = symbolInfo.filters.find((f) => f.filterType === 'PRICE_FILTER')
      const tickSize = parseFloat(priceFilter.tickSize)

      // Round prices to tickSize
      const roundToTickSize = (price, tickSize) => {
        const precision = -Math.floor(Math.log10(tickSize))
        return Number(price.toFixed(precision))
      }

      let tpPrice = roundToTickSize(tpPriceRaw, tickSize)
      let slPrice = roundToTickSize(slPriceRaw, tickSize)

      // Lấy thông tin percent price filter
      const percentFilter = symbolInfo.filters.find((f) => f.filterType === 'PERCENT_PRICE')
      if (percentFilter) {
        const multiplierUp = parseFloat(percentFilter.multiplierUp)
        const multiplierDown = parseFloat(percentFilter.multiplierDown)

        // Điều chỉnh giá theo filter
        const maxPrice = entryPrice * multiplierUp
        const minPrice = entryPrice * multiplierDown

        if (side === 'BUY') {
          tpPrice = Math.min(tpPrice, maxPrice)
          slPrice = Math.max(slPrice, minPrice)
        } else {
          tpPrice = Math.max(tpPrice, minPrice)
          slPrice = Math.min(slPrice, maxPrice)
        }
      }

      // Re-validate rounded prices
      if (side === 'BUY') {
        if (tpPrice <= entryPrice || slPrice >= entryPrice) {
          throw new Error(`Rounded TP/SL invalid: TP=${tpPrice}, SL=${slPrice}, Entry=${entryPrice}`)
        }
      } else {
        if (tpPrice >= entryPrice || slPrice <= entryPrice) {
          throw new Error(`Rounded TP/SL invalid: TP=${tpPrice}, SL=${slPrice}, Entry=${entryPrice}`)
        }
      }

      // Place TP/SL orders
      await this.placeTPSLOrder(symbol, side, tpPrice, 'TAKE_PROFIT_MARKET')
      await this.placeTPSLOrder(symbol, side, slPrice, 'STOP_MARKET')

      return { tpPrice, slPrice }
    } catch (error) {
      logger.error(`setTPSL error for ${symbol}: ${error.message}`)
      //   await sendTelegramMessage(`🔴 Lỗi đặt TP/SL cho ${symbol}: ${error.message}`)
      throw error
    }
  }

  // Tính giá TP và SL dựa trên ROI và hướng lệnh
  calculateTpSlPrices({ entryPrice, tpRoiPercent, slRoiPercent, side }) {
    try {
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
    } catch (error) {
      throw error
    }
  }
  // Đặt lệnh TP hoặc SL trên Binance
  async placeTPSLOrder(symbol, side, price, type) {
    try {
      const orderSide = side === 'BUY' ? 'SELL' : 'BUY'

      // Get tickSize to format stopPrice
      const symbolInfo = (await binanceClient.futuresExchangeInfo()).symbols.find((s) => s.symbol === symbol)
      const priceFilter = symbolInfo.filters.find((f) => f.filterType === 'PRICE_FILTER')
      const tickSize = parseFloat(priceFilter.tickSize)
      const precision = -Math.floor(Math.log10(tickSize))
      const formattedPrice = Number(price.toFixed(precision))

      const order = await binanceClient.futuresOrder({
        symbol,
        side: orderSide,
        type,
        stopPrice: formattedPrice,
        closePosition: true,
      })

      return order
    } catch (error) {
      throw error
    }
  }

  async handleOrderError(error, symbol) {
    const message = `🔴 Lỗi đặt lệnh ${symbol}: ${error.message}`
    logger.error(message)
    // await sendTelegramMessage(message)
  }

  async logClosedPositionsDaily() {
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1

      // Gọi API để lấy lịch sử giao dịch trong ngày
      const trades = await binanceClient.futuresAccountTrades({
        startTime: startOfDay,
        endTime: endOfDay,
      })

      // Lọc các lệnh đóng vị thế (closePosition: true)
      const closedTrades = trades.filter((trade) => trade.closePosition)

      if (closedTrades.length > 0) {
        const logMessage = closedTrades
          .map((trade) => {
            const realizedPnl = parseFloat(trade.realizedPnl)
            const entryPrice = parseFloat(trade.price) // Giá khi đóng lệnh (tạm thời, có thể cải thiện sau)
            const quantity = parseFloat(trade.quantity)
            const side = trade.side // BUY hoặc SELL
            const commission = parseFloat(trade.commission)

            // Tính PNL % (dựa trên realizedPnl và số vốn đầu tư)
            const investedCapital = (quantity * entryPrice) / ORDER_SETTINGS.LEVERAGE
            const pnlPercent = investedCapital !== 0 ? ((realizedPnl / investedCapital) * 100).toFixed(2) : '0.00'

            return `Symbol: ${trade.symbol}, Entry: ${entryPrice.toFixed(4)}, Close: ${entryPrice.toFixed(
              4,
            )}, PNL: ${realizedPnl.toFixed(2)} USDT (${pnlPercent}%)`
          })
          .join('\n')

        logger.info(`Closed positions today:\n${logMessage}`)
        //  await sendTelegramMessage(`Closed positions today:\n${logMessage}`)
      } else {
        logger.info('No positions closed today.')
      }
    } catch (error) {
      logger.error(`Error fetching closed trades: ${error.message}`)
      // await sendTelegramMessage(`🔴 Error fetching closed trades: ${error.message}`)
    }
  }

  // Thực thi quá trình quét tín hiệu và đặt lệnh
  async execute() {
    if (this.isRunning) return
    this.isRunning = true

    try {
      stateManager.resetDailyOrders() // Check and reset daily orders
      stateManager.syncStateFromFile()

      const signals = (await performScan()) || []
      if (!signals || signals?.length === 0) {
        const noSignalMessage = 'Không có tín hiệu nào để giao dịch.'
        logger.info(noSignalMessage)
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
          logger.info(existMessage)
          await sendTelegramMessage(existMessage)
        }
      }

      // Sắp xếp và áp dụng scanOrderLimit cho các tín hiệu hợp lệ
      const filteredSignals = validSignals.sort((a, b) => b.TP_ROI - a.TP_ROI).slice(0, this.scanOrderLimit)

      // Đặt lệnh cho các tín hiệu đã lọc
      for (const signal of filteredSignals) {
        logger.info(`Đang thực hiện đặt lệnh ch0: ${signal.symbol}`)
        await this.placeOrder(signal)
      }

      // Thông báo nếu có tín hiệu bị bỏ qua do scanOrderLimit
      if (validSignals.length > this.scanOrderLimit) {
        const skipped = validSignals.slice(this.scanOrderLimit).map((s) => s.symbol)
        const limitMessage = `⚠️ Vượt giới hạn ${this.scanOrderLimit} lệnh/lần, bỏ qua: ${skipped.join(', ')}`
        logger.info(limitMessage)
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

  async start() {
    // Kiểm tra kết nối API bằng cách gọi futuresAccountBalance
    try {
      const balances = await binanceClient.futuresAccountBalance()
      const usdtBalance = balances.find((b) => b.asset === 'USDT')
      const walletBalance = parseFloat(usdtBalance.balance)

      // Lưu initialCapital nếu chưa tồn tại
      const { initialCapital } = stateManager.getState()
      if (!initialCapital) {
        stateManager.setStateAndSaveToFile({
          initialCapital: walletBalance,
        })
        logger.info(`Đã lưu initialCapital: ${walletBalance.toFixed(2)} USDT`)
      }
    } catch (error) {
      logger.inferroro(`Lỗi kết nối API Binance ${error.message}`)
      //  await sendTelegramMessage(`🔴 Lỗi kết nối API Binance ${error.message}`)
      return // Dừng bot nếu lỗi
    }

    // Thông báo bot khởi động
    const startupMessage = `🚀 Bot đã khởi động chức năng quét và đặt lệnh...`
    logger.info(`Bot đã khởi động chức năng quét và đặt lệnh...`)
    await sendTelegramMessage(startupMessage)

    // Lên lịch log các lệnh đã đóng vào cuối ngày (23:59)
    schedule.scheduleJob('59 23 * * *', () => this.logClosedPositionsDaily())

    setInterval(() => {
      this.execute()
    }, CONFIG.SCAN_INTERVAL)
    this.execute()
  }
}

const order = new Order()
telegramCommands(order)
order.start()
