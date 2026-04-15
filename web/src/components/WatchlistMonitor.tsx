"use client"

import React, { useState, useEffect, useCallback } from 'react'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
    Zap, 
    TrendingUp, 
    TrendingDown, 
    Loader2, 
    Clock, 
    AlertCircle,
    BrainCircuit,
    RefreshCw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { triggerAnalysisTask } from '@/app/actions/analysis'

interface WatchlistItem {
    ticker: string;
    price: number | null;
    changePct: number | null;
    tier: string;
    score: number;
    action: string | null;
    lastAnalysis: string | null;
    lastTriggered: string | null;
}

export function WatchlistMonitor() {
    const [data, setData] = useState<WatchlistItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null)

    const fetchData = useCallback(async (isManual = false) => {
        if (!isManual) setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/watchlist/status')
            const json = await res.json()
            
            if (res.status === 401) {
                setError(json.error || "授權過期，請重新連結")
                // We'll notify parent if needed, but the status check is enough
            }

            if (json.success) {
                setData(json.data)
            } else {
                setError(json.error || json.message || "無法獲取監控數據")
            }
        } catch (err: any) {
            console.error("Watchlist fetch failed:", err)
            setError(err.message || "連線至 API 伺服器失敗")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
        const timer = setInterval(() => fetchData(false), 60000) 
        return () => clearInterval(timer)
    }, [fetchData])

    const handleAnalyzeNow = async (ticker: string) => {
        setIsAnalyzing(ticker)
        try {
            const result = await triggerAnalysisTask(ticker)
            if (result.success) {
                alert(`🎯 狙擊指令已下達！AI 正在對 ${ticker} 啟動精密診斷...`)
                fetchData(true)
            } else {
                alert(`發射失敗: ${result.error}`)
            }
        } catch (e) {
            alert("系統繁忙，請稍後再試")
        } finally {
            setIsAnalyzing(null)
        }
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-2 px-2">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-indigo-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Tactical Watchlist Monitoring
                    </span>
                </div>
                <button 
                    onClick={() => fetchData(true)}
                    className="p-1 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-all flex items-center gap-2 text-[10px] font-bold"
                >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    {loading ? "更新中..." : "手動刷新"}
                </button>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden shadow-2xl">
                <Table>
                    <TableHeader className="bg-white/5">
                        <TableRow className="border-white/5 hover:bg-transparent">
                            <TableHead className="text-slate-500 font-black text-[10px] uppercase h-12">Ticker</TableHead>
                            <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase h-12">Current Price</TableHead>
                            <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase h-12">Today's Change</TableHead>
                            <TableHead className="text-center text-slate-500 font-black text-[10px] uppercase h-12">Latest Tier</TableHead>
                            <TableHead className="text-center text-slate-500 font-black text-[10px] uppercase h-12">AI Sentiment</TableHead>
                            <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase h-12">Last Analysis</TableHead>
                            <TableHead className="text-right text-slate-500 font-black text-[10px] uppercase h-12 pr-6">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-40 text-center">
                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-400" />
                                </TableCell>
                            </TableRow>
                        ) : error ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-48 text-center bg-rose-500/5">
                                    <div className="flex flex-col items-center gap-3">
                                        <AlertCircle className="h-8 w-8 text-rose-500 animate-bounce" />
                                        <div className="space-y-1 px-4">
                                            <p className="text-sm font-bold text-rose-400">
                                                {error.includes("Token Refresh") ? "Schwab 授權已過期" : "數據讀取失敗"}
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-mono leading-normal max-w-md mx-auto">
                                                {error.includes("Token Refresh") 
                                                    ? "您的 Schwab 登入金鑰已生效或被撤銷，請重新點擊下方按鈕進行安全授權。" 
                                                    : error}
                                            </p>
                                        </div>
                                        {error.includes("Token Refresh") ? (
                                            <button 
                                                onClick={() => window.location.href = '/api/auth/schwab'}
                                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black transition-all shadow-xl shadow-indigo-600/20 active:scale-95 border border-indigo-400/30"
                                            >
                                                重新連結 Schwab 帳號
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => fetchData(true)}
                                                className="px-4 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-lg text-[10px] font-black transition-all border border-rose-500/30 shadow-lg shadow-rose-500/10 active:scale-95"
                                            >
                                                再次嘗試連線
                                            </button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-40 text-center text-slate-500 italic">
                                    Watchlist 目前為空，請前往 Radar 管理系統加入標的。
                                </TableCell>
                            </TableRow>
                        ) : (
                            data.map((item) => (
                                <TableRow key={item.ticker} className="border-white/5 hover:bg-white/[0.03] transition-all group">
                                    <TableCell className="py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center font-mono font-black text-[10px] text-indigo-400 shadow-inner group-hover:border-indigo-500/50 transition-colors">
                                                {item.ticker.charAt(0)}
                                            </div>
                                            <span className="font-mono font-black text-white group-hover:text-indigo-400 transition-colors uppercase">
                                                {item.ticker}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-slate-200">
                                        {item.price ? `$${item.price.toFixed(2)}` : '--'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {item.changePct !== null ? (
                                            <div className={cn(
                                                "font-mono font-bold text-xs flex items-center justify-end gap-1",
                                                item.changePct >= 0 ? "text-emerald-400" : "text-rose-400"
                                            )}>
                                                {item.changePct >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                {item.changePct >= 0 ? '+' : ''}{item.changePct.toFixed(2)}%
                                            </div>
                                        ) : '--'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex justify-center">
                                            <div className={cn(
                                                "relative flex items-center justify-center w-10 h-10 rounded-xl font-black text-lg transition-all",
                                                item.tier === 'S' && "bg-yellow-500/20 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.3)] animate-pulse border border-yellow-500/50",
                                                item.tier === 'A' && "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
                                                item.tier === 'B' && "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30",
                                                item.tier === 'C' && "bg-slate-500/10 text-slate-500 border border-slate-500/20",
                                                item.tier === 'N/A' && "bg-white/5 text-slate-600 border border-white/5 border-dashed"
                                            )}>
                                                {item.tier}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {item.action ? (
                                            <div className="flex flex-col items-center gap-1">
                                                <Badge className={cn(
                                                    "font-black text-[9px] px-2 py-0 border-none",
                                                    item.action === 'BULLISH' && "bg-emerald-500/20 text-emerald-400",
                                                    item.action === 'BEARISH' && "bg-rose-500/20 text-rose-400",
                                                    item.action === 'NEUTRAL' && "bg-slate-500/20 text-slate-400"
                                                )}>
                                                    {item.score}% {item.action}
                                                </Badge>
                                                <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                                    <div 
                                                        className={cn(
                                                            "h-full transition-all duration-1000",
                                                            item.action === 'BULLISH' ? "bg-emerald-500" : "bg-rose-500"
                                                        )}
                                                        style={{ width: `${item.score}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-slate-600 italic">No Signal</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {item.lastAnalysis ? (
                                            <div className="flex flex-col items-end gap-0.5">
                                                <div className="text-[10px] text-slate-400 font-mono">
                                                    {new Date(item.lastAnalysis).toLocaleDateString()}
                                                </div>
                                                <div className="text-[9px] text-slate-600 uppercase flex items-center gap-1">
                                                    <Clock size={8} />
                                                    {new Date(item.lastAnalysis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        ) : '--'}
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                        <button 
                                            onClick={() => handleAnalyzeNow(item.ticker)}
                                            disabled={isAnalyzing === item.ticker}
                                            className={cn(
                                                "p-2 rounded-xl transition-all active:scale-95 group/btn",
                                                item.tier === 'N/A' || item.tier === 'C' 
                                                    ? "bg-indigo-600/90 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20" 
                                                    : "bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5"
                                            )}
                                        >
                                            {isAnalyzing === item.ticker ? (
                                                <Loader2 size={16} className="animate-spin text-white" />
                                            ) : (
                                                <div className="flex items-center gap-2 px-1">
                                                    <BrainCircuit size={16} className={cn(item.tier === 'N/A' && "text-white")} />
                                                    <span className="text-[10px] font-bold uppercase tracking-tight">立即診斷</span>
                                                </div>
                                            )}
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            
            <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10">
                <AlertCircle size={14} className="text-indigo-400 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed italic">
                    AI 戰術評級每 24 小時重新演算一次。若標的出現異常落水（昨收跌幅 &gt; 5%），雷達哨兵將自動喚醒大腦重新評分。
                </p>
            </div>
        </div>
    )
}
