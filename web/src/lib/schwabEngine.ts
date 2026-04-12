import { createAdminSupabase } from '@/utils/supabase';
import { watchlisthigh } from './watchlisthigh';
import YahooFinance from 'yahoo-finance2';

async function getAccessToken(userId: string) {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'schwab_access_token')
    .eq('user_id', userId)
    .order('id', { ascending: false }) // V25.5 Stable: Always pick the freshest token
    .limit(1)
    .maybeSingle();

  if (!data?.value) throw new Error('Schwab Access Token not available in Supabase settings.');
  return data.value;
}

export async function getSchwabQuotes(userId: string, tickers: string[]) {
  const token = await getAccessToken(userId);
  const url = `https://api.schwabapi.com/marketdata/v1/quotes?symbols=${tickers.join(',')}`;
  const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Quotes Error: ${response.statusText}`);
  return response.json();
}

export async function getSchwabPriceHistory(userId: string, ticker: string, startDate: Date, endDate: Date) {
  const token = await getAccessToken(userId);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  let period = Math.max(1, Math.ceil(diffDays / 365));

  const params = new URLSearchParams({
    symbol: ticker, periodType: 'year', period: period.toString(),
    frequencyType: 'daily', frequency: '1',
    startDate: startDate.getTime().toString(), endDate: endDate.getTime().toString(),
  });

  const response = await fetch(`https://api.schwabapi.com/marketdata/v1/pricehistory?${params.toString()}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) throw new Error(`History Error for ${ticker}: ${response.statusText}`);
  return response.json();
}

export async function executeBuy(userId: string, ticker: string, shares: number, executedTrades?: any[]) {
  const yahooFinance = new (YahooFinance as any)();
  const quotesData = await yahooFinance.quote(ticker);
  const price = quotesData.regularMarketPrice;
  if (!price) throw new Error(`Cannot get price for [${ticker}]`);

  const cost = price * shares;
  const supabase = createAdminSupabase();

  const { data: state, error: stateError } = await supabase.from('portfolio_state').select('cash, history').eq('user_id', userId).single();
  if (stateError) throw stateError;
  if (state.cash < cost) return { success: false, message: 'Insufficient cash' };

  const { data: existingPos } = await supabase.from('positions').select('*').eq('ticker', ticker).eq('user_id', userId).single();
  const newHistory = [...(state.history || []), { type: 'BUY', date: new Date().toISOString(), ticker, shares, price }];

  if (existingPos) {
    const newShares = existingPos.shares + shares;
    const newAvgCost = ((existingPos.avgCost * existingPos.shares) + cost) / newShares;
    await supabase.from('positions').update({ shares: newShares, avgCost: newAvgCost }).eq('ticker', ticker).eq('user_id', userId);
  } else {
    await supabase.from('positions').insert({ ticker, shares, avgCost: price, peakPrice: price, user_id: userId });
  }

  await supabase.from('portfolio_state').update({ cash: state.cash - cost, history: newHistory }).eq('user_id', userId);
  console.log(`📈 BUY [${ticker}]: ${shares} shares @ $${price.toFixed(2)}`);
  if (executedTrades) executedTrades.push({ ticker, action: 'BUY', price, shares });
  return { success: true };
}

export async function executeSell(userId: string, ticker: string, shares: number, executedTrades?: any[]) {
  const supabase = createAdminSupabase();
  const { data: posToSell } = await supabase.from('positions').select('*').eq('ticker', ticker).eq('user_id', userId).single();
  if (!posToSell) return { success: false, message: 'Position not found' };

  const yahooFinance = new (YahooFinance as any)();
  const quotesData = await yahooFinance.quote(ticker);
  const price = quotesData.regularMarketPrice;
  if (!price) throw new Error(`Cannot get price for [${ticker}]`);

  const { data: state, error: stateError } = await supabase.from('portfolio_state').select('cash, history').eq('user_id', userId).single();
  if (stateError || !state) throw new Error('Could not fetch portfolio state');
  const newHistory = [...(state.history || []), { type: 'SELL', date: new Date().toISOString(), ticker, shares, price }];

  if (posToSell.shares - shares <= 0) {
    await supabase.from('positions').delete().eq('ticker', ticker).eq('user_id', userId);
  } else {
    await supabase.from('positions').update({ shares: posToSell.shares - shares }).eq('ticker', ticker).eq('user_id', userId);
  }

  await supabase.from('portfolio_state').update({ cash: state.cash + (price * shares), history: newHistory }).eq('user_id', userId);
  console.log(`📉 SELL [${ticker}]: ${shares} shares @ $${price.toFixed(2)}`);
  if (executedTrades) executedTrades.push({ ticker, action: 'SELL', price, shares });
  return { success: true };
}

