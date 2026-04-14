// server.js (最终生产版)

// ==================== 全域错误捕捉器 ====================
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌❌❌ 未被捕获的 Promise 拒絕:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('❌❌❌ 未被捕获的异常:', error);
  process.exit(1); 
});
// =================================================================

// 1. 引入必要的套件
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const simulationEngine = require('./simulationEngine');
const authMiddleware = require('./authMiddleware');

// 2. 读入环境变数与初始化
const clientId = process.env.SCHWAB_CLIENT_ID;
const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;
const accountNumberHash = process.env.SCHWAB_ACCOUNT_HASH; // 确保这个已在 Render 设定
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const app = express();
const port = process.env.PORT || 3015;
let accessToken = null;
let refreshToken = null;

// 3. 使用中介软体
app.use(cors());
app.use(express.json());

// ==================== Token 核心管理函数 ====================
async function saveTokens() {
  const { error } = await supabase.from('settings').upsert({ key: 'schwab_refresh_token', value: refreshToken });
  if (error) console.error('❌ 储存 Refresh Token 至 Supabase 失败:', error);
  else console.log('✅ Refresh Token 已储存至 Supabase。');
}

async function loadTokens() {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'schwab_refresh_token').single();
  if (data && !error) {
    refreshToken = data.value;
    return true;
  }
  return false;
}

// 在 server.js 中，取代舊的 refreshAccessToken 函數

// 在 server.js 中，取代舊的 refreshAccessToken 函數

