'use server'

import { createAdminSupabase } from "@/utils/supabase"
import { revalidatePath } from "next/cache"

/**
 * Update Trade Signal status using Service Role (Bypasses RLS)
 */
export async function updateSignalStatus(id: string, newStatus: 'EXECUTED' | 'REJECTED') {
  if (!id || !newStatus) {
    return { success: false, error: "ID and status are required" }
  }

  const supabase = createAdminSupabase()

  try {
    const { data, error } = await supabase
      .from('trade_signals')
      .update({ status: newStatus })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error("[Server Action] Signal Update Error:", error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/')
    
    return { success: true, data }
  } catch (err: any) {
    console.error("[Server Action] Critical Signal Error:", err)
    return { success: false, error: err.message || "Unknown server error" }
  }
}

/**
 * Fetch PENDING trade signals using Service Role (Bypasses RLS)
 */
export async function getPendingSignals() {
  const supabase = createAdminSupabase()
  
  try {
    const { data, error } = await supabase
      .from('trade_signals')
      .select('*')
      .ilike('status', 'PENDING')
      .order('created_at', { ascending: false })

    if (error) {
      console.error("[Server Action] Fetch Signals Error:", error.message)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (err: any) {
    console.error("[Server Action] Critical Fetch Error:", err)
    return { success: false, error: err.message || "Unknown server error" }
  }
}
