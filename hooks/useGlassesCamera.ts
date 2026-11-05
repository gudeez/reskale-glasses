// From the Reskale app: first written 2026-11-03, last changed 2026-11-04 (before this repo); changed here on 2026-11-04 for the hackathon. See HACKATHON.md.
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Alert } from 'react-native';
import * as Speech from 'expo-speech';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGlassesButton } from '@/hooks/useGlassesButton';
import { useGlassesVoice } from '@/hooks/useGlassesVoice';
import { useSoldMarket } from '@/hooks/useSoldMarket';
import type { EbaySearchResult } from '@/lib/ebay';
import type { FocusBox } from '@/lib/focus-crop';
import { DEFAULT_BOX, parseBox } from '@/lib/glasses/crop-box';
import { cropToBox } from '@/lib/glasses/crop-photo';
import {
  actionFor,
  createGestureReader,
  DONE,
  INTRO,
  MAX_SHOTS,
  modeAnnouncement,
  photoAnnouncement,
  STILL_SEARCHING,
  type Gesture,
} from '@/lib/glasses/hands-free';
import {
  answerQuestion,
  identitySentence,
  marketSentence,
  spokenSummary,
  type GlassesIdentity,
  type GlassesScanOutcome,
  type GlassesScanResult,
} from '@/lib/glasses/spoken-summary';
import type { Question, SpokenCondition, VoiceCommand } from '@/lib/glasses/voice-commands';
import type { CalculatorNumbers, ConditionFilter } from '@/lib/scan-types';
import { findEbayCategory, type EbayCategory } from '@/lib/ebay';
import { buyWeightAnswer, minListAnswer, shipCostAnswer, spokenMoney } from '@/lib/glasses/spoken-calculator';
import type { VisionResult } from '@/lib/google-vision';
import { decide, type BuyDecision } from '@/lib/agent/buy-decision';
import { spokenVerdict } from '@/lib/agent/spoken-verdict';
import { buyInputs, scanFacts } from '@/lib/agent/facts';
import { askMuse, explainVerdict } from '@/lib/agent/ask-client';
import { activeGlasses, useGlassesStore } from '@/store/glassesStore';

/** How a Scan-tab scan ended, as the glasses need to know it. */
export type ScanEnd =
  /** `priced`: a general scan, so its listings and sold prices follow and are read out. */
  | { kind: 'identified'; identity: GlassesIdentity; priced: boolean }
  | Exclude<GlassesScanOutcome, { kind: 'found' }>
  /** No photo to scan (the capture gave nothing back). */
  | { kind: 'no_photo' };

/** What the Scan tab does for the glasses: the same actions its own buttons run. */
export interface GlassesCameraHost {
  /** A scan is being identified; a press now is never queued (each would be billed). */
  busy: boolean;
  multiShot: boolean;
  staged: number;
  /** Barcode first (free), then the photo: one press, one scan at most. */
  scanPhoto(uri: string): Promise<ScanEnd>;
  /** Multi-shot: add a photo of this item. */
  stagePhoto(uri: string): Promise<void>;
  scanStaged(): Promise<ScanEnd>;
  /** Returns how many staged photos were dropped. */
  setMultiShot(on: boolean): number;
  /** Abandon the scan being identified. False when none was. */
  cancel(): boolean;
  /** Search these words instead (the sheet's "search again"); the photo isn't scanned again. */
  research(query: string): void;
  /** The sheet's condition filter. */
  setCondition(condition: ConditionFilter): void;
  /** Listings from this eBay category only; null is every category. */
  setCategory(category: EbayCategory | null): void;
  /** Open the sheet's profit calculator with these numbers in. */
  fillCalculator(numbers: CalculatorNumbers): void;
}

/** The scan on the result sheet now. */
export interface SheetNow {
  vision: VisionResult | null;
  ebay: EbaySearchResult | null;
  listingsLoading: boolean;
  /** Words the seller searched instead of what the scan found. */
  typedQuery: string | null;
}

