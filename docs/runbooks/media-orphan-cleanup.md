# Media orphan cleanup

Reserving an upload intent commits one private source cleanup candidate before
the signed upload URL is returned. Finalization also commits all six derivative
candidates before uploading any WebP/AVIF bytes. A successful media registration
changes the exact source candidate and matching derivative candidates to
`protected`; the upload-intent finalization transition independently protects
the source when SHA deduplication reuses an existing asset. An abandoned source
upload, incomplete derivative upload, or failed registration remains `queued`
for at least a six-hour grace period.

`GET /api/internal/jobs/media-cleanup?limit=6` is scheduler-compatible and
requires `Authorization: Bearer $CRON_SECRET`. The route is Production-only,
uses the lazy `SUPABASE_SECRET_KEY` client, claims one candidate at a time, and
deletes through the Supabase Storage API. It never deletes `storage.objects`
rows through SQL.

## Safety states

- `queued`: upload/finalize grace is active; registration may protect it.
- `leased`: deletion is in flight; registration is blocked.
- `retry_pending`: a completed deletion attempt failed or is uncertain;
  registration requires a complete re-upload.
- `quarantined`: a lease expired; registration and re-staging stay blocked for
  15 minutes so an old invocation can drain.
- `deleted`: Storage accepted the idempotent removal; registration requires
  a new source upload or staging and uploading all six derivatives again.
- `protected`: a source intent is finalized, its exact path is media-referenced,
  or a matching derivative asset exists; the cleanup worker cannot claim it.
- `dead_letter`: retry budget ended; an operator can retry the full upload,
  which safely re-stages the six candidates.

The claim RPC rechecks `catalog_private.media_assets` immediately before
leasing. Source checks match `source_object_path` exactly; derivative checks
match the SHA/object class or exact manifest path. The media-assets insert
trigger locks the same candidate rows and rejects registration after deletion
has started. The upload-intent finalization trigger applies the same rule to
finalized deduplicated sources. Derivatives share a transaction-scoped lock for
`(scope, SHA)`; sources share one for `(scope, exact source path)`, so an empty
candidate set cannot create a phantom race. Lease/quarantine/protection sweeps
are bounded and use `SKIP LOCKED`.

## Operations

Until a Vercel plan and scheduler are selected, no cadence is declared in
`vercel.json`. Configure this endpoint at least hourly after Production
credentials exist; the minimum six-hour grace exceeds the signed-upload lifetime
and means a temporary missed invocation does not affect uploads. Alert on
`dead_letter`, repeated `quarantined`, or a rising count of candidates older
than 24 hours.

For recovery, retry the original image from the admin editor. Staging resets a
completed/retry/dead-letter candidate, uploads every derivative, and registers
the SHA atomically. Do not manually delete Storage metadata or bypass the
cleanup RPCs.
