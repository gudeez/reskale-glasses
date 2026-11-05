# Submission: paste-ready answers

For the Cerebral Valley form (cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit). Due **Wed Nov 4, 9:00 PM ET**.

---

**Project name:** Reskale Glasses

**Tagline:** Hands-free sourcing on Ray-Ban Meta: look at an item, and Reskale tells you whether to buy it.

**Track:** Indie Developer

**Problem statement:** Build for Your World

---

### The problem

Resellers source in thrift stores and at the bins: thousands of items, both hands full, a few seconds per item. On the phone, every lookup means putting the item down, unlocking, typing and scrolling, so most resellers guess. A wrong guess becomes dead stock: money spent on things that sell slowly, or for less than they cost after eBay's fees.

### What it does

**Reskale tells you whether to buy it.**

1. Wearing Ray-Ban Meta glasses, the reseller looks at an item and presses the glasses button, or says "Reskale, scan".
2. Muse identifies it from the glasses' photo and reads the store's price tag. eBay gives what it actually sold for over about 90 days, and how many are listed now.
3. An agent makes the call and says it in the glasses: "Buy it. It sells for about 42 dollars, so you keep 35 dollars and 7 cents after eBay fees, 4.3 times your 8 dollars. 45 percent sell through in 90 days." Or: "Pass. It sells too slowly: 12 percent sell through in 90 days, under 30."
4. If it doesn't know the price, it asks. If it sees a tag, it asks the seller to confirm it.

The seller never takes out the phone.

### How we use Muse

- **Identify (Muse Spark 1.3).** One call with the photo and a JSON schema returns brand, model, condition, a short eBay search, Spark's confidence, and the price on any visible tag. Spark is fast enough to answer while the seller is still holding the item.
- **Escalate (Muse Wonder 1.0).** Only when Spark's confidence is under 0.5, or it has no search words, is the same photo sent to Wonder. Most scans pay Spark's price; the hard ones get the smarter model.
- **Talk (Spark).** Free-form questions ("Reskale, who makes this?") are answered from the facts of the last scan only. Muse is told never to guess a number.
- **Explain (Spark).** Muse says the verdict in its own words. A guard keeps that sentence only if it opens with the same verdict and doesn't name the other one; otherwise the rules' own sentence is spoken.
- **Budget.** Every call reserves its worst case before it is sent and settles to its real cost after. Spend is capped at $150 (`MUSE_BUDGET_USD`), and a ledger file keeps the cap across restarts.

### Why it's an agent, not an image analyzer

It decides and acts:

- **It decides.** Two rules make the call, written in code: what you keep after eBay fees must be at least 3× the price, and more than 30% of listings must have sold in 90 days.
- **It asks for what's missing.** No price means "What's the price?"; a price tag Muse saw means "Say yes to use it".
- **It explains.** The seller hears the reason, and the most to pay to still make 3×.
- **It's verifiable.** Every verdict traces back to two numbers. The rules are a pure, unit-tested function, including the edges: exactly 3× passes, exactly 30% fails, and missing data gives "no call", never a guess. Muse can't override them.

### What we built during the hackathon (Oct 27 – Nov 4)

The full list, with commit hashes and dates, is in HACKATHON.md.

- **Oct 30.** A separate "Reskale Glasses" build, connected through Meta AI in Developer Mode.
- **Nov 2.** Hands-free sourcing with a spoken result; "Reskale, …" voice commands; a live viewfinder with a scan box; "Hey Meta, start Reskale".
- **Nov 3.** The glasses as the scan camera, with photos turned upright.
- **Nov 4.** A voice profit calculator, eBay category search, and the speech restart. Also built that day, in this repo: **all of the Muse work**, the **buy/pass agent**, eBay sold data through ScrapeBadger, and the Scan screen.
- **Before the window, and not judged:** the first Meta glasses connection (Oct 23) and Reskale's existing eBay search and fee maths.

### Tech stack

- **Glasses:** Meta Wearables Device Access Toolkit (camera stream, button, mic) through `@chrisgocode/expo-meta-wearables-dat`.
- **App:** Expo / React Native (Android), with Expo Router API routes on the dev server.
- **AI:** Meta Model API, using Muse Spark 1.3 and Muse Wonder 1.0.
- **Market data:** eBay Browse and Taxonomy APIs; ScrapeBadger for eBay sold listings.
- **Code:** TypeScript, Zustand, NativeWind, Vitest (303 tests).

### Challenges

- **Speech stops silently.** Meta's speech recognition stops about 60 seconds after it starts and doesn't tell the app. We restart it every 55 seconds.
- **Sideways photos.** Glasses photos arrive turned 90° with no EXIF, so we detect that and turn them upright before cropping or scanning.
- **"Cell" for "sell".** The recogniser writes "sell" as "cell", so "what's it sell for?" becomes "what's it cell for?". We map it back for questions and the calculator only, and leave "cell phone" alone.
- **Dev-server timeouts.** The phone gave up on the dev server because Expo's manifest took 7–60 seconds. We traced it to a runtime-version lookup and cached it.
- **Must be worn.** Meta's toolkit only works while the glasses are on a face, so every test means wearing them.

### What's next

- A store build that works without Meta's experimental features (on-screen scan and voice only).
- Sellers set their own rules (a 2× target for new items, their own sell-through floor).
- One tap from a BUY to "add to inventory" in the Reskale app.
- iOS.

### Links

- Repo: https://github.com/gudeez/reskale-glasses
- Video: https://youtube.com/shorts/TA7AOikh99Y (clean cut, under 3 minutes; link added after the deadline, no code changed)
