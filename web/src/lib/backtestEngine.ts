import YahooFinance from 'yahoo-finance2';
import { watchlisthigh } from './watchlisthigh';

export interface BacktestResult {
    equityCurve: { date: string; equity: number; spy: number; qqq: number }[];
    totalReturn: number;
    annualReturn: number;
    maxDrawdown: number;
    sharpeRatio: number;
    trades: any[];
}

const COMMISSION = 0.0; // Charles Schwab model
const SLIPPAGE = 0.0005;  // 0.05% slippage

export async function runBacktest(
    startDateStr: string,
    endDateStr: string,
    initialCash: number = 100000,
    options: any = {}
): Promise<BacktestResult> {
    const { 
        useVixFilter = false, 
        strategyMode = 'mean-reversion', 
        useSlopeFilter = false, 
        useGoldenCross = false,
        useBearSurf = false,
        useAlphaShield = false,
        useFastSignal = false,
        useRiskParity = false,
        useCoreTrend = false,
        spatialBuffer = 1.5,
        temporalBuffer = 2,
        stopLossPct = 10, // Default 10%
        focusTicker = null // Support specific ticker backtest
    } = options;
    
    // Determine the working watchlist
    const activeWatchlist = focusTicker ? [focusTicker.toUpperCase()] : watchlisthigh;
    const stopLossMultiplier = 1 - (stopLossPct / 100);
    
    const yahooFinance = new (YahooFinance as any)();
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const fetchStart = new Date(start);
    fetchStart.setDate(fetchStart.getDate() - 365); 

    // 1. Fetch Data
    const drivers = ['SPY', 'TQQQ', '^VIX', 'SQQQ', 'QQQ'];
    const [spyData, tqqqData, vixData, sqqqData, qqqData] = await Promise.all(
        drivers.map((t: string) => yahooFinance.chart(t, { period1: fetchStart, period2: end, interval: '1d' }))
    );

    const toDateStr = (d: any) => new Date(d).toISOString().split('T')[0];
    const applyAdj = (q: any) => {
        const r = q.adjclose ? (q.adjclose / q.close) : 1;
        return { ...q, close: q.close * r, high: q.high * r, open: q.open * r, low: q.low * r };
    };

    const spyQuotes = spyData.quotes.filter((q: any) => q && q.close).map(applyAdj);
    const tqqqQuotes = tqqqData.quotes.filter((q: any) => q && q.close).map(applyAdj).filter((q: any) => q.close > 0);
    const qqqQuotes = qqqData.quotes.filter((q: any) => q && q.close).map(applyAdj).filter((q: any) => q.close > 0);
    const sqqqQuotes = sqqqData.quotes.filter((q: any) => q && q.close).map(applyAdj).filter((q: any) => q.close > 0);
    const vixMap = new Map<string, number>();
    vixData.quotes.forEach((q: any) => { if(q && q.close) vixMap.set(toDateStr(q.date), q.close); });

    const tqqqDict: Record<string, any> = {};
    tqqqQuotes.forEach((q: any) => tqqqDict[toDateStr(q.date)] = q);
    
    const qqqDict: Record<string, any> = {};
    qqqQuotes.forEach((q: any) => qqqDict[toDateStr(q.date)] = q);

    const sqqqDict: Record<string, any> = {};
    sqqqQuotes.forEach((q: any) => sqqqDict[toDateStr(q.date)] = q);

    // 2. Fetch Watchlist
    const stockData: Record<string, Record<string, any>> = {};
    for (let i = 0; i < activeWatchlist.length; i += 20) {
        const batch = activeWatchlist.slice(i, i + 20);
        await Promise.all(batch.map(async (ticker) => {
            try {
                const data = await yahooFinance.chart(ticker, { period1: fetchStart, period2: end, interval: '1d' });
                const quotes = data.quotes.filter((q: any) => q && q.close).map(applyAdj);
                const dict: Record<string, any> = {};
                quotes.forEach((q: any, idx: number) => {
                    let ma5 = null, ma200 = null, drops = 0;
                    if (idx >= 5) ma5 = quotes.slice(idx - 5, idx).reduce((s: number, x: number | any) => s + (typeof x === 'number' ? x : x.close), 0) / 5;
                    if (idx >= 200) ma200 = quotes.slice(idx - 200, idx).reduce((s: number, x: number | any) => s + (typeof x === 'number' ? x : x.close), 0) / 200;
                    
                    if (idx > 0) {
                        const prevIdx = idx - 1;
                        if (q.close < quotes[prevIdx].close) {
                            drops = (dict[toDateStr(quotes[prevIdx].date)]?.drops || 0) + 1;
                        }
                    }
                    dict[toDateStr(q.date)] = { ...q, ma5, ma200, drops };
                });
                stockData[ticker] = dict;
            } catch (e) {}
        }));
    }

    // 3. Signals
    const marketSignals = new Map<string, any>();
        let daysAboveMa200 = 0;
        let daysBelowMa200 = 0;

        for (let i = 220; i < spyQuotes.length; i++) {
        const dateStr = toDateStr(spyQuotes[i].date);
        const ma10 = spyQuotes.slice(i - 10, i).reduce((s: number, x: any) => s + x.close, 0) / 10;
        const ma50 = spyQuotes.slice(i - 50, i).reduce((s: number, x: any) => s + x.close, 0) / 50;
        const ma200 = spyQuotes.slice(i - 200, i).reduce((s: number, x: any) => s + x.close, 0) / 200;
        
        const qqqQuoteIdx = qqqQuotes.findIndex((q: any) => toDateStr(q.date) === dateStr);
        let qqqMa200 = 0;
        if (qqqQuoteIdx >= 200) {
            qqqMa200 = qqqQuotes.slice(qqqQuoteIdx - 200, qqqQuoteIdx).reduce((s: number, x: any) => s + x.close, 0) / 200;
        }

        if (qqqQuoteIdx >= 0 && qqqMa200 > 0) {
            if (qqqQuotes[qqqQuoteIdx].close > qqqMa200) {
                daysAboveMa200++;
                daysBelowMa200 = 0;
            } else {
                daysBelowMa200++;
                daysAboveMa200 = 0;
            }
        }

        const prevMa200 = spyQuotes.slice(i - 220, i - 20).reduce((s: number, x: any) => s + x.close, 0) / 200;
        const slope = ((ma200 - prevMa200) / prevMa200) * 100;
        
        const ma20 = spyQuotes.slice(i - 20, i).reduce((s: number, x: any) => s + x.close, 0) / 20;
        const ma60 = spyQuotes.slice(i - 60, i).reduce((s: number, x: any) => s + x.close, 0) / 60;

        // V18/V19 Iron Shield (Whipsaw Filter - Dynamic)
        const spatialBufferRatio = 1 + (spatialBuffer / 100);
        const isTrendBull = (strategyMode === 'tqqq-trend' && qqqQuoteIdx >= 0) 
            ? (qqqQuotes[qqqQuoteIdx].close > qqqMa200 * spatialBufferRatio && daysAboveMa200 >= temporalBuffer) 
            : (spyQuotes[i].close > ma200 * 1.005);

        let isBull = ma10 > ma50 * 1.005; // 0.5% Buffer
        if (useCoreTrend) isBull = ma20 > ma60 * 1.005;
        else if (strategyMode === 'tqqq-trend') isBull = isTrendBull;
        else if (!useFastSignal) isBull = spyQuotes[i].close > ma200 * 1.005;

        // V16 Fix: UI Toggles for Signals
        if (useGoldenCross) isBull = ma50 > ma200;
        if (useSlopeFilter) isBull = isBull && slope > 0;

        marketSignals.set(dateStr, {
            isBull,
            isDeathCross: ma50 < ma200,
            slope,
            qqqMa200
        });
    }

    // 4. Loop
    let cash = initialCash, tqqqShares = 0, sqqqShares = 0;
    let spyShares = 0, sqqqPeak = 0, equityPeak = initialCash;
    let isPanic = false; 
    const stockPositions: Record<string, { shares: number; avgCost: number; peak: number }> = {};
    const trades: any[] = [];
    const equityCurve: any[] = [];

    const startIdx = spyQuotes.findIndex((q: any) => toDateStr(q.date) >= startDateStr);
    const loopStart = startIdx === -1 ? 220 : Math.max(220, startIdx);
    const firstDate = toDateStr(spyQuotes[loopStart].date);
    const initialSpyPrice = spyQuotes.find((q: any) => toDateStr(q.date) === firstDate)?.close || spyQuotes[loopStart].close;
    const initialQqqPrice = qqqDict[firstDate]?.close || qqqQuotes[0].close;

    for (let i = loopStart; i < spyQuotes.length - 1; i++) {
        const today = toDateStr(spyQuotes[i].date);
        const tomorrow = toDateStr(spyQuotes[i+1].date);
        const qqqHoldEquity = (qqqDict[today]?.close / initialQqqPrice) * initialCash;
        
        let currentEquity = cash + (tqqqShares * (tqqqDict[today]?.close || 0)) + (sqqqShares * (sqqqDict[today]?.close || 0)) + (spyShares * (spyQuotes[i].close || 0));
        for (const t in stockPositions) currentEquity += stockPositions[t].shares * (stockData[t]?.[today]?.close || stockPositions[t].avgCost);
        
        if (currentEquity > equityPeak) equityPeak = currentEquity;
        
        const signal = marketSignals.get(today) || { isBull: true, isDeathCross: false, slope: 0 };
        const vix = vixMap.get(today) || 20;

        if (useRiskParity && currentEquity < equityPeak * 0.85) isPanic = true;
        if (isPanic && (currentEquity > equityPeak * 0.95 || (signal.isBull && vix < 30))) isPanic = false;

        const tmrwTqqq = tqqqDict[tomorrow];
        const tmrwSqqq = sqqqDict[tomorrow];
        const tmrwSpyQuote = spyQuotes[i+1];

        let exposureScale = 1.0;
        if (useRiskParity) {
            if (strategyMode === 'tqqq-trend' && vix > 35) exposureScale = 0;
            else if (vix > 40) exposureScale = 0;
            else if (vix > 35) exposureScale = 0.2;
            else if (vix > 30) exposureScale = 0.4;
            else if (vix > 25) exposureScale = 0.7;
            else if (vix > 20) exposureScale = 0.9;
        }

        // 1. SELL LOGIC (Individual Stocks)
        if (strategyMode !== 'tqqq-trend') {
            for (const t in stockPositions) {
                const q = stockData[t]?.[today];
                const tmrw = stockData[t]?.[tomorrow];
                if (!q) continue;
                if (q.high > stockPositions[t].peak) stockPositions[t].peak = q.high;
                
                let shouldSell = false;
                if (strategyMode === 'mean-reversion') {
                    if (q.close > q.ma5 || (q.close / stockPositions[t].avgCost) < stopLossMultiplier) shouldSell = true;
                } else if (strategyMode === 'momentum') {
                    if (q.close < stockPositions[t].peak * stopLossMultiplier) shouldSell = true;
                }
                if (!signal.isBull || isPanic) shouldSell = true;

                if (shouldSell) {
                    const sellPrice = tmrw ? tmrw.open : q.close;
                    const proceeds = stockPositions[t].shares * sellPrice;
                    cash += proceeds * (1 - COMMISSION - SLIPPAGE);
                    trades.push({ date: tomorrow, ticker: t, action: 'SELL', price: sellPrice, reason: !signal.isBull ? 'Market' : 'Exit', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                    delete stockPositions[t];
                }
            }
        }

        // 2/3. ETF LIQUIDATION
        if (sqqqShares > 0 && (signal.isBull || !signal.isDeathCross || isPanic)) {
             if (tmrwSqqq) {
                 cash += sqqqShares * tmrwSqqq.open * (1 - COMMISSION - SLIPPAGE);
                 trades.push({ date: tomorrow, ticker: 'SQQQ', action: 'SELL', price: tmrwSqqq.open, reason: 'Exit', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                 sqqqShares = 0;
             }
        }
        if (tqqqShares > 0 && (!signal.isBull || isPanic)) { 
            if (tmrwTqqq) { 
                cash += tqqqShares * tmrwTqqq.open * (1 - COMMISSION - SLIPPAGE);
                trades.push({ date: tomorrow, ticker: 'TQQQ', action: 'SELL', price: tmrwTqqq.open, reason: 'Regime Exit', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                tqqqShares = 0; 
            }
        }
        if (spyShares > 0 && (!signal.isBull || isPanic)) {
            // V17: Protect Alpha Shield parking - don't sell SPY on regime exit if it's our shield!
            if (!useAlphaShield) {
                if (tmrwSpyQuote) {
                    cash += spyShares * tmrwSpyQuote.open * (1 - COMMISSION - SLIPPAGE);
                    trades.push({ date: tomorrow, ticker: 'SPY', action: 'SELL', price: tmrwSpyQuote.open, reason: 'Regime Exit', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                    spyShares = 0;
                }
            }
        }

        // 4. BUY LOGIC (CANDIDATES)
        const candidates = [];
        if (signal.isBull && !isPanic && strategyMode !== 'tqqq-trend') {
            for (const ticker of activeWatchlist) {
                if (stockPositions[ticker]) continue;
                const q = stockData[ticker]?.[today], tmrw = stockData[ticker]?.[tomorrow];
                if (q?.ma200 && q?.ma5 && q.close > q.ma200 && q.drops >= 3 && tmrw) {
                    candidates.push({ ticker, stretch: (q.ma5 - q.close) / q.ma5, open: tmrw.open });
                }
            }
            candidates.sort((a, b) => b.stretch - a.stretch);
        }

        // 5. BUY EXECUTION (STOCKS)
        const currentStockValue = Object.keys(stockPositions).reduce((s, t) => s + stockPositions[t].shares * (stockData[t]?.[today]?.close || 0), 0);
        for (const cand of candidates) {
            if (Object.keys(stockPositions).length >= 5) break;
            const target = currentEquity * 0.20;
            if (cash < target) {
                 // Raise cash from SPY/TQQQ if needed
                 if (spyShares > 0 && tmrwSpyQuote) {
                     const sToSell = Math.min(spyShares, Math.ceil((target - cash) / tmrwSpyQuote.open));
                     cash += sToSell * tmrwSpyQuote.open * (1 - COMMISSION - SLIPPAGE);
                     spyShares -= sToSell;
                 }
                 if (cash < target && tqqqShares > 0 && tmrwTqqq) {
                     const sToSell = Math.min(tqqqShares, Math.ceil((target - cash) / tmrwTqqq.open));
                     cash += sToSell * tmrwTqqq.open * (1 - COMMISSION - SLIPPAGE);
                     tqqqShares -= sToSell;
                 }
            }
            if (cash >= target) {
                const s = Math.floor(target / (cand.open * (1 + COMMISSION + SLIPPAGE)));
                if (s > 0) {
                    cash -= s * cand.open * (1 + COMMISSION + SLIPPAGE);
                    stockPositions[cand.ticker] = { shares: s, avgCost: cand.open, peak: cand.open };
                    trades.push({ date: tomorrow, ticker: cand.ticker, action: 'BUY', price: cand.open, equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                }
            }
        }

        // 6. ALLOCATION (TQQQ/SPY)
        if (signal.isBull && !isPanic) {
            const targetTqqqValue = (currentEquity - currentStockValue) * exposureScale;
            const currentTqqqValue = tqqqShares * (tqqqDict[today]?.close || 0);

            if (currentTqqqValue < targetTqqqValue * 0.8 && tmrwTqqq) {
                const costFactor = 1 + COMMISSION + SLIPPAGE;
                let add = Math.floor((targetTqqqValue - currentTqqqValue) / (tmrwTqqq.open * costFactor));
                if (cash < add * tmrwTqqq.open * costFactor && spyShares > 0 && tmrwSpyQuote) {
                    const sToSell = Math.min(spyShares, Math.ceil((add * tmrwTqqq.open * costFactor - cash) / tmrwSpyQuote.open));
                    cash += sToSell * tmrwSpyQuote.open * (1 - COMMISSION - SLIPPAGE);
                    spyShares -= sToSell;
                    trades.push({ date: tomorrow, ticker: 'SPY', action: 'SELL', price: tmrwSpyQuote.open, reason: 'Raise Cash', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                }
                add = Math.min(add, Math.floor(cash / (tmrwTqqq.open * costFactor)));
                if (add > 0) {
                    cash -= add * tmrwTqqq.open * costFactor;
                    tqqqShares += add;
                    trades.push({ date: tomorrow, ticker: 'TQQQ', action: 'BUY', price: tmrwTqqq.open, reason: 'Allocation', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                }
            } else if (currentTqqqValue > targetTqqqValue * 1.2 && tmrwTqqq) {
                const sToSell = Math.floor((currentTqqqValue - targetTqqqValue) / tmrwTqqq.open);
                if (sToSell > 0) {
                    cash += sToSell * tmrwTqqq.open * (1 - COMMISSION - SLIPPAGE);
                    tqqqShares -= sToSell;
                    trades.push({ date: tomorrow, ticker: 'TQQQ', action: 'SELL', price: tmrwTqqq.open, reason: 'Rebalance', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
                }
            }
        } else if (useBearSurf && signal.isDeathCross && !isPanic && sqqqShares === 0 && tmrwSqqq && cash > 500) {
            const s = Math.floor(cash / (tmrwSqqq.open * (1 + COMMISSION + SLIPPAGE)));
            if (s > 0) {
                cash -= s * tmrwSqqq.open * (1 + COMMISSION + SLIPPAGE);
                sqqqShares = s;
                trades.push({ date: tomorrow, ticker: 'SQQQ', action: 'BUY', price: tmrwSqqq.open, equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
            }
        }

        // V16 Fix: Relocated Alpha Shield to sweep residual cash into SPY regardless of regime
        // V18/V19 Optimization: Don't park in SPY if VIX > 28 (Too volatile, hold cash instead)
        // V19 Fix: Now correctly respects 'useVixFilter' UI toggle
        const isVixSafe = !useVixFilter || vix < 28;
        if (useAlphaShield && cash > 1000 && tmrwSpyQuote && sqqqShares === 0 && isVixSafe) { 
            // Only park in SPY if not shorting via SQQQ to avoid hedging friction
            // AND only if market isn't in a high-vol panic (VIX < 28)
            const s = Math.floor(cash / (tmrwSpyQuote.open * (1 + COMMISSION + SLIPPAGE)));
            if (s > 0) {
                cash -= s * tmrwSpyQuote.open * (1 + COMMISSION + SLIPPAGE);
                spyShares += s;
                trades.push({ date: tomorrow, ticker: 'SPY', action: 'BUY', price: tmrwSpyQuote.open, reason: 'Shield Parking', equity: currentEquity, balance: cash, qqq: qqqHoldEquity });
            }
        }

        equityCurve.push({ 
            date: today, 
            equity: currentEquity, 
            spy: (spyQuotes[i].close / initialSpyPrice) * initialCash,
            qqq: qqqHoldEquity
        });
    }

    const final = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : initialCash;
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    let peak = 0, maxDD = 0;
    for (const d of equityCurve) { 
        if (d.equity > peak) peak = d.equity; 
        const dd = (peak - d.equity) / Math.max(1, peak); 
        if (dd > maxDD) maxDD = dd; 
    }

    const returns: number[] = [];
    for (let j = 1; j < equityCurve.length; j++) {
        returns.push((equityCurve[j].equity / equityCurve[j-1].equity) - 1);
    }
    const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
    const stdDev = returns.length > 0 ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length) : 0;
    const annualizedSharpe = stdDev === 0 ? 0 : (avgReturn / stdDev) * Math.sqrt(252);

    return {
        equityCurve,
        totalReturn: ((final / initialCash) - 1) * 100,
        annualReturn: (Math.pow(final / initialCash, 365 / days) - 1) * 100,
        maxDrawdown: maxDD * 100,
        sharpeRatio: annualizedSharpe,
        trades
    };
}
