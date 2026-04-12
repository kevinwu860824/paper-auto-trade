/*
// backtest.js (新增了自訂日期區間功能)

const yahooFinance = require('yahoo-finance2').default;
const watchlisthigh = require('./watchlisthigh.js'); 

// ... (simulateBuy, simulateSell, getSwingHigh, getSwingLow 函數保持完全不變) ...
const initialCash = 100000;
const portfolio = {
  cash: initialCash,
  positions: {},
  history: [],
};
const swingPointLookback = 5;
const trailingStopPercent = 10;
const tradeSizePercent = 0.05;
function simulateBuy(date, ticker, price, shares, entryHigh) {
  const cost = price * shares;
  if (portfolio.cash < cost) return false;
  portfolio.cash -= cost;
  if (portfolio.positions[ticker]) {
    const existingPos = portfolio.positions[ticker];
    const newTotalShares = existingPos.shares + shares;
    const newTotalCost = (existingPos.avgCost * existingPos.shares) + cost;
    portfolio.positions[ticker] = {
      shares: newTotalShares,
      avgCost: newTotalCost / newTotalShares,
      entryPrice: existingPos.entryPrice,
      peakPrice: existingPos.peakPrice > price ? existingPos.peakPrice : price
    };
  } else {
    portfolio.positions[ticker] = { shares, avgCost: price, entryPrice: price, peakPrice: price };
  }
  portfolio.history.push({ type: 'BUY', date, ticker, shares, price, entryHigh });
  return true;
}
function simulateSell(date, ticker, price, shares, reason) {
  const pos = portfolio.positions[ticker];
  if (!pos || pos.shares < shares) return false;
  pos.shares -= shares;
  portfolio.cash += price * shares;
  if (pos.shares === 0) {
    delete portfolio.positions[ticker];
  }
  portfolio.history.push({ type: 'SELL', date, ticker, shares, price, reason });
  return true;
}
function getSwingHigh(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const slice = quotes.slice(index - lookback * 2, index + 1);
  const highest = Math.max(...slice.map(q => q.high));
  return slice[lookback * 2].high === highest ? quotes[index - lookback] : null;
}
function getSwingLow(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const slice = quotes.slice(index - lookback * 2, index + 1);
  const lowest = Math.min(...slice.map(q => q.low));
  return slice[lookback * 2].low === lowest ? quotes[index - lookback] : null;
}



// ============== 回測主引擎 (已修改) ==============
// ✨ 參數變更：tradeStartDateStr 是必需的，endDateStr 可選，預熱期長度(年)可選
async function runBacktest(tradeStartDateStr, tradeEndDateStr = null, dataLookbackYears = 1) {
  console.log('====== 開始回測 (市場結構突破策略) ======');
  
  // --- ✨ 新的日期處理與預熱期邏輯 ✨ ---
  const tradeStartDate = new Date(tradeStartDateStr);
  const tradeEndDate = tradeEndDateStr ? new Date(tradeEndDateStr) : new Date();
  
  // 數據開始日期 = 交易開始日期 - 預熱期
  const dataStartDate = new Date(tradeStartDate);
  dataStartDate.setFullYear(tradeStartDate.getFullYear() - dataLookbackYears);
  
  console.log(`數據獲取期間 (Data Period): ${dataStartDate.toISOString().split('T')[0]} to ${tradeEndDate.toISOString().split('T')[0]}`);
  console.log(`交易執行期間 (Trade Period): ${tradeStartDate.toISOString().split('T')[0]} to ${tradeEndDate.toISOString().split('T')[0]}`);
  // --- ✨ 日期處理邏輯結束 ✨ ---

  for (const ticker of watchlisthigh) {
    console.log(`\n正在回測 [${ticker}]...`);
    try {
      const history = await yahooFinance.chart(ticker, {
        period1: dataStartDate.toISOString().split('T')[0],
        period2: tradeEndDate.toISOString().split('T')[0],
        interval: '1d'
      });
      
      const quotes = history.quotes.filter(q => q && q.date);
      if (!quotes || quotes.length < swingPointLookback * 2 + 1) {
        console.warn(`數據不足，跳過 [${ticker}]`);
        continue;
      }
      let lastSwingHigh = null;
      let lastSwingLow = null;
      let currentTrend = null;

      for (let i = swingPointLookback * 2; i < quotes.length; i++) {
        const todayQuote = quotes[i];
        
        // --- 預熱期邏輯：無論何時都計算指標 ---
        const swingHigh = getSwingHigh(quotes, i, swingPointLookback);
        const swingLow = getSwingLow(quotes, i, swingPointLookback);
        if (swingHigh) lastSwingHigh = swingHigh;
        if (swingLow) lastSwingLow = swingLow;

        // --- ✨ 核心修改：只有在日期進入交易期後，才執行買賣邏輯 ✨ ---
        if (todayQuote.date >= tradeStartDate) {
            const position = portfolio.positions[ticker];
            
            // 更新持股最高價 (這也應該只在交易期內發生)
            if (position && todayQuote.high > position.peakPrice) {
                position.peakPrice = todayQuote.high;
            }

            // 初始化趨勢
            if (currentTrend === null) {
                if (lastSwingHigh && lastSwingLow) {
                    currentTrend = (lastSwingHigh.high > lastSwingLow.low) ? 'bullish' : 'bearish';
                }
                continue; 
            }

            // 偵測趨勢反轉 (CHoCH) 和趨勢延續 (BOS)
            // ... (所有 if/else if 買賣判斷邏輯都放在這個大括號內) ...
             if (currentTrend === 'bullish' && todayQuote.close < lastSwingLow.low) {
                if (position) {
                    simulateSell(todayQuote.date.toISOString(), ticker, todayQuote.close, position.shares, 'CHoCH');
                }
                currentTrend = 'bearish';
            } else if (currentTrend === 'bearish' && todayQuote.close > lastSwingHigh.high) {
                const sharesToBuy = Math.floor((portfolio.cash * tradeSizePercent) / todayQuote.close);
                if (sharesToBuy > 0) {
                    simulateBuy(todayQuote.date.toISOString(), ticker, todayQuote.close, sharesToBuy, todayQuote.high);
                }
                currentTrend = 'bullish';
            }
            if (currentTrend === 'bullish' && todayQuote.high > lastSwingHigh.high) {
                const sharesToBuy = Math.floor((portfolio.cash * tradeSizePercent) / todayQuote.close);
                if (sharesToBuy > 0 && !position) {
                    simulateBuy(todayQuote.date.toISOString(), ticker, todayQuote.close, sharesToBuy, todayQuote.high);
                }
            }

            // 賣出訊號：動態止損
            if (position) {
                const dropFromPeak = ((todayQuote.close - position.peakPrice) / position.peakPrice) * 100;
                if (dropFromPeak <= -trailingStopPercent) {
                    simulateSell(todayQuote.date.toISOString(), ticker, todayQuote.close, position.shares, 'trailing_stop');
                }
            }
        } // <-- 交易期判斷的結束括號
      }
      
      const pos = portfolio.positions[ticker];
      if (pos) {
        const lastQuote = quotes[quotes.length - 1];
        simulateSell(lastQuote.date.toISOString(), ticker, lastQuote.close, pos.shares, 'end_of_backtest');
      }
    } catch (error) {
      console.error(`❌ 回測 [${ticker}] 時發生錯誤:`, error.message);
    }
  }

  // ... (最終結果計算的部分，保持不變) ...
  let finalValue = portfolio.cash;
  console.log('\n====== 回溯測試結果 ======');
  console.log(`初始資金: $${initialCash.toFixed(2)}`);
  console.log(`最終資產淨值: $${finalValue.toFixed(2)}`);
  console.log(`總獲利: $${(finalValue - initialCash).toFixed(2)}`);
  console.log(`總報酬率: ${((finalValue - initialCash) / initialCash * 100).toFixed(2)}%`);
  // ...
}

// ==================== ✨ 新的執行方式 ✨ ====================
// 參數一：交易開始日期 (必填)
// 參數二：交易結束日期 (可選，預設為今天)
// 參數三：數據預熱期(年) (可選，預設為 1 年)

// 範例：測試 2022 年全年的表現，但使用 2021 年的全年數據進行預熱
runBacktest('2025-08-01', '2025-09-26', 0);

// 範例：測試從 2023 年初至今的表現，使用 2022 年的數據預熱
// runBacktest('2023-01-01');
*/

