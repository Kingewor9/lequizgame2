import { useCallback, useEffect, useRef, useState } from 'react';
import '../types/monetag';

export function useMonetag() {
  const showAdRef = useRef<NonNullable<Window['show_12051949']> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [initializationError, setInitializationError] = useState<Error | null>(null);

  useEffect(() => {
    const show = window.show_12051949;
    if (typeof show !== 'function') {
      const error = new Error('Monetag ad script is unavailable.');
      console.error(error.message);
      setInitializationError(error);
      return;
    }

    showAdRef.current = show;
    setIsReady(true);

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
