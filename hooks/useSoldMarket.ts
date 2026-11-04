// Hackathon (Nov 4 2026): what a search sold for on eBay, and how many are
// listed now, from this app's /api/sold (ScrapeBadger). One lookup per search.

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api-config';
import type { SoldAnswer } from '@/lib/sold-comps/sold';

export interface SoldMarket {
  /** The words this state is for; '' before any search. */
  query: string;
  loading: boolean;
  answer: SoldAnswer | null;
  /** Plain English, for the screen; null when it worked. */
  error: string | null;
}

const IDLE: SoldMarket = { query: '', loading: false, answer: null, error: null };
const FAILED = 'Couldn’t get sold prices. Try again in a moment.';
const TIMEOUT_MS = 30_000;

export function useSoldMarket(query: string): SoldMarket {
  const [state, setState] = useState<SoldMarket>(IDLE);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    setState({ query: q, loading: true, answer: null, error: null });
    fetch(`${API_BASE_URL}/api/sold?query=${encodeURIComponent(q)}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (SoldAnswer & { error?: string }) | null;
        if (!live) return;
        if (!res.ok || !body) setState({ query: q, loading: false, answer: null, error: body?.error || FAILED });
        else setState({ query: q, loading: false, answer: body, error: null });
      })
      .catch(() => {
        if (live) setState({ query: q, loading: false, answer: null, error: FAILED });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return state;
}
