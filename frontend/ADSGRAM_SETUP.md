# Adsgram Integration Setup

## Environment Variables

Add the following to your `.env` file (or `.env.local` for development):

```env
VITE_ADSGRAM_BLOCK_ID=your-block-id-here
```

The `VITE_` prefix is required for Vite to expose variables to the browser.

## Usage

### Basic Implementation with ShowAdButton Component

```tsx
import { ShowAdButton } from '@/components/ShowAdButton';
import { useCallback } from 'react';

export function MyComponent() {
  const blockId = import.meta.env.VITE_ADSGRAM_BLOCK_ID || 'default-block-id';

  const handleReward = useCallback(() => {
    console.log('User watched ad successfully!');
    // Call your API to award coins
  }, []);

  const handleError = useCallback((error) => {
    console.error('Ad error:', error);
  }, []);

  return (
    <ShowAdButton
      blockId={blockId}
      onReward={handleReward}
      onError={handleError}
    >
      Watch Ad & Earn 50 Coins
    </ShowAdButton>
  );
}
```

### Advanced Usage with Custom Hook

If you need more control, use the `useAdsgram` hook directly:

```tsx
import { useAdsgram } from '@/hooks/useAdsgram';
import { useCallback } from 'react';

export function CustomAdIntegration() {
  const blockId = import.meta.env.VITE_ADSGRAM_BLOCK_ID || 'default-block-id';

  const handleReward = useCallback(() => {
    // User completed watching the ad
  }, []);

  const handleError = useCallback((result) => {
    console.error('Ad failed:', result.description);
  }, []);

  const showAd = useAdsgram({ blockId, onReward: handleReward, onError: handleError });

  return (
    <button onClick={() => showAd()}>
      Show Ad
    </button>
  );
}
```

## Callback Parameters

### onReward
Called when the user successfully watches the ad completely.

```tsx
const onReward = () => {
  // Award coins to user
  // Refresh user data
};
```

### onError
Called when an error occurs. Receives a `ShowPromiseResult` object:

```tsx
interface ShowPromiseResult {
  error: boolean;
  done: boolean;
  state: 'load' | 'show' | 'close' | 'error';
  description?: string;
}

const onError = (result: ShowPromiseResult) => {
  if (result.state === 'load') {
    console.log('Ad failed to load');
  } else if (result.state === 'close') {
    console.log('User closed the ad');
  }
};
```

## Integration with FootyCoinPage

Your `FootyCoinPage` already has Adsgram initialized. You can refactor the watch ad button to use the new `ShowAdButton` component for cleaner code and better reusability.

## Testing

In development mode, Adsgram shows a debug banner. This is controlled by:
- `import.meta.env.DEV` - automatically set to `true` in dev mode
- You can customize the debug banner type in the hook initialization
