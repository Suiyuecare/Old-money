# LIGNÉE — Made to Be Inherited.

A high-fidelity, non-transactional commerce prototype for a fictional
contemporary British estate lifestyle brand. The customer-facing experience is
written primarily in Traditional Chinese, with English used for editorial mood.

## Prototype boundary

- No real payment, order, inventory, account, email, appointment, or analytics service
- Cart and wishlist persist locally in the visitor's browser
- Checkout and demonstration-form details remain in React memory only
- All contact examples use the reserved `.invalid` top-level domain
- Every deployment remains `noindex` and displays the prototype banner
- Product facts, sourcing, materials, and imagery are concepts pending real-world verification

See [SECURITY.md](./SECURITY.md) for the complete privacy and security boundary.

## Local development

Requires Node.js 22.13+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Verification

```bash
pnpm validate
pnpm audit --prod
pnpm build
pnpm start

# In a second terminal, against the production server on 127.0.0.1:3000:
pnpm test:e2e
pnpm test:visual
```

`pnpm build` runs the unit/content suite first, then creates the optimized
Next.js build. Generated commerce and editorial assets are governed by
`content/asset-manifest.ts`. The visual sweep captures all 55 routes at three
locked viewports into the ignored `artifacts/visual-qa/` directory; see
`VISUAL-QA.md` for the approval record. Lighthouse, interaction-latency, and
first-load JavaScript results are documented in `PERFORMANCE.md`.

The final production acceptance run completed 68 unit/content tests and 34
Playwright cases (28 passed, 6 intentionally skipped by viewport/project), with
no failures. The locked production dependency graph also completed
`pnpm audit --prod` with no known vulnerabilities.

## Architecture

- Next.js App Router and React Server Components by default
- TypeScript strict mode
- CSS Modules plus global design tokens
- Local typed catalog: 27 products and 155 explicit SKUs
- Four estate collections and four journal entries
- Client islands only for search/filtering, cart, wishlist, forms, and mock checkout
- Request-scoped nonce CSP plus restrictive security and indexing headers

## Vercel production

The approved Vercel project `old-money`
(`prj_DKYM3lvhibSXp1khm0Xv6m1EOv7g`) is linked to the GitHub `main` branch and
is live at [old-money-topaz.vercel.app](https://old-money-topaz.vercel.app).
Production sets `NEXT_PUBLIC_SITE_URL` to that stable alias, and future pushes
to `main` trigger a new production deployment through the Vercel Git
integration.

The project can be relinked and inspected with the pinned CLI:

```bash
pnpm dlx vercel@56.5.0 link --yes \
  --project prj_DKYM3lvhibSXp1khm0Xv6m1EOv7g \
  --scope entrepreneur-9585s-projects
pnpm dlx vercel@56.5.0 inspect old-money-topaz.vercel.app \
  --scope entrepreneur-9585s-projects
```

The production site remains visibly marked as a non-transactional prototype,
uses `noindex`, and contains no commerce credentials. Do not connect payment or
PII services without completing the production review in `SECURITY.md`.
