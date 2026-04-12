// 引入 yahoo-finance2 套件
const yahooFinance = require('yahoo-finance2').default;

async function getStockQuote(symbol) {
  try {
    console.log(`正在查詢 ${symbol} 的報價...`);

    // 使用 .quote() 方法查詢股票資訊
    const quote = await yahooFinance.quote(symbol);

    // 從回傳的資料中，挑選我們需要的資訊
    const price = quote.regularMarketPrice;
    const change = quote.regularMarketChange;
    const changePercent = quote.regularMarketChangePercent;
    const previousClose = quote.regularMarketPreviousClose;

    console.log('--- 查詢成功 ---');
    console.log(`股票代碼: ${symbol}`);
    console.log(`目前價格: \$${price.toFixed(2)}`);
    console.log(`今日漲跌: \$${change.toFixed(2)} (${changePercent.toFixed(2)}%)`);
    console.log(`昨日收盤: \$${previousClose.toFixed(2)}`);

  } catch (error) {
    console.error(`查詢 ${symbol} 失敗:`, error.message);
  }
}

// 測試一下，查詢蘋果 (AAPL) 的股價
getStockQuote('AAPL');