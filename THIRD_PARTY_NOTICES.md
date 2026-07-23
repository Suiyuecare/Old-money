# Third-party notices

This file records the attribution boundaries for the LIGNÉE concept prototype. It is not a substitute for the license text shipped by an upstream project.

## Generated imagery

The 27 product images and 8 editorial images listed in [`content/asset-manifest.ts`](content/asset-manifest.ts) were created with OpenAI image generation for this prototype. They depict fictional LIGNÉE products and the fictional The Lignée Estate brand world.

No third-party stock-photo, photographer, model, product-brand, or image-agency licensor is attributed for these 35 canonical images. Use of generated output remains subject to the applicable OpenAI terms and the deploying organization's review requirements. The manifest's `approved` status means prototype editorial approval only; it is not a warranty of physical-product accuracy, materials, origin, manufacture, trademark clearance, likeness rights, or exclusive ownership.

The generated images must be replaced or re-reviewed before real goods are sold. They must not be presented as photography of a manufactured product.

## Typography

The display face is **Cormorant Garamond**, loaded through `next/font/google` using the Latin subset. Cormorant Garamond is distributed by its upstream authors under the SIL Open Font License; retain the upstream font metadata and license when redistributing font files.

Traditional Chinese and interface copy use a system font stack that may resolve to PingFang TC, Noto Sans TC, Microsoft JhengHei, or a platform sans-serif. This repository does not intentionally redistribute those system fallback fonts; their availability and licensing are supplied by the visitor's operating system or browser environment.

## Software packages

This application uses open-source runtime packages Next.js, React, React DOM,
and Zod. Development and verification tooling includes TypeScript, ESLint,
Vitest, Playwright, Testing Library, jsdom, and axe-core's Playwright adapter.

Package names alone do not establish a license. The authoritative package versions and dependency graph are recorded in:

- [`package.json`](package.json) for direct runtime and development dependencies;
- [`pnpm-lock.yaml`](pnpm-lock.yaml) for resolved versions;
- each installed or distributed package's own `package.json`, `LICENSE`, `NOTICE`, and copyright files for its actual terms.

Do not copy a single license label across the dependency tree. Before distributing a production build, generate a dependency-license inventory from the final lockfile and retain all notices required by the exact shipped versions, including notices for transitive packages.
