'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Wallet, TrendingUp, PlayCircle, Loader2, DollarSign, PieChart, ShieldCheck, AlertCircle, RefreshCw } from "lucide-react"
import { createClient } from '@/utils/supabase/client'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface PortfolioItem {
  id: string;
  ticker: string;
  shares: number;
  average_cost: number;
  tier: 'S' | 'A' | 'B';
  highest_price?: number;
  stop_loss_pct?: number;
}

export function PortfolioDashboard() {
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [cash, setCash] = useState(0)
  const [quotes, setQuotes] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isAllocating, setIsAllocating] = useState(false)
  const [schwabConnected, setSchwabConnected] = useState<boolean | null>(null)
  const [showToast, setShowToast] = useState<{message: string, type: 'success' | 'error'} | null>(null)
  const supabase = createClient()

  // 1. Fetch Real-time Quotes from our Internal API
  const fetchQuotes = useCallback(async (items: PortfolioItem[]) => {
    const tickers = items.map(i => i.ticker).join(',')
    if (!tickers) return

    try {
      const res = await fetch(`/api/portfolio/quotes?tickers=${tickers}`)
      if (res.status === 401) {
        setSchwabConnected(false)
        return
      }
      if (!res.ok) throw new Error("Quotes Fetch Failed")
      
      const data = await res.json()
      setQuotes(data)
      setSchwabConnected(true)
    } catch (err) {
      console.error("[PortfolioDashboard] Schwab Quote Error:", err)
      setSchwabConnected(false)
    }
  }, [])

  // 2. Fetch Portfolio from Supabase
  const fetchPortfolio = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('portfolio')
        .select('*')
        .order('ticker', { ascending: true })

      if (error) throw error
      
      const cashEntry = data.find(item => item.ticker === 'CASH')
      const stockItems = data.filter(item => item.ticker !== 'CASH') as PortfolioItem[]
      
      setCash(cashEntry ? cashEntry.shares : 0)
      setPortfolio(stockItems)
      
      // Immediately fetch quotes for these stocks
      if (stockItems.length > 0) {
        fetchQuotes(stockItems)
      } else {
        setSchwabConnected(true) // If no stocks, assume connected if we reached here
      }
    } catch (err: any) {
      console.error("Failed to fetch portfolio:", err.message)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, fetchQuotes])

  useEffect(() => {
    fetchPortfolio()
    
    const channel = supabase
      .channel('portfolio_realtime_v2')
      .on('postgres_changes', { event: '*', table: 'portfolio', schema: 'public' }, () => {
        fetchPortfolio()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchPortfolio])

  const handleRunAllocation = async () => {
    if (!schwabConnected) {
      alert("請先完成 Schwab OAuth 授權連線。")
      return
    }
    if (!confirm("確定要執行『Schwab 即時建倉演算』嗎？這將使用券商真實報價分配資金。")) return
    
    setIsAllocating(true)
    try {
      const response = await fetch('/api/portfolio/allocate', { method: 'POST' })
      const result = await response.json()

      if (result.success) {
        setShowToast({ message: result.message, type: 'success' })
        fetchPortfolio()
      } else {
        setShowToast({ message: result.message || result.error, type: 'error' })
      }
    } catch (err: any) {
      setShowToast({ message: "連線 API 失敗，請重試", type: 'error' })
    } finally {
      setIsAllocating(false)
      setTimeout(() => setShowToast(null), 5000)
    }
  }

  // Calculate Aggregated Metrics
  const marketValue = portfolio.reduce((acc, item) => {
    const price = quotes[item.ticker] || item.average_cost
    return acc + (item.shares * price)
  }, 0)
  
  const totalValue = marketValue + cash
  const totalPL = portfolio.reduce((acc, item) => {
    const price = quotes[item.ticker]
    if (!price) return acc
    return acc + ((price - item.average_cost) * item.shares)
  }, 0)

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
              "fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl border shadow-2xl backdrop-blur-md flex flex-col gap-1",
              showToast.type === 'success' ? "bg-emerald-600/90 border-emerald-500/50" : "bg-rose-600/90 border-rose-500/50"
            )}
          >
            <p className="text-sm font-bold text-white">{showToast.type === 'success' ? '🚀 建倉成功' : '⚠️ 執行中止'}</p>
            <p className="text-xs text-white/80">{showToast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-xl font-black text-white italic tracking-tight flex items-center gap-2">
           <ShieldCheck className="text-emerald-400" />
           資產管理中心 <span className="text-slate-500 font-light text-sm not-italic ml-2">Initial Allocation</span>
        </h3>
        
        <div className="flex items-center gap-2">
           {schwabConnected === true ? (
             <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 py-1 px-3 flex items-center gap-1.5 animate-in fade-in duration-500">
                <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                🟢 Schwab Live Data Connected
             </Badge>
           ) : schwabConnected === false ? (
             <Badge variant="destructive" className="py-1 px-3 flex items-center gap-1.5">
                <AlertCircle size={12} />
                Schwab Unauthorized
             </Badge>
           ) : (
             <Badge variant="outline" className="text-slate-500 border-slate-800 py-1 px-3">
                <Loader2 size={12} className="animate-spin mr-1.5" /> Checking Connection
             </Badge>
           )}
           <button 
             onClick={() => fetchPortfolio()} 
             className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
           >
             <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">總資產估值 (AUM)</span>
              <span className="text-2xl font-black text-white font-mono">
                ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">可用現金水位</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                ${cash.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardContent className="pt-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">當前總盈虧 (P/L)</span>
              <span className={cn(
                "text-2xl font-black font-mono",
                totalPL >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {totalPL >= 0 ? '+' : ''}${Math.abs(totalPL).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-indigo-500/20 flex items-center p-4">
          <button 
            onClick={handleRunAllocation}
            disabled={isAllocating || schwabConnected === false}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 disabled:bg-slate-800 disabled:text-slate-600"
          >
            {isAllocating ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
            執行初次建倉演算
          </button>
        </Card>
      </div>

      <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden border-t-indigo-500/30 border-t-2">
        <CardHeader className="bg-white/[0.02] border-b border-white/5">
          <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
             <PieChart size={16} className="text-indigo-400" /> 持倉明細與即時估值 (Schwab Live)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-white/[0.02]">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="text-slate-500 font-black text-[10px] uppercase">Ticker</TableHead>
                <TableHead className="text-slate-500 font-black text-[10px] uppercase">Tier</TableHead>
                <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase">股數</TableHead>
                <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase">平均成本</TableHead>
                <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase">Schwab 現價</TableHead>
                <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase">防禦狀態 (Stop Loss)</TableHead>
                <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase">未實現損益</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-400" />
                  </TableCell>
                </TableRow>
              ) : portfolio.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500 italic">
                    尚未建倉，等待 AI 訊號發射後啟動演算。
                  </TableCell>
                </TableRow>
              ) : (
                portfolio.map((item) => {
                  const livePrice = quotes[item.ticker]
                  const pl = livePrice ? (livePrice - item.average_cost) * item.shares : 0
                  
                  return (
                    <TableRow key={item.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                      <TableCell className="font-mono font-black text-white text-base group-hover:text-indigo-400 transition-colors uppercase">
                        {item.ticker}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(
                          "font-black text-[9px] px-1.5 py-0 border-none",
                          item.tier === 'S' && "bg-indigo-500/20 text-indigo-400",
                          item.tier === 'A' && "bg-emerald-500/20 text-emerald-400",
                          item.tier === 'B' && "bg-amber-500/20 text-amber-400"
                        )}>
                          {item.tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-slate-300">{item.shares}</TableCell>
                      <TableCell className="text-right font-mono text-slate-400">${item.average_cost.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-white font-bold">
                        {livePrice ? `$${livePrice.toFixed(2)}` : '--'}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.highest_price ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn(
                              "text-[11px] font-mono font-bold",
                              livePrice && livePrice < (item.highest_price * (1 - (item.stop_loss_pct || 0.1))) * 1.02 
                                ? "text-orange-400 animate-pulse" 
                                : "text-slate-400"
                            )}>
                              ${(item.highest_price * (1 - (item.stop_loss_pct || 0.1))).toFixed(2)}
                            </span>
                            <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-indigo-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (livePrice || 0) / (item.highest_price * (1 - (item.stop_loss_pct || 0.1))) * 50)}%` }}
                              />
                            </div>
                          </div>
                        ) : '--'}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-black",
                        pl >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
