import { GoogleAuth } from 'google-auth-library';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // 1. Initialize Google Auth with Cloud Platform scope
    // Supports both ADC (Production) and explicit JSON Key (Local Dev)
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      credentials: process.env.GCP_SERVICE_ACCOUNT_KEY 
        ? JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY) 
        : undefined
    });
    
    // 2. Obtain an authenticated client
    const client = await auth.getClient();
    
    // 📍 Configuration for the Cloud Run Job
    const projectId = 'autotradeapp-493318';
    const location = 'us-central1';
    const jobName = 'sniper-job';
    
    // 🔗 Cloud Run v2 API endpoint to run the job
    const url = `https://run.googleapis.com/v2/projects/${projectId}/locations/${location}/jobs/${jobName}:run`;
    
    console.log(`[Cloud Run Trigger] Attempting to run job: ${jobName} in ${location}...`);

    // 🚀 Execute the POST request to start the job
    const response = await client.request({
      url,
      method: 'POST',
    });
    
    return NextResponse.json({ 
      success: true, 
      data: response.data 
    });
  } catch (error: any) {
    console.error('[Cloud Run Trigger] Critical Error:', error.message || error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to trigger Cloud Run Job' 
    }, { status: 500 });
  }
}
