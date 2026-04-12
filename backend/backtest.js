// backtest.js (最終融合版：動態風險 + 股票評級)

const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();
const watchlisthigh = require('./watchlisthigh.js'); 
const { Parser } = require('json2csv');
const fs = require('fs');

// ==================== 模擬交易核心函數與狀態 ====================
const initialCash = 100000;
const portfolio = {
  cash: initialCash,
  positions: {},
  history: [],
  closedTrades: [],
  equityCurve: [],
};

// --- 策略基礎參數 ---
const swingPointLookback = 5;

// --- ✨ 1. 動態風險參數表 (按股票評級) ✨ ---
const riskTiers = {
    A: { tradeSizePercent: 0.07, trailingStopPercent: 15, hardStopLossPercent: 10 },
    B: { tradeSizePercent: 0.05, trailingStopPercent: 12, hardStopLossPercent: 8 },
    C: { tradeSizePercent: 0.03, trailingStopPercent: 8, hardStopLossPercent: 5 }
};

// --- 市場篩選器參數 ---
const MA_PERIOD = 200;
const SLOPE_PERIOD = 20;
const VIX_THRESHOLD = 30;

// --- 輔助函數 ---
function getSwingHigh(quotes, index, lookback) {
  if (index < lookback || index >= quotes.length - lookback) return null;
  const slice = quotes.slice(index - lookback, index + lookback + 1);
  const highest = Math.max(...slice.map(q => q.high));
  return quotes[index].high === highest ? quotes[index] : null;
}
function getSwingLow(quotes, index, lookback) {
  if (index < lookback || index >= quotes.length - lookback) return null;
  const slice = quotes.slice(index - lookback, index + lookback + 1);
  const lowest = Math.min(...slice.map(q => q.low));
  return quotes[index].low === lowest ? quotes[index] : null;
}

// --- 模擬交易函數 ---
const SLIPPAGE_RATE = 0.0005; // 0.05% 的滑價設定

function simulateBuy(date, ticker, price, shares, riskParams) {
  const effectivePrice = price * (1 + SLIPPAGE_RATE);
  const cost = effectivePrice * shares;
  if (portfolio.cash < cost) return false;
  portfolio.cash -= cost;
  const tradeData = { date, ticker, shares, price: effectivePrice };
  portfolio.history.push({ type: 'BUY', ...tradeData });
  if (portfolio.positions[ticker]) {
    const existingPos = portfolio.positions[ticker];
    existingPos.trades.push(tradeData);
    const newTotalShares = existingPos.shares + shares;
    const newTotalCost = (existingPos.avgCost * existingPos.shares) + cost;
    existingPos.shares = newTotalShares;
    existingPos.avgCost = newTotalCost / newTotalShares;
  } else {
    portfolio.positions[ticker] = { 
      shares, avgCost: effectivePrice, peakPrice: effectivePrice, trades: [tradeData], riskParams // ✨ 儲存這筆交易的風險參數
    };
  }
  return true;
}
function simulateSell(date, ticker, price, shares, reason) {
  const pos = portfolio.positions[ticker];
  if (!pos || pos.shares < shares) return false;
  const effectivePrice = price * (1 - SLIPPAGE_RATE);
  portfolio.cash += effectivePrice * shares;
  portfolio.history.push({ type: 'SELL', date, ticker, shares, price: effectivePrice, reason });
  if (pos.shares - shares < 1) {
    const entryDate = pos.trades[0].date;
    const holdingPeriod = Math.round((new Date(date) - new Date(entryDate)) / (1000 * 60 * 60 * 24));
    const totalCost = pos.trades.reduce((sum, trade) => sum + (trade.price * trade.shares), 0);
    const totalProceeds = effectivePrice * pos.shares;
    const profitLoss = totalProceeds - totalCost;
    const profitLossPercent = (totalCost > 0) ? (profitLoss / totalCost) * 100 : 0;
    portfolio.closedTrades.push({
      ticker,
      entryDate: entryDate.split('T')[0],
      exitDate: date.split('T')[0],
      holdingPeriod,
      totalCost: totalCost.toFixed(2),
      totalProceeds: totalProceeds.toFixed(2),
      profitLoss: profitLoss.toFixed(2),
      profitLossPercent: profitLossPercent.toFixed(2),
      reason,
    });
    delete portfolio.positions[ticker];
  } else {
    pos.shares -= shares;
  }
  return true;
}

