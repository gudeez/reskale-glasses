// Hackathon (Nov 4 2026): the Scan screen. The glasses photograph the item,
// Muse identifies it, eBay prices it, and the agent says buy or pass.
//
// It is the host useGlassesCamera drives (the button, "Reskale, …" and the
// live view): the same actions as the Scan tab of the Reskale app, slimmed to
// one result card.

import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassesViewfinder } from '@/components/glasses/source/GlassesViewfinder';
import { GlassesConnectPrompt, GlassesToggles } from '@/components/glasses/source/GlassesScanControls';
import { useGlassesCamera, type GlassesCameraHost, type ScanEnd, type SheetNow } from '@/hooks/useGlassesCamera';
import { VERDICT_LABEL } from '@/lib/agent/spoken-verdict';
import { RETURN_MULTIPLE, MIN_SELL_THROUGH, type BuyDecision } from '@/lib/agent/buy-decision';
import { searchEbay, searchEbayByBarcode, type EbaySearchResult } from '@/lib/ebay';
import type { EbayCategory } from '@/lib/ebay-category-match';
import { pickProductBarcode } from '@/lib/glasses/barcode';
import { readBarcodesFromPhoto } from '@/lib/glasses/read-barcodes';
import { analyzeImage, type VisionResult } from '@/lib/google-vision';
import { prepareScanImage } from '@/lib/prepare-scan-image';
import { readBase64 } from '@/lib/read-base64';
import type { ConditionFilter } from '@/lib/scan-types';
import { lookupBarcodeProduct } from '@/lib/upc';
import { useGlassesStore } from '@/store/glassesStore';

const MAX_SHOTS = 4;

