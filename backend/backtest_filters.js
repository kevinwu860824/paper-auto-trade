const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const watchlisthigh = require('./watchlisthigh.js'); 

async function start() {
  console.log('====== 開始回測 (比較三種濾網優化 2014~2019) ======');
  const queryOptions = { period1: '2013-01-01', period2: '2019-12-31', interval: '1d' };
  
  console.log('[1/3] 正在下載 SPY, TQQQ 與 VIX ...');
  const spyHist = await yahooFinance.chart('SPY', queryOptions);
  const tqqqHist = await yahooFinance.chart('TQQQ', queryOptions);
  const vixHist = await yahooFinance.chart('^VIX', queryOptions);

  const spyDict = {}; 
  const tqqqDict = {};
  const vixDict = {};
  spyHist.quotes.forEach(q => { if(q && q.date && q.close) spyDict[q.date.toISOString().split('T')[0]] = q.close; });
  tqqqHist.quotes.forEach(q => { if(q && q.date && q.close) tqqqDict[q.date.toISOString().split('T')[0]] = { open: q.open, close: q.close }; });
  vixHist.quotes.forEach(q => { if(q && q.date && q.close) vixDict[q.date.toISOString().split('T')[0]] = q.close; });
  
  const sortedAllDates = Object.keys(spyDict).sort();
  const stockData = {}; 

  console.log('[2/3] 正在下載 90 檔績優股並計算 RSI(2) / BB ...');
  for (const ticker of watchlisthigh) {
      process.stdout.write(`讀取 ${ticker} ... `);
      const history = await yahooFinance.chart(ticker, queryOptions).catch(e => null);
      if (!history || !history.quotes) { console.log('失敗'); continue; }
      
      const quotesDict = {};
      const validQuotes = history.quotes.filter(q => q && q.date && q.close);
      
      validQuotes.forEach((q, i) => {
          const ratio = q.adjclose ? (q.adjclose / q.close) : 1;
          const close = q.close * ratio;
          
          let ma5 = null; let ma200 = null; let ma20 = null;
          let rsi2 = null; let lowerBB = null;

          if (i >= 5) {
              let sum = 0; for(let j=i-4; j<=i; j++) sum += validQuotes[j].close * (validQuotes[j].adjclose ? validQuotes[j].adjclose/validQuotes[j].close : 1);
              ma5 = sum / 5;
          }
          if (i >= 200) {
              let sum = 0; for(let j=i-199; j<=i; j++) sum += validQuotes[j].close * (validQuotes[j].adjclose ? validQuotes[j].adjclose/validQuotes[j].close : 1);
              ma200 = sum / 200;
          }
          if (i >= 20) {
              let sum = 0; for(let j=i-19; j<=i; j++) sum += validQuotes[j].close * (validQuotes[j].adjclose ? validQuotes[j].adjclose/validQuotes[j].close : 1);
              ma20 = sum / 20;
              let variance = 0;
              for(let j=i-19; j<=i; j++) variance += Math.pow((validQuotes[j].close * (validQuotes[j].adjclose ? validQuotes[j].adjclose/validQuotes[j].close : 1)) - ma20, 2);
              lowerBB = ma20 - 2 * Math.sqrt(variance / 20);
          }
          
          if (i >= 3) {
             let gains = 0; let losses = 0;
             for (let j = i-1; j<=i; j++) {
                 const diff = validQuotes[j].close - validQuotes[j-1].close;
                 if (diff > 0) gains += diff; else losses -= diff;
             }
             if (gains + losses === 0) rsi2 = 50;
             else rsi2 = 100 * (gains / (gains + losses));
          }
          
          let consecutiveDrops = 0;
          if (i > 0 && validQuotes[i].close < validQuotes[i-1].close) {
              const prevDate = validQuotes[i-1].date.toISOString().split('T')[0];
              consecutiveDrops = (quotesDict[prevDate]?.consecutiveDrops || 0) + 1;
          }

          quotesDict[q.date.toISOString().split('T')[0]] = {
              open: q.open * ratio, close, consecutiveDrops, ma5, ma20, ma200, rsi2, lowerBB
          };
      });
      stockData[ticker] = quotesDict;
      console.log('完成!');
  }

  const tradeDates = sortedAllDates.filter(d => d >= '2014-01-01');
  
  const ma200Dict = {};
  const ma50Dict = {};
  const spyQuotes = spyHist.quotes.filter(q => q && q.date && q.close);
  for (let i = 200; i < spyQuotes.length; i++) {
      const d = spyQuotes[i].date.toISOString().split('T')[0];
      let sum200 = 0; for (let j=i-199; j<=i; j++) sum200 += spyQuotes[j].close;
      let sum50 = 0; for (let j=i-49; j<=i; j++) sum50 += spyQuotes[j].close;
      ma200Dict[d] = sum200 / 200;
      ma50Dict[d] = sum50 / 50;
  }

  function runSimulation(name, useSol1, useSol2, useSol3) {
      const initialCash = 100000;
      let cash = initialCash;
      const positions = {};
      let tqqqShares = 0;
      const MAX_POSITIONS = 5;

      for (let dIndex = 0; dIndex < tradeDates.length - 1; dIndex++) {
          const todayStr = tradeDates[dIndex];
          const tomorrowStr = tradeDates[dIndex + 1]; 

          const spyClose = spyDict[todayStr];
          const spyMA200 = ma200Dict[todayStr];
          const spyMA50 = ma50Dict[todayStr];
          const tmrwTQQQ = tqqqDict[tomorrowStr];
          const vixToday = vixDict[todayStr];
          if (!spyMA200 || !tmrwTQQQ) continue;

          let dailyEquity = cash + (tqqqShares > 0 ? tqqqShares * tqqqDict[todayStr].close : 0);
          for (const t in positions) {
              dailyEquity += positions[t].shares * (stockData[t][todayStr]?.close || positions[t].avgCost);
          }

          let pendingCash = cash;
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

          let isBull = spyClose > spyMA200;
          if (useSol1 && (!spyMA50 || spyMA50 <= spyMA200)) isBull = false; 
          if (useSol2 && (!vixToday || vixToday >= 20)) isBull = false;

          const candidates = [];
          for (const ticker of watchlisthigh) {
              if (!stockData[ticker] || positions[ticker]) continue;
              const todayQuote = stockData[ticker][todayStr];
              const tomorrowQuote = stockData[ticker][tomorrowStr];
              if (!todayQuote || !tomorrowQuote) continue;

              let dipCondition = false;
              if (useSol3) {
                  dipCondition = todayQuote.close > todayQuote.ma200 && todayQuote.rsi2 !== null && todayQuote.rsi2 < 10 && todayQuote.lowerBB && todayQuote.close < todayQuote.lowerBB;
              } else {
                  dipCondition = todayQuote.close > todayQuote.ma200 && todayQuote.consecutiveDrops >= 3 && todayQuote.ma5;
              }

              if (dipCondition) {
                  let stretch = (todayQuote.ma5 - todayQuote.close) / todayQuote.ma5;
                  if (useSol3) stretch = (todayQuote.lowerBB - todayQuote.close) / todayQuote.lowerBB;
                  candidates.push({ ticker, stretch, tomorrowOpen: tomorrowQuote.open });
              }
          }
          candidates.sort((a, b) => b.stretch - a.stretch);

          if (candidates.length > 0 || !isBull) {
              if (tqqqShares > 0) {
                  pendingCash += tqqqShares * tmrwTQQQ.open;
                  tqqqShares = 0;
              }
          }

          let currentPosCount = Object.keys(positions).length;
          for (const item of candidates) {
              if (currentPosCount >= MAX_POSITIONS) break;
              const tradeBudget = dailyEquity * 0.20;
              const actualBudget = Math.min(tradeBudget, pendingCash);
              const sharesToBuy = Math.floor(actualBudget / item.tomorrowOpen);
              if (sharesToBuy > 0) {
                  pendingCash -= sharesToBuy * item.tomorrowOpen;
                  positions[item.ticker] = { shares: sharesToBuy, avgCost: item.tomorrowOpen };
                  currentPosCount++;
              }
          }

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

      const lastDate = tradeDates[tradeDates.length-1];
      if (tqqqShares > 0) cash += tqqqShares * (tqqqDict[lastDate]?.close || 0);
      for (const t in positions) {
          cash += positions[t].shares * (stockData[t][lastDate]?.close || positions[t].avgCost);
      }
      console.log(`[${name}] \n最終淨值: $${cash.toFixed(2)} \n總報酬率: ${(((cash/initialCash)-1)*100).toFixed(2)}%\n`);
  }

  console.log('\n[3/3] 開始跑各種濾網的回測 (2014-2019)...');
  runSimulation("Base  原始終極版 (僅過 200MA)", false, false, false);
  runSimulation("解方一：大盤雙均線過濾 (50MA > 200MA)", true, false, false);
  runSimulation("解方二：大盤 VIX 恐慌過濾 (VIX < 20)", false, true, false);
  runSimulation("解方三：個股極端飛刀濾網 (RSI(2)<10 + 跌破布林下軌)", false, false, true);
}

start();
