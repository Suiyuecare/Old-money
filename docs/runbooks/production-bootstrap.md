# LIGNÉE production-disabled bootstrap

This runbook applies only to the new LIGNÉE Supabase project in Tokyo. Both
bootstrap scripts refuse the existing HR project and require an explicit
matching `CONFIRM_LIGNEE_PROJECT_REF`.

## Preconditions

1. Apply every tracked migration to the new project.
2. Apply `supabase/seed.sql` so the locked Estate No. 01 identities exist.
3. In hosted Supabase Auth, set the Site URL to
   `https://estatelignee.com`, allow
   `https://estatelignee.com/admin/invite/confirm`, and copy the Invite
   template from `supabase/templates/invite.html`. The repository
   `config.toml` only configures local Auth; it does not update a hosted
   project.
4. Send a disposable invitation and verify that its button opens
   `/admin/invite/confirm?token_hash=…&type=invite` before inviting either
   Owner. The confirmation page also supports Supabase's default authenticated
   URL-fragment redirect, removes that fragment from browser history, and
   fails closed if it cannot persist the session.
5. Keep `LIGNEE_MODE=production-disabled`, `COMMERCE_CAPABLE=false`, checkout,
   live providers, canary and indexing disabled.
6. Export the Supabase URL, project ref and secret key only in the trusted
   operator shell. Do not write them to the repository or command history.

## Publish the locked Estate batch

Run:

```sh
CONFIRM_LIGNEE_PROJECT_REF="$SUPABASE_PROJECT_REF" pnpm bootstrap:estate
```

The script requires exact 50-product／189-SKU parity and calls the one-time
service-only bootstrap RPC. Replaying the same digest is safe; any identity
mismatch fails closed.

## Create the initial Owner pair

Export two distinct Owner emails and display names:

```sh
export LIGNEE_OWNER_ONE_EMAIL=
export LIGNEE_OWNER_ONE_DISPLAY_NAME=
export LIGNEE_OWNER_TWO_EMAIL=
export LIGNEE_OWNER_TWO_DISPLAY_NAME=
```

Then run:

```sh
CONFIRM_LIGNEE_PROJECT_REF="$SUPABASE_PROJECT_REF" pnpm bootstrap:owners
```

The script invites or reuses the two matching Auth users, then atomically
creates exactly two active Owner memberships. The RPC is service-only and
refuses to run when any membership already exists.

Each Owner must independently accept the invitation, set a password, enroll
and verify two TOTP factors, then pass an AAL2 challenge. Do not enable checkout
or live provider effects during this bootstrap.
