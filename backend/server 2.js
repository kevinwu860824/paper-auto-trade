// server.js (紙上交易 - 升級版 v1: 整合 Schwab 認證)

// 在最頂部引入 dotenv，讓程式可以讀取 .env 檔案
require('dotenv').config(); 

// 引入必要的套件
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // <-- 新增 axios 用於認證
const simulationEngine = require('./simulationEngine');

// 從 .env 讀取 Schwab API 憑證
const clientId = process.env.SCHWAB_CLIENT_ID;
const clientSecret = process.env.SCHWAB_CLIENT_SECRET;
const redirectUri = process.env.REDIRECT_URI;

// 初始化 Express 應用
const app = express();
const port = 3000;

// 在記憶體中暫存 Token (僅適用於開發！)
let accessToken = null;
let refreshToken = null;

// 使用中介軟體
app.use(cors());
app.use(express.json());

// ==================== Schwab API 認證路由 ====================
app.get('/login', (req, res) => {
  const authUrl = `https://api.schwabapi.com/v1/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}`;
  console.log('🚀 將使用者重新導向至 Schwab 進行認證...');
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const authCode = req.query.code;
  if (!authCode) return res.status(400).send('錯誤：沒有收到授權碼。');

  console.log('✅ 成功取得授權碼，正在換取 Access Token...');
  const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  const tokenRequestBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: redirectUri,
  });

  try {
    const tokenResponse = await axios.post('https://api.schwabapi.com/v1/oauth/token', tokenRequestBody, {
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    accessToken = tokenResponse.data.access_token;
    refreshToken = tokenResponse.data.refresh_token;

    // 將獲取到的 Token 傳遞給 simulationEngine 保存，以便後續使用
    simulationEngine.setAccessToken(accessToken);

    console.log('🎉 成功取得 Access Token！現在模擬引擎可以使用真實數據了。');

    // --- ✨ 請在這裡新增以下這兩行 ✨ ---
    console.log('   - Access Token:', accessToken);
    console.log('   - Refresh Token:', refreshToken);
    // ------------------------------------

    res.send('<h1>認證成功！</h1><p>您可以關閉此分頁。模擬交易後端已獲取授權。</p>');
  } catch (error) {
    console.error('❌ 換取 Access Token 時發生錯誤:', error.response ? error.response.data : error.message);
    res.status(500).send('換取 Access Token 失敗。');
  }
});


// ==================== 模擬交易 API 路由 (保持不變) ====================
app.get('/api/simulation/portfolio', async (req, res) => {
  const portfolioData = await simulationEngine.getPortfolio();
  res.json(portfolioData);
});

// ... (POST /buy 和 /sell 的路由保持不變) ...
app.post('/api/simulation/buy', async (req, res) => { /* ... */ });
app.post('/api/simulation/sell', async (req, res) => { /* ... */ });


// ==================== 伺服器與自動化引擎啟動 ====================
app.listen(port, '0.0.0.0', () => {
  console.log(`\n✅ 模擬交易後端已啟動，正在監聽 Port: ${port}`);
  console.log(`   首先，請在瀏覽器中開啟以下網址來完成 Schwab 授權:`);
  console.log(`   ➡️  http://localhost:3000/login`);
  console.log('\n🚀 自動交易策略引擎已待命，完成認證後將開始掃描...');
  const scanInterval = 3600 * 1000; // 每小時
  setInterval(simulationEngine.scanForSignalsAndTrade, scanInterval);
});