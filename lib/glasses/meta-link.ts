// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
/**
 * After the seller approves Reskale in the Meta AI app, Meta AI opens
 * `reskale-meta://?…&metaWearablesAction=register&…`. The Meta SDK reads that link
 * natively; expo-router also sees it, and with no path it would drop the
 * seller on the home tab. Send them back to the glasses screen they came from.
 * Every other link passes through untouched.
 */
export function redirectMetaCallback(path: string): string {
  return /[?&]metaWearablesAction=/.test(path) ? '/glasses' : path;
}
