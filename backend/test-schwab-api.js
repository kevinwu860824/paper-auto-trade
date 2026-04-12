// test-schwab-api.js
const axios = require('axios');

// ===================== 請填寫您的資訊 =====================
// 步驟 1：將您從 Postman 或其他方式獲取的 Access Token 貼到這裡
const accessToken = 'I0.b2F1dGgyLmNkYy5zY2h3YWIuY29t.Aq2DbWXFpOnqAau9ljoxGBppI7QiFsmfKlaQgq0FU7U@'; 
// =========================================================


// Schwab API 的正式網址
const schwabApiUrl = 'https://api.schwabapi.com/trader/v1/accounts';


async function testSchwabConnection() {
  console.log('🚀 正在嘗試連接 Charles Schwab API...');

  if (accessToken === '在這裡貼上您剛剛獲取的Access Token' || !accessToken) {
    console.error('❌ 錯誤：請務必在程式碼中填入您有效的 Access Token！');
    return;
  }

  try {
    const response = await axios.get(schwabApiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log('\n✅ 連線成功！API 回應正常。');
    console.log('===========================================================');
    console.log('您的帳戶資訊如下 (已隱藏敏感資料):');
    
    const accounts = response.data.map(acc => ({
        accountNumber: acc.securitiesAccount.accountNumber.slice(-4), // 顯示末4碼
        accountType: acc.securitiesAccount.type,
        currentBalances: acc.securitiesAccount.currentBalances,
    }));

    console.log(JSON.stringify(accounts, null, 2));
    console.log('===========================================================');
    console.log('\n🎉 恭喜！您的 Charles Schwab API 已經準備就緒！');

  } catch (error) {
    console.error('\n❌ 連線失敗！請檢查您的 Access Token 是否正確且未過期。');
    console.error('===========================================================');
    if (error.response) {
      console.error('API 錯誤狀態:', error.response.status);
      console.error('API 錯誤訊息:', error.response.data);
    } else {
      console.error('發生網路錯誤:', error.message);
    }
    console.error('===========================================================');
  }
}

// 執行測試
testSchwabConnection();