// --- ✨ 2. 股票評級系統核心函數 ✨ ---
async function getStockScore(ticker, spyHistory) {
    try {
        const summary = await yahooFinance.quoteSummary(ticker, { modules: ["recommendationTrend", "price"] });
        let analystScore = 50;
        const recommendation = summary.recommendationTrend?.trend?.[0];
        if (recommendation) {
            const totalRatings = recommendation.strongBuy + recommendation.buy + recommendation.hold + recommendation.sell + recommendation.strongSell;
            if (totalRatings > 0) {
                const weightedSum = (recommendation.strongBuy * 5 + recommendation.buy * 4 + recommendation.hold * 3 + recommendation.sell * 2 + recommendation.strongSell * 1);
                analystScore = (weightedSum / (totalRatings * 5)) * 100;
            }
        }
        let relativeStrengthScore = 50;
        const priceHistory = await yahooFinance.chart(ticker, { period1: new Date(new Date().setDate(new Date().getDate() - 90)), interval: '1d' });
        const stockQuotes = priceHistory.quotes.filter(q => q && q.close);
        if (stockQuotes.length > 61 && spyHistory.quotes.length > 61) {
            const stockEndIndex = stockQuotes.length - 1;
            const stockStartIndex = stockQuotes.length - 61;
            const stockReturn = (stockQuotes[stockEndIndex].close / stockQuotes[stockStartIndex].close) - 1;
            const spyEndQuote = spyHistory.quotes.find(q => q.date.toISOString().split('T')[0] === stockQuotes[stockEndIndex].date.toISOString().split('T')[0]);
            const spyStartQuote = spyHistory.quotes.find(q => q.date.toISOString().split('T')[0] === stockQuotes[stockStartIndex].date.toISOString().split('T')[0]);
            if (spyEndQuote && spyStartQuote) {
                const spyReturn = (spyEndQuote.close / spyStartQuote.close) - 1;
                const outperformance = (stockReturn - spyReturn) * 100;
                if (outperformance > 20) relativeStrengthScore = 100;
                else if (outperformance > 0) relativeStrengthScore = 50 + (outperformance * 2.5);
                else relativeStrengthScore = Math.max(0, 50 + outperformance);
            }
        }
        const totalScore = (analystScore * 0.5) + (relativeStrengthScore * 0.5);
        let grade = 'C';
        if (totalScore >= 80) grade = 'A';
        else if (totalScore >= 60) grade = 'B';
        console.log(`[評級系統] ${ticker} -> 總分: ${totalScore.toFixed(0)}, 評級: ${grade}`);
        return grade;
    } catch (error) {
        console.warn(`⚠️ [評級系統] 無法獲取 ${ticker} 評級，預設為 C 級:`, error.message);
        return 'C';
    }
}

