import { useCallback, useEffect, useRef, useState } from 'react';
import type { OnclickaShow } from '../types/onclicka';

interface UseOnclickaOptions {
  spotId: number;
}

export function useOnclicka({ spotId }: UseOnclickaOptions) {
  const showAdRef = useRef<OnclickaShow | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    showAdRef.current = null;
    setIsReady(false);
    setInitializationError(null);

    if (!Number.isSafeInteger(spotId) || spotId <= 0) {
      setInitializationError(new Error('Onclicka Spot ID is missing or invalid.'));
      return () => {
        isMounted = false;
      };
    }

    if (!window.initCdTma) {
      const error = new Error('Onclicka ad script is unavailable.');
      console.error(error.message);
      setInitializationError(error);
      return () => {
        isMounted = false;
      };
    }

    Promise.resolve()
      .then(() => window.initCdTma?.({ id: spotId }))
      .then((show) => {
        if (!isMounted) return;
        if (typeof show !== 'function') {
          throw new Error('Onclicka did not provide an ad display function.');
        }
        showAdRef.current = show;
        setIsReady(true);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const initError = error instanceof Error
          ? error
          : new Error('Could not initialize Onclicka ads.');
        console.error('Could not initialize Onclicka ads:', initError);
        setInitializationError(initError);
      });

    return () => {
      isMounted = false;
      showAdRef.current = null;
    };
  }, [spotId]);

  const showAd = useCallback(async () => {
    const show = showAdRef.current;
    if (!show) {
      throw initializationError || new Error('Onclicka ads are not ready yet.');
    }
    await show();
  }, [initializationError]);

  return { showAd, isReady, initializationError };
}