// backtest.js (數據源: Charles Schwab API) - 完整版本

const axios = require('axios'); 
const watchlisthigh = require('./watchlisthigh.js'); 

// ==================== ✨ 步驟 1：手動填入 Access Token ✨ ====================
// 在運行此腳本前，請先透過您的 paper-auto-trade 後端伺服器完成登入流程，
// 然後將獲取到的 Access Token 完整地貼在下方的引號中。
const accessToken = "I0.b2F1dGgyLmNkYy5zY2h3YWIuY29t.7IcJAhM7xH2e6vT40NagGnyvsnnNvsjkYACSIWDMZuI@";
// =========================================================================

// ==================== 模擬交易核心函數 (未變更) ====================
const initialCash = 100000;
const portfolio = {
  cash: initialCash,
  positions: {},
  history: [],
};

// 策略參數
const swingPointLookback = 5; 
const trailingStopPercent = 10; 
const tradeSizePercent = 0.05;

// 模擬買入
function simulateBuy(date, ticker, price, shares, entryHigh) {
  const cost = price * shares;
  if (portfolio.cash < cost) return false;

  portfolio.cash -= cost;
  if (portfolio.positions[ticker]) {
    const existingPos = portfolio.positions[ticker];
    const newTotalShares = existingPos.shares + shares;
    const newTotalCost = (existingPos.avgCost * existingPos.shares) + cost;
    portfolio.positions[ticker] = {
      shares: newTotalShares,
      avgCost: newTotalCost / newTotalShares,
      entryPrice: existingPos.entryPrice,
      peakPrice: existingPos.peakPrice > price ? existingPos.peakPrice : price
    };
  } else {
    portfolio.positions[ticker] = { shares, avgCost: price, entryPrice: price, peakPrice: price };
  }
  portfolio.history.push({ type: 'BUY', date, ticker, shares, price, entryHigh });
  return true;
}

