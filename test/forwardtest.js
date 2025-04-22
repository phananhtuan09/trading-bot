const { performScan } = require('../src/scanner')
const { ORDER_SETTINGS, CONFIG } = require('../src/config')
const { binanceTestClient } = require('../src/clients')
const { sendTelegramMessage } = require('../src/telegramService')

class ForwardTester {
  constructor() {
    this.openPositions = new Map()
    this.isRunning = false // Biến kiểm tra trạng thái chạy của executeTest
    this.initialCapital = null // Số vốn ban đầu
    this.isFirstRun = true // cờ đánh dấu lần chạy đầu
  }

  async logBalance() {
    try {
      const balances = await binanceTestClient.futuresAccountBalance()
      const usdtBalance = balances.find((b) => b.asset === 'USDT')
      const availableBalance = parseFloat(usdtBalance.availableBalance)

      const positions = await binanceTestClient.futuresPositionRisk()
      const openPositions = positions.filter((p) => parseFloat(p.positionAmt) !== 0)
      const unrealizedProfit = openPositions.reduce((sum, p) => sum + parseFloat(p.unrealizedProfit), 0)

      // ✅ Nếu là lần đầu, gán vốn khởi đầu bằng số dư khả dụng
      if (this.isFirstRun) {
        this.initialCapital = availableBalance
        this.isFirstRun = false
        const initialCapitalMessage = `💰 Vốn khởi đầu: ${this.initialCapital.toFixed(2)} USDT`
        console.log(initialCapitalMessage)
        await sendTelegramMessage(initialCapitalMessage)
      }

      const currentTotal = availableBalance + unrealizedProfit
      const profit = currentTotal - this.initialCapital

      const profitMessage = `
Số dư khả dụng: ${availableBalance.toFixed(2)} USDT
Lợi nhuận đang có: ${isNaN(profit) ? 0 : profit.toFixed(2)} USDT (so với số vốn ban đầu ${this.initialCapital.toFixed(
        2,
      )} USDT).
      `

      console.log(profitMessage)
      await sendTelegramMessage(profitMessage)

      return {
        availableBalance,
        profit,
      }
    } catch (error) {
      console.error('Lỗi khi lấy thông tin tài khoản:', error)
    }
  }

  async checkExistingPosition(symbol) {
    try {
      const positions = await binanceTestClient.futuresPositionRisk()
      return positions.some((p) => p.symbol === symbol && Math.abs(parseFloat(p.positionAmt)) > 0)
    } catch (error) {
      console.error('Lỗi kiểm tra vị thế:', error)
      return false
    }
  }

