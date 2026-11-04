// Hackathon (Nov 4 2026): written for this repo; the Reskale app's feature switches, fixed for a Meta-only app.
// This app is the glasses app, and Meta is its only glasses family, so the
// switches the Reskale app reads are fixed here.
export const GLASSES_ENABLED = true;
export const GLASSES_META_ENABLED = true;
/** Meta's Mock Device Kit (the phone's back camera as the glasses), for development builds. */
export const GLASSES_DEMO_ENABLED = __DEV__;
export const GLASSES_RAVEN_ENABLED = false;
