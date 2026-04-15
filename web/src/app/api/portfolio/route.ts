import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/utils/supabase';

export async function GET() {
  const supabase = createAdminSupabase();

  try {
    // We use the admin client here to ensure we bypass RLS and get the full data
    // for the dashboard, regardless of frontend user session state.
    const { data: portfolioItems, error } = await supabase
      .from('portfolio')
      .select('*')
      .order('ticker', { ascending: true });

    if (error) {
      console.error("[Portfolio API] Database Error:", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: portfolioItems
    });
  } catch (error: any) {
    console.error("[Portfolio API] Critical Error:", error.message);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch portfolio data', 
      details: error.message 
    }, { status: 500 });
  }
}
