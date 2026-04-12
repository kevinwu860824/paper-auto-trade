// find_hash.js (最終正確版 - 查詢 User Preferences)
const axios = require('axios');

// --- 請在這裡填入您最新的、帶有 api 權限的 Access Token ---
const accessToken = "I0.b2F1dGgyLmNkYy5zY2h3YWIuY29t.w5Max9wcjPkoL1dw9tDQf4PxMbUm_Sr5_IuP6UDmMFI@";
// ------------------------------------

async function findRealHash() {
    if (!accessToken || accessToken.includes("在這裡")) {
        console.error("錯誤：請先在程式碼中填入一個有效的 Access Token。");
        return;
    }
    console.log("ℹ️  正在查詢使用者偏好設定以獲取帳號 Hash...");
    
    const url = `https://api.schwabapi.com/trader/v1/user/preferences`;

    try {
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const accounts = response.data?.accounts;
        if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
            console.error("❌ 在 API 回應中找不到任何帳戶資訊。");
            return;
        }

        // 假設我們使用第一個帳戶，並讀取 hashValue
        const hash = accounts[0]?.accountNumberHash?.hashValue;

        if (hash) {
            console.log("\n🎉 成功找到了！這就是我們需要的最終答案！");
            console.log("==================================================================");
            console.log("您的 Hashed Account Number (hashValue) 是：", hash);
            console.log("==================================================================");
            console.log("\n請將這串 Hash 值複製，並設定到 Render 的 SCHWAB_ACCOUNT_HASH 環境變數中。");
        } else {
            console.error("❌ 在 API 回應中找到了帳戶，但找不到 hashValue。");
            console.log("收到的完整回應：", JSON.stringify(response.data, null, 2));
        }
    } catch (error) {
        console.error("查詢時發生錯誤:");
        console.error("   - API Status:", error.response?.status);
        console.error("   - API Response:", error.response?.data);
    }
}

findRealHash();