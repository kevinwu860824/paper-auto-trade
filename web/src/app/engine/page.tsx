import { createClient } from "@/utils/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, ShieldCheck, ShieldAlert, Cpu, List, History, ArrowRight, TrendingUp } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { LogoutButton } from "@/components/LogoutButton"

export const revalidate = 30 // Refresh every 30 seconds

export default async function EngineMonitor() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')
  
  // Fetch latest 20 scan logs
  const { data: logs, error } = await supabase
    .from('scan_logs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: snapshotInfo } = await supabase
    .from('market_snapshots')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  const lastScan = logs?.[0];

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-50 selection:bg-emerald-500/30">
      <div className="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      {/* Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-white/10 bg-slate-950/50 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <TrendingUp size={18} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">AutoTrade <span className="font-light text-slate-400">Terminal</span></h1>
          </Link>
        </div>
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400 mr-4">
            <Link href="/" className="hover:text-white cursor-pointer transition-colors">總覽概況</Link>
            <span className="text-white">交易引擎</span>
            <Link href="/backtest" className="hover:text-white cursor-pointer transition-colors">回測探險家</Link>
            <div className="h-4 w-px bg-white/10 mx-2" />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <div className="z-10 flex-1 space-y-8 p-8 pt-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Cpu className="text-emerald-400" /> 交易引擎監控室 (Engine Monitor)
            </h2>
            <p className="text-slate-400 text-sm">即時透明化顯示量化掃描邏輯、決策過程與執行紀錄。</p>
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-4 py-1 rounded-full whitespace-nowrap">
              系統資料已同步
            </Badge>
            <div className="text-[10px] uppercase text-slate-500 font-bold bg-white/5 px-3 py-1 rounded-md border border-white/5">
                最後資料庫快取: {snapshotInfo?.updated_at ? new Date(snapshotInfo.updated_at).toLocaleString('zh-TW', { timeZone: 'America/New_York' }) + ' (ET)' : '等待中'}
            </div>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-12">
          {/* Left Column: Log Feed */}
          <div className="md:col-span-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-2">
                <List size={16}/> 掃描序列 (Scan Sequence)
            </div>
            <div className="space-y-3 h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                {logs?.map((log) => (
                    <div key={log.id} className={`p-4 rounded-xl border transition-all cursor-default ${log.id === lastScan?.id ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5' : 'bg-white/5 border-white/5 hover:border-white/10'}`}>
                       <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono text-slate-500">{new Date(log.created_at).toLocaleString('zh-TW', { timeZone: 'America/New_York' })} (ET)</span>
                          <Badge className={log.status === 'Success' ? 'bg-emerald-500/20 text-emerald-400 border-none px-2' : 'bg-rose-500/20 text-rose-400 border-none px-2'}>
                             {log.status === 'Success' ? '成功執行' : log.status}
                          </Badge>
                       </div>
                       <div className="flex items-center gap-2 mb-1">
                          {log.is_bull_market ? <ShieldCheck className="text-emerald-400" size={14}/> : <ShieldAlert className="text-rose-400" size={14}/>}
                          <span className="text-sm font-medium">{log.is_bull_market ? '大盤牛市：多頭濾網啟動' : '大盤熊市：防禦模式啟動'}</span>
                       </div>
                       <p className="text-xs text-slate-400">SPY 指數: ${Number(log.spy_price).toFixed(2)}</p>
                    </div>
                ))}
                {(!logs || logs.length === 0) && (
                    <div className="text-center py-20 bg-white/5 rounded-xl border border-dashed border-white/10">
                       <p className="text-slate-500 text-sm">等待首次引擎掃描...</p>
                    </div>
                )}
            </div>
          </div>

          {/* Right Column: Active Scan Details */}
          <div className="md:col-span-8 space-y-6">
             <Card className="bg-white/5 border-white/10 backdrop-blur-md">
                <CardHeader className="border-b border-white/5">
                   <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-white flex items-center gap-2">Alpha 雷達分析 (Alpha Radar)</CardTitle>
                        <CardDescription>根據最近一次掃描，篩選出乖離率最高且符合進場條件的標的。</CardDescription>
                      </div>
                      <div className="text-right">
                         <p className="text-xs text-slate-500">掃描頻率</p>
                         <p className="text-sm font-bold text-emerald-400">每 10-60 分鐘</p>
                      </div>
                   </div>
                </CardHeader>
                <CardContent className="pt-6">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {lastScan?.candidates?.length > 0 ? (
                         lastScan.candidates.map((can: any, idx: number) => (
                             <div key={idx} className="bg-slate-900/50 border border-white/5 p-4 rounded-xl flex items-center justify-between">
                                <div>
                                   <p className="text-lg font-bold text-white tracking-tight">{can.ticker}</p>
                                   <p className="text-xs text-slate-500">乖離率 (Stretch): {(can.stretch * 100).toFixed(2)}%</p>
                                </div>
                                <div className="text-right">
                                   <p className="text-sm font-semibold text-emerald-400">${can.close.toFixed(2)}</p>
                                   <p className="text-[10px] uppercase tracking-tighter text-slate-500 font-bold">訊號強度：強</p>
                                </div>
                             </div>
                         ))
                      ) : (
                         <div className="col-span-2 py-10 text-center bg-slate-900/30 rounded-xl border border-dashed border-white/5">
                            <p className="text-slate-500 text-sm">最近一次掃描未發現符合條件的高勝率機會。</p>
                         </div>
                      )}
                   </div>
                </CardContent>
             </Card>

             <Card className="bg-white/5 border-white/10 backdrop-blur-md overflow-hidden">
                <CardHeader className="bg-emerald-500/5 border-b border-white/5">
                   <CardTitle className="text-white flex items-center gap-2 text-md">
                      <History className="text-emerald-400" size={18}/> 交易執行歷史 (Execution History)
                   </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="divide-y divide-white/5">
                      {lastScan?.executed_trades?.length > 0 ? (
                         lastScan.executed_trades.map((trade: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-4 px-6 hover:bg-white/5 transition-colors">
                               <div className="flex items-center gap-4">
                                  <div className={`h-2 w-2 rounded-full ${trade.action === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <div>
                                     <p className="text-sm font-bold text-white tracking-widest">{trade.ticker}</p>
                                     <p className="text-[10px] text-slate-500 uppercase">{trade.action === 'BUY' ? '買入' : '賣出'} 指令已撮合</p>
                                  </div>
                               </div>
                               <div className="flex items-center gap-8">
                                  <div className="text-center">
                                     <p className="text-[10px] text-slate-500 uppercase">執行數量</p>
                                     <p className="text-sm font-medium text-slate-200">{trade.shares || '--'}</p>
                                  </div>
                                  <div className="text-right">
                                     <p className="text-[10px] text-slate-500 uppercase">成交價格</p>
                                     <p className="text-sm font-bold text-white">${trade.price?.toFixed(2) || '市價'}</p>
                                  </div>
                                  <ArrowRight size={16} className="text-slate-700"/>
                                </div>
                            </div>
                         ))
                      ) : (
                         <div className="py-20 flex flex-col items-center justify-center space-y-2 opacity-30">
                            <ShieldCheck size={32}/>
                            <p className="text-sm">資產處於動態平衡狀態，無須變更持倉</p>
                         </div>
                      )}
                   </div>
                </CardContent>
             </Card>
          </div>
        </div>
      </div>
    </main>
  )
}
