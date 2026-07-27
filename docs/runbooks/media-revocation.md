# Media revocation

1. Create immutable intent with reason, SHA/variants, and expected revision.
2. Append Edge tombstone and increment media safety revision.
3. Receive Edge acknowledgement before DB mutation.
4. Purge every public/internal cache generation and legacy optimizer derivative.
5. In one DB transaction append `live_approved -> revocation_pending -> revoked`, remove every catalog/editorial/SEO/Email reference, disable an incomplete SKU/batch, audit, and enqueue invalidation.
6. Verify original URL and every variant return 410 with zero original bytes for GET, HEAD, Range, conditional and cache-busting requests in two regions.
7. Rollback/DR restores tombstones and revision before bytes.

Unknown or failed steps leave the tombstone and emergency no-cache active. A SHA is never revived.

