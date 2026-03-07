/**
 * Adsgram SDK Type Definitions
 */

export interface ShowPromiseResult {
  error: boolean;
  done: boolean;
  state: 'load' | 'show' | 'close' | 'error';
  description?: string;
}

export interface AdControllerConfig {
  blockId: string;
  debug?: boolean;
  debugBannerType?: 'Interstitial' | 'FullscreenMedia' | 'RewardedVideo';
}

export interface AdController {
  show(): Promise<void>;
}

export interface AdsgramSDK {
  init(config: AdControllerConfig): AdController;
}

// Global window interface for Adsgram
declare global {
  interface Window {
    Adsgram?: AdsgramSDK;
  }
}