function isMarketOpen() {
  const now = new Date();

  // Convert UTC to Eastern Time (ET)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'long',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const findPart = (name: string) => parts.find(p => p.type === name)?.value;

  const weekday = findPart('weekday');
  const hour = parseInt(findPart('hour') || '0');
  const minute = parseInt(findPart('minute') || '0');
  const month = now.getUTCMonth() + 1; // 1-12
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();

  // Weekend check
  if (weekday === 'Saturday' || weekday === 'Sunday') return false;

  // US Stock Market Holidays 2026 (Hardcoded for stability)
  const holidays2026 = [
    '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'
  ];
  const holidays2027 = [
    '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'
  ];

  const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  if (holidays2026.includes(dateStr) || holidays2027.includes(dateStr)) return false;

  const currentTimeInMinutes = hour * 60 + minute;
  const marketOpenTime = 9 * 60 + 30; // 9:30
  const marketCloseTime = 16 * 60;    // 16:00

  return currentTimeInMinutes >= marketOpenTime && currentTimeInMinutes < marketCloseTime;
}

/**
 * 🤖 AI Signal Processor (V26.0)
 * Reads 'PENDING' signals from ai_trade_signals and executes them via Schwab quotes.
 */
export async function processAISignals(userId: string) {
  const supabase = createAdminSupabase();
  const yahooFinance = new (YahooFinance as any)();
  const executedTrades: any[] = [];

  // 1. Fetch PENDING signals for this user
  const { data: signals, error: signalError } = await supabase
    .from('ai_trade_signals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'PENDING');

  if (signalError || !signals || signals.length === 0) {
    return { status: 'No signals to process', count: 0 };
  }

  console.log(`\n===== [${new Date().toISOString()}] AI Signal Processing Started (${signals.length} signals) =====`);

  for (const signal of signals) {
    try {
      if (signal.action === 'HOLD') {
        await supabase.from('ai_trade_signals').update({ status: 'EXECUTED', executed_at: new Date().toISOString() }).eq('id', signal.id);
        continue;
      }

      // Fetch fresh quotes to ensure simulated trade is at 'real' market prices
      const quote = await yahooFinance.quote(signal.ticker);
      const currentPrice = quote.regularMarketPrice;
      
      if (!currentPrice) {
        throw new Error(`Could not fetch quote for ${signal.ticker}`);
      }

      let res;
      if (signal.action === 'BUY') {
        res = await executeBuy(userId, signal.ticker, Number(signal.quantity), executedTrades);
      } else if (signal.action === 'SELL') {
        res = await executeSell(userId, signal.ticker, Number(signal.quantity), executedTrades);
      }

      // Update signal status based on realization
      if (res?.success) {
        await supabase.from('ai_trade_signals').update({ 
          status: 'EXECUTED', 
          executed_at: new Date().toISOString() 
        }).eq('id', signal.id);
      } else {
        await supabase.from('ai_trade_signals').update({ 
          status: 'FAILED',
          reasoning: `Execution Failed: ${res?.message || 'Unknown error'}`
        }).eq('id', signal.id);
      }
    } catch (err: any) {
      console.error(`Error executing AI signal [${signal.ticker}]:`, err.message);
      await supabase.from('ai_trade_signals').update({ 
        status: 'FAILED',
        reasoning: `System Error: ${err.message}`
      }).eq('id', signal.id);
    }
  }

  return { status: 'Success', processedCount: signals.length, executed: executedTrades.length };
}

/**
 * ⚡️ Ultra-fast Dual-Pass Scan (Snapshot Architecture)
 * Refactored in V26.0 to delegate decision making to the AI Signal Processor.
 */
export async function scanForSignalsAndTrade(userId: string) {
  // Now we primarily rely on AI signals
  return await processAISignals(userId);
}

export async function syncForMarketSnapshots() {
  console.log(`\n===== [${new Date().toISOString()}] Market Snapshot Sync Started =====`);
  const supabase = createAdminSupabase();
  const yahooFinance = new (YahooFinance as any)();

  const END_DATE = new Date();
  const START_DATE = new Date();
  START_DATE.setDate(END_DATE.getDate() - 320);

  const results: any[] = [];
  const BATCH_SIZE = 15;

  for (let i = 0; i < watchlisthigh.length; i += BATCH_SIZE) {
    const batch = watchlisthigh.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async (ticker) => {
      try {
        const history = await yahooFinance.chart(ticker, { period1: START_DATE, period2: END_DATE, interval: '1d' });
        if (!history || !history.quotes || history.quotes.length < 200) return null;
        const quotes = history.quotes.filter((q: any) => q && q.close);
        if (quotes.length < 200) return null;

        const latest = quotes[quotes.length - 1];
        let sum5 = 0; for (let j = quotes.length - 5; j < quotes.length; j++) sum5 += quotes[j].close;
        const ma5 = sum5 / 5;
        let sum200 = 0; for (let j = quotes.length - 200; j < quotes.length; j++) sum200 += quotes[j].close;
        const ma200 = sum200 / 200;

        let consecutiveDrops = 0;
        for (let j = quotes.length - 1; j > 0; j--) {
          if (quotes[j].close < quotes[j - 1].close) consecutiveDrops++; else break;
        }

        return { ticker, ma200, ma5, last_close: latest.close, consecutive_drops: consecutiveDrops, updated_at: new Date().toISOString() };
      } catch (e) { return null; }
    }));
    results.push(...batchResults.filter(r => r !== null));
    console.log(`Synced batch ${i / BATCH_SIZE + 1}...`);
  }

  // Also Sync SPY for the radar
  try {
    const spyH = await yahooFinance.chart('SPY', { period1: START_DATE, period2: END_DATE, interval: '1d' });
    const spyQuotes = spyH.quotes.filter((q: any) => q && q.close);
    if (spyQuotes.length >= 200) {
      let s200 = 0; for (let j = spyQuotes.length - 200; j < spyQuotes.length; j++) s200 += spyQuotes[j].close;
      let s5 = 0; for (let j = spyQuotes.length - 5; j < spyQuotes.length; j++) s5 += spyQuotes[j].close;
      let sDrops = 0;
      for (let j = spyQuotes.length - 1; j > 0; j--) {
        if (spyQuotes[j].close < spyQuotes[j - 1].close) sDrops++; else break;
      }
      results.push({
        ticker: 'SPY',
        ma200: s200 / 200,
        ma5: s5 / 5,
        last_close: spyQuotes[spyQuotes.length - 1].close,
        consecutive_drops: sDrops,
        updated_at: new Date().toISOString()
      });
    }
  } catch (e) { console.error("SPY Sync error:", e); }

  if (results.length > 0) {
    const { error } = await supabase.from('market_snapshots').upsert(results);
    if (error) console.error("Upsert Error:", error.message);
  }
  return { status: 'Sync Complete', count: results.length };
}

