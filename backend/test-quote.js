const yahooFinance = require('yahoo-finance2').default;

async function simpleQuoteTest(symbol) {
  console.log(`\n正在對 [${symbol}] 進行最直接的報價查詢...`);
  try {
    const quote = await yahooFinance.quote(symbol);

    console.log(`\n✅ [${symbol}] 查詢成功！底下是從 Yahoo Finance 收到的完整原始資料：`);
    console.log("===========================================================");
    console.log(quote);
    console.log("===========================================================");

    if (quote && quote.regularMarketPrice) {
      console.log(`\n🎯 結論：成功獲取到即時價格 -> \$${quote.regularMarketPrice}`);
    } else {
      console.log(`\n⚠️ 結論：查詢成功，但回傳的資料中【沒有】有效的 'regularMarketPrice' 欄位。`);
    }

  } catch (error) {
    console.error(`\n❌ [${symbol}] 查詢徹底失敗！錯誤訊息:`, error.message);
  }
}

// 我們用一支絕對不可能出錯的股票來測試
simpleQuoteTest('CRWD');