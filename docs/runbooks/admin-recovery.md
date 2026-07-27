# Admin recovery

Normal admin actions require same-origin BFF session, recent AAL2, active DB membership and CSRF/Origin validation. Public signup and wildcard production redirects are prohibited.

Bootstrap requires zero active/provisional Owners, exact production-disabled deployment binding, 2-of-3 hardware-key manifest, one-time recovery certificate and recoverable two-Owner Auth saga. Both different natural persons must enroll TOTP and recovery material before activation.

If one Owner is compromised, the other may only reduce privilege/availability: Edge/DB fail-close, suspend target membership and revoke sessions. Reopening commerce waits for a verified replacement Owner.

If both Owners are inaccessible, break-glass can only fail-close, revoke sessions, and recover Owner access. It cannot read PII, publish, price, refund or enable commerce. Every use rotates affected credentials/keys and is rehearsed.

