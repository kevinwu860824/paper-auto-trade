const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const watchlisthigh = require('./watchlisthigh.js'); 

async function runUltimate() {
  console.log('====== 開始回測 (終極型態：大盤順勢 TQQQ + 均值回歸接飛刀) ======');
  const queryOptions = { period1: '2025-01-01', period2: '2026-03-31', interval: '1d' };
  
  console.log('[1/3] 正在下載 SPY 與 TQQQ ...');
  const spyHist = await yahooFinance.chart('SPY', queryOptions);
  const tqqqHist = await yahooFinance.chart('TQQQ', queryOptions);

  const spyDict = {}; 
  const tqqqDict = {};
  spyHist.quotes.forEach(q => { 
      if(q && q.date && q.close) {
          const ratio = q.adjclose ? (q.adjclose / q.close) : 1;
          spyDict[q.date.toISOString().split('T')[0]] = q.close * ratio; 
      }
  });
  tqqqHist.quotes.forEach(q => { 
      if(q && q.date && q.close) {
          const ratio = q.adjclose ? (q.adjclose / q.close) : 1;
          tqqqDict[q.date.toISOString().split('T')[0]] = { open: q.open * ratio, close: q.close * ratio }; 
      }
  });
  
  const sortedAllDates = Object.keys(spyDict).sort();
  const stockData = {}; 

  console.log('[2/3] 正在下載 90 檔績優股歷史數據 (約需 1~2 分鐘) ...');
  for (const ticker of watchlisthigh) {
      process.stdout.write(`讀取 ${ticker} ... `);
      const history = await yahooFinance.chart(ticker, queryOptions).catch(e => null);
      if (!history || !history.quotes) { console.log('失敗'); continue; }
      
      const quotesDict = {};
      const validQuotes = history.quotes.filter(q => q && q.date && q.close);
      
      validQuotes.forEach((q, i) => {
          const ratio = q.adjclose ? (q.adjclose / q.close) : 1;
          const close = q.close * ratio;
          
          let ma5 = null; let ma200 = null;
          if (i >= 5) {
              let sum5 = 0;
              for(let j=i-4; j<=i; j++) sum5 += validQuotes[j].close * (validQuotes[j].adjclose ? validQuotes[j].adjclose/validQuotes[j].close : 1);
              ma5 = sum5 / 5;
          }
          if (i >= 200) {
              let sum200 = 0;
              for(let j=i-199; j<=i; j++) sum200 += validQuotes[j].close * (validQuotes[j].adjclose ? validQuotes[j].adjclose/validQuotes[j].close : 1);
              ma200 = sum200 / 200;
          }
          
          let consecutiveDrops = 0;
          if (i > 0 && validQuotes[i].close < validQuotes[i-1].close) {
              const prevDate = validQuotes[i-1].date.toISOString().split('T')[0];
              consecutiveDrops = (quotesDict[prevDate]?.consecutiveDrops || 0) + 1;
          }

          quotesDict[q.date.toISOString().split('T')[0]] = {
              open: q.open * ratio, close, consecutiveDrops, ma5, ma200
          };
      });
      stockData[ticker] = quotesDict;
      console.log('完成!');
  }

  console.log('\n[3/3] 開始日迴圈模擬 (動態資金切換法)...');
  const tradeDates = sortedAllDates.filter(d => d >= '2026-01-01');
  const initialCash = 100000;
  let cash = initialCash;
  const positions = {};
  let tqqqShares = 0;
  const MAX_POSITIONS = 5;

  const ma200Dict = {};
  const spyQuotes = spyHist.quotes.filter(q => q && q.date && q.close);
  for (let i = 200; i < spyQuotes.length; i++) {
      const d = spyQuotes[i].date.toISOString().split('T')[0];
      let sum = 0;
      for (let j = i - 199; j <= i; j++) sum += spyQuotes[j].close;
      ma200Dict[d] = sum / 200;
  }

  for (let dIndex = 0; dIndex < tradeDates.length - 1; dIndex++) {
      const todayStr = tradeDates[dIndex];
      const tomorrowStr = tradeDates[dIndex + 1]; 

      const spyClose = spyDict[todayStr];
      const spyMA200 = ma200Dict[todayStr];
      const tmrwTQQQ = tqqqDict[tomorrowStr];
      if (!spyMA200 || !tmrwTQQQ) continue;

      let dailyEquity = cash + (tqqqShares > 0 ? tqqqShares * tqqqDict[todayStr].close : 0);
      for (const t in positions) {
          dailyEquity += positions[t].shares * (stockData[t][todayStr]?.close || positions[t].avgCost);
      }

      let pendingCash = cash;
      // 1. 個股賣出視角 (均值回歸)
      for (const ticker in positions) {
          const pos = positions[ticker];
          const todayQuote = stockData[ticker][todayStr];
          const tomorrowQuote = stockData[ticker][tomorrowStr];
          if (!todayQuote || !tomorrowQuote) continue;

          if (todayQuote.close > todayQuote.ma5 || todayQuote.close < pos.avgCost * 0.90) {
              pendingCash += pos.shares * tomorrowQuote.open;
              delete positions[ticker];
          }
      }

      // 2. 個股買入條件判斷
      const isBull = spyClose > spyMA200;
      const candidates = [];
      for (const ticker of watchlisthigh) {
          if (!stockData[ticker] || positions[ticker]) continue;
          const todayQuote = stockData[ticker][todayStr];
          const tomorrowQuote = stockData[ticker][tomorrowStr];
          if (!todayQuote || !tomorrowQuote) continue;

          // 個股條件：長線多頭 (>200MA) 且連跌 3 天
          if (todayQuote.close > todayQuote.ma200 && todayQuote.consecutiveDrops >= 3 && todayQuote.ma5) {
              const stretch = (todayQuote.ma5 - todayQuote.close) / todayQuote.ma5;
              candidates.push({ ticker, stretch, tomorrowOpen: tomorrowQuote.open });
          }
      }
      candidates.sort((a, b) => b.stretch - a.stretch);

      // 3. TQQQ 資金釋放視角
      // 如果大盤轉空，或「有超強飛刀標的要接」，強制賣出 TQQQ 變現
      if (candidates.length > 0 || !isBull) {
          if (tqqqShares > 0) {
              pendingCash += tqqqShares * tmrwTQQQ.open;
              tqqqShares = 0;
          }
      }

      // 4. 接飛刀買入
      let currentPosCount = Object.keys(positions).length;
      for (const item of candidates) {
          if (currentPosCount >= MAX_POSITIONS) break;
          // 單筆動用總資產的 20%
          const tradeBudget = dailyEquity * 0.20;
          const actualBudget = Math.min(tradeBudget, pendingCash);
          const sharesToBuy = Math.floor(actualBudget / item.tomorrowOpen);
          if (sharesToBuy > 0) {
              pendingCash -= sharesToBuy * item.tomorrowOpen;
              positions[item.ticker] = { shares: sharesToBuy, avgCost: item.tomorrowOpen };
              currentPosCount++;
          }
      }

      // 5. 閒置資金回充 TQQQ
      // 如果是大牛市，而且沒有飛刀可接，把剩餘所有閒置現金買入 TQQQ
      if (isBull && currentPosCount === 0 && candidates.length === 0) {
          if (pendingCash > 0) {
              const sharesToBuy = Math.floor(pendingCash / tmrwTQQQ.open);
              if (sharesToBuy > 0) {
                  tqqqShares += sharesToBuy;
                  pendingCash -= sharesToBuy * tmrwTQQQ.open;
              }
          }
      }

      cash = pendingCash;
  }

  // 強制平倉
  const lastDate = tradeDates[tradeDates.length-1];
  if (tqqqShares > 0) cash += tqqqShares * (tqqqDict[lastDate]?.close || 0);
  for (const t in positions) {
      cash += positions[t].shares * (stockData[t][lastDate]?.close || positions[t].avgCost);
  }

  console.log(`\n====== 回溯測試結果 (終極究極體) ======`);
  console.log(`初始資金: $${initialCash.toFixed(2)}`);
  console.log(`最終資產淨值: $${cash.toFixed(2)}`);
  console.log(`總報酬率: ${(((cash/initialCash)-1)*100).toFixed(2)}%`);
}

runUltimate();
