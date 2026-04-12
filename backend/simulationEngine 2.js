const axios = require('axios');
const watchlisthigh = require('./watchlisthigh.js'); 

// ==================== 投資組合狀態 ====================
let portfolio = {
  cash: 100000,
  positions: [],
  history: [],
};

// 用於保存 Schwab API 的 Access Token
let schwabAccessToken = null;

// ==================== 核心功能函數 ====================

// 讓外部 server.js 可以設定 Token
function setAccessToken(token) {
    console.log('[simulationEngine] Access Token 已設定。');
    schwabAccessToken = token;
}

// ✨ 新增：Schwab API 呼叫的輔助函數 ✨
async function getSchwabQuotes(tickers) {
  if (!schwabAccessToken) throw new Error('Schwab Access Token not available.');
  const url = `https://api.schwabapi.com/marketdata/v1/quotes?symbols=${tickers.join(',')}`;
  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${schwabAccessToken}` }
  });
  return response.data;
}

async function getSchwabPriceHistory(ticker) {
  if (!schwabAccessToken) throw new Error('Schwab Access Token not available.');
  // Schwab API 的 pricehistory 端點有一些限制，通常請求過去幾個月的日線數據是比較穩定的
  const url = `https://api.schwabapi.com/marketdata/v1/pricehistory/${ticker}?periodType=month&period=3&frequencyType=daily&frequency=1`;
  const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${schwabAccessToken}` }
  });
  return response.data;
}


// ✨ 修改：getPortfolio 使用 Schwab API ✨
async function getPortfolio() {
  if (portfolio.positions.length === 0) {
    return { ...portfolio, totalPortfolioValue: portfolio.cash };
  }

  try {
    const tickers = portfolio.positions.map(p => p.ticker);
    const quotesData = await getSchwabQuotes(tickers);

    const updatedPositions = portfolio.positions.map(pos => {
      const quote = quotesData[pos.ticker];
      if (quote && !quote.error && quote.quote) {
        return {
          ...pos,
          currentPrice: quote.quote.lastPrice,
          currentValue: quote.quote.lastPrice * pos.shares,
          dailyChange: quote.quote.netChange,
          dailyChangePercent: quote.quote.netPercentChangeInDouble || 0,
        };
      }
      return { ...pos, currentPrice: pos.avgCost, currentValue: pos.avgCost * pos.shares, dailyChange: 0, dailyChangePercent: 0 };
    });

    const totalPositionsValue = updatedPositions.reduce((sum, p) => sum + p.currentValue, 0);
    const totalPortfolioValue = portfolio.cash + totalPositionsValue;
    
    return { ...portfolio, positions: updatedPositions, totalPortfolioValue };
  } catch (error) {
      console.error('❌ 更新投資組合時獲取 Schwab 報價失敗:', error.response ? error.response.data : error.message);
      return getPortfolioWithoutUpdate();
  }
}

// 輔助函數：在 API 失敗時回傳未更新的組合
function getPortfolioWithoutUpdate() {
    const totalPositionsValue = portfolio.positions.reduce((sum, p) => sum + (p.currentValue || (p.avgCost * p.shares)), 0);
    const totalPortfolioValue = portfolio.cash + totalPositionsValue;
    return { ...portfolio, totalPortfolioValue };
}


// ✨ 修改：executeBuy/Sell 使用 Schwab API 獲取成交價 ✨
async function executeBuy(ticker, shares) {
  try {
    const quotesData = await getSchwabQuotes([ticker]);
    const price = quotesData[ticker]?.quote?.lastPrice;
    if (!price) throw new Error('無法從 Schwab API 獲取價格');
    
    const cost = price * shares;
    if (portfolio.cash < cost) return { success: false, message: '現金不足' };

    portfolio.cash -= cost;
    const existingPos = portfolio.positions.find(p => p.ticker === ticker);
    if (existingPos) {
      const newTotalShares = existingPos.shares + shares;
      const newTotalCost = (existingPos.avgCost * existingPos.shares) + cost;
      existingPos.avgCost = newTotalCost / newTotalShares;
      existingPos.shares = newTotalShares;
    } else {
      portfolio.positions.push({ ticker, shares, avgCost: price, peakPrice: price });
    }
    portfolio.history.push({ type: 'BUY', date: new Date().toISOString(), ticker, shares, price });
    console.log(`📈 買入成功 [${ticker}]: ${shares} 股 @ $${price.toFixed(2)} (Schwab)`);
    return { success: true, message: '買入成功' };
  } catch (error) {
    console.error(`❌ 買入時發生錯誤 [${ticker}]:`, error.message);
    return { success: false, message: error.message };
  }
}

async function executeSell(ticker, shares) {
   try {
    const posIndex = portfolio.positions.findIndex(p => p.ticker === ticker);
    if (posIndex === -1) return { success: false, message: '未持有該部位' };

    const quotesData = await getSchwabQuotes([ticker]);
    const price = quotesData[ticker]?.quote?.lastPrice;
    if (!price) throw new Error('無法從 Schwab API 獲取價格');

    const position = portfolio.positions[posIndex];
    if (position.shares < shares) return { success: false, message: '持股不足' };

    portfolio.cash += price * shares;
    position.shares -= shares;
    if (position.shares === 0) {
      portfolio.positions.splice(posIndex, 1);
    }
    portfolio.history.push({ type: 'SELL', date: new Date().toISOString(), ticker, shares, price });
    console.log(`📉 賣出成功 [${ticker}]: ${shares} 股 @ $${price.toFixed(2)} (Schwab)`);
    return { success: true, message: '賣出成功' };
  } catch (error) {
    console.error(`❌ 賣出時發生錯誤 [${ticker}]:`, error.message);
    return { success: false, message: error.message };
  }
}


// ==================== ✨ 自動掃描與交易策略 (使用 Schwab API) ✨ ====================
const swingPointLookback = 5; 
const trailingStopPercent = 10; 
const tradeSizePercent = 0.05;

function getSwingHigh(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const targetIndexInSlice = lookback;
  const slice = quotes.slice(index - lookback, index + lookback + 1);
  if (slice.length <= targetIndexInSlice) return null;
  const highest = Math.max(...slice.map(q => q.high));
  return slice[targetIndexInSlice].high === highest ? quotes[index] : null;
}

function getSwingLow(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const targetIndexInSlice = lookback;
  const slice = quotes.slice(index - lookback, index + lookback + 1);
  if (slice.length <= targetIndexInSlice) return null;
  const lowest = Math.min(...slice.map(q => q.low));
  return slice[targetIndexInSlice].low === lowest ? quotes[index] : null;
}

async function scanForSignalsAndTrade() {
  console.log(`\n===== [${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}] 自動掃描開始 (數據源: Schwab) =====`);
  if (!schwabAccessToken) {
      console.warn("⚠️ 掃描暫停：等待 Schwab API 認證...");
      return;
  }
  
  try {
    // 1. 更新現有持股的動態停損點
    if (portfolio.positions.length > 0) {
        const tickers = portfolio.positions.map(p => p.ticker);
        const quotesData = await getSchwabQuotes(tickers);
        for (const position of portfolio.positions) {
            const quote = quotesData[position.ticker];
            if (quote && quote.quote && quote.quote.lastPrice) {
                // 更新最高價
                if (quote.quote.lastPrice > (position.peakPrice || 0)) {
                    position.peakPrice = quote.quote.lastPrice;
                }
                // 檢查動態停損
                const dropFromPeak = ((quote.quote.lastPrice - position.peakPrice) / position.peakPrice) * 100;
                if (dropFromPeak <= -trailingStopPercent) {
                    console.log(`🚨 動態停損觸發 [${position.ticker}]! 從最高點 $${position.peakPrice.toFixed(2)} 回落超過 ${trailingStopPercent}%`);
                    await executeSell(position.ticker, position.shares);
                }
            }
        }
    }
    
    // 2. 掃描觀察列表，尋找新的交易機會
    for (const ticker of watchlisthigh) {
      if (portfolio.positions.find(p => p.ticker === ticker)) continue;
      try {
        const historyData = await getSchwabPriceHistory(ticker);
        if (!historyData || !historyData.candles || historyData.candles.length === 0) {
            console.warn(`⚠️ 從 Schwab 獲取 [${ticker}] 的歷史數據為空，跳過。`);
            continue;
        }
        
        // 資料格式轉換：將 Schwab 的格式轉為我們策略習慣的格式
        const quotes = historyData.candles.map(c => ({
            date: new Date(c.datetime),
            high: c.high,
            low: c.low,
            open: c.open,
            close: c.close,
            volume: c.volume
        }));

        if (quotes.length < swingPointLookback * 2 + 1) continue;

        let lastSwingHigh = null, lastSwingLow = null;
        // 從後往前找最近的擺盪高低點
        for (let i = quotes.length - 2; i >= swingPointLookback * 2; i--) {
            const high = getSwingHigh(quotes, i, swingPointLookback);
            const low = getSwingLow(quotes, i, swingPointLookback);
            if (!lastSwingHigh && high) lastSwingHigh = high;
            if (!lastSwingLow && low) lastSwingLow = low;
            if (lastSwingHigh && lastSwingLow) break;
        }
        
        if (!lastSwingHigh || !lastSwingLow) continue;

        const currentPrice = quotes[quotes.length - 1].close;
        if (currentPrice > lastSwingHigh.high) {
          console.log(`📈 偵測到買入訊號 [${ticker}]: 價格 $${currentPrice.toFixed(2)} 突破前高 $${lastSwingHigh.high.toFixed(2)}`);
          const sharesToBuy = Math.floor((portfolio.cash * tradeSizePercent) / currentPrice);
          if (sharesToBuy > 0) {
            await executeBuy(ticker, sharesToBuy);
          }
        }
      } catch (error) {
        console.warn(`⚠️ 掃描 [${ticker}] 時發生錯誤: ${error.response ? error.response.data.error : error.message}`);
      }
    }
  } catch (error) {
    console.error("❌❌❌ 在執行自動掃描時捕獲到一個嚴重錯誤:", error);
  } finally {
    console.log(`===== 自動掃描結束 =====`);
  }
}

// 匯出需要被外部使用的函數
module.exports = {
  getPortfolio,
  executeBuy,
  executeSell,
  scanForSignalsAndTrade,
  setAccessToken,
};