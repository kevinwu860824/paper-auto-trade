'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BrainCircuit, Loader2, Send, CheckCircle2, AlertCircle, Zap, Clock } from "lucide-react"
import { createClient } from '@/utils/supabase/client'
import { cn } from '@/lib/utils'
import { triggerAnalysisTask } from '@/app/actions/analysis'
import { motion, AnimatePresence } from 'framer-motion'

interface AnalysisTask {
  id: string;
  ticker: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_log?: string;
}

export function AIPanel() {
  const [ticker, setTicker] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTasks, setActiveTasks] = useState<AnalysisTask[]>([])
  const [showToast, setShowToast] = useState(false)
  const supabase = createClient()

  // 1. Lifecycle: Initial Data & Real-time Subscription
  useEffect(() => {
    const fetchActiveTasks = async () => {
      const { data } = await supabase
        .from('analysis_tasks')
        .select('*')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
      
      if (data) setActiveTasks(data as AnalysisTask[])
    }
    fetchActiveTasks()

    // C. Subscribe to Real-time Changes
    const channel = supabase
      .channel('analysis_tasks_changes')
      .on('postgres_changes', 
        { event: '*', table: 'analysis_tasks', schema: 'public' }, 
        (payload) => {
          const { eventType, new: newRecord } = payload
          
          if (eventType === 'INSERT') {
            setActiveTasks(prev => [newRecord as AnalysisTask, ...prev])
          } else if (eventType === 'UPDATE') {
            const updated = newRecord as AnalysisTask
            if (['completed', 'failed'].includes(updated.status)) {
              setActiveTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
              setTimeout(() => {
                setActiveTasks(prev => prev.filter(t => t.id !== updated.id))
              }, 10000)
            } else {
              setActiveTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  const handleShoot = async () => {
    if (!ticker.trim() || isSubmitting) return
    const symbol = ticker.trim().toUpperCase()
    setIsSubmitting(true)

    try {
      // Step: Actual Insertion via Server Action (Bypasses RLS)
      const result = await triggerAnalysisTask(symbol)
      
      if (!result.success) {
        console.error("Failed to trigger task:", result.error)
        alert(`狙擊啟動失敗: ${result.error}`)
      } else {
        setTicker('')
        
        // 🚀 Trigger Cloud Run Job in background
        fetch('/api/trigger-job', { method: 'POST' }).catch(err => {
          console.error("Failed to trigger Cloud Run Job background:", err)
        })

        // ✨ Show Premium Toast
        setShowToast(true)
        setTimeout(() => setShowToast(false), 4000)
      }
    } catch (e: any) {
      console.error("Failed to trigger AI analysis:", e.message || e)
      alert("系統繁忙中，請稍後再試")
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-3 w-3 animate-pulse text-amber-400" />
      case 'processing': return <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
      case 'completed': return <CheckCircle2 className="h-3 w-3 text-emerald-400" />
      case 'failed': return <AlertCircle className="h-3 w-3 text-rose-400" />
      default: return null
    }
  }

  return (
    <>
      {/* Premium Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className="fixed bottom-8 right-8 z-[100] flex items-center gap-3 px-6 py-4 bg-indigo-600/90 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl shadow-indigo-500/40 pointer-events-none"
          >
            <div className="p-2 rounded-full bg-white/20 animate-pulse">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">狙擊任務已成功送出</p>
              <p className="text-[10px] text-white/70">正在喚醒雲端 AI 大腦，預計 60 秒內回傳...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="bg-white/5 border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden h-full">
        <CardHeader className="border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/20">
              <Zap className="h-5 w-5 text-indigo-400 fill-indigo-400/20" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-white">黑天鵝狙擊發射台</CardTitle>
              <CardDescription className="text-slate-400 text-xs mt-0.5">
                手動獵殺目標，AI 即時啟動 10 年 DNA 錯殺診斷。
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 group">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleShoot()}
                  placeholder="輸入股票代號 (如: TSLA)"
                  className="flex h-11 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm shadow-inner transition-all placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white font-mono uppercase"
                />
              </div>
              <button 
                onClick={handleShoot}
                disabled={isSubmitting || !ticker.trim()}
                className={cn(
                  "inline-flex items-center justify-center rounded-xl text-sm font-bold transition-all h-11 px-6 shadow-lg",
                  isSubmitting || !ticker.trim() 
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                    : "bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 active:scale-95 shadow-indigo-500/20"
                )}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send size={16} className="mr-2"/> 發射</>}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex items-center gap-2">
               <div className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-ping" />
               即時分析狀態 (Live Status)
            </h4>
            
            <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1 py-1">
              {activeTasks.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-white/5 rounded-xl bg-white/[0.02]">
                  <p className="text-xs text-slate-500 italic">目前無進行中的任務，輸入 Ticker 即可發射。</p>
                </div>
              ) : (
                activeTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5 animate-in slide-in-from-left duration-300">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black text-white font-mono tracking-tighter">{task.ticker}</span>
                      <div className="h-1 w-1 bg-slate-700 rounded-full" />
                      <span className="text-[10px] text-slate-500 font-medium">ID: {task.id.split('-')[0]}</span>
                    </div>
                    
                    <Badge variant="outline" className={cn(
                      "flex items-center gap-1.5 px-2 py-0.5 border-none text-[10px] font-bold uppercase",
                      task.status === 'pending' && "text-amber-400 bg-amber-400/10",
                      task.status === 'processing' && "text-indigo-400 bg-indigo-400/10",
                      task.status === 'completed' && "text-emerald-400 bg-emerald-400/10",
                      task.status === 'failed' && "text-rose-400 bg-rose-400/10",
                    )}>
                      {getStatusIcon(task.status)}
                      {task.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
