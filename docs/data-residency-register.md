# Data residency register — draft

| Flow | Data | Planned region/country | Known wider path | Status |
|---|---|---|---|---|
| Supabase DB/Auth/Vault | orders, PII ciphertext, admin Auth, logical keys | Tokyo, Japan | provider control plane/subprocessors TBD | unverified |
| Vercel Functions | request processing | hnd1 Tokyo | CDN/control plane may be global | unverified |
| Vercel private Blob stores | catalog and encrypted case objects | hnd1 Tokyo | control plane metadata TBD | uncreated |
| AWS backup/operational accounts | immutable backup, brokers, recovery | ap-northeast-1 | AWS control plane per DPA | uncreated |
| ECPay | payment/invoice/provider reports | Taiwan | contract/subprocessors TBD | unapproved |
| Black Cat via ECPay | shipping/returns | Taiwan | contract/subprocessors TBD | unapproved |
| Resend | Email content/metadata | Tokyo sending region planned | account data, metadata, logs/API records may be United States | unapproved |

Country, retention, immutable region properties, support access, and subprocessors must be confirmed from current DPAs before live use.