async function refreshAccessToken() {
  console.log('\n🔄 [偵錯] refreshAccessToken 函數被觸發...');

  const currentRefreshToken = refreshToken;
  const currentClientId = process.env.SCHWAB_CLIENT_ID;
  const currentClientSecret = process.env.SCHWAB_CLIENT_SECRET;

  // ✨ 終極偵錯：打印出函數當下看到的所有關鍵變數 ✨
  console.log(`[偵錯] Refresh Token (是否存在): ${!!currentRefreshToken}`);
  console.log(`[偵錯] Client ID (是否存在): ${!!currentClientId}`);
  console.log(`[偵錯] Client Secret (是否存在): ${!!currentClientSecret}`);
  
  if (!currentRefreshToken) {
      console.warn('⚠️ 無法刷新：找不到 Refresh Token。');
      return;
  }
  if (!currentClientId || !currentClientSecret) {
      console.error('❌❌❌ 刷新失敗：缺少 Client ID 或 Client Secret 環境變數！');
      return;
  }

  const authHeader = `Basic ${Buffer.from(`${currentClientId}:${currentClientSecret}`).toString('base64')}`;
  const tokenRequestBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
  });

  try {
      // ✨ 終極偵錯：打印出即將發送的請求資訊 (但不包含敏感資料) ✨
      console.log('[偵錯] 準備發送 axios.post 請求至: https://api.schwabapi.com/v1/oauth/token');
      console.log('[偵錯] - grant_type:', tokenRequestBody.get('grant_type'));
      console.log('[偵錯] - Authorization Header (前10位):', authHeader.substring(0, 10) + '...');
      
      const tokenResponse = await axios.post('https://api.schwabapi.com/v1/oauth/token', tokenRequestBody, {
          headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      accessToken = tokenResponse.data.access_token;
      if (tokenResponse.data.refresh_token) {
          refreshToken = tokenResponse.data.refresh_token;
      }
      await saveTokens();
      simulationEngine.setAccessToken(accessToken);
      console.log('🎉 成功獲取新的 Access Token！');
  } catch (error) {
      console.error('❌❌❌ 刷新 Access Token 失敗:', error.response ? (error.response.data.error_description || error.response.data) : error.message);
  }
}


// ==================== 公开路由 (无需 Supabase 登入) ====================
app.get('/login', (req, res) => {
  const encodedUri = encodeURIComponent(redirectUri);
  const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${encodedUri}`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const authCode = req.query.code;
  if (!authCode) return res.status(400).send('错误：没有收到授權码。');
  console.log('✅ 成功取得授權码，正在换取 Access Token...');
  try {
    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    const tokenRequestBody = new URLSearchParams({ grant_type: 'authorization_code', code: authCode, redirect_uri: redirectUri });
    const tokenResponse = await axios.post('https://api.schwabapi.com/v1/oauth/token', tokenRequestBody, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;
    await saveTokens();
    simulationEngine.setAccessToken(accessToken);
    console.log('🎉 成功取得 Access Token！');

    // ✨ 新增：在首次獲取 Token 後，立即觸發第一次掃描 ✨
    console.log('🚀 首次認證成功，立即觸發第一次掃描...');
    simulationEngine.scanForSignalsAndTrade();

    res.send('<h1>認证成功！</h1><p>系统已开始首次掃描，您可以关闭此分頁。</p>');
  } catch (error) {
    res.status(500).send('换取 Access Token 失败。');
  }
});

// ==================== 受保护的 API 路由 (需要 Supabase JWT 认证) ====================
app.get('/api/simulation/portfolio', authMiddleware, async (req, res) => {
  try {
    const portfolioData = await simulationEngine.getPortfolio();
    res.json(portfolioData);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// ✨ 补全 buy/sell 路由，并加上 authMiddleware 保护 ✨
app.post('/api/simulation/buy', authMiddleware, async (req, res) => {
  const { ticker, shares } = req.body;
  const result = await simulationEngine.executeBuy(ticker, shares);
  res.json(result);
});

app.post('/api/simulation/sell', authMiddleware, async (req, res) => {
  const { ticker, shares } = req.body;
  const result = await simulationEngine.executeSell(ticker, shares);
  res.json(result);
});

app.get('/api/schwab/account', authMiddleware, async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Schwab token not available.' });
  const url = 'https://api.schwabapi.com/trader/v1/accounts?fields=positions';
  try {
    const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      res.json(response.data[0]);
    } else {
      res.json({});
    }
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch account summary.' });
  }
});

app.get('/api/schwab/positions', authMiddleware, async (req, res) => {
  if (!accessToken) return res.status(401).json({ error: 'Schwab token not available.' });
  if (!accountNumberHash) return res.status(500).json({ error: 'SCHWAB_ACCOUNT_HASH not configured.' });
  const url = `https://api.schwabapi.com/trader/v1/accounts/${accountNumberHash}?fields=positions`;
  try {
    const positionsResponse = await axios.get(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const positions = positionsResponse.data?.securitiesAccount?.positions;
    if (!positions || positions.length === 0) return res.json([]);
    const tickers = positions.map(p => p.instrument.symbol);
    const quotesUrl = `https://api.schwabapi.com/marketdata/v1/quotes?symbols=${tickers.join(',')}`;
    const quotesResponse = await axios.get(quotesUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    const quotesData = quotesResponse.data;
    const enhancedPositions = positions.map(pos => {
        const quoteInfo = quotesData[pos.instrument.symbol]?.quote;
        const totalValue = pos.marketValue;
        const totalCost = pos.averagePrice * pos.longQuantity;
        return {
            symbol: pos.instrument.symbol, shares: pos.longQuantity, avgCost: pos.averagePrice,
            currentPrice: quoteInfo?.lastPrice || 0, currentValue: totalValue, assetType: pos.instrument.assetType,
            dailyChange: quoteInfo?.netChange || 0, dailyChangePercent: quoteInfo?.netPercentChangeInDouble || 0,
            totalGainLoss: totalValue - totalCost, dayHigh: quoteInfo?.highPrice || 0, dayLow: quoteInfo?.lowPrice || 0,
        };
    });
    res.json(enhancedPositions);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: 'Failed to fetch enhanced positions.' });
  }
});

// ==================== 伺服器启动逻辑 ====================
async function startServer() {
  const tokensLoaded = await loadTokens();
  if (tokensLoaded) {
      await refreshAccessToken(); // 刷新成功後會自動觸發一次掃描
  }
  
  // 定時刷新 Token
  setInterval(refreshAccessToken, 25 * 60 * 1000); 

  // 定時執行交易掃描
  const scanInterval = 3600 * 1000;
  console.log('\n🚀 自動交易策略引擎已設定，將每小時為所有活躍使用者進行背景掃描...');
  
  setInterval(async () => {
    try {
        const { data: users } = await supabase.from('settings').select('user_id').eq('key', 'schwab_access_token');
        if (users && users.length > 0) {
            for (const user of users) {
                if (user.user_id) {
                    console.log(`[Timer] 正在為使用者 ${user.user_id} 執行自動掃描...`);
                    await simulationEngine.scanForSignalsAndTrade(user.user_id);
                }
            }
        }
    } catch (err) {
        console.error('背景掃描循環發生錯誤:', err);
    }
  }, scanInterval);

  // 啟动 Web 伺服器
  app.listen(port, '0.0.0.0', () => {
      console.log(`\n✅ 全自動交易後端已啟动，正在監听 Port: ${port}`);
      if (!accessToken) {
          console.log(`   请在浏览器中开启以下网址来完成首次 Schwab 授权:`);
          console.log(`   ➡️  http://localhost:3000/login`);
      } else {
          console.log('   ✅ 已成功载入並刷新 Token，系统正在自动运行。');
      }
  });
}

// 执行启动程序
startServer();