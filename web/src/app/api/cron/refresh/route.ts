import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/utils/supabase';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized Cron Execution', { status: 401 });
    }

    const supabase = createServerSupabase();
    const { data: allTokens, error: fetchError } = await supabase.from('settings').select('*').eq('key', 'schwab_refresh_token');

    if (fetchError || !allTokens || allTokens.length === 0) {
      return new NextResponse('No refresh tokens found for any users.', { status: 200 });
    }

    console.log(`[V23 Cron] Found ${allTokens.length} accounts to refresh...`);

    const clientId = process.env.SCHWAB_CLIENT_ID;
    const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const results = [];

    for (const tokenSource of allTokens) {
      const refreshToken = tokenSource.value;
      const userId = tokenSource.user_id;

      try {
        const tokenResponse = await fetch('https://api.schwabapi.com/v1/oauth/token', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
          }).toString()
        });

        const newData = await tokenResponse.json();
        if (tokenResponse.ok) {
           await supabase.from('settings').upsert({ key: 'schwab_access_token', value: newData.access_token, user_id: userId });
           if (newData.refresh_token) {
               await supabase.from('settings').upsert({ key: 'schwab_refresh_token', value: newData.refresh_token, user_id: userId });
           }
           results.push({ userId, status: 'Success' });
        } else {
           results.push({ userId, status: 'Failed', error: newData });
        }
      } catch (e: any) {
         results.push({ userId, status: 'Error', error: e.message });
      }
    }

    console.log(`✅ [V23 Cron] Processed ${results.length} token refreshes.`);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return new NextResponse('Error refreshing token', { status: 500 });
  }
}
