import { createAdminSupabase } from '@/utils/supabase';
import { watchlisthigh } from './watchlisthigh';
import YahooFinance from 'yahoo-finance2';

async function getAccessToken(userId: string, forceRefresh: boolean = false) {
  const supabase = createAdminSupabase();
  const { data: settings } = await supabase
    .from('settings')
    .select('key, value')
    .eq('user_id', userId)
    .in('key', ['schwab_access_token', 'schwab_refresh_token', 'schwab_expires_at']);

  if (!settings || settings.length === 0) {
    throw new Error('Schwab credentials not found. Please connect your account.');
  }

  const find = (key: string) => settings.find(s => s.key === key)?.value;
  
  let accessToken = find('schwab_access_token');
  const refreshToken = find('schwab_refresh_token');
  const expiresAt = Number(find('schwab_expires_at') || '0');

  // If token is missing, expired, near expiry, OR forceRefresh is requested
  const now = Date.now();
  const isNearExpiry = !accessToken || !expiresAt || now >= (expiresAt - 120000);

  if (isNearExpiry || forceRefresh) {
    console.log(`[Schwab Engine] Token refresh triggered for user [${userId}] (Forced: ${forceRefresh})...`);
    if (!refreshToken) throw new Error('Refresh token missing. Please re-authenticate.');
    
    const refreshed = await refreshAccessToken(userId, refreshToken);
    accessToken = refreshed;
  }

  return accessToken;
}

async function refreshAccessToken(userId: string, refreshToken: string) {
  const clientId = process.env.SCHWAB_CLIENT_ID;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const tokenResponse = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }).toString()
    });

    const newData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error(`[Schwab Engine] Refresh Failed:`, newData);
      throw new Error(`Token Refresh Failed: ${JSON.stringify(newData)}`);
    }

    const { access_token, refresh_token, expires_in } = newData;
    const expiresAt = Date.now() + (expires_in * 1000);

    const supabase = createAdminSupabase();
    await supabase.from('settings').upsert([
      { key: 'schwab_access_token', value: access_token, user_id: userId },
      { key: 'schwab_expires_at', value: expiresAt.toString(), user_id: userId }
    ], { onConflict: 'user_id,key' });

    // Schwab sometimes returns a new refresh token (Rotation)
    if (refresh_token) {
      await supabase.from('settings').upsert(
        { key: 'schwab_refresh_token', value: refresh_token, user_id: userId },
        { onConflict: 'user_id,key' }
      );
    }

    console.log(`✅ [Schwab Engine] Token refreshed successfully for [${userId}].`);
    return access_token;
  } catch (e: any) {
    console.error(`[Schwab Engine] Fatal Refresh Error:`, e.message);
    throw e;
  }
}

export async function getSchwabQuotes(userId: string, tickers: string[]) {
  const token = await getAccessToken(userId);
  const url = `https://api.schwabapi.com/marketdata/v1/quotes?symbols=${tickers.join(',')}`;
  const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Quotes Error: ${response.statusText}`);
  return response.json();
}

/**
 * 🛰️ Schwab Quote Manager (Snapshot Sync)
 * Fetches real-time price & change % for the 118-stock watchlist in batches.
 */
export async function syncSchwabQuotes(userId: string) {
  console.log(`\n===== [${new Date().toISOString()}] Schwab Quote Sync Started =====`);
  const supabase = createAdminSupabase();
  const BATCH_SIZE = 40; // Schwab limit is usually 50 per request
  const results: any[] = [];

  for (let i = 0; i < watchlisthigh.length; i += BATCH_SIZE) {
    const batch = watchlisthigh.slice(i, i + BATCH_SIZE);
    try {
      const quotes = await getSchwabQuotes(userId, batch);
      // Schwab API returns an object with ticker keys
      for (const ticker of batch) {
        const q = quotes[ticker];
        if (!q) continue;

        // Extract last price and net change % (e.g. 0.05 for 5%)
        const lastPrice = q.quote.lastPrice;
        const netChangePercent = q.quote.netChangePercent;
        const totalVolume = q.quote.totalVolume;

        results.push({
          ticker,
          last_close: lastPrice,
          net_change_percent: netChangePercent,
          total_volume: totalVolume,
          updated_at: new Date().toISOString()
        });
      }
      console.log(`Synced batch ${i / BATCH_SIZE + 1} of Schwab quotes...`);
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit protection
    } catch (e: any) {
      console.error(`Error syncing Schwab quotes for batch ${i}:`, e.message);
    }
  }

  if (results.length > 0) {
    const { error } = await supabase.from('market_snapshots').upsert(results, { onConflict: 'ticker' });
    if (error) console.error("Upsert Error (Schwab Snapshots):", error.message);
  }

  return { status: 'Schwab Sync Complete', count: results.length };
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
    const { error: upError } = await supabase.from('positions').update({ shares: newShares, avgCost: newAvgCost }).eq('ticker', ticker).eq('user_id', userId);
    if (upError) throw new Error(`Failed to update position: ${upError.message}`);
  } else {
    const { error: inError } = await supabase.from('positions').insert({ ticker, shares, avgCost: price, peakPrice: price, user_id: userId });
    if (inError) throw new Error(`Failed to insert position: ${inError.message}`);
  }

  const { error: stateUpError } = await supabase.from('portfolio_state').update({ cash: state.cash - cost, history: newHistory }).eq('user_id', userId);
  if (stateUpError) {
      // Critical: If state update fails after position update, we should technically roll back, but for now we log it.
      console.error(`CRITICAL: Cash update failed after position update: ${stateUpError.message}`);
      throw stateUpError;
  }

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
        const { error: finalError } = await supabase.from('ai_trade_signals').update({ 
          status: 'EXECUTED', 
          executed_at: new Date().toISOString() 
        }).eq('id', signal.id);
        if (finalError) console.error(`Failed to mark signal as EXECUTED: ${finalError.message}`);
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
  let token = await getAccessToken(userId);

  // V25 Dynamic Discovery: Fetch the account list first to retrieve the user's specific accountHash
  try {
    let listUrl = `https://api.schwabapi.com/trader/v1/accounts/accountNumbers`;
    let listResponse = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    
    // 🛡️ Automatic Retry for 401 Unauthorized
    if (listResponse.status === 401) {
      console.warn(`[Schwab Engine] 401 Unauthorized detected for user [${userId}]. Forcing token refresh and retrying...`);
      token = await getAccessToken(userId, true); // Force Refresh
      listResponse = await fetch(listUrl, { headers: { 'Authorization': `Bearer ${token}` } });
    }

    if (!listResponse.ok) {
      throw new Error(`Fetch Accounts List Error: ${listResponse.status} ${listResponse.statusText}`);
    }

    const accounts = await listResponse.json();
    console.log(`[Schwab API] 回傳的帳戶列表 (Count: ${accounts?.length || 0})`);

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
    console.error(`[Schwab Sync] Error for user [${userId}]:`, e.message);
    throw e;
  }
}
