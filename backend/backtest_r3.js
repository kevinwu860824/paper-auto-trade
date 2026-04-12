const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function runR3() {
  const queryOptions = { period1: '2018-01-01', period2: '2026-03-31', interval: '1d' };
  const spyHist = await yahooFinance.chart('SPY', queryOptions);
  const tqqqHist = await yahooFinance.chart('TQQQ', queryOptions);
  const sqqqHist = await yahooFinance.chart('SQQQ', queryOptions);

  const spyQuotes = spyHist.quotes.filter(q => q && q.date && q.close);
  const tqqqQuotes = tqqqHist.quotes.filter(q => q && q.date && q.close);
  const sqqqQuotes = sqqqHist.quotes.filter(q => q && q.date && q.close);
  
  const spyDict = {}; const tqqqDict = {}; const sqqqDict = {};
  spyQuotes.forEach(q => spyDict[q.date.toISOString().split('T')[0]] = q.close);
  tqqqQuotes.forEach(q => tqqqDict[q.date.toISOString().split('T')[0]] = { open: q.open, close: q.close });
  sqqqQuotes.forEach(q => sqqqDict[q.date.toISOString().split('T')[0]] = { open: q.open, close: q.close });

  const sortedDates = Object.keys(spyDict).sort().filter(d => d >= '2019-09-01');
  let cash = 100000; let posTQQQ = 0; let posSQQQ = 0;
  
  const ma200Dict = {};
  for (let i = 200; i < spyQuotes.length; i++) {
      const d = spyQuotes[i].date.toISOString().split('T')[0];
      let sum = 0;
      for (let j = i - 199; j <= i; j++) sum += spyQuotes[j].close;
      ma200Dict[d] = sum / 200;
  }

  for (let i = 0; i < sortedDates.length - 1; i++) {
      const today = sortedDates[i];
      const tomorrow = sortedDates[i+1];
      const spyClose = spyDict[today];
      const ma200 = ma200Dict[today];
      
      if (!ma200) continue;
      const isBull = spyClose > ma200;
      const tmrwTQQQ = tqqqDict[tomorrow];
      const tmrwSQQQ = sqqqDict[tomorrow];
      
      if (isBull) {
          if (posSQQQ > 0 && tmrwSQQQ) { cash = posSQQQ * tmrwSQQQ.open; posSQQQ = 0; }
          if (posTQQQ === 0 && tmrwTQQQ) { posTQQQ = cash / tmrwTQQQ.open; cash = 0; }
      } else {
          if (posTQQQ > 0 && tmrwTQQQ) { cash = posTQQQ * tmrwTQQQ.open; posTQQQ = 0; }
          if (posSQQQ === 0 && tmrwSQQQ) { posSQQQ = cash / tmrwSQQQ.open; cash = 0; }
      }
  }
  
  if (posTQQQ > 0) cash = posTQQQ * tqqqDict[sortedDates[sortedDates.length-1]].close;
  if (posSQQQ > 0) cash = posSQQQ * sqqqDict[sortedDates[sortedDates.length-1]].close;
  
  console.log(`[Route 3: TQQQ/SQQQ 多空雙向] 最終淨值: $${cash.toFixed(2)} (總報酬率: ${(((cash/100000)-1)*100).toFixed(2)}%)`);
}
runR3();
