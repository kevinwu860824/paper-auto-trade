import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tickers } = await req.json()

    // 儲存至 settings table
    const { error } = await supabase
      .from('settings')
      .upsert({ 
        user_id: user.id, 
        key: 'ai_target_tickers', 
        value: JSON.stringify(tickers) 
      }, { onConflict: 'user_id,key' })

    if (error) {
      console.error("Supabase upsert error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("API error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
