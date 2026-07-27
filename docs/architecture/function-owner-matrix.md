# Function-owner privilege matrix

| Function | Owner | Direct objects | Operations | Caller |
|---|---|---|---|---|
| `api.catalog_read_all` | `catalog_reader_owner` | published catalog/variant/price/category/chapter | SELECT | `storefront_rpc_caller` |
| `api.apply_inventory_operation` | `inventory_command_owner` | balances, movements | SELECT/UPDATE/INSERT | worker RPC caller only; storefront is explicitly denied |
| `api.fail_close_runtime` | `ops_command_owner` | runtime controls, audit | SELECT/UPDATE/INSERT | worker RPC caller |

Every owner is `NOLOGIN NOINHERIT NOBYPASSRLS`, has a matching forced-RLS policy, cannot create/replace functions, and owns no table. Runtime callers have only `api` usage and allowlisted execute. Default/public execute is revoked.

Future checkout, payment, refund, invoice, logistics, Auth, PII and release functions must add a row here before migration approval. Broad ownership, dynamic caller SQL, `service_role`, and shared caller credentials are prohibited.
