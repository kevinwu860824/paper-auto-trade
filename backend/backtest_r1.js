const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function runR1() {
  const queryOptions = { period1: '2018-01-01', period2: '2026-03-31', interval: '1d' };
  const spyHist = await yahooFinance.chart('SPY', queryOptions);
  const tqqqHist = await yahooFinance.chart('TQQQ', queryOptions);

  const spyQuotes = spyHist.quotes.filter(q => q && q.date && q.close);
  const tqqqQuotes = tqqqHist.quotes.filter(q => q && q.date && q.close);
  
  const spyDict = {}; const tqqqDict = {};
  spyQuotes.forEach(q => spyDict[q.date.toISOString().split('T')[0]] = q.close);
  tqqqQuotes.forEach(q => tqqqDict[q.date.toISOString().split('T')[0]] = { open: q.open, close: q.close });

  const sortedDates = Object.keys(spyDict).sort().filter(d => d >= '2019-09-01');
  let cash = 100000; let shares = 0;
  
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
      const tmrwTQQQ = tqqqDict[tomorrow];
      
      if (!ma200 || !tmrwTQQQ) continue;
      const isBull = spyClose > ma200;
      
      if (isBull && shares === 0) {
          shares = cash / tmrwTQQQ.open;
          cash = 0;
      } else if (!isBull && shares > 0) {
          cash = shares * tmrwTQQQ.open;
          shares = 0;
      }
  }
  
  if (shares > 0) {
      cash = shares * tqqqDict[sortedDates[sortedDates.length-1]].close;
  }
  
  console.log(`[Route 1: TQQQ 牛熊切換] 最終淨值: $${cash.toFixed(2)} (總報酬率: ${(((cash/100000)-1)*100).toFixed(2)}%)`);
}
runR1();
