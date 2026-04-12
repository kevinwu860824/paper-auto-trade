const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const watchlisthigh = require('./watchlisthigh.js'); 

async function runR2() {
  const queryOptions = { period1: '2018-01-01', period2: '2026-03-31', interval: '1d' };
  const spyHist = await yahooFinance.chart('SPY', queryOptions);
  
  const spyDict = {}; 
  spyHist.quotes.forEach(q => { if(q && q.date && q.close) spyDict[q.date.toISOString().split('T')[0]] = q.close; });
  const sortedAllDates = Object.keys(spyDict).sort();

  const stockData = {}; 

  for (const ticker of watchlisthigh) {
      const history = await yahooFinance.chart(ticker, queryOptions).catch(e => null);
      if (!history || !history.quotes) continue;
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
  }

  const tradeDates = sortedAllDates.filter(d => d >= '2019-09-01');
  const initialCash = 100000;
  let cash = initialCash;
  const positions = {};
  const MAX_POSITIONS = 5;

  for (let dIndex = 0; dIndex < tradeDates.length - 1; dIndex++) {
      const todayStr = tradeDates[dIndex];
      const tomorrowStr = tradeDates[dIndex + 1]; 

      let dailyEquity = cash;
      for (const t in positions) {
          dailyEquity += positions[t].shares * (stockData[t][todayStr]?.close || positions[t].avgCost);
      }

      // Sell logic
      for (const ticker in positions) {
          const pos = positions[ticker];
          const todayQuote = stockData[ticker][todayStr];
          const tomorrowQuote = stockData[ticker][tomorrowStr];
          if (!todayQuote || !tomorrowQuote) continue;

          // Mean Reversion Exit: Close crosses above MA5, sell tomorrow open
          if (todayQuote.close > todayQuote.ma5) {
              cash += pos.shares * tomorrowQuote.open;
              delete positions[ticker];
          } 
          // Catastrophic 10% hard stop
          else if (todayQuote.close < pos.avgCost * 0.90) {
              cash += pos.shares * tomorrowQuote.open;
              delete positions[ticker];
          }
      }

      // Buy logic
      const candidates = [];
      for (const ticker of watchlisthigh) {
          if (!stockData[ticker] || positions[ticker]) continue;
          const todayQuote = stockData[ticker][todayStr];
          const tomorrowQuote = stockData[ticker][tomorrowStr];
          if (!todayQuote || !tomorrowQuote) continue;

          if (todayQuote.close > todayQuote.ma200 && todayQuote.consecutiveDrops >= 3 && todayQuote.ma5) {
              const stretch = (todayQuote.ma5 - todayQuote.close) / todayQuote.ma5;
              candidates.push({ ticker, stretch, tomorrowOpen: tomorrowQuote.open });
          }
      }

      candidates.sort((a, b) => b.stretch - a.stretch);

      for (const item of candidates) {
          if (Object.keys(positions).length >= MAX_POSITIONS) break;
          const tradeBudget = dailyEquity * 0.20;
          const actualBudget = Math.min(tradeBudget, cash);
          const sharesToBuy = Math.floor(actualBudget / item.tomorrowOpen);
          if (sharesToBuy > 0) {
              cash -= sharesToBuy * item.tomorrowOpen;
              positions[item.ticker] = { shares: sharesToBuy, avgCost: item.tomorrowOpen };
          }
      }
  }

  for (const t in positions) {
      cash += positions[t].shares * stockData[t][tradeDates[tradeDates.length-1]].close;
  }

  console.log(`[Route 2: 極端均值回歸 (接飛刀)] 最終淨值: $${cash.toFixed(2)} (總報酬率: ${(((cash/initialCash)-1)*100).toFixed(2)}%)`);
}
runR2();