  async calculateQuantity(symbol, price) {
    try {
      const exchangeInfo = await binanceTestClient.futuresExchangeInfo()
      const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol)
      // Kiểm tra symbol có tồn tại không
      if (!symbolInfo) {
        console.error(`🔴 Symbol ${symbol} không tồn tại trên Testnet`)
        return 0
      }
      const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE')
      const stepSize = parseFloat(lotSizeFilter.stepSize)

      const notional = ORDER_SETTINGS.QUANTITY * ORDER_SETTINGS.LEVERAGE
      let quantity = notional / price

      // Làm tròn theo stepSize
      quantity = Math.floor(quantity / stepSize) * stepSize

      // Đảm bảo notional tối thiểu 100 USDT
      let actualNotional = quantity * price
      if (actualNotional < 100) {
        const minQuantity = Math.ceil(100 / price / stepSize) * stepSize
        actualNotional = minQuantity * price
        if (actualNotional < 100) {
          console.error(`🔴 Không đạt notional tối thiểu cho ${symbol}: ${actualNotional.toFixed(2)} USDT`)
          return 0
        }
        quantity = minQuantity
      }

      // Log thông tin kiểm tra
      console.log(`ℹ️ ${symbol} | Lot size step: ${stepSize} | Quantity: ${quantity}`)

      return quantity
    } catch (error) {
      console.error('Lỗi tính số lượng:', error)
      return 0
    }
  }

  calculateTpSlPrices({ entryPrice, tpRoiPercent, slRoiPercent, direction, leverage }) {
    const tpChange = tpRoiPercent / leverage / 100
    const slChange = slRoiPercent / leverage / 100

    if (direction === 'BUY') {
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
  async placeOrder(signal) {
    const { symbol, price, decision, TP_ROI, SL_ROI } = signal

    try {
      if (await this.checkExistingPosition(symbol)) {
        const existMessage = `🟡 Bỏ qua ${symbol} - Đang có vị thế mở`
        console.log(existMessage)
        await sendTelegramMessage(existMessage)
        return
      }

      await binanceTestClient
        .futuresMarginType({
          symbol,
          marginType: 'ISOLATED',
        })
        .catch((err) => {
          if (!err.message.includes('No need to change margin type')) {
            throw err
          }
        })
      await binanceTestClient.futuresLeverage({
        symbol,
        leverage: ORDER_SETTINGS.LEVERAGE,
      })

      const quantity = await this.calculateQuantity(symbol, price)
      if (quantity <= 0) {
        console.log(`🟡 Bỏ qua ${symbol} - Số lượng không hợp lệ`)
        return
      }
      const side = decision === 'Long' ? 'BUY' : 'SELL'
      await binanceTestClient.futuresOrder({
        symbol,
        side,
        type: 'MARKET',
        quantity,
      })

      const entryPrice = price
      if (entryPrice <= 0) {
        console.error(`🔴 Lỗi: entryPrice không hợp lệ, sử dụng giá trị price: ${price}`)
        return
      }
      const symbolInfo = (await binanceTestClient.futuresExchangeInfo()).symbols.find((s) => s.symbol === symbol)

      const { tp: tpPriceRaw, sl: slPriceRaw } = this.calculateTpSlPrices({
        entryPrice,
        tpRoiPercent: ORDER_SETTINGS.TP_ROI_PERCENTAGE,
        slRoiPercent: ORDER_SETTINGS.SL_ROI_PERCENTAGE,
        direction: side,
        leverage: ORDER_SETTINGS.LEVERAGE,
      })

      let tpPrice = tpPriceRaw
      let slPrice = slPriceRaw

      const priceFilter = symbolInfo.filters.find((f) => f.filterType === 'PRICE_FILTER')
      const tickSize = parseFloat(priceFilter.tickSize)
      tpPrice = Math.round(tpPrice / tickSize) * tickSize
      slPrice = Math.round(slPrice / tickSize) * tickSize

      await binanceTestClient.futuresOrder({
        symbol,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: tpPrice.toFixed(4),
        closePosition: true,
      })

      await binanceTestClient.futuresOrder({
        symbol,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        type: 'STOP_MARKET',
        stopPrice: slPrice.toFixed(4),
        closePosition: true,
      })
      const orderMessage = `📈 Đã mở ${side} ${symbol} | Giá vào: ${entryPrice.toFixed(4)} | SL: ${slPrice.toFixed(
        4,
      )} | TP: ${tpPrice.toFixed(4)} | KL: ${quantity}`
      console.log(orderMessage)
      await sendTelegramMessage(orderMessage)
    } catch (error) {
      console.error(`🔴 Lỗi đặt lệnh ${symbol}:`, error)
    }
  }

  async executeTest() {
    let startMessage = `\n🔍 Bắt đầu quét lúc ${new Date().toLocaleTimeString()}`
    console.log(startMessage)
    await sendTelegramMessage(startMessage)
    // Kiểm tra nếu hàm đang chạy thì bỏ qua lần gọi này
    if (this.isRunning) {
      console.log('executeTest đang chạy, bỏ qua lần này.')
      return
    }

    this.isRunning = true // Đánh dấu hàm đang chạy
    try {
      console.log('=== BẮT ĐẦU FORWARD TEST ===')
      await this.logBalance()

      const allSignals = await performScan()

      if (!allSignals || allSignals?.length === 0) {
        const noSignalMessage = 'Không có tín hiệu nào để giao dịch.'
        console.log(noSignalMessage)
        await sendTelegramMessage(noSignalMessage)
        return
      }
      for (const signal of allSignals) {
        await this.placeOrder(signal)
      }

      console.log('=== KẾT THÚC FORWARD TEST ===')
    } catch (error) {
      console.error('Lỗi trong executeTest:', error)
    } finally {
      this.isRunning = false // Đánh dấu hàm đã hoàn thành
    }
  }

  startTesting() {
    setInterval(() => {
      this.executeTest()
    }, CONFIG.SCAN_INTERVAL)
    // Chạy lần đầu tiên ngay lập tức
    this.executeTest()
  }
}

const mockSignal = {
  symbol: 'SPXUSDT',
  price: 0.4475, // giá giả lập
  futuresDetails: {
    direction: 'Long',
  },
}

// Chạy test
const tester = new ForwardTester()
tester.startTesting()
// tester.placeOrder(mockSignal)
