import { useCallback, ReactElement } from 'react';
import { useAdsgram } from '../hooks/useAdsgram';
import type { ShowPromiseResult } from '../types/adsgram';

export interface ShowAdButtonProps {
  blockId: string;
  onReward?: () => void;
  onError?: (result: ShowPromiseResult) => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * ShowAdButton Component
 * Displays a button that triggers Adsgram ads
 * 
 * @param blockId - Your Adsgram block ID
 * @param onReward - Callback when user successfully watches the ad
 * @param onError - Callback if ad fails to load or play
 * @param isLoading - Show loading state
 * @param disabled - Disable the button
 * @param className - Additional CSS classes
 * @param children - Button text/content
 */
export function ShowAdButton({
  blockId,
  onReward,
  onError,
  isLoading = false,
  disabled = false,
  className = '',
  children = 'Watch & Earn',
}: ShowAdButtonProps): ReactElement {
  const showAd = useAdsgram({ blockId, onReward, onError });

  const handleClick = useCallback(async () => {
    await showAd();
  }, [showAd]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`show-ad-button ${className}`.trim()}
      aria-label="Watch advertisement to earn coins"
    >
      {isLoading ? 'Loading Ad...' : children}
    </button>
  );
}
