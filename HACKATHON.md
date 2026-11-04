# What was built when

The Meta Global AI Developer Hackathon only allows work built between **Oct 27 and Nov 4, 2026** to be shown, and that work must be clearly identified. This page says what in this repo was built when, and where the evidence is.

**About the evidence.** This public repo started with fresh history on Nov 4. The glasses work before that lives in Reskale's private app repo (`rescale-3`, branch `feat/linux-glasses`). The commit hashes and dates below come from that repo, and judges can ask to see it. Every code file here also starts with a one-line header that says which kind it is:

- `// Hackathon (Nov 4 2026): …` was written in this repo during the hackathon.
- `// Pre-existing (Reskale), trimmed for this repo: …` came from the Reskale app and was cut down here for the hackathon.
- `// From the Reskale app: first written …, last changed … (before this repo).` was copied from the Reskale app. Its dates come from the private repo's git history. Files that were also changed here say "changed here on 2026-11-04 for the hackathon".

## Before the window (not part of the entry)

| Date | Commit (private) | What |
|---|---|---|
| Mar – Oct 2026 | Reskale app history | eBay Browse search and app-token plumbing (`lib/ebay.ts`, `lib/ebay-auth.ts`, `lib/browse-cache.ts`), eBay fee maths (`constants/fees.ts`), USPS price table (`lib/shipping/usps-estimate.ts`), scan-image helpers (`lib/prepare-scan-image.ts`, `lib/focus-crop.ts`, `lib/scan-objects.ts`), app config and styling |
| Oct 23 | `4ec4b5d2` | First Meta glasses connection through Meta's Wearables Device Access Toolkit: "Meta glasses for sourcing scans and listing photos (dev builds)". This is where the glasses transport (`lib/glasses/meta.native.ts`, `transport.ts`, `types.ts`), the deep-link callback and the photo waiters were first written. |

## Built inside the window: Oct 27 – Nov 4

| Date | Commit (private `rescale-3`, `feat/linux-glasses`) | What |
|---|---|---|
| Oct 29 | `38ca0191` | Reskale app scan work, not glasses-specific: a scanned barcode is named from a free UPC database (`lib/upc.ts`, `lib/upc-lookup.ts`, `app/api/upc/lookup+api.ts`). Used here for the free barcode path. |
| Oct 29 | `615f468f` | Reskale app scan work, not glasses-specific: `lib/read-base64.ts`, reused here to read photos. |
| Oct 30 | `f186caed` | A separate "Reskale Glasses" Android build (`com.reskale.app.glasses`) that installs next to the main app, plus connecting through Meta AI in Developer Mode. **This repo runs on that build.** |
| Nov 2 | `14f9b2de` | Hands-free sourcing with the full spoken result: press the glasses button, hear what it is and what it sells for. |
| Nov 2 | `9384578a` | The glasses as a source on the Scan tab, plus a spoken how-to. |
| Nov 2 | `40e589a6` | "Reskale, …" voice commands, the live viewfinder with a scan box, and "Hey Meta, start Reskale". |
| Nov 3 | `e025eedf` | The glasses as the Scan tab's camera; photos turned upright (Meta photos arrive turned 90° with no EXIF). |
| Nov 4 | `f1205f09` | Voice profit calculator, eBay category search, restarting speech every 55 s (Meta's speech stops after about 60 s and doesn't say so), "cell" heard as "sell", glasses photos from Inventory, and a Metro dev-server fix. |
| Nov 4 | **this repo** (`9c19738` and later) | **All of the Muse work.** Muse Spark identifies the item, writes the eBay search and reads a price tag in the photo. Muse Wonder is asked again when Spark is unsure. Muse answers spoken questions and puts the verdict into words. There is a $150 budget guard. Also new here: **the buy/pass agent** (`lib/agent/*`), the ScrapeBadger sold-data route (`app/api/sold+api.ts`, `lib/sold-comps/scrapebadger-ebay.ts`), the slim Scan screen (`app/index.tsx`), and the eBay and UPC routes cut down to run without Reskale accounts. |

The commit dates and subjects above were checked against the private repo on Nov 4 with `git log -1 --format='%h %ad %s' --date=short <sha>`.

## Third-party code and services

- **`@chrisgocode/expo-meta-wearables-dat` 2.2.0** (MIT): the community Expo wrapper around Meta's toolkit.
- **Meta Wearables Device Access Toolkit**: Meta's terms. It is used in Developer Mode (no Meta App ID). Its capture button (Inputs) and voice launch are experimental features, which Meta does not allow in a published app.
- **Meta Model API (Muse)**: Muse Spark 1.3 and Muse Wonder 1.0, paid with the hackathon credits. The `-contributor` tiers are never used, because Meta trains on that data and these are sellers' photos.
- **eBay Browse and Taxonomy APIs**: used under eBay's API licence with the builder's own keyset.
- **ScrapeBadger**: a paid API for eBay sold listings, on the builder's own key.
- **Expo, React Native, NativeWind, Zustand, Vitest**: their own open-source licences, through `package.json`.
