#!/bin/bash

# =================================================================
# Paper-Auto-Trade One-Click Sync Script
# =================================================================

# 1. 找到 Git 根目錄 (自動向上搜尋 .git)
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -z "$GIT_ROOT" ]; then
    echo "❌ 找不到 Git 儲存庫 (.git)。這是在 Repo 裡面嗎？"
    exit 1
fi

cd "$GIT_ROOT"
echo "🔍 正在檢查更新狀態 (路徑: $GIT_ROOT)..."

# 2. 檢查是否有變更
if [ -z "$(git status --porcelain)" ]; then
    echo "✅ 目前沒有任何變更需要上傳。"
    exit 0
fi

# 3. 執行同步
echo "🚀 正在將變更推送到 GitHub..."

git add .

# 使用當前時間作為 Commit Message
COMMIT_MSG="Restore: AI Features Deployment ($(date +'%Y-%m-%d %H:%M:%S'))"
git commit -m "$COMMIT_MSG"

# 4. 推送到主分支
git push origin main

if [ $? -eq 0 ]; then
    echo "--------------------------------------------------"
    echo "🎉 同步成功！"
    echo "🌍 Vercel 正在開始新的構建，請於 1-2 分鐘後重新整理網頁。"
    echo "--------------------------------------------------"
else
    echo "❌ 同步失敗，請檢查網路連線或 Git 權限。"
    exit 1
fi
