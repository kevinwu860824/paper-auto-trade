// backtest_v2.js (Event-Driven 日期推進模組 - 純粹資金效率與動能排行)

const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance();
const watchlisthigh = require('./watchlisthigh.js'); 
const { Parser } = require('json2csv');
const fs = require('fs');

const initialCash = 100000;
const portfolio = {
  cash: initialCash,
  positions: {},
  history: [],
  closedTrades: [],
  equityCurve: [],
};

const riskTiers = {
    // Axe 3: ATR Dynamic Stops (取代固定 % 數停損)
    A: { tradeSizePercent: 0.25, atrMultiplier: 3.0 },
    B: { tradeSizePercent: 0.20, atrMultiplier: 2.5 },
    C: { tradeSizePercent: 0.15, atrMultiplier: 2.0 }
};

const MA_PERIOD = 200;
const SLOPE_PERIOD = 20;
const VIX_THRESHOLD = 30;
const RS_LOOKBACK = 61; 
const SWITCH_THRESHOLD = 999; // 第二把隱藏斧頭：關閉主動換股機制 (強迫獲利奔跑，直到觸發自然停損才釋放資金)
const MAX_POSITIONS = 5;    // 第三把斧頭(火力集中)：最多持有 5 檔最強股票
const SLIPPAGE_RATE = 0.0005;

function doSell(dateStr, ticker, price, shares, reason) {
    const pos = portfolio.positions[ticker];
    if (!pos || pos.shares < shares) return false;
    const effectivePrice = price * (1 - SLIPPAGE_RATE);
    portfolio.cash += effectivePrice * shares;
    portfolio.history.push({ type: 'SELL', date: dateStr, ticker, shares, price: effectivePrice, reason });
    if (pos.shares - shares < 1) {
        const entryDate = pos.trades[0].date;
        const holdingPeriod = Math.round((new Date(dateStr) - new Date(entryDate)) / (1000 * 60 * 60 * 24));
        const totalCost = pos.trades.reduce((sum, trade) => sum + (trade.price * trade.shares), 0);
        const totalProceeds = effectivePrice * pos.shares;
        const profitLoss = totalProceeds - totalCost;
        const profitLossPercent = (totalCost > 0) ? (profitLoss / totalCost) * 100 : 0;
        portfolio.closedTrades.push({
            ticker, entryDate, exitDate: dateStr,
            holdingPeriod, totalCost: totalCost.toFixed(2), totalProceeds: totalProceeds.toFixed(2),
            profitLoss: profitLoss.toFixed(2), profitLossPercent: profitLossPercent.toFixed(2), reason
        });
        delete portfolio.positions[ticker];
    } else {
        pos.shares -= shares;
    }
    return true;
}