// ============== 回測主引擎 (最終融合版) ==============
async function runBacktest(tradeStartDateStr, tradeEndDateStr = null, dataLookbackYears = 1) {
  console.log('====== 開始回測 (動態風險 + 股票評級) ======');
  const tradeStartDate = new Date(tradeStartDateStr);
  const tradeEndDate = tradeEndDateStr ? new Date(tradeEndDateStr) : new Date();
  const dataStartDate = new Date(tradeStartDate);
  dataStartDate.setFullYear(tradeStartDate.getFullYear() - dataLookbackYears);
  dataStartDate.setDate(dataStartDate.getDate() - (MA_PERIOD + SLOPE_PERIOD + 5));
  console.log(`數據獲取期間: ${dataStartDate.toISOString().split('T')[0]} to ${tradeEndDate.toISOString().split('T')[0]}`);
  console.log(`交易執行期間: ${tradeStartDate.toISOString().split('T')[0]} to ${tradeEndDate.toISOString().split('T')[0]}`);

  console.log('\n正在下載市場狀態指標 (SPY, VIX)...');
  const queryOptions = { period1: dataStartDate, period2: tradeEndDate, interval: '1d' };
  const marketIndicatorsHistory = await Promise.all([
    yahooFinance.chart('SPY', queryOptions).catch(e => ({quotes:[]})),
    yahooFinance.chart('^VIX', queryOptions).catch(e => ({quotes:[]}))
  ]);

  const marketState = {};
  const spyQuotes = marketIndicatorsHistory[0].quotes.filter(q => q && q.date);
  const vixMap = marketIndicatorsHistory[1].quotes.filter(q => q && q.date).reduce((map, quote) => {
      map[quote.date.toISOString().split('T')[0]] = quote.close;
      return map;
  }, {});
  for (let i = 0; i < spyQuotes.length; i++) {
      const dateStr = spyQuotes[i].date.toISOString().split('T')[0];
      marketState[dateStr] = { spyClose: spyQuotes[i].close, vixClose: vixMap[dateStr] || null, ma200: null, ma200Slope: null, };
      if (i >= MA_PERIOD - 1) {
          marketState[dateStr].ma200 = spyQuotes.slice(i - (MA_PERIOD - 1), i + 1).reduce((acc, q) => acc + q.close, 0) / MA_PERIOD;
      }
      if (i >= MA_PERIOD - 1 + SLOPE_PERIOD) {
          const pastMA = marketState[spyQuotes[i - SLOPE_PERIOD].date.toISOString().split('T')[0]]?.ma200;
          if (marketState[dateStr].ma200 && pastMA) {
              marketState[dateStr].ma200Slope = ((marketState[dateStr].ma200 - pastMA) / pastMA) * 100;
          }
      }
  }

  for (const ticker of watchlisthigh) {
    console.log(`\n正在回測 [${ticker}]...`);
    try {
      const history = await yahooFinance.chart(ticker, queryOptions);
      const quotes = history.quotes.filter(q => q && q.date && q.open && q.high && q.low && q.close).map(q => {
        // 修正第4點：用 adjclose 即時還原真實報酬
        const ratio = q.adjclose ? (q.adjclose / q.close) : 1;
        return {
            date: q.date,
            open: q.open * ratio,
            high: q.high * ratio,
            low: q.low * ratio,
            close: q.close * ratio, 
            volume: q.volume
        };
      });
      if (!quotes || quotes.length < swingPointLookback * 2 + 2) continue;
      
      let lastSwingHigh = null, lastSwingLow = null, currentTrend = null;
      for (let i = swingPointLookback * 2; i < quotes.length - 1; i++) {
        const todayQuote = quotes[i], tomorrowQuote = quotes[i+1];
        const swingHigh = getSwingHigh(quotes, i, swingPointLookback);
        const swingLow = getSwingLow(quotes, i, swingPointLookback);
        if (swingHigh) lastSwingHigh = swingHigh;
        if (swingLow) lastSwingLow = swingLow;
        if (todayQuote.date >= tradeStartDate) {
            const dateStr = todayQuote.date.toISOString().split('T')[0];
            const state = marketState[dateStr];
            let marketSignal = 'RED';
            if (state && state.spyClose && state.ma200 && state.ma200Slope !== null && state.vixClose) {
                const isBullish = state.spyClose > state.ma200;
                if (isBullish && state.ma200Slope > 0 && state.vixClose < VIX_THRESHOLD) marketSignal = 'GREEN';
                else if (isBullish) marketSignal = 'YELLOW';
            }
            let position = portfolio.positions[ticker];
            if (position) {
                const params = position.riskParams || riskTiers['B'];
                let sold = false;
                const hardStopPrice = position.avgCost * (1 - params.hardStopLossPercent / 100);
                if (todayQuote.high > position.peakPrice) position.peakPrice = todayQuote.high;
                const trailingStopPrice = position.peakPrice * (1 - params.trailingStopPercent / 100);

                // 取兩者之間較嚴格（較高）的停損價作為動態出場價位
                const activeStopPrice = Math.max(hardStopPrice, trailingStopPrice);
                const stopReason = activeStopPrice === trailingStopPrice ? 'trailing_stop' : 'hard_stop_loss';

                if (todayQuote.open <= activeStopPrice) {
                    // 如果今天一開盤就崩盤跳空低於停損點，那就只能以更糟糕的開盤價出場
                    simulateSell(todayQuote.date.toISOString(), ticker, todayQuote.open, position.shares, `${stopReason}_gap_down`);
                    sold = true;
                } else if (todayQuote.low <= activeStopPrice) {
                    // 如果是盤中跌破，那就以觸價點（停損價）出場，日期記在今天！
                    simulateSell(todayQuote.date.toISOString(), ticker, activeStopPrice, position.shares, `${stopReason}_intraday`);
                    sold = true;
                }

                if (!sold && marketSignal === 'RED') {
                    simulateSell(tomorrowQuote.date.toISOString(), ticker, tomorrowQuote.open, position.shares, 'market_signal_red');
                } else if (!sold && currentTrend === 'bullish' && todayQuote.close < lastSwingLow.low) {
                    simulateSell(tomorrowQuote.date.toISOString(), ticker, tomorrowQuote.open, position.shares, 'CHoCH');
                    currentTrend = 'bearish';
                }
            }
            if (!portfolio.positions[ticker] && marketSignal !== 'RED') {
                if (currentTrend === null) {
                    if (lastSwingHigh && lastSwingLow) currentTrend = (lastSwingHigh.high > lastSwingLow.low) ? 'bullish' : 'bearish';
                }
                if ((currentTrend === 'bearish' && todayQuote.close > lastSwingHigh.high) || (currentTrend === 'bullish' && todayQuote.high > lastSwingHigh.high)) {
                    const grade = await getStockScore(ticker, marketIndicatorsHistory[0]);
                    const params = riskTiers[grade];
                    let tradeSize = params.tradeSizePercent;
                    if (marketSignal === 'YELLOW') tradeSize /= 2;
                    // 修正第一點：不使用剩餘現金，而是用總池子基準計算 (目前用 initialCash 做定額單利示範)
                    const sharesToBuy = Math.floor((initialCash * tradeSize) / tomorrowQuote.open);
                    if (sharesToBuy > 0) {
                        simulateBuy(tomorrowQuote.date.toISOString(), ticker, tomorrowQuote.open, sharesToBuy, params);
                        currentTrend = 'bullish';
                    }
                }
            }
        }
      }
      if (portfolio.positions[ticker]) {
        const lastQuote = quotes[quotes.length - 1];
        simulateSell(lastQuote.date.toISOString(), ticker, lastQuote.close, portfolio.positions[ticker].shares, 'end_of_backtest');
      }
    } catch (error) { console.error(`❌ 回測 [${ticker}] 時發生錯誤:`, error.message); }
  }

  // --- 績效分析與報告生成 ---
  console.log('\n正在準備報告數據...');
  const allDates = new Set();
  const allQuotes = {};
  
  const allTickersForQuotes = Array.from(new Set(['SPY', ...watchlisthigh]));
  // ✨ 修正：這裡不需要再次下載所有數據，可以優化
  for (const ticker of allTickersForQuotes) {
      const history = await yahooFinance.chart(ticker, queryOptions).catch(e => null);
      if (!history) continue;
      allQuotes[ticker] = {};
      history.quotes.forEach(q => {
          if(q && q.date && q.close) {
              const ratio = q.adjclose ? (q.adjclose / q.close) : 1;
              const dateStr = q.date.toISOString().split('T')[0];
              allDates.add(dateStr);
              allQuotes[ticker][dateStr] = q.close * ratio;
          }
      });
  }
  const sortedDates = Array.from(allDates).sort();
  const spyStartPrice = allQuotes['SPY'] ? allQuotes['SPY'][sortedDates.find(d => allQuotes['SPY'][d])] : undefined;
  
  let dailyCash = initialCash;
  let dailyPositions = {};

  for (const dateStr of sortedDates) {
    if (new Date(dateStr) < tradeStartDate) continue;
    portfolio.history.forEach(trade => {
        if (trade.date.startsWith(dateStr)) {
            if (trade.type === 'BUY') {
                dailyCash -= trade.price * trade.shares;
                if (dailyPositions[trade.ticker]) {
                    dailyPositions[trade.ticker].shares += trade.shares;
                } else {
                    dailyPositions[trade.ticker] = { shares: trade.shares };
                }
            } else {
                dailyCash += trade.price * trade.shares;
                if (dailyPositions[trade.ticker]) {
                    dailyPositions[trade.ticker].shares -= trade.shares;
                }
            }
        }
    });
    let positionsValue = 0;
    for (const ticker in dailyPositions) {
        if (dailyPositions[ticker].shares > 0 && allQuotes[ticker]?.[dateStr]) {
            positionsValue += allQuotes[ticker][dateStr] * dailyPositions[ticker].shares;
        }
    }
    const totalEquity = dailyCash + positionsValue;
    const spyBenchmark = spyStartPrice ? (allQuotes['SPY'][dateStr] / spyStartPrice) * initialCash : initialCash;
    
    portfolio.equityCurve.push({
      date: dateStr,
      strategyEquity: totalEquity.toFixed(2),
      spyBenchmark: spyBenchmark.toFixed(2),
    });
  }

  const finalEquity = portfolio.equityCurve[portfolio.equityCurve.length - 1]?.strategyEquity || portfolio.cash;
  console.log('\n====== 回溯測試結果 ======');
  console.log(`初始資金: $${initialCash.toFixed(2)}`);
  console.log(`最終資產淨值: $${parseFloat(finalEquity).toFixed(2)}`);
  console.log(`總獲利: $${(finalEquity - initialCash).toFixed(2)}`);
  console.log(`總報酬率: ${((finalEquity - initialCash) / initialCash * 100).toFixed(2)}%`);
  
  console.log('\n正在將結果匯出至 CSV 檔案...');
  try {
    if (portfolio.history.length > 0) {
      fs.writeFileSync('backtest_trade_history.csv', new Parser().parse(portfolio.history));
    }
    if (portfolio.closedTrades.length > 0) {
      fs.writeFileSync('backtest_closed_trades.csv', new Parser().parse(portfolio.closedTrades));
    }
    if (portfolio.equityCurve.length > 0) {
      fs.writeFileSync('backtest_equity_curve.csv', new Parser().parse(portfolio.equityCurve));
    }
    console.log('✅ 成功匯出 CSV 檔案至您的專案資料夾！');
  } catch (error) {
    console.error('❌ 匯出 CSV 時發生錯誤:', error);
  }
}

// ==================== 執行方式 ====================
runBacktest('2019-09-01', '2026-03-31', 0);