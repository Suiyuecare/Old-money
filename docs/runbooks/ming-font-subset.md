# Ming font subset

LIGNÉE bundles an audited Traditional Chinese subset so Chinese storefront and
admin copy does not fall back to a sans-serif system font.

## Pinned source

- Family: Noto Serif TC variable (`wght` 200–900)
- Upstream release: `Serif2.003`
- Source:
  `https://raw.githubusercontent.com/notofonts/noto-cjk/Serif2.003/Serif/Variable/TTF/Subset/NotoSerifTC-VF.ttf`
- Source SHA-256:
  `c2f466b741797d917aff27089f1c2eba2fe42c46ca410e2dbd39a8e95d0e5e3a`
- License: `app/fonts/OFL-Noto-Serif-TC.txt`

Do not use a macOS system Songti font as the distributable source.

## Regeneration contract

1. Scan runtime `.ts`, `.tsx`, `.json`, and `.css` under `app`, `components`,
   `lib`, and `content`.
2. Append missing Han characters to `content/ming-han-glyphs.txt` without
   removing previously audited glyphs.
3. Build the Unicode set from the prior WOFF2 cmap plus the updated Han
   registry. This retains its punctuation coverage while adding new copy.
4. Use FontTools 4.x with Brotli to subset the pinned variable TTF, retain all
   layout features and the `wght` axis, and write WOFF2.
5. Update only the three reviewed constants in
   `scripts/check-ming-font.mjs`, then run `pnpm check:font`.

The current reviewed output contains 1,085 unique Han glyphs and retains the
200–900 variable weight axis. A changed font, registry, or uncovered runtime
character fails the launch gate.