/** "Reskale, condition …" on a result: the listings filter it means. */
const FILTER_FOR: Record<SpokenCondition, ConditionFilter> = {
  new: 'new',
  like_new: 'open_box',
  good: 'used',
  fair: 'used',
  for_parts: 'for_parts',
};

const FILTER_SAID: Record<ConditionFilter, string> = {
  all: 'Showing every condition.',
  new: 'Showing new.',
  used: 'Showing used.',
  open_box: 'Showing open box.',
  for_parts: 'Showing for parts.',
};

const LIVE_VIEW_KEY = 'glasses.liveView';
const BOX_ON_KEY = 'glasses.cropBoxOn';
const BOX_KEY = 'glasses.cropBox';
const SPEAK_KEY = 'glasses.speak';
const INTRO_KEY = 'glasses.introSaid';
const KEEP_AWAKE_TAG = 'glasses-scan';
/** How long "Reskale, yes" has to accept a price tag Muse read. */
const CONFIRM_WINDOW_MS = 15_000;
const CAPTURE_FAILED = 'Couldn’t take a photo. Press the button on your glasses to try again.';
const NO_LISTINGS: EbaySearchResult = { items: [], avgPriceUsed: null, avgPriceNew: null, totalResults: 0 };
const NO_ANSWER = 'I can’t answer that right now.';

/** A recognised question, in words Muse can answer. */
const QUESTION_WORDS: Record<Question, string> = {
  identity: 'What is it?',
  price: 'What does it sell for?',
  new_price: 'What does it sell for new?',
  used_price: 'What does it sell for used?',
  sold_count: 'How many sold in 90 days?',
  listed_count: 'How many are listed now?',
  sell_through: 'What is the sell-through rate?',
};

/** The words the result sheet prices by: what the seller searched, else what the scan found. */
function sheetQuery({ vision, typedQuery }: SheetNow): string {
  return typedQuery ?? vision?.searchQuery ?? vision?.bestGuessLabel ?? '';
}

/**
 * The glasses as the Scan tab's camera: the button, "Reskale, …" and the live
 * view drive the tab's own scan, and its result is read aloud from what the
 * result sheet shows. Does nothing while `enabled` is false (phone camera, or
 * the tab out of view).
 *
 *   press         single shot: photograph and scan; multi-shot: add a photo
 *   double press  multi-shot with photos: scan them; otherwise stop talking
 *   triple press  switch single shot / multi-shot
 *   hold          say the last result again (free)
 */
