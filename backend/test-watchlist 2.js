const yahooFinance = require('yahoo-finance2').default;

async function getEtfConstituents(symbol) {
  try {
    console.log(`\n正在查詢 ${symbol} 的成分股...`);

    // 使用 quote() 方法並指定 'price' 和 'quoteType' 模組來獲取持股資訊
    const result = await yahooFinance.quote(symbol, {
      fields: ["longName"],
      // quoteType's 'holdings' property contains the constituents
      modules: ["price", "quoteType"],
    });

    const holdings = result?.quoteType?.holdings;
    if (!holdings || holdings.length === 0) {
      console.log(`無法找到 ${symbol} 的持股資訊。`);
      return [];
    }

    // 從持股資訊中，只提取股票代碼 (ticker)
    const tickers = holdings.map(h => h.symbol);

    console.log(`查詢成功！${result.price.longName} 包含 ${tickers.length} 支成分股。`);
    console.log('部分範例:', tickers.slice(0, 10).join(', '));
    return tickers;

  } catch (error) {
    console.error(`查詢 ${symbol} 成分股失敗:`, error.message);
    return [];
  }
}

async function main() {
  const qqqTickers = await getEtfConstituents('QQQ');
  const soxxTickers = await getEtfConstituents('SOXX');

  // 合併兩個列表並移除重複項
  const combined = [...new Set([...qqqTickers, ...soxxTickers])];

  console.log(`\n==================================================`);
  console.log(`合併後的觀察名單總數: ${combined.length} 支股票`);
  console.log(`==================================================`);
}

main();