'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Brain, ChevronDown, ChevronUp, Clock, Target, Check, X as CloseIcon, Info } from "lucide-react"
import { createClient } from '@/utils/supabase/client'
import { cn } from "@/lib/utils"
import { updateSignalStatus, getPendingSignals } from '@/app/actions/signals'

export interface TradeSignal {
  id: string;
  ticker: string;
  action: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  quantity: number;
  reasoning: string;
  created_at: string;
  composite_score?: number;
  status: 'PENDING' | 'EXECUTED' | 'REJECTED';
}

export function TradeSignals() {
  const [signals, setSignals] = useState<TradeSignal[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchSignals = async () => {
      setIsLoading(true)
      try {
        const result = await getPendingSignals()
        
        if (!result.success) {
          console.error("[TradeSignals] Server Fetch Error:", result.error)
        } else if (result.data) {
          setSignals(result.data as TradeSignal[])
        }
      } catch (err) {
        console.error("[TradeSignals] Critical fetch error:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSignals()

    // Real-time subscription for new signals
    const channel = supabase
      .channel('trade_signals_pending')
      .on('postgres_changes', 
        { event: '*', table: 'trade_signals', schema: 'public', filter: 'status=eq.PENDING' }, 
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setSignals(prev => [payload.new as TradeSignal, ...prev])
          } else if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
            const record = payload.new as TradeSignal || payload.old as TradeSignal
            if (record.status !== 'PENDING') {
              setSignals(prev => prev.filter(s => s.id !== record.id))
            } else {
              setSignals(prev => prev.map(s => s.id === record.id ? record : s))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const handleUpdateStatus = async (id: string, newStatus: 'EXECUTED' | 'REJECTED') => {
    try {
      const result = await updateSignalStatus(id, newStatus)
      if (!result.success) {
        console.error(`Failed to update signal ${id}:`, result.error)
        alert(`狀態更新失敗: ${result.error}`)
      }
    } catch (e: any) {
      console.error(`Error updating signal status:`, e)
      alert("系統回應異常，請稍後再試")
    }
    // Real-time listener will handle local state update
  }

  return (
    <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden min-h-[400px]">
      <CardHeader className="border-b border-white/5 bg-white/5 flex flex-row items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20">
            <Brain className="h-5 w-5 text-emerald-400 fill-emerald-400/20" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight text-white">AI 決策診斷看板</CardTitle>
        </div>
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] font-black uppercase tracking-widest">
           {signals.length} Pending
        </Badge>
      </CardHeader>
      
      <CardContent className="p-0 scroll-smooth">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
             <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
             <span className="text-sm font-medium">正在同步雲端策略...</span>
          </div>
        ) : signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500 px-6 text-center">
             <div className="p-4 rounded-full bg-white/5">
                <Info size={32} className="text-slate-600" />
             </div>
             <div>
                <p className="text-sm font-bold text-slate-300">暫時無即時信號</p>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px]">請確保發射台已啟動，或等待市場情緒觸發 Black Swan 監控。</p>
             </div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {signals.map((signal) => (
              <div 
                key={signal.id} 
                className={cn(
                  "transition-all duration-300 group",
                  expandedId === signal.id ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
                )}
              >
                {/* Header Section */}
                <div 
                  className="flex items-center justify-between p-5 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === signal.id ? null : signal.id)}
                >
                  <div className="flex items-center gap-6">
                     <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-black/40 border border-white/10 min-w-[70px]">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">SCORE</span>
                        <span className={cn(
                          "text-lg font-black font-mono",
                          (signal.composite_score || 0) >= 80 ? "text-emerald-400" : 
                          (signal.composite_score || 0) >= 60 ? "text-amber-400" : "text-rose-400"
                        )}>
                          {signal.composite_score || '--'}
                        </span>
                     </div>
                     
                     <div className="space-y-1">
                        <div className="flex items-center gap-2">
                           <Target size={14} className="text-slate-500" />
                           <span className="text-lg font-black text-white uppercase tracking-tight">{signal.ticker}</span>
                           <Badge className={cn(
                             "text-[10px] font-black px-2 py-0 border-none",
                             signal.action === 'BULLISH' && "bg-emerald-500/20 text-emerald-400",
                             signal.action === 'BEARISH' && "bg-rose-500/20 text-rose-400",
                             signal.action === 'NEUTRAL' && "bg-slate-500/20 text-slate-400"
                           )}>
                             {signal.action}
                           </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                           <Clock size={10} />
                           <span>{new Date(signal.created_at).toLocaleString()}</span>
                        </div>
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === signal.id ? null : signal.id); }}
                      className="p-2 rounded-lg hover:bg-white/10 text-slate-500 transition-colors"
                    >
                      {expandedId === signal.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Content */}
                {expandedId === signal.id && (
                  <div className="p-6 pt-0 space-y-4 animate-in fade-in duration-300">
                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                       <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                          <Check className="h-3 w-3" /> AI 診斷報告 (Diagnostic Report)
                       </h4>
                       <div className="text-sm text-slate-300 leading-relaxed font-light whitespace-pre-wrap italic pl-4 border-l-2 border-indigo-500/30">
                          {signal.reasoning}
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-3 pt-2">
                       <button 
                         onClick={() => handleUpdateStatus(signal.id, 'EXECUTED')}
                         className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-emerald-500/20"
                       >
                          <Check size={18} /> 批准執行 (Approve)
                       </button>
                       <button 
                         onClick={() => handleUpdateStatus(signal.id, 'REJECTED')}
                         className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 font-bold py-3 px-6 text-sm transition-all active:scale-95"
                       >
                          <CloseIcon size={18} /> 駁回 (Reject)
                       </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Fallback Loader
function Loader2({ className }: { className?: string }) {
  return <div className={cn("animate-spin border-2 border-t-transparent rounded-full", className)} />
}
