# Owner 帳號復原 Runbook

## 安全邊界

- 僅能在 Vercel Production 且 `LIGNEE_MODE=production-disabled|live` 執行。
- `SUPABASE_SECRET_KEY` 只由 server-only worker lazy 載入；Preview、Demo 與瀏覽器不得設定或使用。
- 資料庫必須是新建的 LIGNÉE 專案；禁止將 worker 指向既有 HR 專案。
- Supabase Auth 的 Redirect URL allow list 必須精確包含
  `https://estatelignee.com/admin/recovery/confirm`。
- `CRON_SECRET` 至少 32 個字元，僅放在 Production environment。

## 正常流程

1. 遺失兩組 TOTP 的 Owner 仍須以 Email 與密碼建立 AAL1 session。
2. Owner 從 `/admin/recovery` 替目前 `auth.uid()` 本人提出申請；不能輸入或指定他人 user ID。
3. 另一位 active Owner 在最近十分鐘 AAL2 下核准申請。
4. 核准 transaction 更新 `sessions_revoked_at`、audit 與
   `auth.revoke_sessions_and_recover` outbox job。
5. 受 `CRON_SECRET` 保護的
   `GET /api/internal/jobs/owner-recovery?limit=1` claim job；人工維運亦可
   使用同一 bearer credential 呼叫 `POST`。
6. Worker 移除舊 TOTP、寫入 Auth app-metadata dispatch marker，再要求
   Supabase Auth 寄出 password recovery Email。
7. 收件人只在瀏覽器記憶體中使用 recovery session；網址 fragment 會立即移除。
8. Owner 更新密碼後重新登入，並重新註冊主要與備用兩組 TOTP。

## 重試與人工判讀

- DB claim／complete RPC 使用 idempotency key 與 payload hash；response 遺失時可安全 replay。
- Vercel Cron 僅發出 GET，route 已相容並驗證
  `Authorization: Bearer $CRON_SECRET`。實際排程間隔須依 Vercel 方案另行
  設定；尚未設定前，後台會保留 durable queued job 而不盲目執行。
- 尚未開始寄信的可證明失敗才標成 `retry_safe`。
- 寄信呼叫開始後的 timeout、worker crash 或 `dispatching` marker 不得自動重寄。
- lease 到期會進 dead letter，錯誤碼為
  `AUTH_RECOVERY_LEASE_EXPIRED_EFFECT_UNKNOWN`。
- `AUTH_RECOVERY_EMAIL_OUTCOME_UNKNOWN`、
  `AUTH_RECOVERY_PRIOR_EMAIL_OUTCOME_UNKNOWN` 或
  `AUTH_RECOVERY_MARKER_FINALIZE_FAILED` 都需要 Owner 查閱 Supabase Auth
  寄信紀錄後人工決定；不要直接重新建立或重送相同操作。

## 隱私檢查

- API 回應只包含 job ID、狀態與 attempt count。
- outbox result 只允許 `sessionsRevoked`、`totpFactorsRemoved`、
  `recoveryEmailQueued` 與可選的 provider message ID。
- Email、recovery URL、access token、refresh token 與 hash fragment
  不得寫入 job、audit、錯誤訊息或應用程式日誌。
