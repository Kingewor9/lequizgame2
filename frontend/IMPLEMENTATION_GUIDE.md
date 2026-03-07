# Adsgram Integration Guide for FootyCoinPage

## Current Setup

Your `FootyCoinPage.tsx` already has basic Adsgram integration. Here's how the new components improve it:

### Option 1: Quick Integration (Minimal Changes)

If you want to keep your current implementation but use the utility hook, update the Adsgram initialization:

```tsx
import { useAdsgram } from '../hooks/useAdsgram';

// In your component, replace the useEffect initialization with:
const showAd = useAdsgram({
  blockId: import.meta.env.VITE_ADSGRAM_BLOCK_ID || 'your-block-id',
  onReward: () => {
    setTaskInProgress('watch_ads');
    // ... rest of your reward logic
  },
  onError: (result) => {
    setAlert({ 
      message: 'You must watch the full ad to earn coins.', 
      type: 'error' 
    });
  },
});

// Then in handleWatchAd:
const handleWatchAd = async () => {
  setIsAdLoading(true);
  try {
    await showAd();
  } finally {
    setIsAdLoading(false);
  }
};
```

### Option 2: Full Refactor with ShowAdButton Component

For cleaner code, create a separate component for the watch ad task:

```tsx
// src/components/WatchAdTask.tsx
import { ShowAdButton } from './ShowAdButton';
import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';

interface WatchAdTaskProps {
  isCompleted: boolean;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function WatchAdTask({ isCompleted, onSuccess, onError }: WatchAdTaskProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { refreshUser } = useAuth();
  const blockId = import.meta.env.VITE_ADSGRAM_BLOCK_ID || 'your-block-id';

  const handleReward = useCallback(async () => {
    try {
      const response = await apiService.post('/footy-coins/tasks/ad/complete', {});
      if (response.success) {
        await refreshUser();
        onSuccess();
      } else {
        onError(response.error || 'Failed to claim ad reward');
      }
    } catch {
      onError('Failed to claim ad reward');
    } finally {
      setIsLoading(false);
    }
  }, [onSuccess, onError, refreshUser]);

  const handleError = useCallback(() => {
    onError('You must watch the full ad to earn coins.');
    setIsLoading(false);
  }, [onError]);

  return (
    <ShowAdButton
      blockId={blockId}
      onReward={handleReward}
      onError={handleError}
      isLoading={isLoading}
      disabled={isCompleted}
      className="btn-task btn-task--ad"
    >
      {isCompleted ? 'Completed' : 'Watch & Earn'}
    </ShowAdButton>
  );
}
```

Then in `FootyCoinPage.tsx`:

```tsx
import { WatchAdTask } from '../components/WatchAdTask';

// In render, for the watch_ads task:
{task.type === 'watch_ads' && (
  <WatchAdTask
    isCompleted={completedTasks.has('watch_ads')}
    onSuccess={() => {
      setAlert({ message: '🎉 Earned 50 Footy Coins!', type: 'success' });
    }}
    onError={(message) => {
      setAlert({ message, type: 'error' });
    }}
  />
)}
```

## Environment Variables Required

Create a `.env.local` file in your frontend directory:

```env
VITE_ADSGRAM_BLOCK_ID=your_actual_block_id_here
```

For production, add this to your CI/CD or production environment variables.

## API Integration

Your backend endpoint `/footy-coins/tasks/ad/complete` is already set up. The Adsgram hook will:
1. Initialize the ad controller with your block ID
2. Show the ad when called
3. Call `onReward` callback if user completes the ad
4. Call `onError` callback if user skips or there's an error
