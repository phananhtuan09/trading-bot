// forwardtest.js
const { Futures } = require('binance-futures-connector')
const { performScan } = require('../src/scanner')
const { STRATEGY_CONFIG } = require('../src/config')

const client = new Futures(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET, {
  baseURL: 'https://testnet.binancefuture.com',
})

class ForwardTester {
  constructor() {
    this.openPositions = new Map()
  }

  async logBalance() {
    try {
      const account = await client.account()
      const balance = parseFloat(account.availableBalance).toFixed(2)
      const unrealizedProfit = account.positions.reduce((sum, p) => sum + parseFloat(p.unRealizedProfit), 0).toFixed(2)

      console.log(
        `[${new Date().toLocaleTimeString()}] Vốn hiện tại: ${balance} USDT | Lợi nhuận chưa thực hiện: ${unrealizedProfit} USDT`,
      )
    } catch (error) {
      console.error('Lỗi khi kiểm tra số dư:', error)
    }
  }

  async checkExistingPosition(symbol) {
    try {
      const positions = await client.positionRisk()
      return positions.some((p) => p.symbol === symbol && Math.abs(parseFloat(p.positionAmt)) > 0)
    } catch (error) {
      console.error('Lỗi kiểm tra vị thế:', error)
      return false
    }
  }

  async calculateQuantity(symbol, price) {
    try {
      const exchangeInfo = await client.exchangeInfo()
      const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol)
      const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE')

      const notional = 10 * 15 // 10$ * đòn bẩy x15
      const quantity = notional / price
      const stepSize = parseFloat(lotSizeFilter.stepSize)

      return Math.floor(quantity / stepSize) * stepSize
    } catch (error) {
      console.error('Lỗi tính số lượng:', error)
      return 0
    }
  }

  async placeOrder(signal) {
    const { symbol, price, futuresDetails } = signal
    try {
      // Kiểm tra vị thế tồn tại
      if (await this.checkExistingPosition(symbol)) {
        console.log(`🟡 Bỏ qua ${symbol} - Đang có vị thế mở`)
        return
      }

      // Thiết lập đòn bẩy
      await client.leverage(symbol, 15)

      // Tính toán số lượng
      const quantity = await this.calculateQuantity(symbol, price)
      if (quantity <= 0) return

      // Đặt lệnh MARKET
      const side = futuresDetails.direction === 'Long' ? 'BUY' : 'SELL'
      const order = await client.newOrder(symbol, side, 'MARKET', { quantity })

      // Đặt lệnh TP/SL
      const entryPrice = parseFloat(order.avgPrice)
      const tpPrice = side === 'BUY' ? entryPrice * 1.01 : entryPrice * 0.99
      const slPrice = side === 'BUY' ? entryPrice * 0.98 : entryPrice * 1.02

      await client.newOrder(symbol, side === 'BUY' ? 'SELL' : 'BUY', 'TAKE_PROFIT_MARKET', {
        stopPrice: tpPrice.toFixed(2),
        closePosition: 'true',
      })

      await client.newOrder(symbol, side === 'BUY' ? 'SELL' : 'BUY', 'STOP_MARKET', {
        stopPrice: slPrice.toFixed(2),
        closePosition: 'true',
      })

      console.log(`✅ Đã mở ${side} ${symbol} | Giá: ${entryPrice.toFixed(4)} | KL: ${quantity}`)
    } catch (error) {
      console.error(`🔴 Lỗi đặt lệnh ${symbol}:`, error.message)
    }
  }

  async executeTest() {
    console.log('=== BẮT ĐẦU FORWARD TEST ===')
    await this.logBalance()

    try {
      // Chạy scanner và lấy tín hiệu
      const { allSignals } = await performScan()

      // Xử lý từng tín hiệu
      for (const signal of allSignals) {
        await this.placeOrder(signal)
      }
    } catch (error) {
      console.error('Lỗi quét tổng:', error)
    }

    // Log kết quả cuối cùng
    await this.logBalance()
    console.log('=== KẾT THÚC FORWARD TEST ===\n')
  }
}

// Chạy test
new ForwardTester().executeTest()
