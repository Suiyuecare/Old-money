# Migration release

Production DDL is never run from a laptop or general CI identity. A one-shot fixed-egress runner receives one short-lived per-operation login from the migration broker and applies only the reviewed ordered digest.

Each run records release/SHA, before/after version, migration and image digests, phase checkpoints and bounded backfill cursors. Expand/backfill/validate/enforce/contract are resumable; destructive contract is a later release after at least two compatible deployments.

On completion or heartbeat loss, revoke membership, set NOLOGIN/rotate, terminate every backend whose `session_user` is the per-run role, prove zero sessions, then drop it. PID/application name alone is not revocation proof.

Every Auth/Vault/grant/Cron/migration change first runs in a disposable Tokyo rehearsal project with external effects disabled. No remote runner is implemented in this repository.