// 模擬賣出
function simulateSell(date, ticker, price, shares, reason) {
  const pos = portfolio.positions[ticker];
  if (!pos || pos.shares < shares) return false;

  pos.shares -= shares;
  portfolio.cash += price * shares;
  if (pos.shares === 0) {
    delete portfolio.positions[ticker];
  }
  portfolio.history.push({ type: 'SELL', date, ticker, shares, price, reason });
  return true;
}

// 偵測擺盪高點和低點
function getSwingHigh(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const slice = quotes.slice(index - lookback * 2, index + 1);
  const highest = Math.max(...slice.map(q => q.high));
  return slice[lookback * 2].high === highest ? quotes[index - lookback] : null;
}

function getSwingLow(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const slice = quotes.slice(index - lookback * 2, index + 1);
  const lowest = Math.min(...slice.map(q => q.low));
  return slice[lookback * 2].low === lowest ? quotes[index - lookback] : null;
}

// ============== Schwab API 歷史數據獲取函數 (新) ==============
// 在 backtest.js 中，取代舊的 getSchwabPriceHistory 函數

// 在 backtest.js 中，取代舊的 getSchwabPriceHistory 函數

async function getSchwabPriceHistory(ticker, startDate, endDate) {
  if (!accessToken || accessToken.includes("在這裡貼上")) {
    throw new Error('無效的 Access Token。請先手動填入一個有效的 Token。');
  }

  const baseUrl = `https://api.schwabapi.com/marketdata/v1/pricehistory`;
  
  // --- ✨ 核心修改：明確指定 periodType 和 period 來匹配 daily 頻率 ✨ ---
  // 計算開始和結束日期之間相差多少年，並向上取整
  const years = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24 * 365));

  const queryParams = {
    symbol: ticker,
    periodType: 'year', // 明確告訴 API 我們要以「年」為單位
    period: years,      // 告訴 API 我們需要幾年的數據
    frequencyType: 'daily',
    frequency: 1,       // 當 frequencyType 為 daily 時，frequency 必須為 1
    // endDate 和 startDate 在指定 periodType 和 period 時，通常會被 API 忽略，
    // 但為保險起見仍可傳送，或將其移除。我們先將其保留。
    endDate: endDate.getTime(), 
    startDate: startDate.getTime(),
  };
  // --- ✨ 修改結束 ✨ ---

  const fullUrl = `${baseUrl}?${new URLSearchParams(queryParams).toString()}`;
  console.log(`\n[DIAGNOSTIC] Calling correct Schwab API URL:`);
  console.log(fullUrl);
  
  const response = await axios.get(baseUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    params: queryParams
  });
  return response.data;
}

