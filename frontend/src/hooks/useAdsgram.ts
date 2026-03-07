import { useCallback, useEffect, useRef } from 'react';
import type { AdController, ShowPromiseResult } from '../types/adsgram';

export interface useAdsgramParams {
  blockId: string;
  onReward?: () => void;
  onError?: (result: ShowPromiseResult) => void;
}

/**
 * Custom hook for managing Adsgram ad displays
 * @param blockId - The Adsgram block ID for your app
 * @param onReward - Callback when user completes watching the ad
 * @param onError - Callback when an error occurs during ad display
 * @returns Function to show the ad
 */
export function useAdsgram({
  blockId,
  onReward,
  onError,
}: useAdsgramParams): () => Promise<void> {
  const AdControllerRef = useRef<AdController | undefined>(undefined);

  // Initialize Adsgram controller on mount or when blockId changes
  useEffect(() => {
    if (window.Adsgram) {
      AdControllerRef.current = window.Adsgram.init({
        blockId,
        debug: import.meta.env.DEV,
      });
    } else {
      console.warn('Adsgram SDK not loaded');
    }
  }, [blockId]);

  // Return the function to show ads
  return useCallback(async () => {
    if (AdControllerRef.current) {
      try {
        await AdControllerRef.current.show();
        // User watched ad till the end or closed it in interstitial format
        onReward?.();
      } catch (error: any) {
        // User got error during playing ad
        const result: ShowPromiseResult = error || {
          error: true,
          done: false,
          state: 'error',
          description: 'Unknown error occurred',
        };
        onError?.(result);
      }
    } else {
      onError?.({
        error: true,
        done: false,
        state: 'load',
        description: 'Adsgram script not loaded',
      });
    }
  }, [onError, onReward]);
}