const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`);

/** A barcode's product, as the scan result the rest of the app reads. No AI call: free. */
function barcodeVision(title: string, brand: string | null, category: string | null): VisionResult {
  return {
    brand: brand ?? '',
    model: '',
    category: category ?? 'General',
    condition: 'Used',
    conditionSeen: false,
    bestGuessLabel: title,
    searchQuery: title,
    webEntities: [{ description: title, score: 1 }],
    matchingPages: [],
    suggestedQueries: [],
    priceTagUsd: null,
    identifiedBy: 'barcode',
  };
}

async function frameOf(uri: string): Promise<string> {
  return readBase64(await prepareScanImage(uri));
}

async function barcodeIn(uri: string): Promise<string | null> {
  try {
    return pickProductBarcode(await readBarcodesFromPhoto(uri));
  } catch {
    return null;
  }
}

export default function ScanScreen() {
  const connected = useGlassesStore((s) => s.connection === 'connected');
  // The glasses send a tall portrait frame; a short box shrinks it to a sliver.
  const viewfinderHeight = Math.round(useWindowDimensions().height * 0.55);
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [ebay, setEbay] = useState<EbaySearchResult | null>(null);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [typedQuery, setTypedQuery] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiShot, setMultiShot] = useState(false);
  const [staged, setStaged] = useState<string[]>([]);
  const stagedRef = useRef<string[]>([]);
  const [condition, setCondition] = useState<ConditionFilter>('all');
  const [category, setCategory] = useState<EbayCategory | null>(null);
  const [priceText, setPriceText] = useState('');
  /** The search words being edited; null shows the query the result is priced by. */
  const [searchText, setSearchText] = useState<string | null>(null);
  const scanIdRef = useRef(0);

  /** List eBay listings for `query`; a newer scan or search wins. */
  function list(query: string, filter: ConditionFilter, cat: EbayCategory | null) {
    const id = scanIdRef.current;
    setListingsLoading(true);
    searchEbay(query, filter === 'all' ? undefined : filter, [], cat?.categoryId ?? null)
      .then((result) => {
        if (id === scanIdRef.current) setEbay(result?.items ? result : null);
      })
      .catch(() => {
        if (id === scanIdRef.current) setEbay(null);
      })
      .finally(() => {
        if (id === scanIdRef.current) setListingsLoading(false);
      });
  }

  function startScan(): number {
    const id = ++scanIdRef.current;
    setIdentifying(true);
    setError(null);
    setVision(null);
    setEbay(null);
    setTypedQuery(null);
    setCondition('all');
    setCategory(null);
    setPriceText('');
    setSearchText(null);
    return id;
  }

  /** Photos → Muse → eBay. One identify call per scan. */
  async function identify(id: number, frames: string[], hint?: string): Promise<ScanEnd> {
    try {
      const found = await analyzeImage(frames, hint);
      if (id !== scanIdRef.current) return { kind: 'cancelled', scanUsed: true };
      setVision(found);
      // Before saying "identified", so the market waits for these listings.
      list(found.searchQuery, 'all', null);
      return {
        kind: 'identified',
        identity: { title: found.searchQuery, condition: found.conditionSeen ? found.condition : null },
        priced: true,
      };
    } catch (err) {
      if (id !== scanIdRef.current) return { kind: 'cancelled', scanUsed: false };
      setError(err instanceof Error ? err.message : 'Couldn’t identify that. Try again.');
      return { kind: 'failed' };
    } finally {
      if (id === scanIdRef.current) setIdentifying(false);
    }
  }

  /** A glasses photo: the barcode first (free), else the photo (one Muse call). */
  async function scanPhoto(uri: string): Promise<ScanEnd> {
    const id = startScan();
    const code = await barcodeIn(uri);
    if (code) {
      const [product, byCode] = await Promise.all([
        lookupBarcodeProduct(code),
        searchEbayByBarcode(code).catch(() => null),
      ]);
      if (id !== scanIdRef.current) return { kind: 'cancelled', scanUsed: false };
      const title = product?.title ?? byCode?.items?.[0]?.title ?? null;
      if (title) {
        const found = barcodeVision(title, product?.brand ?? null, product?.category ?? null);
        setVision(found);
        setIdentifying(false);
        if (byCode?.items?.length) setEbay(byCode);
        else list(title, 'all', null);
        return { kind: 'identified', identity: { title, condition: null }, priced: true };
      }
    }
    let frame: string;
    try {
      frame = await frameOf(uri);
    } catch {
      setIdentifying(false);
      setError('Couldn’t read that photo. Take it again.');
      return { kind: 'failed' };
    }
    return identify(id, [frame], code ?? undefined);
  }

  const sheet: SheetNow = { vision, ebay, listingsLoading, typedQuery };
  const hostRef = useRef<GlassesCameraHost | null>(null);
  hostRef.current = {
    busy: identifying,
    multiShot,
    staged: staged.length,
    scanPhoto,
    stagePhoto: async (uri) => {
      const frame = await frameOf(uri);
      const next = [...stagedRef.current, frame].slice(0, MAX_SHOTS);
      stagedRef.current = next;
      setStaged(next);
    },
    scanStaged: async () => {
      const frames = stagedRef.current;
      stagedRef.current = [];
      setStaged([]);
      if (frames.length === 0) return { kind: 'no_photo' };
      return identify(startScan(), frames);
    },
    setMultiShot: (on) => {
      const dropped = on ? 0 : stagedRef.current.length;
      setMultiShot(on);
      if (!on) {
        stagedRef.current = [];
        setStaged([]);
      }
      return dropped;
    },
    cancel: () => {
      if (!identifying) return false;
      scanIdRef.current += 1;
      setIdentifying(false);
      return true;
    },
    research: (query) => {
      setTypedQuery(query);
      list(query, condition, category);
    },
    setCondition: (filter) => {
      setCondition(filter);
      list(typedQuery ?? vision?.searchQuery ?? '', filter, category);
    },
    setCategory: (cat) => {
      setCategory(cat);
      list(typedQuery ?? vision?.searchQuery ?? '', condition, cat);
    },
    // The calculator's answer is spoken; this app has no calculator card.
    fillCalculator: () => undefined,
  };

  const cam = useGlassesCamera({ enabled: true, sheet, hostRef });
  const query = typedQuery ?? vision?.searchQuery ?? null;
  const runSearch = () => {
    const q = searchText?.trim();
    if (q && q !== query) cam.search(q);
    setSearchText(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-0" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-1">
        <Text className="text-white text-xl font-bold">Reskale Glasses</Text>
        <TouchableOpacity onPress={() => router.push('/glasses' as never)} accessibilityLabel="Glasses settings">
          <Text className="text-brand-300 text-sm">🕶️ {connected ? 'Connected' : 'Connect'}</Text>
        </TouchableOpacity>
      </View>

      <View className="px-4">
        <GlassesToggles
          liveView={cam.liveView}
          onLiveView={cam.toggleLiveView}
          boxOn={cam.boxOn}
          onBox={cam.toggleBox}
          speak={cam.speak}
          onSpeak={cam.toggleSpeak}
        />
      </View>

      <View className="mx-4 mt-3 rounded-2xl overflow-hidden bg-black" style={{ height: viewfinderHeight }}>
        {connected && cam.liveView ? (
          <GlassesViewfinder showBox={cam.boxOn} box={cam.box} onBoxChange={cam.setBox} onDragging={(d) => !d && cam.saveBox()} />
        ) : connected ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted text-sm">Live view is off. Press your glasses button to scan.</Text>
          </View>
        ) : (
          <GlassesConnectPrompt />
        )}
      </View>

      <View className="flex-row items-center gap-2 px-4 mt-3">
        <TouchableOpacity
          onPress={cam.shoot}
          disabled={!connected || cam.capturing}
          className={`flex-1 rounded-xl py-3 items-center ${connected ? 'bg-brand-500' : 'bg-surface-3'}`}
        >
          <Text className="text-white font-bold">{cam.capturing ? 'Taking photo…' : multiShot ? `Add photo (${staged.length}/${MAX_SHOTS})` : 'Scan'}</Text>
        </TouchableOpacity>
        {multiShot && staged.length > 0 && (
          <TouchableOpacity onPress={cam.scanSet} className="rounded-xl py-3 px-4 bg-surface-3">
            <Text className="text-white font-semibold">Scan {staged.length}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => hostRef.current?.setMultiShot(!multiShot)}
          className={`rounded-xl py-3 px-3 ${multiShot ? 'bg-brand-700' : 'bg-surface-3'}`}
        >
          <Text className="text-white text-xs">Multi-shot</Text>
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1 mt-3" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {identifying && (
          <View className="flex-row items-center gap-2 py-3">
            <ActivityIndicator color="#0ea5e9" />
            <Text className="text-white">Muse is identifying it…</Text>
            <TouchableOpacity onPress={cam.cancel} className="ml-auto">
              <Text className="text-brand-300">Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
        {error && <Text className="text-danger text-sm py-2">{error}</Text>}

        {vision && query && (
          <View className="bg-surface-1 rounded-2xl p-4">
            <View className="flex-row items-start gap-3">
              <View className="flex-1">
                <Text className="text-white text-lg font-bold">{query}</Text>
                <Text className="text-muted text-xs mt-1">
                  {vision.conditionSeen ? `${vision.condition} · ` : ''}
                  {vision.identifiedBy === 'barcode' ? 'From its barcode' : `Identified by ${vision.identifiedBy ?? 'Muse'}`}
                  {vision.confidence != null && vision.identifiedBy !== 'barcode' ? ` · ${Math.round(vision.confidence * 100)}% sure` : ''}
                </Text>
              </View>
              {cam.decision && <VerdictBadge decision={cam.decision} />}
            </View>

            <View className="flex-row items-center gap-2 mt-3">
              <TextInput
                value={searchText ?? query}
                onChangeText={setSearchText}
                placeholder="eBay search words"
                placeholderTextColor="#71717a"
                autoCorrect={false}
                returnKeyType="search"
                className="flex-1 bg-surface-2 text-white rounded-xl px-3 py-2"
                onSubmitEditing={runSearch}
              />
              <TouchableOpacity onPress={runSearch} disabled={listingsLoading || cam.market.loading} className="bg-surface-3 rounded-xl px-4 py-2">
                <Text className="text-white font-semibold">Search</Text>
              </TouchableOpacity>
            </View>
            <Text className="text-muted text-xs mt-1">Too few sales? Use fewer words: brand and model only.</Text>

            <View className="flex-row items-center gap-2 mt-3">
              <TextInput
                value={priceText}
                onChangeText={setPriceText}
                keyboardType="decimal-pad"
                placeholder={cam.buyPrice != null ? `Price $${cam.buyPrice}` : vision.priceTagUsd ? `Tag says $${vision.priceTagUsd}` : 'Store price'}
                placeholderTextColor="#71717a"
                className="flex-1 bg-surface-2 text-white rounded-xl px-3 py-2"
                onSubmitEditing={() => cam.enterPrice(Number(priceText))}
              />
              <TouchableOpacity onPress={() => cam.enterPrice(Number(priceText))} className="bg-surface-3 rounded-xl px-4 py-2">
                <Text className="text-white font-semibold">Buy or pass?</Text>
              </TouchableOpacity>
            </View>

            {cam.decision && <Reasons decision={cam.decision} />}

            <Market sold={cam.market} ebay={ebay} loading={listingsLoading} />
          </View>
        )}

        {!vision && !identifying && !error && (
          <Text className="text-muted text-sm leading-5">
            Look at an item and press your glasses button, or say “Reskale, scan”. Then say the price (“Reskale, it’s 5 dollars”) and Reskale tells you
            whether to buy it: at least {RETURN_MULTIPLE}× your money after eBay fees, and over {Math.round(MIN_SELL_THROUGH * 100)}% of listings selling in 90
            days.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const BADGE: Record<BuyDecision['verdict'], string> = {
  BUY: 'bg-success',
  PASS: 'bg-danger',
  NEED_PRICE: 'bg-warning',
  NOT_ENOUGH_DATA: 'bg-surface-3',
};

function VerdictBadge({ decision }: { decision: BuyDecision }) {
  return (
    <View className={`rounded-xl px-3 py-2 ${BADGE[decision.verdict]}`}>
      <Text className="text-white font-black text-base">{VERDICT_LABEL[decision.verdict]}</Text>
    </View>
  );
}

function Rule({ ok, text }: { ok: boolean | null; text: string }) {
  return (
    <Text className="text-white text-sm mt-1">
      {ok === null ? '◦' : ok ? '✅' : '❌'} {text}
    </Text>
  );
}

function Reasons({ decision: d }: { decision: BuyDecision }) {
  return (
    <View className="mt-3">
      <Rule
        ok={d.money}
        text={
          d.netAfterFees === null
            ? 'No sold price yet'
            : d.buyPrice === null
              ? `Keep ${money(d.netAfterFees)} after fees · pay up to ${money(d.maxBuyPrice)} for ${RETURN_MULTIPLE}×`
              : `Keep ${money(d.netAfterFees)} after fees = ${(d.multiple ?? 0).toFixed(1)}× your ${money(d.buyPrice)} (need ${RETURN_MULTIPLE}×)`
        }
      />
      <Rule
        ok={d.speed}
        text={d.sellThrough === null ? 'Sell-through unknown' : `${Math.round(d.sellThrough * 100)}% sell-through in 90 days (need over ${Math.round(MIN_SELL_THROUGH * 100)}%)`}
      />
    </View>
  );
}

function Market({ sold, ebay, loading }: { sold: ReturnType<typeof useGlassesCamera>['market']; ebay: EbaySearchResult | null; loading: boolean }) {
  const answer = sold.answer;
  return (
    <View className="mt-4 border-t border-surface-3 pt-3">
      {sold.loading ? (
        <Text className="text-muted text-sm">Getting eBay sold prices…</Text>
      ) : sold.error ? (
        <Text className="text-danger text-sm">{sold.error}</Text>
      ) : answer ? (
        <Text className="text-white text-sm">
          Sold (90 days): <Text className="text-success font-bold">{money(answer.summary?.median)}</Text> typical ·{' '}
          <Text className="font-bold">{answer.soldTotal ?? '—'}</Text> sold · <Text className="font-bold">{answer.activeTotal ?? '—'}</Text> listed
        </Text>
      ) : null}
      {loading ? (
        <Text className="text-muted text-sm mt-1">Getting eBay listings…</Text>
      ) : ebay ? (
        <>
          <Text className="text-muted text-xs mt-1">
            Asking now: used {money(ebay.avgPriceUsed)} · new {money(ebay.avgPriceNew)}
          </Text>
          {ebay.items.slice(0, 3).map((item) => (
            <Text key={item.itemId} className="text-white text-xs mt-1" numberOfLines={1}>
              {money(item.price)} · {item.title}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}