// ============== 回測主引擎 (使用 Schwab API) ==============
async function runBacktest(tradeStartDateStr, tradeEndDateStr = null, dataLookbackYears = 1) {
  console.log('====== 開始回測 (數據源: Schwab API) ======');
  
  const tradeStartDate = new Date(tradeStartDateStr);
  const tradeEndDate = tradeEndDateStr ? new Date(tradeEndDateStr) : new Date();
  const dataStartDate = new Date(tradeStartDate);
  dataStartDate.setFullYear(tradeStartDate.getFullYear() - dataLookbackYears);
  
  console.log(`數據獲取期間 (Data Period): ${dataStartDate.toISOString().split('T')[0]} to ${tradeEndDate.toISOString().split('T')[0]}`);
  console.log(`交易執行期間 (Trade Period): ${tradeStartDate.toISOString().split('T')[0]} to ${tradeEndDate.toISOString().split('T')[0]}`);

  for (const ticker of watchlisthigh) {
    console.log(`\n正在回測 [${ticker}]...`);
    try {
      const historyData = await getSchwabPriceHistory(ticker, dataStartDate, tradeEndDate);
      
      if (!historyData || !historyData.candles || historyData.candles.length === 0) {
          console.warn(`從 Schwab API 未獲取到 [${ticker}] 的數據，跳過。`);
          continue;
      }
      
      const quotes = historyData.candles.map(c => ({
          date: new Date(c.datetime),
          high: c.high,
          low: c.low,
          open: c.open,
          close: c.close,
          volume: c.volume
      }));

      if (quotes.length < swingPointLookback * 2 + 1) {
        console.warn(`數據不足，跳過 [${ticker}]`);
        continue;
      }

      let lastSwingHigh = null;
      let lastSwingLow = null;
      let currentTrend = null;

      for (let i = swingPointLookback * 2; i < quotes.length; i++) {
        const todayQuote = quotes[i];
        
        const swingHigh = getSwingHigh(quotes, i, swingPointLookback);
        const swingLow = getSwingLow(quotes, i, swingPointLookback);
        if (swingHigh) lastSwingHigh = swingHigh;
        if (swingLow) lastSwingLow = swingLow;

        if (todayQuote.date >= tradeStartDate) {
            const position = portfolio.positions[ticker];
            
            if (position && todayQuote.high > position.peakPrice) {
                position.peakPrice = todayQuote.high;
            }

            if (currentTrend === null) {
                if (lastSwingHigh && lastSwingLow) {
                    currentTrend = (lastSwingHigh.high > lastSwingLow.low) ? 'bullish' : 'bearish';
                }
                continue; 
            }

            if (currentTrend === 'bullish' && todayQuote.close < lastSwingLow.low) {
                if (position) {
                    simulateSell(todayQuote.date.toISOString(), ticker, todayQuote.close, position.shares, 'CHoCH');
                }
                currentTrend = 'bearish';
            } else if (currentTrend === 'bearish' && todayQuote.close > lastSwingHigh.high) {
                const sharesToBuy = Math.floor((portfolio.cash * tradeSizePercent) / todayQuote.close);
                if (sharesToBuy > 0) {
                    simulateBuy(todayQuote.date.toISOString(), ticker, todayQuote.close, sharesToBuy, todayQuote.high);
                }
                currentTrend = 'bullish';
            }
            if (currentTrend === 'bullish' && todayQuote.high > lastSwingHigh.high) {
                const sharesToBuy = Math.floor((portfolio.cash * tradeSizePercent) / todayQuote.close);
                if (sharesToBuy > 0 && !position) {
                    simulateBuy(todayQuote.date.toISOString(), ticker, todayQuote.close, sharesToBuy, todayQuote.high);
                }
            }

            if (position) {
                const dropFromPeak = ((todayQuote.close - position.peakPrice) / position.peakPrice) * 100;
                if (dropFromPeak <= -trailingStopPercent) {
                    simulateSell(todayQuote.date.toISOString(), ticker, todayQuote.close, position.shares, 'trailing_stop');
                }
            }
        }
      }
      
      const pos = portfolio.positions[ticker];
      if (pos) {
        const lastQuote = quotes[quotes.length - 1];
        simulateSell(lastQuote.date.toISOString(), ticker, lastQuote.close, pos.shares, 'end_of_backtest');
      }
    } catch (error) {
      console.error(`❌ 回測 [${ticker}] 時發生錯誤:`);
      if (error.response) {
      // 如果是 API 回傳的錯誤，印出狀態碼和詳細內容
      console.error('   - API Status:', error.response.status);
      console.error('   - API Response:', error.response.data);
      }else {
      // 如果是其他錯誤 (例如網路問題或程式碼 bug)
      console.error('   - Error Message:', error.message);
    }
  }
}


  let finalValue = portfolio.cash;
  console.log('\n====== 回溯測試結果 ======');
  console.log(`初始資金: $${initialCash.toFixed(2)}`);
  console.log(`最終資產淨值: $${finalValue.toFixed(2)}`);
  console.log(`總獲利: $${(finalValue - initialCash).toFixed(2)}`);
  console.log(`總報酬率: ${((finalValue - initialCash) / initialCash * 100).toFixed(2)}%`);
  console.log('所有交易紀錄:', portfolio.history);
}

// ==================== 執行方式 ====================
// 參數一：交易開始日期 (必填)
// 參數二：交易結束日期 (可選，預設為今天)
// 參數三：數據預熱期(年) (可選，預設為 1 年)

// 範例：測試 2022 年全年的表現，使用 2021 年的全年數據進行預熱
runBacktest('2023-01-01', '2023-12-31', 0);