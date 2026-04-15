'use server'

import { createAdminSupabase } from "@/utils/supabase"
import { revalidatePath } from "next/cache"

/**
 * Trigger AI Analysis Task using Service Role (Bypasses RLS)
 */
export async function triggerAnalysisTask(ticker: string) {
  if (!ticker) {
    return { success: false, error: "Ticker is required" }
  }

  const symbol = ticker.toUpperCase().trim()
  const supabase = createAdminSupabase()

  try {
    // 1. Identify the caller (Current Authenticated User)
    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id

    // 2. Insert Task (Attempts to include user_id with fallback)
    const taskPayload: any = { ticker: symbol, status: 'pending' }
    if (userId) taskPayload.user_id = userId

    let { data, error } = await supabase
      .from('analysis_tasks')
      .insert(taskPayload)
      .select()
      .single()

    if (error) {
      console.warn("[Server Action] user_id insert failed, retrying without user_id...")
      // Fallback: Try without user_id
      const fallback = await supabase
        .from('analysis_tasks')
        .insert({ ticker: symbol, status: 'pending' })
        .select()
        .single()
      
      if (fallback.error) {
        console.error("[Server Action] Fallback Error:", fallback.error.message)
        return { success: false, error: fallback.error.message }
      }
      data = fallback.data
    }

    // 3. WAKE UP GCR: Send the signal to start processing
    console.log(`[Server Action] Triggering GCR wake-up for ticker: ${symbol}...`)
    const triggerUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/trigger-job`
    
    // Non-blocking trigger
    fetch(triggerUrl, { method: 'POST' }).catch(err => {
      console.error("[Server Action] GCR Trigger failed:", err)
    })

    // Revalidate the dashboard path if needed
    revalidatePath('/')
    
    return { success: true, data }
  } catch (err: any) {
    console.error("[Server Action] Critical Error:", err)
    return { success: false, error: err.message || "Unknown server error" }
  }
}
