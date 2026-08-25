import { useEffect, useRef, useState } from "react";

export interface PollingState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Ruft `fetcher` sofort und danach alle `intervalMs` auf, solange `enabled` true ist.
 * Bricht laufende Requests beim Deaktivieren/Unmount sauber ab.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  enabled: boolean,
): PollingState<T> {
  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
    loading: false,
  });

  // Aktuellste fetcher-Referenz, ohne das Intervall neu aufzusetzen.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setState((s) => ({ ...s, loading: true }));
      try {
        const data = await fetcherRef.current(controller.signal);
        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (err) {
        if (!cancelled && (err as Error).name !== "AbortError") {
          setState((s) => ({ ...s, error: err as Error, loading: false }));
        }
      }
    }

    run();
    const id = setInterval(run, intervalMs);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [intervalMs, enabled]);

  return state;
}
