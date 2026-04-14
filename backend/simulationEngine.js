

// simulationEngine.js (資料庫驅動最終版)

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const watchlisthigh = require('./watchlisthigh.js'); 

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

let schwabAccessToken = null;

// ==================== 核心輔助函數 ====================

function setAccessToken(token) {
    schwabAccessToken = token;
}

async function getSchwabQuotes(tickers) {
  if (!schwabAccessToken) throw new Error('Schwab Access Token not available.');
  const url = `https://api.schwabapi.com/marketdata/v1/quotes?symbols=${tickers.join(',')}`;
  const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${schwabAccessToken}` } });
  return response.data;
}

async function getSchwabPriceHistory(ticker, startDate, endDate) {
  if (!schwabAccessToken) throw new Error('Schwab Access Token not available.');
  const baseUrl = `https://api.schwabapi.com/marketdata/v1/pricehistory`;
  const diffTime = Math.abs(endDate - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  let periodType = 'year';
  let period = Math.ceil(diffDays / 365);
  if (period < 1) period = 1;
  const queryParams = {
    symbol: ticker, periodType: periodType, period: period,
    frequencyType: 'daily', frequency: 1,
    startDate: startDate.getTime(), endDate: endDate.getTime(),
  };
  const response = await axios.get(baseUrl, { headers: { 'Authorization': `Bearer ${schwabAccessToken}` }, params: queryParams });
  return response.data;
}

/*
async function isMarketBullish() {
  const marketIndex = 'SPY'; // 使用 S&P 500 ETF 作為市場指標
  const lookbackDays = 250; // 獲取約一年的交易日數據來計算 200MA
  const maPeriod = 200;
  console.log(`[市場篩選器] 正在獲取 ${marketIndex} 的數據來判斷市場趨勢...`);
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - lookbackDays);
    const historyData = await getSchwabPriceHistory(marketIndex, startDate, endDate);
    if (!historyData || !historyData.candles || historyData.candles.length < maPeriod) {
      console.warn(`[市場篩選器] 無法獲取足夠的 ${marketIndex} 數據，為安全起見，預設為熊市。`);
      return false; 
    }
    const candles = historyData.candles;
    const lastPrice = candles[candles.length - 1].close;
    const closingPrices = candles.slice(-maPeriod).map(c => c.close);
    const sum = closingPrices.reduce((a, b) => a + b, 0);
    const sma200 = sum / maPeriod;
    console.log(`[市場篩選器] ${marketIndex} 現價: ${lastPrice.toFixed(2)}, 200日均線: ${sma200.toFixed(2)}`);
    if (lastPrice > sma200) {
      console.log('✅ [市場篩選器] 判斷：牛市，允許交易。');
      return true;
    } else {
      console.log('📉 [市場篩選器] 判斷：熊市，將暫停新的買入操作。');
      return false;
    }
  } catch (error) {
    console.error(`❌ [市場篩選器] 獲取 ${marketIndex} 數據時發生錯誤:`, error.message);
    return false; // 如果無法判斷，最安全的做法是不要交易
  }
}
*/

// 獲取投资组合
async function getPortfolio(userId) {
  const { data: stateData, error: stateError } = await supabase.from('portfolio_state').select('cash, history').eq('user_id', userId).order('id', { ascending: false }).limit(1).maybeSingle();
  const { data: dbPositions, error: positionsError } = await supabase.from('positions').select('*').eq('user_id', userId);

  if (stateError || positionsError) {
    console.error('讀取資料庫投資組合失敗:', stateError || positionsError);
    throw new Error('Failed to fetch portfolio from DB.');
  }
  if (!stateData) {
     return { cash: 100000, positions: [], history: [], totalPortfolioValue: 100000 };
  }
  if (!dbPositions || dbPositions.length === 0) {
    return { cash: stateData.cash, positions: [], history: stateData.history, totalPortfolioValue: stateData.cash };
  }
  const tickers = dbPositions.map(p => p.ticker);
  const quotesData = await getSchwabQuotes(tickers);
  const updatedPositions = dbPositions.map(pos => {
    const quote = quotesData[pos.ticker];
    if (quote && !quote.error && quote.quote?.lastPrice) {
      return { ...pos, currentPrice: quote.quote.lastPrice, currentValue: quote.quote.lastPrice * pos.shares, dailyChange: quote.quote.netChange || 0, dailyChangePercent: quote.quote.netPercentChangeInDouble || 0 };
    }
    return { ...pos, currentPrice: pos.avgCost, currentValue: pos.avgCost * pos.shares, dailyChange: 0, dailyChangePercent: 0 };
  });

  const totalPositionsValue = updatedPositions.reduce((sum, p) => sum + p.currentValue, 0);
  const totalPortfolioValue = stateData.cash + totalPositionsValue;
  return { cash: stateData.cash, positions: updatedPositions, history: stateData.history || [], totalPortfolioValue };
}

async function executeBuy(userId, ticker, shares) {
  const quotesData = await getSchwabQuotes(ticker.split(',')); // Helper expects array or handles mapping
  const price = quotesData[ticker]?.quote?.lastPrice;
  if (!price) throw new Error(`無法獲取 [${ticker}] 的價格`);

  const cost = price * shares;
  const { data: state, error: stateError } = await supabase.from('portfolio_state').select('cash, history').eq('user_id', userId).order('id', { ascending: false }).limit(1).maybeSingle();
  if (stateError || !state) throw new Error(stateError ? stateError.message : '找不到指定的投資組合狀態');
  if (state.cash < cost) return { success: false, message: '現金不足' };
  
  const { data: existingPos, error: posError } = await supabase.from('positions').select('*').eq('ticker', ticker).eq('user_id', userId).maybeSingle();
  if (posError) throw posError;

  const newHistory = [...(state.history || []), { type: 'BUY', date: new Date().toISOString(), ticker, shares, price }];
  
  if (existingPos) { // 更新現有持股
    const newShares = existingPos.shares + shares;
    const newAvgCost = ((existingPos.avgCost * existingPos.shares) + cost) / newShares;
    const { error: updatePosError } = await supabase.from('positions').update({ shares: newShares, avgCost: newAvgCost }).eq('ticker', ticker).eq('user_id', userId);
    if (updatePosError) throw updatePosError;
  } else { // 新增持股
    const { error: insertPosError } = await supabase.from('positions').insert({ ticker, shares, avgCost: price, peakPrice: price, user_id: userId });
    if (insertPosError) throw insertPosError;
  }
  
  // 更新現金餘額和歷史紀錄
  const { error: updateStateError } = await supabase.from('portfolio_state').update({ cash: state.cash - cost, history: newHistory }).eq('user_id', userId);
  if (updateStateError) throw updateStateError;
  
  console.log(`📈 買入成功 [${ticker}]: ${shares} 股 @ $${price.toFixed(2)}`);
  return { success: true, message: '買入成功' };
}

async function executeSell(userId, ticker, shares) {
    const { data: posToSell, error: posError } = await supabase.from('positions').select('*').eq('ticker', ticker).eq('user_id', userId).maybeSingle();
    if (!posToSell || posError) return { success: false, message: '未持有該部位' };
    if (posToSell.shares < shares) return { success: false, message: '持股不足' };

    const quotesData = await getSchwabQuotes([ticker]);
    const price = quotesData[ticker]?.quote?.lastPrice;
    if (!price) throw new Error(`無法獲取 [${ticker}] 的價格`);
    
    const { data: state, error: stateError } = await supabase.from('portfolio_state').select('cash, history').eq('user_id', userId).order('id', { ascending: false }).limit(1).maybeSingle();
    if (stateError || !state) throw new Error('Could not fetch portfolio state');

    const newHistory = [...(state.history || []), { type: 'SELL', date: new Date().toISOString(), ticker, shares, price }];

    if (posToSell.shares - shares <= 0) { // 賣出全部
        const { error } = await supabase.from('positions').delete().eq('ticker', ticker).eq('user_id', userId);
        if (error) throw error;
    } else { // 賣出部分
        const newShares = posToSell.shares - shares;
        const { error } = await supabase.from('positions').update({ shares: newShares }).eq('ticker', ticker).eq('user_id', userId);
        if (error) throw error;
    }

    const { error: updateStateError } = await supabase.from('portfolio_state').update({ cash: state.cash + (price * shares), history: newHistory }).eq('user_id', userId);
    if (updateStateError) throw updateStateError;

    console.log(`📉 賣出成功 [${ticker}]: ${shares} 股 @ $${price.toFixed(2)}`);
    return { success: true, message: '賣出成功' };
}



// ==================== 自動掃描與交易策略 ====================
const swingPointLookback = 5; 
const trailingStopPercent = 10; 
const tradeSizePercent = 0.05;

function getSwingHigh(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const slice = quotes.slice(index - lookback, index + lookback + 1);
  if (slice.length <= lookback + 1) return null;
  const highest = Math.max(...slice.map(q => q.high));
  return slice[lookback].high === highest ? quotes[index] : null;
}

function getSwingLow(quotes, index, lookback) {
  if (index < lookback * 2) return null;
  const slice = quotes.slice(index - lookback, index + lookback + 1);
  if (slice.length <= lookback + 1) return null;
  const lowest = Math.min(...slice.map(q => q.low));
  return slice[lookback].low === lowest ? quotes[index] : null;
}

async function scanForSignalsAndTrade(userId) {
  console.log(`\n===== [${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}] 使用者 [${userId}] 自動掃描開始 =====`);
  if (!schwabAccessToken) {
      console.warn("⚠️ 掃描暫停：等待 Schwab API 認證...");
      return;
  }
  
  try {
    const { data: dbPositions, error: posError } = await supabase.from('positions').select('*').eq('user_id', userId);
    const { data: dbState, error: stateError } = await supabase.from('portfolio_state').select('cash').eq('user_id', userId).order('id', { ascending: false }).limit(1).maybeSingle();

    if (posError || stateError || !dbState) {
        console.error('掃描開始時讀取資料庫失敗:', posError || stateError);
        return;
    }
    
    // 預設參數
    const MAX_POSITIONS = 5;
    const END_DATE = new Date();
    const START_DATE = new Date();
    START_DATE.setDate(END_DATE.getDate() - 320); // 確保有超過 200 個交易日

    // 1. 取得大盤 SPY 資料與 MA200
    console.log('[1/4] 取得大盤 SPY 狀態...');
    const spyData = await getSchwabPriceHistory('SPY', START_DATE, END_DATE).catch(()=>null);
    if (!spyData || !spyData.candles || spyData.candles.length < 200) {
        console.warn("⚠️ 無法獲取足夠的 SPY 歷史數據，為安全起見暫停掃描。");
        return;
    }
    const spyCandles = spyData.candles.filter(c => c && c.close);
    const spyClose = spyCandles[spyCandles.length - 1].close;
    let spySum = 0;
    for(let i = spyCandles.length - 200; i < spyCandles.length; i++) spySum += spyCandles[i].close;
    const spyMA200 = spySum / 200;
    const isBullMarket = spyClose > spyMA200;
    console.log(`大盤現價: $${spyClose.toFixed(2)}, 200MA: $${spyMA200.toFixed(2)} -> 狀態: ${isBullMarket ? '🟢 牛市' : '🔴 熊市'}`);

    // 2. 爬取 90 檔股票尋找飛刀獵物
    console.log(`\n[2/4] 掃描 90 檔績優股尋找潛在獵物... (約需 1~2 分鐘)`);
    const candidates = [];
    const stockStats = {}; 
    
    for (const ticker of watchlisthigh) {
        await new Promise(r => setTimeout(r, 60)); // 防止 Schwab Rate Limit
        
        const historyData = await getSchwabPriceHistory(ticker, START_DATE, END_DATE).catch(e => null);
        if (!historyData || !historyData.candles || historyData.candles.length < 200) continue;
        
        const quotes = historyData.candles.filter(c => c && c.close);
        const latest = quotes[quotes.length - 1];
        
        let sum5 = 0; for(let i = quotes.length - 5; i < quotes.length; i++) sum5 += quotes[i].close;
        const ma5 = sum5 / 5;
        
        let sum200 = 0; for(let i = quotes.length - 200; i < quotes.length; i++) sum200 += quotes[i].close;
        const ma200 = sum200 / 200;
        
        let consecutiveDrops = 0;
        for(let i = quotes.length - 1; i > 0; i--) {
            if (quotes[i].close < quotes[i-1].close) consecutiveDrops++; else break;
        }
        
        stockStats[ticker] = { close: latest.close, ma5, ma200 };
        
        if (latest.close > ma200 && consecutiveDrops >= 3) {
            const stretch = (ma5 - latest.close) / ma5;
            candidates.push({ ticker, stretch, close: latest.close });
        }
    }
    
    candidates.sort((a, b) => b.stretch - a.stretch);
    if (candidates.length > 0) {
        console.log(`🎯 發現 ${candidates.length} 檔潛在飛刀標的！最高乖離: ${candidates[0].ticker}`);
    } else {
        console.log(`沒有發現符合連跌3天接刀條件的標的。`);
    }

    // 3. 結算與賣出判定區塊
    console.log(`\n[3/4] 檢查手中部位並執行停利/停損/避險...`);
    for (const pos of dbPositions) {
        const ticker = pos.ticker;
        if (ticker === 'TQQQ') {
            if (!isBullMarket || candidates.length > 0) {
                console.log(`🔪 觸發大盤危機 或 需要現金接刀，賣出所有 TQQQ！`);
                await executeSell(ticker, pos.shares);
            }
        } else {
            // 需要針對沒有抓到歷史資料的做二次 API 價格確認
            let currentStrats = stockStats[ticker];
            if (!currentStrats) {
                const latestQuote = await getSchwabQuotes([ticker]);
                if (latestQuote[ticker]?.quote?.lastPrice) {
                    currentStrats = { close: latestQuote[ticker].quote.lastPrice, ma5: 999999 }; // 補救，無法判斷ma5就不停利
                }
            }
            if (currentStrats) {
                if (currentStrats.close > currentStrats.ma5) {
                    console.log(`✅ [${ticker}] 反彈超過 MA5，執行獲利了結！`);
                    await executeSell(ticker, pos.shares);
                } else if (currentStrats.close < pos.avgCost * 0.90) {
                    console.log(`🛑 [${ticker}] 虧損達 10% 觸發極端停損！`);
                    await executeSell(ticker, pos.shares);
                }
            }
        }
    }

    // 確保抓取最新資料庫狀態來算錢
    const { data: updatedPositions } = await supabase.from('positions').select('*').eq('user_id', userId);
    const { data: updatedState } = await supabase.from('portfolio_state').select('cash').eq('user_id', userId).order('id', { ascending: false }).limit(1).maybeSingle();
    let pendingCash = updatedState?.cash || 0;
    let individualPosCount = 0;
    let totalPosValue = 0;

    for (const p of (updatedPositions || [])) {
        if (p.ticker !== 'TQQQ') individualPosCount++;
        const pQuote = await getSchwabQuotes([p.ticker]);
        const cp = pQuote[p.ticker]?.quote?.lastPrice || p.avgCost;
        totalPosValue += cp * p.shares;
    }
    const dailyEquity = pendingCash + totalPosValue;

    // 4. 執行買入區塊
    console.log(`\n[4/4] 執行剩餘現金戰略分配...`);
    const tradeBudget = dailyEquity * 0.20; // 每個部位最大上限 20%
    
    for (const item of candidates) {
        if (individualPosCount >= MAX_POSITIONS) break; // 倉位已滿
        if (updatedPositions.find(p => p.ticker === item.ticker)) continue; // 已經持有
        
        const actualBudget = Math.min(tradeBudget, pendingCash);
        const sharesToBuy = Math.floor(actualBudget / item.close);
        
        if (sharesToBuy > 0) {
            console.log(`📥 抄底買入飛刀 [${item.ticker}] ${sharesToBuy} 股`);
            const res = await executeBuy(userId, item.ticker, sharesToBuy);
            if (res.success) {
                pendingCash -= sharesToBuy * item.close;
                individualPosCount++;
            }
        }
    }

    if (isBullMarket && individualPosCount === 0 && candidates.length === 0) {
        const tqqqData = await getSchwabQuotes(['TQQQ']);
        const tqqqPrice = tqqqData['TQQQ']?.quote?.lastPrice;
        if (tqqqPrice) {
            const hasTqqq = (updatedPositions || []).find(p => p.ticker === 'TQQQ');
            if (pendingCash > 500) { 
                const sharesToBuy = Math.floor((pendingCash - 50) / tqqqPrice); // 預留一點手續費或滑價空間
                if (sharesToBuy > 0) {
                    console.log(`🚀 閒置資金全數買入 TQQQ 啟動牛市衝浪，買入 ${sharesToBuy} 股`);
                    await executeBuy(userId, 'TQQQ', sharesToBuy);
                }
            } else if (hasTqqq) {
                console.log(`🏄 目前正重倉 TQQQ 衝浪中，無需變更部位。`);
            } else {
                 console.log(`💤 牛市保護狀態，但資金不足買入 TQQQ。`);
            }
        }
    }

  } catch (error) {
    console.error("❌❌❌ 實盤交易引擎執行核心發生嚴重錯誤:", error);
  } finally {
    console.log(`===== 終極切換引擎 掃描與執行完畢 =====`);
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