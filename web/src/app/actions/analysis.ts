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
    const { data, error } = await supabase
      .from('analysis_tasks')
      .insert({
        ticker: symbol,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error("[Server Action] Insert Error:", error.message)
      return { success: false, error: error.message }
    }

    // Revalidate the dashboard path if needed
    revalidatePath('/')
    
    return { success: true, data }
  } catch (err: any) {
    console.error("[Server Action] Critical Error:", err)
    return { success: false, error: err.message || "Unknown server error" }
  }
}
