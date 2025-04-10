const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { EMA, RSI } = require('technicalindicators');
const TradingStrategies = require('./src/tradingStrategies');
const { STRATEGY_CONFIG } = require('./src/config');
const { format } = require('date-fns');

const SYMBOL = 'BTCUSDT';
const INTERVAL = '1h'; // Dữ liệu mỗi 1 giờ
const LIMIT = 1000;

const TEST_FOLDER = 'test';

// Tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(TEST_FOLDER)) {
  fs.mkdirSync(TEST_FOLDER);
}

async function fetchHistoricalKlines(symbol, interval, startTime, endTime) {
  const url = `https://api.binance.com/api/v3/klines`;
  const res = await axios.get(url, {
    params: {
      symbol,
      interval,
      startTime,
      endTime,
      limit: LIMIT,
    },
  });
  return res.data.map((d) => ({
    openTime: d[0],
    open: parseFloat(d[1]),
    high: parseFloat(d[2]),
    low: parseFloat(d[3]),
    close: parseFloat(d[4]),
    volume: parseFloat(d[5]),
  }));
}

async function fetchFullHistory(symbol, interval, years = 2) {
  const now = Date.now();
  const startTime = now - years * 365 * 24 * 60 * 60 * 1000;
  let result = [];
  let current = startTime;

  while (current < now) {
    const candles = await fetchHistoricalKlines(symbol, interval, current);
    if (!candles.length) break;
    result = result.concat(candles);
    current = candles[candles.length - 1].openTime + 1;
    await new Promise((r) => setTimeout(r, 500));
  }

  return result;
}

function findPriceAfterTime(history, currentTime, hours) {
  const targetTime = currentTime + hours * 60 * 60 * 1000;
  const futureCandle = history.find((c) => c.openTime >= targetTime);
  return futureCandle ? futureCandle.close : null;
}

function calcProfitPercent(currentPrice, futurePrice, action) {
  if (!futurePrice) return null;
  const diff = futurePrice - currentPrice;
  const profit = action === 'BUY' ? diff : -diff;
  return (profit / currentPrice) * 100;
}

async function runBacktest() {
  const history = await fetchFullHistory(SYMBOL, INTERVAL, 2);
  const closes = history.map((c) => c.close);
  const highs = history.map((c) => c.high);
  const lows = history.map((c) => c.low);
  const volumes = history.map((c) => c.volume);

  const emaShort = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.short, values: closes });
  const emaLong = EMA.calculate({ period: STRATEGY_CONFIG.emaPeriods.long, values: closes });
  const rsi = RSI.calculate({ values: closes, period: STRATEGY_CONFIG.rsiPeriod });

  let signals = [];

  for (let i = STRATEGY_CONFIG.emaPeriods.long; i < closes.length; i++) {
    const subCloses = closes.slice(0, i + 1);
    const subHighs = highs.slice(0, i + 1);
    const subLows = lows.slice(0, i + 1);
    const subVolumes = volumes.slice(0, i + 1);
    const subEmaShort = emaShort.slice(0, i + 1 - (closes.length - emaShort.length));
    const subEmaLong = emaLong.slice(0, i + 1 - (closes.length - emaLong.length));
    const subRSI = rsi.slice(0, i + 1 - (closes.length - rsi.length));

    const breakout = TradingStrategies.checkBreakout(subHighs, subLows, subCloses, subVolumes, subEmaShort, subEmaLong, subRSI.at(-1));
    const bollinger = TradingStrategies.checkBollingerBand(subCloses, subEmaShort, subEmaLong, subRSI, subVolumes);
    const macdCombo = TradingStrategies.checkMACD_RSI_Volume(subCloses, subVolumes, subRSI);

    const signalDate = format(new Date(history[i].openTime), 'dd/MM/yyyy HH:mm:ss');
    if (breakout || bollinger || macdCombo) {
      const currentPrice = subCloses.at(-1);
      const after1h = findPriceAfterTime(history, history[i].openTime, 1);
      const after4h = findPriceAfterTime(history, history[i].openTime, 4);
      const after8h = findPriceAfterTime(history, history[i].openTime, 8);
      const action = breakout?.action || bollinger?.action || macdCombo?.action;

      signals.push({
        date: signalDate,
        breakout,
        bollinger,
        macdCombo,
        price: currentPrice,
        after1h: after1h
          ? {
              price: after1h,
              profitPercent: calcProfitPercent(currentPrice, after1h, action),
            }
          : null,
        after4h: after4h
          ? {
              price: after4h,
              profitPercent: calcProfitPercent(currentPrice, after4h, action),
            }
          : null,
        after8h: after8h
          ? {
              price: after8h,
              profitPercent: calcProfitPercent(currentPrice, after8h, action),
            }
          : null,
      });
    }
  }

  const outputPath = path.join(TEST_FOLDER, `backtest_result_${SYMBOL}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(signals, null, 2));
  console.log(`✅ Đã lưu ${signals.length} tín hiệu vào file ${outputPath}`);
}

//runBacktest();


module.exports = { runBacktest }