export async function getRealAccountData(userId: string) {
  const token = await getAccessToken(userId);

  // V25 Dynamic Discovery: Fetch the account list first to retrieve the user's specific accountHash
  try {
    // 💡 修正：必須呼叫 /accountNumbers 才能取得 Schwab 專屬的 hashValue
    const listUrl = `https://api.schwabapi.com/trader/v1/accounts/accountNumbers`;
    const listResponse = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!listResponse.ok) throw new Error(`Fetch Accounts List Error: ${listResponse.statusText}`);

    const accounts = await listResponse.json();

    // 💡 加上這行，如果未來還有問題，我們就能在終端機直接看見 Schwab 到底回傳了什麼鬼東西
    console.log(`[Schwab API] 回傳的帳戶列表:`, JSON.stringify(accounts));

    if (!accounts || accounts.length === 0) throw new Error('No accounts found for this Schwab connection.');

    // Pick the first account hash available for this user
    const accountHash = accounts[0].hashValue;
    if (!accountHash) throw new Error('Could not find a valid account hash for this user.');

    // Now fetch the actual details using the discovered hash
    const detailUrl = `https://api.schwabapi.com/trader/v1/accounts/${accountHash}?fields=positions`;
    const response = await fetch(detailUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Account Detail Error: ${response.statusText}`);

    const data = await response.json();
    const account = data.securitiesAccount;

    return {
      balance: account.currentBalances.totalCash || 0,
      liquidationValue: account.currentBalances.liquidationValue || 0,
      positions: (account.positions || []).map((p: any) => ({
        ticker: p.instrument.symbol,
        shares: p.longQuantity || p.shortQuantity,
        marketValue: p.marketValue,
        avgCost: p.averagePrice,
        unrealizedPL: p.unrealizedProfitLoss
      }))
    };
  } catch (e: any) {
    console.error(`[V25 Sync] Dynamic Account Error to user [${userId}]:`, e.message);
    throw e;
  }
}
