import { useCallback, ReactElement } from 'react';
import { useOnclicka } from '../hooks/useOnclicka';

export interface ShowAdButtonProps {
  spotId: number;
  onReward?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * ShowAdButton Component
 * Displays a button that triggers an Onclicka ad
 * 
 * @param spotId - Your Onclicka Spot ID
 * @param onReward - Callback when user successfully watches the ad
 * @param onError - Callback if ad fails to load or play
 * @param isLoading - Show loading state
 * @param disabled - Disable the button
 * @param className - Additional CSS classes
 * @param children - Button text/content
 */
export function ShowAdButton({
  spotId,
  onReward,
  onError,
  isLoading = false,
  disabled = false,
  className = '',
  children = 'Watch & Earn',
}: ShowAdButtonProps): ReactElement {
  const { showAd, isReady } = useOnclicka({ spotId });

  const handleClick = useCallback(async () => {
    try {
      await showAd();
      await onReward?.();
    } catch (error) {
      onError?.(error);
    }
  }, [onError, onReward, showAd]);

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading || !isReady}
      className={`show-ad-button ${className}`.trim()}
      aria-label="Watch advertisement to earn coins"
    >
      {isLoading ? 'Loading Ad...' : children}
    </button>
  );
}
