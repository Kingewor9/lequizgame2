import { useCallback, useEffect, useRef, useState } from 'react';
import createAdHandler from 'monetag-tg-sdk';

const MONETAG_REWARDED_INTERSTITIAL_ZONE_ID = 12051949;

export function useMonetag() {
  const showAdRef = useRef<(() => Promise<unknown>) | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      showAdRef.current = createAdHandler(MONETAG_REWARDED_INTERSTITIAL_ZONE_ID);
      setIsReady(true);
    } catch (error) {
      const initError = error instanceof Error
        ? error
        : new Error('Could not initialize Monetag ads.');
      console.error('Could not initialize Monetag ads:', initError);
      setInitializationError(initError);
    }

    return () => {
      showAdRef.current = null;
    };
  }, []);

  const showAd = useCallback(async () => {
    const show = showAdRef.current;
    if (!show) {
      throw initializationError || new Error('Monetag ads are not ready yet.');
    }
    await show();
  }, [initializationError]);

  return { showAd, isReady, initializationError };
}
