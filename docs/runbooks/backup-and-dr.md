# Backup and disaster recovery

## Targets

- Same-project PITR: RPO <=5 minutes, rehearsed RTO <=4 hours.
- Supabase/Vercel/control-plane loss: nightly independent export, honest RPO <=24 hours and RTO <=24 hours.

## Independent backup

An AWS backup-account task with fixed egress uses a read-only, NOBYPASSRLS exporter. Client-side encrypted dumps, schema/grant manifests, public/private assets, media tombstones and configuration/escrow bundles go to ap-northeast-1 Object Lock Compliance storage. Recovery keys use offline age X25519 2-of-3 custody.

## Quarterly exercise

Assume production Supabase, Vercel, and their credentials are unavailable. Restore a new isolated project, apply tombstones before media, recreate Vault key mapping, verify row counts/totals/RLS/Auth/attachments, keep providers off, and record evidence hashes. Do not claim completion until an exercise actually occurs.

