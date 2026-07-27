# Third-party notices

This file records the attribution boundaries for the LIGNÉE Sandbox storefront.
It is not a substitute for the license text shipped by an upstream project.

## Generated imagery

The governed public inventory contains 150 Sandbox visual records:
50 product-main, 50 product-detail, 24 estate-lifestyle, 12 tennis-lifestyle,
10 category, and 4 story-hero assets. Product and lifestyle source masters were
created with OpenAI image generation; category images are governed derivatives
of the product sources, and the four story heroes are retained local Sandbox
editorial sources.

No third-party stock-photo, photographer, product-brand, or image-agency
licensor is attributed for these assets. Use of generated output remains
subject to the applicable OpenAI terms and the deploying organization’s review
requirements. Every record remains `sandbox_review`,
`humanFinalApproval=false`, `physicalProductMatch=false`, and
`internal-sandbox-only`; none of those fields is a warranty of physical-product
accuracy, materials, origin, manufacture, trademark clearance, likeness
rights, or exclusive ownership.

The images must receive final product, model/likeness, legal, and brand review
before real goods are sold. They must not be presented as photography of a
manufactured product.

## Typography

English display typography uses locally available system faces, beginning with
Baskerville and Iowan Old Style; no display webfont is downloaded.

Traditional Chinese copy uses
[`app/fonts/lignee-ming-subset.woff2`](app/fonts/lignee-ming-subset.woff2), a
self-hosted subset of **Noto Serif TC** derived from the official Google Fonts
variable TTF. Noto Serif TC is distributed under the SIL Open Font License; the
upstream license is retained at
[`app/fonts/OFL-Noto-Serif-TC.txt`](app/fonts/OFL-Noto-Serif-TC.txt). The
locked font and its audited 984-Han-glyph runtime registry are checked by
`pnpm check:font`; CJK punctuation included in the subset and platform Ming
fallbacks remain available. New runtime Han copy fails the launch gate until
the subset and registry are deliberately regenerated and reviewed.

## Software packages

This application uses open-source runtime packages including Next.js, React,
React DOM, Zod, Supabase clients, React Email, and Resend. Development and
verification tooling includes TypeScript, ESLint, Vitest, Playwright, Testing
Library, jsdom, axe-core’s Playwright adapter, and Sharp.

Package names alone do not establish a license. The authoritative package versions and dependency graph are recorded in:

- [`package.json`](package.json) for direct runtime and development dependencies;
- [`pnpm-lock.yaml`](pnpm-lock.yaml) for resolved versions;
- each installed or distributed package's own `package.json`, `LICENSE`, `NOTICE`, and copyright files for its actual terms.

Do not copy a single license label across the dependency tree. Before distributing a production build, generate a dependency-license inventory from the final lockfile and retain all notices required by the exact shipped versions, including notices for transitive packages.
