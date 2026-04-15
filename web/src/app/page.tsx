import { TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, LayoutDashboard, Globe, ShieldCheck, Briefcase } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createClient } from "@/utils/supabase/server"
import { createAdminSupabase } from "@/utils/supabase" // V25.7 Add Admin Client
import YahooFinance from "yahoo-finance2"
import { getRealAccountData } from "@/lib/schwabEngine"
import Link from "next/link"
import { redirect } from "next/navigation"
import { LogoutButton } from "@/components/LogoutButton"

import { AIPanel } from "@/components/AIPanel"
import { TradeSignals } from "@/components/TradeSignals"

export const revalidate = 60 // Refresh every minute

export default async function Dashboard() {
  const supabase = await createClient()
  
  // V23 Get the current authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const yahooFinance = new (YahooFinance as any)()
  
  let cash = 0
  let positions: any[] = []
  let isConnected = false
  let hasToken = false
  let realAccountData: any = null
  let aiTickers: string[] = ["AAPL", "NVDA", "TSLA"] // 預設值

  // 1. Fetch SPY for simple chart/context
  let spyPrice = 0
  let spyChange = 0
  try {
    const spy = await yahooFinance.quote('SPY')
    spyPrice = spy.regularMarketPrice
    spyChange = spy.regularMarketChangePercent
  } catch (e) {
    console.error("SPY Chart error", e)
  }

  // 1.5 Fetch AI Settings
  try {
    const { data: aiSettings } = await supabase.from('settings').select('value').eq('key', 'ai_target_tickers').eq('user_id', user.id).maybeSingle()
    if (aiSettings?.value) {
      aiTickers = JSON.parse(aiSettings.value)
    }
  } catch(e) {
    console.error("Error fetching AI settings", e)
  }
  
  // 1.6 Fetch Latest AI Trade Signals
  let aiSignals: any[] = []
  try {
    const { data: signals } = await supabase
      .from('ai_trade_signals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)
    
    aiSignals = signals || []
  } catch (e) {
    console.error("Error fetching AI signals", e)
  }

  // 2. Fetch User-Specific Supabase Positions & State + Schwab Token Status (V25.7 Admin Init)
  try {
    let { data: dbState } = await supabase
      .from('portfolio_state')
      .select('*')
      .eq('user_id', user.id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 🌟 核心修復：如果找不到該使用者的資料，改用「上帝權限」進行開戶
    if (!dbState) {
      console.log(`[V25.7] Initializing user simulation account via Admin Key for [${user.email}]...`)
      const adminSupabase = createAdminSupabase()
      const { data: newState, error: initError } = await adminSupabase
        .from('portfolio_state')
        .insert({ user_id: user.id, cash: 100000, history: [] })
        .select()
        .maybeSingle()

      if (!initError && newState) {
        dbState = newState
      } else {
        console.error("無法初始化使用者模擬帳戶 (Admin Error):", initError)
      }
    }

    let { data: dbPos } = await supabase.from('positions').select('*').eq('user_id', user.id)
    const { data: tokenData } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'schwab_access_token')
      .eq('user_id', user.id)
      //.order('id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (dbState) {
      cash = dbState.cash
      positions = dbPos || []
      hasToken = !!tokenData?.value
    }
  } catch (e) {
    console.error("Dashboard DB fetch error:", e)
  }

  // 3. Fetch Real Brokerage Data (Scoped to current user)
  if (hasToken) {
    try {
      realAccountData = await getRealAccountData(user.id)
      isConnected = !!realAccountData
    } catch (e: any) {
      console.error("Real account data error:", e.message)
      isConnected = false
    }
  }

  // 4. Calculate Simulation Equity
  let simEquity = cash
  const enrichedPositions = []
  for (const p of positions) {
    try {
      const quote = await yahooFinance.quote(p.ticker)
      const currentPrice = quote.regularMarketPrice || p.avgCost
      const profit = ((currentPrice / p.avgCost) - 1) * 100
      simEquity += currentPrice * p.shares
      enrichedPositions.push({ ...p, currentPrice, profit })
    } catch (e) {
      simEquity += p.avgCost * p.shares
      enrichedPositions.push({ ...p, currentPrice: p.avgCost, profit: 0 })
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-50 selection:bg-emerald-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      {/* Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-slate-950/50 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <TrendingUp size={18} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">AutoTrade <span className="font-light text-slate-400">Terminal</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400 mr-4">
            <span className="text-white">總覽概況</span>
            <Link href="/engine" className="hover:text-white cursor-pointer transition-colors">交易引擎</Link>
            <Link href="/backtest" className="hover:text-white cursor-pointer transition-colors">回測探險家</Link>
            <div className="h-4 w-px bg-white/10 mx-2" />
            <LogoutButton />
          </nav>

          <div className="flex items-center gap-3 border-l border-white/10 pl-6 cursor-pointer group">
            {isConnected ? (
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-slate-400 group-hover:text-white transition-colors">Schwab 已連線</span>
              </div>
            ) : hasToken && !isConnected ? (
              <Link href="/api/auth/schwab" className="flex items-center gap-3 hover:opacity-80 transition-all">
                <div className="h-2 w-2 rounded-full bg-rose-500" />
                <span className="text-xs font-bold text-rose-400 underline decoration-rose-500/30">Schwab 連線已中斷</span>
              </Link>
            ) : (
              <Link href="/api/auth/schwab" className="flex items-center gap-3 hover:opacity-80 transition-all">
                <div className="h-2 w-2 rounded-full bg-slate-500" />
                <span className="text-xs font-bold text-slate-400">尚未連接 Schwab</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="z-10 flex-1 space-y-8 p-8 pt-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight text-white italic">Black Swan <span className="font-light text-slate-500">Sniper War Room</span></h2>
          <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <Globe className="text-slate-400" size={14} />
            <span className="text-xs font-mono text-slate-300">SPY Index: <span className={spyChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>${spyPrice?.toFixed(2)} ({spyChange?.toFixed(2)}%)</span></span>
          </div>
        </div>

        <Tabs defaultValue="sim" className="space-y-6">
          <TabsList className="bg-white/5 border border-white/10 p-1 rounded-xl">
            <TabsTrigger value="sim" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg px-6 font-bold">模擬戰場 (Simulation)</TabsTrigger>
            <TabsTrigger value="real" className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white rounded-lg px-6 font-bold">Charles Schwab (Real)</TabsTrigger>
          </TabsList>

          <TabsContent value="sim" className="space-y-8">
            {/* Simulation Stats Overview */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">模擬總資產 (Equity)</CardTitle>
                  <Wallet className="h-4 w-4 text-emerald-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black font-mono text-white">${(simEquity || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">可用現金 (Free Cash)</CardTitle>
                  <LayoutDashboard className="h-4 w-4 text-indigo-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black font-mono text-white">${(cash || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">持倉總數 (Positions)</CardTitle>
                  <Briefcase className="h-4 w-4 text-emerald-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black font-mono text-white">{enrichedPositions.length} <span className="text-xs font-normal text-slate-500">TICKERS</span></div>
                </CardContent>
              </Card>
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest">系統狀態</CardTitle>
                  <ShieldCheck className="h-4 w-4 text-emerald-400 animate-pulse" />
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-black text-emerald-400">🧠 智慧守護中</div>
                </CardContent>
              </Card>
            </div>

            {/* War Room Layout GRID */}
            <div className="grid grid-cols-12 gap-8">
              {/* Left Column: Sniper Launchpad */}
              <div className="col-span-12 lg:col-span-4 space-y-6">
                <AIPanel />
              </div>

              {/* Right Column: Decision Center & Portfolio Details */}
              <div className="col-span-12 lg:col-span-8 space-y-8">
                <TradeSignals />
                
                <Card className="bg-white/5 border-white/10 backdrop-blur-md border-t-emerald-500/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                       <Briefcase className="h-4 w-4 text-slate-500" /> 持倉明細 (Current Positions)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-500 uppercase text-[10px] font-black tracking-widest">
                            <th className="px-4 py-3">股票代碼 (Ticker)</th>
                            <th className="px-4 py-3">股數 (Qty)</th>
                            <th className="px-4 py-3">平均成本 (Avg)</th>
                            <th className="px-4 py-3">目前價格 (Price)</th>
                            <th className="px-4 py-3">預估盈虧 (P/L %)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {enrichedPositions.map((pos) => (
                            <tr key={pos.ticker} className="hover:bg-white/5 transition-colors group">
                              <td className="px-4 py-4 font-bold text-white group-hover:text-emerald-400 transition-colors uppercase">{pos.ticker}</td>
                              <td className="px-4 py-4 text-slate-300">{pos.shares}</td>
                              <td className="px-4 py-4 text-slate-300">${Number(pos.avgCost || 0).toFixed(2)}</td>
                              <td className="px-4 py-4 text-slate-300">${Number(pos.currentPrice || 0).toFixed(2)}</td>
                              <td className={`px-4 py-4 font-bold ${(pos.profit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {(pos.profit || 0) >= 0 ? '+' : ''}{(pos.profit || 0).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                          {enrichedPositions.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-10 text-center text-slate-500 bg-slate-900/10 italic">
                                目前無主動持倉，等待 AI 狙擊。
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="real" className="space-y-6">
            {realAccountData ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card className="bg-emerald-500/10 border-emerald-500/30 border-2">
                  <CardHeader className="pb-2 text-emerald-400">
                    <CardTitle className="text-xs uppercase tracking-widest font-bold">真實淨資產 (Liquidation Value)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono">${(realAccountData?.liquidationValue || 0).toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10 border">
                  <CardHeader className="pb-2 text-slate-400">
                    <CardTitle className="text-xs uppercase tracking-widest font-bold">可用現金 (Cash Balance)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono">${(realAccountData?.balance || 0).toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white/5 border-white/10 border">
                  <CardHeader className="pb-2 text-slate-400">
                    <CardTitle className="text-xs uppercase tracking-widest font-bold">實盤持倉 (Total Positions)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono">{realAccountData.positions.length}</div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-20 border border-dashed border-white/10 rounded-3xl bg-white/5">
                <p className="text-slate-400 mb-4 italic">無法抓取真實帳戶資料，請確認 API 連線狀態。</p>
              </div>
            )}

            {realAccountData && realAccountData.positions.length > 0 && (
              <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader>
                  <CardTitle>Charles Schwab 真實持倉明細</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="border-b border-white/10 text-slate-500 uppercase text-[10px] font-bold tracking-widest">
                        <tr>
                          <th className="px-4 py-3">標的</th>
                          <th className="px-4 py-3">數量</th>
                          <th className="px-4 py-3">市值</th>
                          <th className="px-4 py-3">成本</th>
                          <th className="px-4 py-3">未實現盈虧</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {realAccountData.positions.map((p: any) => (
                          <tr key={p.ticker} className="hover:bg-white/5">
                            <td className="px-4 py-4 font-bold text-white uppercase">{p.ticker}</td>
                            <td className="px-4 py-4 text-slate-300 font-mono">{p.shares}</td>
                            <td className="px-4 py-4 text-slate-300 font-mono">${(p.marketValue || 0).toFixed(2)}</td>
                            <td className="px-4 py-4 text-slate-300 font-mono">${(p.avgCost || 0).toFixed(2)}</td>
                            <td className={`px-4 py-4 font-mono font-bold ${(p.unrealizedPL || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              ${(p.unrealizedPL || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}