async function runBacktest(tradeStartDateStr, tradeEndDateStr = null, dataLookbackYears = 1) {
  console.log('====== 開始回測 (V2 Event-Driven 跨股輪動引擎) ======');
  const tradeStartDate = new Date(tradeStartDateStr);
  const tradeEndDate = tradeEndDateStr ? new Date(tradeEndDateStr) : new Date();
  const dataStartDate = new Date(tradeStartDate);
  dataStartDate.setFullYear(tradeStartDate.getFullYear() - dataLookbackYears);
  dataStartDate.setDate(dataStartDate.getDate() - (MA_PERIOD + SLOPE_PERIOD + RS_LOOKBACK));

  console.log('\n[1/3] 正在下載市場狀態與股票歷史報價 (這可能需要 1~2 分鐘)...');
  const queryOptions = { period1: dataStartDate, period2: tradeEndDate, interval: '1d' };
  
  const [spyHist, vixHist] = await Promise.all([
    yahooFinance.chart('SPY', queryOptions).catch(e => ({quotes:[]})),
    yahooFinance.chart('^VIX', queryOptions).catch(e => ({quotes:[]}))
  ]);

  const spyDict = {}; const vixDict = {};
  spyHist.quotes.forEach(q => { if(q && q.date && q.close) spyDict[q.date.toISOString().split('T')[0]] = q.close; });
  vixHist.quotes.forEach(q => { if(q && q.date && q.close) vixDict[q.date.toISOString().split('T')[0]] = q.close; });

  const sortedAllDates = Object.keys(spyDict).sort();
  const marketState = {};
  for (let i = 0; i < sortedAllDates.length; i++) {
      const dateStr = sortedAllDates[i];
      marketState[dateStr] = { spyClose: spyDict[dateStr], vixClose: vixDict[dateStr] || null, ma200: null, ma200Slope: null };
      if (i >= MA_PERIOD - 1) {
          let sum = 0;
          for (let j = i - MA_PERIOD + 1; j <= i; j++) sum += spyDict[sortedAllDates[j]];
          marketState[dateStr].ma200 = sum / MA_PERIOD;
      }
      if (i >= MA_PERIOD - 1 + SLOPE_PERIOD) {
          const pastMA = marketState[sortedAllDates[i - SLOPE_PERIOD]]?.ma200;
          if (marketState[dateStr].ma200 && pastMA) {
              marketState[dateStr].ma200Slope = ((marketState[dateStr].ma200 - pastMA) / pastMA) * 100;
          }
      }
  }

  const stockData = {}; 
  const analystScores = {};

  for (const ticker of watchlisthigh) {
      process.stdout.write(`讀取 ${ticker} ... `);
      const history = await yahooFinance.chart(ticker, queryOptions).catch(e => null);
      if (!history || !history.quotes) { console.log('失敗'); continue; }
      const quotesDict = {};
      const validQuotes = history.quotes.filter(q => q && q.date && q.close && q.high);
      validQuotes.forEach((q, i) => {
          const ratio = q.adjclose ? (q.adjclose / q.close) : 1;
          const adjHigh = q.high * ratio;
          
          let recent20High = -Infinity;
          if (i >= 20) {
              for (let j = i - 20; j < i; j++) {
                  const pastRatio = validQuotes[j].adjclose ? (validQuotes[j].adjclose / validQuotes[j].close) : 1;
                  const pastHigh = validQuotes[j].high * pastRatio;
                  if (pastHigh > recent20High) recent20High = pastHigh;
              }
          }
          
          let atr14 = 0;
          if (i >= 14) {
              let trSum = 0;
              for (let j = i - 13; j <= i; j++) {
                  const r = validQuotes[j].adjclose ? (validQuotes[j].adjclose / validQuotes[j].close) : 1;
                  const prevR = validQuotes[j-1].adjclose ? (validQuotes[j-1].adjclose / validQuotes[j-1].close) : 1;
                  const hh = validQuotes[j].high * r;
                  const ll = validQuotes[j].low * r;
                  const p_cc = validQuotes[j-1].close * prevR;
                  const tr = Math.max(hh - ll, Math.abs(hh - p_cc), Math.abs(ll - p_cc));
                  trSum += tr;
              }
              atr14 = trSum / 14;
          }

          quotesDict[q.date.toISOString().split('T')[0]] = {
              open: q.open * ratio, high: adjHigh, low: q.low * ratio, close: q.close * ratio,
              recent20High: recent20High, atr: atr14
          };
      });
      stockData[ticker] = quotesDict;

      let aScore = 50;
      try {
          const summary = await yahooFinance.quoteSummary(ticker, { modules: ["recommendationTrend"] });
          const rec = summary.recommendationTrend?.trend?.[0];
          if (rec) {
              const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
              if (total > 0) aScore = ((rec.strongBuy*5 + rec.buy*4 + rec.hold*3 + rec.sell*2 + rec.strongSell*1) / (total*5)) * 100;
          }
      } catch (e) { }
      analystScores[ticker] = aScore;
      console.log('完成!');
  }

  console.log('\n[2/3] 開始逐日推進回測 (真實複利計算)...');
  const tradeDates = sortedAllDates.filter(d => new Date(d) >= tradeStartDate && new Date(d) <= tradeEndDate);

  for (let dIndex = 0; dIndex < tradeDates.length; dIndex++) {
      const todayStr = tradeDates[dIndex];
      const tomorrowStr = tradeDates[dIndex + 1]; 
      const state = marketState[todayStr];
      if (!state || !state.spyClose) continue;

      let marketSignal = 'RED';
      if (state.ma200 && state.ma200Slope !== null && state.vixClose) {
          const isBullish = state.spyClose > state.ma200;
          if (isBullish && state.ma200Slope > 0 && state.vixClose < VIX_THRESHOLD) marketSignal = 'GREEN';
          else if (isBullish) marketSignal = 'YELLOW';
      }

      // 1. 計算總資產 (Equity)
      let dailyPositionsValue = 0;
      for (const ticker in portfolio.positions) {
          const pos = portfolio.positions[ticker];
          const todayQuote = stockData[ticker][todayStr] || { close: pos.avgCost };
          dailyPositionsValue += pos.shares * todayQuote.close;
      }
      const portfolioEquity = portfolio.cash + dailyPositionsValue;
      
      const spyStartPrice = spyDict[tradeDates[0]];
      const spyBenchmark = spyStartPrice ? (spyDict[todayStr] / spyStartPrice) * initialCash : initialCash;
      portfolio.equityCurve.push({ date: todayStr, strategyEquity: portfolioEquity.toFixed(2), spyBenchmark: spyBenchmark.toFixed(2) });

      if (!tomorrowStr) {
          for (const ticker in portfolio.positions) {
              const pos = portfolio.positions[ticker];
              const todayQuote = stockData[ticker][todayStr];
              if (todayQuote) doSell(todayStr, ticker, todayQuote.close, pos.shares, 'end_of_backtest');
          }
          break;
      }

      // 2. 判定手持部位賣出 (停損 / 停利 / 熔斷)
      for (const ticker in portfolio.positions) {
          const pos = portfolio.positions[ticker];
          const todayQuote = stockData[ticker][todayStr];
          const tomorrowQuote = stockData[ticker][tomorrowStr];
          if (!todayQuote || !tomorrowQuote) continue;

          if (todayQuote.high > pos.peakPrice) pos.peakPrice = todayQuote.high;

          const params = pos.riskParams;

          // Axe 3: 更新移動停損線，只上不下
          if (todayQuote.atr && todayQuote.atr > 0) {
              const candidateStop = todayQuote.high - (params.atrMultiplier * todayQuote.atr);
              if (!pos.activeStopPrice || candidateStop > pos.activeStopPrice) {
                  pos.activeStopPrice = candidateStop;
              }
          }
          if (!pos.activeStopPrice) pos.activeStopPrice = pos.avgCost * 0.9; // 防呆(預設10%)

          let sold = false;
          if (todayQuote.open <= pos.activeStopPrice) {
              doSell(todayStr, ticker, todayQuote.open, pos.shares, `atr_trailing_stop_gap_down`);
              sold = true;
          } else if (todayQuote.low <= pos.activeStopPrice) {
              doSell(todayStr, ticker, pos.activeStopPrice, pos.shares, `atr_trailing_stop_intraday`);
              sold = true;
          }

          // 全局熔斷
          if (!sold && marketSignal === 'RED') {
              doSell(tomorrowStr, ticker, tomorrowQuote.open, pos.shares, 'market_signal_red');
          }
      }

      // 3. 全股票評分 (動能輪動)
      if (marketSignal !== 'RED') {
          const dailyScores = [];
          for (const ticker of watchlisthigh) {
              if (!stockData[ticker]) continue;
              const todayQuote = stockData[ticker][todayStr];
              const tomorrowQuote = stockData[ticker][tomorrowStr];
              if (!todayQuote || !tomorrowQuote) continue;

              const pastDateIndex = sortedAllDates.indexOf(todayStr) - RS_LOOKBACK;
              if (pastDateIndex < 0) continue;
              const pastDateStr = sortedAllDates[pastDateIndex];
              const pastQuote = stockData[ticker][pastDateStr];
              const pastSpy = spyDict[pastDateStr];
              
              if (!pastQuote || !pastSpy) continue;

              const stockReturn = (todayQuote.close / pastQuote.close) - 1;
              const spyReturn = (state.spyClose / pastSpy) - 1;
              const outperformance = (stockReturn - spyReturn) * 100;
              
              let rsScore = 50;
              if (outperformance > 20) rsScore = 100;
              else if (outperformance > 0) rsScore = 50 + (outperformance * 2.5);
              else rsScore = Math.max(0, 50 + outperformance);

              const tickerScore = (analystScores[ticker] || 50) * 0.5 + rsScore * 0.5;
              // 第一把斧頭：雙重確認！分數大於50，且「今日收盤突破過去20天最高價 (動能起漲)」才准買
              if (tickerScore > 50 && todayQuote.close > todayQuote.recent20High) { 
                  dailyScores.push({ ticker, score: tickerScore, tomorrowOpen: tomorrowQuote.open });
              }
          }

          dailyScores.sort((a, b) => b.score - a.score);

          // 4. 動態買入與換股機制 (Hysteresis = 10 分)
          for (const item of dailyScores) {
              if (portfolio.positions[item.ticker]) continue; // 已經有了就跳過
              
              const currentHoldings = Object.keys(portfolio.positions).length;
              if (currentHoldings >= MAX_POSITIONS) {
                  // 檢查換股邏輯
                  let weakestTicker = null;
                  let weakestScore = Infinity;
                  for (const heldTicker in portfolio.positions) {
                      const heldItem = dailyScores.find(d => d.ticker === heldTicker);
                      const heldScore = heldItem ? heldItem.score : 0;
                      if (heldScore < weakestScore) {
                          weakestScore = heldScore;
                          weakestTicker = heldTicker;
                      }
                  }
                  
                  // 換股門檻: 新股票必須贏過手頭最弱股 10 分以上
                  if (weakestTicker && item.score >= weakestScore + SWITCH_THRESHOLD) {
                      const pos = portfolio.positions[weakestTicker];
                      const weakTomorrowOpen = stockData[weakestTicker][tomorrowStr].open;
                      doSell(tomorrowStr, weakestTicker, weakTomorrowOpen, pos.shares, 'switch_to_stronger');
                  } else {
                      continue; // 沒有極強的股票，跳過不買 (滿倉狀態)
                  }
              }

              // 資金配置 (使用動態擴展的 Equity 作為倍率)
              let grade = 'C';
              if (item.score >= 80) grade = 'A';
              else if (item.score >= 60) grade = 'B';
              
              const params = riskTiers[grade];
              let tradeSizePercent = params.tradeSizePercent;
              if (marketSignal === 'YELLOW') tradeSizePercent /= 2;

              const tradeBudget = portfolioEquity * tradeSizePercent;
              const effectivePrice = item.tomorrowOpen * (1 + SLIPPAGE_RATE);
              const actualBudget = Math.min(tradeBudget, portfolio.cash);
              const sharesToBuy = Math.floor(actualBudget / effectivePrice);

              if (sharesToBuy > 0 && Object.keys(portfolio.positions).length < MAX_POSITIONS) {
                  const totalCost = sharesToBuy * effectivePrice;
                  portfolio.cash -= totalCost;
                  const tradeData = { date: tomorrowStr, ticker: item.ticker, shares: sharesToBuy, price: effectivePrice };
                  portfolio.history.push({ type: 'BUY', ...tradeData });
                  // 第一天初始化 ATR 停損價
                  const tQuote = stockData[item.ticker][todayStr];
                  const atrValue = tQuote && tQuote.atr ? tQuote.atr : (effectivePrice * 0.05);
                  const initialStop = effectivePrice - (params.atrMultiplier * atrValue);
                  portfolio.positions[item.ticker] = {
                      shares: sharesToBuy,
                      avgCost: effectivePrice,
                      peakPrice: effectivePrice,
                      activeStopPrice: initialStop,
                      trades: [tradeData],
                      riskParams: params
                  };
              }
          }
      }
  }

  const finalEquity = portfolio.equityCurve[portfolio.equityCurve.length - 1]?.strategyEquity || portfolio.cash;
  console.log('\n====== 回溯測試結果 (Event-Driven) ======');
  console.log(`初始資金: $${initialCash.toFixed(2)}`);
  console.log(`最終資產淨值: $${parseFloat(finalEquity).toFixed(2)}`);
  console.log(`總獲利: $${(finalEquity - initialCash).toFixed(2)}`);
  console.log(`總報酬率: ${((finalEquity - initialCash) / initialCash * 100).toFixed(2)}%`);
  
  console.log('\n[3/3] 正在匯出 V2 CSV...');
  // 覆寫回原本的檔案名方便比較
  if (portfolio.history.length > 0) fs.writeFileSync('backtest_trade_history.csv', new Parser().parse(portfolio.history));
  if (portfolio.closedTrades.length > 0) fs.writeFileSync('backtest_closed_trades.csv', new Parser().parse(portfolio.closedTrades));
  if (portfolio.equityCurve.length > 0) fs.writeFileSync('backtest_equity_curve.csv', new Parser().parse(portfolio.equityCurve));
  console.log('✅ 成功匯出 CSV！你現在擁有真正的時間序列量化引擎了！');
}

runBacktest('2019-09-01', '2026-03-31', 0);
