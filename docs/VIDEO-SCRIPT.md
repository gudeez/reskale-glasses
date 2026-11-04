# Demo video: 3:00 script

Everything shown here was built during the hackathon (Oct 27 – Nov 4). See HACKATHON.md. Keep the video **under 3:00**.

## Pre-flight checklist

- [ ] The glasses are **on your face**; Meta's toolkit refuses glasses that aren't worn. They're charged and connected in Meta AI.
- [ ] Meta AI Developer Mode is on (Settings → App info → tap the version 5×).
- [ ] `MODEL_API_KEY` is in `.env`, and Metro was started **after** adding it.
- [ ] Metro is warm: run `adb reverse tcp:8081 tcp:8081`, then `APP_VARIANT=glasses npx expo start --dev-client --port 8081`. Open the app once before recording; the first API call after a cold start takes about 50 s.
- [ ] Reskale Glasses shows 🕶️ **Connected**, and the 🔊 Speak toggle is on.
- [ ] **Two real items**, each tried once before recording:
  - **A** is a good buy: a branded item that sells (for example a Yeti or Stanley tumbler) with a cheap price tag on it.
  - **B** is a slow seller: a generic item (for example a plain mug or a no-name picture frame).
- [ ] A second terminal is open in the repo for the code shot, with `lib/agent/buy-decision.ts` open in the editor.
- [ ] Optional for the budget shot: a copy of `.env` with `MUSE_BUDGET_USD=0.01`, ready to swap in.

## Recording tips

- **Phone screen:** use `scrcpy --record demo-phone.mp4`, or Android's own screen recorder with audio on.
- **Glasses audio:** the answers are spoken through the glasses' speakers, so record them with a phone or mic held near the glasses. Android's "device audio" recording option may capture the text-to-speech as well; check in a test take.
- **Your point of view:** a second phone filming over your shoulder at the item, or the app's live view on screen.
- Cut the dead air while Muse thinks, but keep at least one real wait in so judges see it's live.

## Shot list

| Time | On screen | Said / heard |
|---|---|---|
| 0:00 | A thrift store aisle or a bin of items, hands full. | **You:** "Resellers decide in seconds with their hands full. Guess wrong, and you're stuck with stock that doesn't sell." |
| 0:12 | Title card: **Reskale Glasses: Reskale tells you whether to buy it.** Ray-Ban Meta + Muse. | **You:** "So I put the decision in my glasses." |
| 0:20 | Glasses on. Phone on the Scan screen. | **You:** "Hey Meta, start Reskale." **Glasses:** "Reskale is opening…" *(Caption: experimental Meta feature, dev build.)* |
| 0:35 | Look at item **A**; press the glasses button. The phone shows "Muse is identifying it…" | **Glasses:** the item's name. Then: "I see a 4 dollar tag. Say Reskale, yes to use it." *(Caption: Muse Spark identified it and read the tag. The phone shows "Identified by muse-spark-1.3".)* |
| 0:55 | The market line fills in: sold median, sold, listed. | **You:** "Reskale, yes." |
| 1:05 | The **BUY** badge turns green. ✅ Keep $X after fees = N× your $4. ✅ NN% sell-through. | **Glasses:** "Buy it. It sells for about …, so you keep … after eBay fees, … times your 4 dollars. … percent sell through in 90 days." *(Caption: the rules decided; Muse said it.)* |
| 1:35 | Look at item **B**; press the button. Say its price. | **You:** "Reskale, it's 3 dollars." **Glasses:** "Pass. It sells too slowly: 12 percent sell through in 90 days, under 30." (Say the real numbers.) The **PASS** badge turns red. |
| 2:00 | Still on item B, or back to A. | **You:** "Reskale, what's it worth new?" **Glasses:** Muse answers from the scan's facts only. Optionally: "Reskale, who makes this?" |
| 2:20 | Editor: `lib/agent/buy-decision.ts`. Highlight `RETURN_MULTIPLE = 3`, `MIN_SELL_THROUGH = 0.3` and the `verdict` lines. Then the terminal: `npm test` → 303 passed. Then the architecture slide (the README's diagram). | **You:** "The call is two rules in code: 3 times my money after eBay fees, and over 30 percent sell-through. Muse identifies the item and explains, but it can't change the verdict. If it tries, the guard drops its sentence." |
| 2:45 | Terminal: Metro's log lines `[muse] muse-spark-1.3 … $0.00xx total=$…`, then `.muse-usage.json`. Optionally restart with `MUSE_BUDGET_USD=0.01`, scan, and hear the refusal. | **Glasses (optional):** "The Muse budget for this demo is used up." **You:** "Every Muse call is reserved, metered and capped at 150 dollars. Reskale Glasses: look at it, and know whether to buy it." |
| 2:58 | End card: github.com/gudeez/reskale-glasses | — |

## If something goes wrong on camera

- **Muse is slow:** keep recording; a real wait is fine.
- **No sold data ("No call"):** use a more common item. The agent saying it won't guess is also worth showing.
- **The glasses disconnect:** take them off and put them back on, then tap 🕶️ → Reconnect.
- **The voice misses "Reskale":** speak the wake word clearly and pause before the command.
