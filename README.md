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

## Vercel preview

No preview was deployed during this delivery. The authenticated Vercel scope
had no existing project identifiable as LIGNÉE or Quiet Luxury, and this
repository was not linked; an unrelated project was not reused and no new
project was created.

After an operator explicitly identifies an approved existing project, this
repository is ready for the pinned CLI workflow:

```bash
pnpm dlx vercel@56.5.0 link --project <approved-existing-project>
pnpm dlx vercel@56.5.0 deploy
```

Set `NEXT_PUBLIC_SITE_URL` to the protected preview URL if stable canonical
Open Graph URLs are required. Keep Vercel Deployment Protection enabled; never
add commerce credentials to this prototype.