export function useGlassesCamera({
  enabled,
  sheet,
  hostRef,
}: {
  enabled: boolean;
  sheet: SheetNow;
  hostRef: MutableRefObject<GlassesCameraHost | null>;
}) {
  const connected = useGlassesStore((s) => s.connection === 'connected');
  const [liveView, setLiveView] = useState(true);
  // On until the seller turns it off: the glasses see a whole room, and a busy
  // background is what most often makes a scan miss.
  const [boxOn, setBoxOn] = useState(true);
  const [box, setBox] = useState<FocusBox>(DEFAULT_BOX);
  const [speak, setSpeak] = useState(true);
  const [capturing, setCapturing] = useState(false);
  /** A priced scan whose market sentence is still to be said. */
  const [awaitingMarket, setAwaitingMarket] = useState(false);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const cropRef = useRef<FocusBox | null>(null);
  cropRef.current = liveView && boxOn ? box : null;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const capturingRef = useRef(false);
  /** Set by a double press: the scan in flight finishes on screen without talking. */
  const quietRef = useRef(false);
  const lastSpokenRef = useRef<string | null>(null);
  /** The last scan as read out, for "Reskale, what does it sell for?". */
  const lastResultRef = useRef<GlassesScanResult | null>(null);
  const identityRef = useRef<GlassesIdentity | null>(null);
  /** A price tag Muse read, waiting for "Reskale, yes". */
  const pendingTagRef = useRef<{ dollars: number; at: number } | null>(null);
  /** The agent: what the store wants for this item, and the call on it. */
  const [buyPrice, setBuyPriceState] = useState<number | null>(null);
  const buyPriceRef = useRef<number | null>(null);
  const [decision, setDecision] = useState<BuyDecision | null>(null);
  const decisionRef = useRef<BuyDecision | null>(null);
  /** The verdict as last said, for "Reskale, should I buy it?". */
  const verdictSaidRef = useRef<string | null>(null);
  /** Each new verdict outdates a Muse explanation still on its way. */
  const verdictSeqRef = useRef(0);

  useEffect(() => {
    AsyncStorage.multiGet([LIVE_VIEW_KEY, BOX_ON_KEY, BOX_KEY, SPEAK_KEY])
      .then(([[, live], [, on], [, savedBox], [, talk]]) => {
        if (live !== null) setLiveView(live === '1');
        if (on !== null) setBoxOn(on === '1');
        if (talk !== null) setSpeak(talk === '1');
        setBox(parseBox(savedBox));
      })
      .catch(() => undefined);
    return () => void Speech.stop();
  }, []);

  // Meta's toolkit stops the camera when the app goes to the background.
  useEffect(() => {
    if (!enabled) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [enabled]);

  /** Say something now, cutting off whatever was being said. */
  const say = useCallback((text: string, { remember = true }: { remember?: boolean } = {}) => {
    if (remember) lastSpokenRef.current = text;
    if (!speakRef.current || !enabledRef.current) return;
    void Speech.stop();
    Speech.speak(text);
  }, []);

  /** Say something after what is being said now (part B after part A). */
  const sayNext = useCallback((text: string) => {
    if (!speakRef.current || !enabledRef.current || quietRef.current) return;
    Speech.speak(text);
  }, []);

  // The first time glasses are ready here, say how they work — once ever.
  useEffect(() => {
    if (!enabled || !connected) return;
    AsyncStorage.getItem(INTRO_KEY)
      .then((said) => {
        if (said) return;
        AsyncStorage.setItem(INTRO_KEY, '1').catch(() => undefined);
        say(INTRO, { remember: false });
      })
      .catch(() => undefined);
  }, [enabled, connected, say]);

  // ── Part B: the market, once the listings and sold prices are in ──
  const market = useSoldMarket(awaitingMarket ? sheetQuery(sheet) : '');
  useEffect(() => {
    if (!awaitingMarket || sheet.listingsLoading) return;
    if (market.loading || market.query !== sheetQuery(sheet).trim()) return;
    const identity = identityRef.current;
    const result: GlassesScanResult = {
      title: sheetQuery(sheet) || identity?.title || '',
      condition: identity?.condition ?? null,
      ebay: sheet.ebay ?? NO_LISTINGS,
      sold: market.answer,
      listedNow: market.answer?.activeTotal ?? null,
      soldError: market.error ? 'failed' : null,
    };
    lastResultRef.current = result;
    lastSpokenRef.current = spokenSummary({ kind: 'found', result });
    sayNext(marketSentence(result));
    setAwaitingMarket(false);
    judge(result, true);
  }, [awaitingMarket, sheet, market, sayNext]);

  // ── Part C: the agent's call, by the rules; Muse only says it ──
  function setBuyPrice(dollars: number | null) {
    buyPriceRef.current = dollars;
    setBuyPriceState(dollars);
  }

  /** Decide on `result` and say the verdict; `queued` waits for what is being said now. */
  function judge(result: GlassesScanResult, queued: boolean) {
    const d = decide(buyInputs(result, buyPriceRef.current));
    decisionRef.current = d;
    setDecision(d);
    const own = spokenVerdict(d);
    verdictSaidRef.current = own;
    const speak = queued ? sayNext : (text: string) => say(text, { remember: false });

    if (d.verdict === 'NEED_PRICE') {
      const tag = sheetRef.current.vision?.priceTagUsd ?? null;
      if (tag) {
        pendingTagRef.current = { dollars: tag, at: Date.now() };
        return speak(`I see a ${spokenMoney(tag)} tag. Say Reskale, yes to use it.`);
      }
      return speak(own);
    }
    if (d.verdict !== 'BUY' && d.verdict !== 'PASS') return speak(own);

    const seq = ++verdictSeqRef.current;
    const facts = scanFacts(result, buyPriceRef.current, d);
    if (!facts) return speak(own);
    void explainVerdict(facts, own).then((muse) => {
      if (seq !== verdictSeqRef.current) return;
      const words = muse ?? own;
      verdictSaidRef.current = words;
      speak(words);
    });
  }

  /** "Reskale, it's 5 dollars", a tag accepted, or the price typed on screen. */
  function priceSaid(dollars: number) {
    setBuyPrice(dollars);
    const result = lastResultRef.current;
    if (!result || awaitingMarket) {
      // The verdict follows once the market is in.
      return say(`Got it, ${spokenMoney(dollars)}.`, { remember: false });
    }
    judge(result, false);
  }

  /** Run one scan and say how it went: what it is at once, the market when it's in. */
  async function run(start: () => Promise<ScanEnd>) {
    void Speech.stop();
    quietRef.current = false;
    setAwaitingMarket(false);
    // A new item: a new price and a new call.
    verdictSeqRef.current++;
    pendingTagRef.current = null;
    verdictSaidRef.current = null;
    decisionRef.current = null;
    setDecision(null);
    setBuyPrice(null);
    const end = await start();
    switch (end.kind) {
      case 'identified':
        identityRef.current = end.identity;
        lastResultRef.current = { ...end.identity, ebay: NO_LISTINGS, sold: null, listedNow: null, soldError: null };
        if (!quietRef.current) say(identitySentence(end.identity));
        if (end.priced) setAwaitingMarket(true);
        return;
      case 'cancelled':
        // "Cancelled." was said when the seller asked; only the cost is news.
        if (end.scanUsed) sayNext('That scan was already used.');
        return;
      case 'no_photo':
        return;
      default:
        if (!quietRef.current) say(spokenSummary(end));
    }
  }

  /** One photo at a time: the glasses refuse a second while one is being taken. */
  async function takePhoto(): Promise<string | null> {
    if (capturingRef.current) return null;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const { uri } = await activeGlasses().capturePhoto('scan');
      // The box is what the seller aimed at; the glasses saw much more.
      const crop = cropRef.current;
      return crop ? await cropToBox(uri, crop, useGlassesStore.getState().frameAspect) : uri;
    } catch (err) {
      // The glasses layer writes its errors for sellers already.
      const message = err instanceof Error && err.message ? err.message : CAPTURE_FAILED;
      say(spokenSummary({ kind: 'failed' }));
      Alert.alert('Couldn’t take a photo', message);
      return null;
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }

  async function capture() {
    const before = hostRef.current;
    if (!before) return;
    const count = before.staged + 1;
    const uri = await takePhoto();
    // The photo took a moment: act through the latest render's host.
    const host = hostRef.current;
    if (!uri || !host) return;
    if (!before.multiShot) {
      await run(() => host.scanPhoto(uri));
      return;
    }
    await host.stagePhoto(uri);
    say(photoAnnouncement(count), { remember: false });
    if (count >= MAX_SHOTS) await run(() => host.scanStaged());
  }

  function scanStaged() {
    const host = hostRef.current;
    if (!host || host.staged === 0) return;
    void run(() => host.scanStaged());
  }

  function toggleMode() {
    const host = hostRef.current;
    if (!host) return;
    const next = !host.multiShot;
    const dropped = host.setMultiShot(next);
    say(modeAnnouncement(next ? 'multi' : 'single', dropped), { remember: false });
  }

  /** Stop talking; a scan still running finishes on screen, silently. */
  function end() {
    const busy = capturingRef.current || (hostRef.current?.busy ?? false);
    quietRef.current = busy;
    setAwaitingMarket(false);
    void Speech.stop();
    if (!busy) say(DONE, { remember: false });
  }

  function cancel() {
    if (!hostRef.current?.cancel()) return;
    setAwaitingMarket(false);
    quietRef.current = false;
    say('Cancelled.', { remember: false });
  }

  function repeat() {
    if (!lastSpokenRef.current || !speakRef.current) return;
    quietRef.current = false;
    void Speech.stop();
    Speech.speak(lastSpokenRef.current);
  }

  const handle = (gesture: Gesture) => {
    const host = hostRef.current;
    if (!host) return;
    const action = actionFor(gesture, {
      busy: capturingRef.current || host.busy,
      shotMode: host.multiShot ? 'multi' : 'single',
      staged: host.staged,
    });
    switch (action) {
      case 'capture':
        return void capture();
      case 'search_set':
        return scanStaged();
      case 'end':
        return end();
      case 'repeat':
        return repeat();
      case 'toggle_mode':
        return toggleMode();
      case 'still_searching':
        return say(STILL_SEARCHING, { remember: false });
    }
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const readerRef = useRef<ReturnType<typeof createGestureReader> | null>(null);
  readerRef.current ??= createGestureReader((gesture) => handleRef.current(gesture));
  useEffect(() => () => readerRef.current?.cancel(), []);
  useGlassesButton((press) => {
    if (enabledRef.current) readerRef.current?.press(press);
  });

  /** "Reskale, …" — the same actions as the button, plus questions and a spoken price. */
  const onVoice = (command: VoiceCommand) => {
    const host = hostRef.current;
    if (!host) return;
    switch (command.kind) {
      case 'scan':
        return handle('single');
      case 'search_set':
        if (host.staged === 0) return say('No photos yet. Say Reskale, scan.', { remember: false });
        return scanStaged();
      case 'end':
        return end();
      case 'repeat':
        return repeat();
      case 'cancel':
        return cancel();
      case 'mode':
        if (capturingRef.current || host.busy) return say(STILL_SEARCHING, { remember: false });
        if ((command.mode === 'multi') === host.multiShot) return say(modeAnnouncement(command.mode, 0), { remember: false });
        return toggleMode();
      case 'ask':
        return void answer(QUESTION_WORDS[command.question], answerQuestion(command.question, lastResultRef.current));
      case 'free_ask':
        return void answer(command.text, lastResultRef.current ? NO_ANSWER : 'Scan something first.');
      case 'should_buy':
        if (!lastResultRef.current) return say('Scan something first.', { remember: false });
        if (awaitingMarket || host.busy) return say(STILL_SEARCHING, { remember: false });
        if (verdictSaidRef.current && decisionRef.current?.verdict !== 'NEED_PRICE') {
          return say(verdictSaidRef.current, { remember: false });
        }
        return judge(lastResultRef.current, false);
      case 'cost':
        if (!sheetRef.current.vision && !lastResultRef.current) return say('Scan something first.', { remember: false });
        pendingTagRef.current = null;
        return priceSaid(command.dollars);
      case 'yes': {
        const pending = pendingTagRef.current;
        pendingTagRef.current = null;
        if (!pending || Date.now() - pending.at > CONFIRM_WINDOW_MS) return;
        return priceSaid(pending.dollars);
      }
      case 'no':
        if (pendingTagRef.current) say('Okay. Say the price, like: Reskale, it’s 5 dollars.', { remember: false });
        pendingTagRef.current = null;
        return;
      case 'search_for':
        if (!sheetRef.current.vision) return say('Scan something first.', { remember: false });
        if (capturingRef.current || host.busy) return say(STILL_SEARCHING, { remember: false });
        identityRef.current = { title: command.query, condition: identityRef.current?.condition ?? null };
        return reprice(`Searching for ${command.query}.`, () => host.research(command.query));
      case 'condition':
      case 'all_conditions': {
        if (!sheetRef.current.vision) return say('Scan something first.', { remember: false });
        const filter = command.kind === 'all_conditions' ? 'all' : FILTER_FOR[command.condition];
        return reprice(FILTER_SAID[filter], () => host.setCondition(filter));
      }
      case 'search_category':
        if (!sheetRef.current.vision) return say('Scan something first.', { remember: false });
        if (capturingRef.current || host.busy) return say(STILL_SEARCHING, { remember: false });
        if (command.category === null) return reprice('Searching every category.', () => host.setCategory(null));
        return void searchCategory(command.category);
      case 'min_list':
        if (command.dollars === null) {
          return say('Say what you paid, like: Reskale, minimum list price based on 5 dollars.', { remember: false });
        }
        host.fillCalculator({ tab: 'price', buyPrice: command.dollars });
        return say(minListAnswer(command.dollars, sheetRef.current.vision?.condition ?? null), { remember: false });
      case 'buy_weight':
        if (command.pounds === null) {
          return say('Say the weight, like: Reskale, cost to purchase at 3 pounds.', { remember: false });
        }
        host.fillCalculator({ tab: 'weight', pounds: command.pounds });
        return say(buyWeightAnswer(command.pounds, sheetRef.current.vision?.condition ?? null), { remember: false });
      case 'ship_cost':
        if (command.pounds !== null || command.box !== null) {
          host.fillCalculator({ tab: 'shipping', pounds: command.pounds, box: command.box });
        }
        return say(shipCostAnswer(command.pounds, command.box), { remember: false });
    }
  };

  /** "Reskale, search in video games category only": find eBay's category by that name, then search it. */
  async function searchCategory(name: string) {
    say(`Looking for ${name}.`, { remember: false });
    let category: EbayCategory | null;
    try {
      category = await findEbayCategory(name);
    } catch (err) {
      return say(err instanceof Error ? err.message : 'Couldn’t reach eBay. Try again in a moment.', { remember: false });
    }
    if (!category) return say(`eBay has no category called ${name}. Try another name.`, { remember: false });
    // The lookup took a moment: act through the latest render's host.
    const host = hostRef.current;
    if (!host || !sheetRef.current.vision) return;
    reprice(`Searching ${category.categoryName} only.`, () => host.setCategory(category));
  }

  /** Muse answers from the last scan; `fallback` is said when it can't. */
  async function answer(question: string, fallback: string) {
    if (!lastResultRef.current) return say(fallback, { remember: false });
    const facts = scanFacts(lastResultRef.current, buyPriceRef.current, decisionRef.current);
    const muse = await askMuse(question, facts);
    say(muse ?? fallback, { remember: false });
  }

  /** Change what the sheet is priced by, then read the new market out once it's in. */
  function reprice(sentence: string, change: () => void) {
    quietRef.current = false;
    say(sentence, { remember: false });
    change();
    setAwaitingMarket(true);
  }
  useGlassesVoice((command) => {
    if (enabledRef.current) onVoice(command);
  });

  return {
    connected,
    capturing,
    /** The agent's call on the item on screen; null until there is one. */
    decision,
    buyPrice,
    /** The price typed on screen: the same as saying it. */
    enterPrice: (dollars: number) => {
      if (Number.isFinite(dollars) && dollars > 0) priceSaid(Math.round(dollars * 100) / 100);
    },
    /** The market lookup behind the result, for the screen. */
    market,
    /** Search typed on screen: the same as "Reskale, search for …". */
    search: (query: string) => {
      const q = query.trim();
      const host = hostRef.current;
      if (!q || !host || !sheetRef.current.vision || capturingRef.current || host.busy) return;
      identityRef.current = { title: q, condition: identityRef.current?.condition ?? null };
      reprice(`Searching for ${q}.`, () => host.research(q));
    },
    /** The on-screen shutter does what a press of the glasses button does. */
    shoot: () => handle('single'),
    /** The on-screen "Scan 3 photos": the multi-shot set, read aloud as a press would be. */
    scanSet: scanStaged,
    cancel,
    liveView,
    toggleLiveView: (on: boolean) => {
      setLiveView(on);
      AsyncStorage.setItem(LIVE_VIEW_KEY, on ? '1' : '0').catch(() => undefined);
    },
    boxOn,
    toggleBox: (on: boolean) => {
      setBoxOn(on);
      AsyncStorage.setItem(BOX_ON_KEY, on ? '1' : '0').catch(() => undefined);
    },
    box,
    setBox,
    /** Saved when the finger lifts, not on every move. */
    saveBox: () => AsyncStorage.setItem(BOX_KEY, JSON.stringify(box)).catch(() => undefined),
    speak,
    toggleSpeak: (on: boolean) => {
      setSpeak(on);
      if (!on) void Speech.stop();
      AsyncStorage.setItem(SPEAK_KEY, on ? '1' : '0').catch(() => undefined);
    },
  };
}
