const yahooFinance = require('yahoo-finance2').default;
const watchlist = require('./watchlist.js');

// 計算簡單移動平均線 (SMA) 的函數
function calculateSMA(data, period) {
  // 注意：yahoo-finance2 回傳的歷史數據可能是無效的 (null)
  const validData = data.filter(d => d && typeof d.close === 'number');
  const closes = validData.map(d => d.close);

  if (closes.length < period) return null; // 數據不足

  const sum = closes.slice(-period).reduce((acc, val) => acc + val, 0);
  return sum / period;
}

async function getSmaForTicker(ticker) {
  try {
    console.log(`\n正在查詢 ${ticker} 的歷史數據並計算 SMA...`);

    const today = new Date();
    // ==================== 修改開始 (1/2) ====================
    // 將 60 天改為 90 天，確保有足夠的交易日數據
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(today.getDate() - 90);
    // =======================================================

    // ==================== 修改開始 (2/2) ====================
    // 遵從套件作者的建議，將 historical() 改為 chart()
    const history = await yahooFinance.chart(ticker, {
      period1: ninetyDaysAgo.toISOString().split('T')[0],
      period2: today.toISOString().split('T')[0],
      interval: '1d'
    });
    // =======================================================
    
    // API 回傳的結果現在在 history.quotes
    const quotes = history.quotes;

    if (!quotes || quotes.length < 50) {
      throw new Error(`歷史數據不足50天 (${quotes?.length || 0} 天)，無法計算50日均線。`);
    }

    // 計算 20 日和 50 日的 SMA
    const sma20 = calculateSMA(quotes, 20);
    const sma50 = calculateSMA(quotes, 50);
    const lastClose = quotes[quotes.length - 1].close;

    if (sma20 === null || sma50 === null) {
       throw new Error('SMA 計算失敗，可能數據點不足。');
    }

    console.log('--- 計算成功 ---');
    console.log(`最新收盤價: \$${lastClose.toFixed(2)}`);
    console.log(`20日均線 (SMA20): \$${sma20.toFixed(2)}`);
    console.log(`50日均線 (SMA50): \$${sma50.toFixed(2)}`);
    
    if (sma20 > sma50) {
      console.log('訊號：黃金交叉 (短期趨勢 > 長期趨勢)');
    } else {
      console.log('訊號：死亡交叉 (短期趨勢 < 長期趨勢)');
    }

  } catch (error) {
    console.error(`處理 ${ticker} 失敗:`, error.message);
  }
}

// 從我們的觀察名單中，隨機選一支股票來測試
const testTicker = watchlist[Math.floor(Math.random() * watchlist.length)];
getSmaForTicker(testTicker);