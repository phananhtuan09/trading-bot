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
Lợi nhuận đang có: ${profit.toFixed(2)} USDT (so với số vốn ban đầu ${this.initialCapital.toFixed(2)} USDT).
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
      const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE')
      const stepSize = parseFloat(lotSizeFilter.stepSize)

      const notional = ORDER_SETTINGS.QUANTITY * ORDER_SETTINGS.LEVERAGE
      let quantity = notional / price

      // Làm tròn xuống theo stepSize
      quantity = Math.floor(quantity / stepSize) * stepSize

      // Đảm bảo notional >= 100
      let actualNotional = quantity * price
      if (actualNotional < 100) {
        quantity = Math.ceil(100 / price / stepSize) * stepSize
        actualNotional = quantity * price
      }

      console.log(`🔢 Quantity: ${quantity}, Notional: ${actualNotional}`)
      return quantity
    } catch (error) {
      console.error('Lỗi tính số lượng:', error)
      return 0
    }
  }

  async placeOrder(signal) {
    const { symbol, price, futuresDetails } = signal
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
      if (quantity <= 0) return

      console.log('Đã tính toán số lượng:', quantity)

      const side = futuresDetails.direction === 'Long' ? 'BUY' : 'SELL'
      const order = await binanceTestClient.futuresOrder({
        symbol,
        side,
        type: 'MARKET',
        quantity,
      })

      const entryPrice = parseFloat(order.avgPrice) || price
      if (entryPrice <= 0) {
        console.error(`🔴 Lỗi: entryPrice không hợp lệ, sử dụng giá trị price: ${price}`)
        return
      }
      const symbolInfo = (await binanceTestClient.futuresExchangeInfo()).symbols.find((s) => s.symbol === symbol)

      const tpPercent = ORDER_SETTINGS.TP_ROI_PERCENTAGE / ORDER_SETTINGS.LEVERAGE
      const slPercent = ORDER_SETTINGS.SL_ROI_PERCENTAGE_LONG / ORDER_SETTINGS.LEVERAGE

      let tpPrice, slPrice
      if (side === 'BUY') {
        tpPrice = entryPrice * (1 + tpPercent / 100)
        slPrice = entryPrice * (1 - slPercent / 100)
      } else {
        tpPrice = entryPrice * (1 - tpPercent / 100)
        slPrice = entryPrice * (1 + slPercent / 100)
      }

      const priceFilter = symbolInfo.filters.find((f) => f.filterType === 'PRICE_FILTER')
      const tickSize = parseFloat(priceFilter.tickSize)
      tpPrice = Math.round(tpPrice / tickSize) * tickSize
      slPrice = Math.round(slPrice / tickSize) * tickSize

      await binanceTestClient.futuresOrder({
        symbol,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        type: 'TAKE_PROFIT_MARKET',
        stopPrice: tpPrice.toFixed(2),
        closePosition: true,
      })

      await binanceTestClient.futuresOrder({
        symbol,
        side: side === 'BUY' ? 'SELL' : 'BUY',
        type: 'STOP_MARKET',
        stopPrice: slPrice.toFixed(2),
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

      const results = await performScan()

      if (!results.allSignals || results.allSignals?.length === 0) {
        const noSignalMessage = 'Không có tín hiệu nào để giao dịch.'
        console.log(noSignalMessage)
        await sendTelegramMessage(noSignalMessage)
        return
      }
      const { allSignals } = results
      for (const signal of allSignals) {
        await this.placeOrder(signal)
      }

      await this.logBalance()
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
  symbol: 'BTCUSDT',
  price: 83483.8, // giá giả lập
  futuresDetails: {
    direction: 'Short', // hoặc 'Short'
  },
}

// Chạy test
const tester = new ForwardTester()
tester.startTesting()
// tester.placeOrder(mockSignal)
