const { default: YahooFinance } = require('yahoo-finance2');
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function getReturn(ticker, start, end) {
    const queryOptions = { period1: start, period2: end, interval: '1d' };
    const q = await yahooFinance.chart(ticker, queryOptions).catch(e => { console.log(e); return null; });
    if (!q || !q.quotes) return;
    const quotes = q.quotes.filter(x => x && x.date && x.close);
    if(quotes.length===0) return;
    
    // 使用第一天的 adjclose 作為成本，最後一天的 adjclose 作為結算
    const first = quotes[0].close * (quotes[0].adjclose ? (quotes[0].adjclose / quotes[0].close) : 1);
    const last = quotes[quotes.length-1].close * (quotes[quotes.length-1].adjclose ? (quotes[quotes.length-1].adjclose / quotes[quotes.length-1].close) : 1);
    
    const ret = ((last/first)-1)*100;
    console.log(`[${start} 到 ${end}] ${ticker} 無腦死抱報酬率: ${ret.toFixed(2)}%`);
}

async function run() {
    console.log("正在計算 QQQ (納斯達克100 1배) 各時期死抱不放的報酬率...");
    await getReturn('QQQ', '2014-01-01', '2019-12-31');
    await getReturn('QQQ', '2014-01-01', '2020-03-31');
    await getReturn('QQQ', '2014-01-01', '2020-12-31');
    await getReturn('QQQ', '2019-09-01', '2026-03-31');
    await getReturn('QQQ', '2021-01-01', '2026-03-31');
    await getReturn('QQQ', '2026-01-01', '2026-03-31');
}
run();
