// authMiddleware.js (最終版 - 使用 Supabase 官方函式庫)

// 引入 Supabase 官方的 server-side client
const { createClient } = require('@supabase/supabase-js');

// 從環境變數讀取 Supabase 金鑰
const supabaseUrl = process.env.SUPABASE_URL;
// 我們將使用權限更高的 Service Role Key 來安全地驗證使用者 Token
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 確保金鑰已設定
if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL and Service Role Key must be provided.');
}

// 使用 Service Role Key 初始化一個 Supabase 管理員 client
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// 認證中間件主體
const authMiddleware = async (req, res, next) => {
    // 在函數開頭加入日誌，確認它被執行
    //console.log(`[authMiddleware] Verifying token for request to: ${req.originalUrl}`);

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: '未授權：沒有提供 Token。' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // ✨ 核心修改：使用 Supabase 官方的 getUser 方法來驗證 Token ✨
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error) {
            // 如果 Supabase 回傳錯誤 (例如 token 過期、無效)，則拒絕請求
            console.error('[authMiddleware] Supabase auth error:', error.message);
            return res.status(401).json({ error: '未授權：無效的 Token。' });
        }

        if (!user) {
             return res.status(401).json({ error: '未授權：找不到對應的使用者。' });
        }
        
        // Token 驗證成功，將使用者資訊附加到 req 物件上
        req.user = user;
        //console.log(`[authMiddleware] Token verified successfully for user: ${user.email}`);
        // 呼叫 next() 將請求傳遞給下一個處理函數
        next();

    } catch (e) {
        console.error('[authMiddleware] An unexpected error occurred during token verification:', e);
        res.status(500).json({ error: '伺服器內部錯誤。' });
    }
};

module.exports = authMiddleware;