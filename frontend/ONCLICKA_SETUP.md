# Onclicka Ads Setup

## Configure the Spot ID

Set the Spot ID provided by Onclicka in `frontend/.env.local` for local development:

```env
VITE_ONCLICKA_SPOT_ID=your_onclicka_spot_id
```

For production, configure the same variable in the deployment environment. Restart or rebuild the frontend after changing it. The Spot ID is exposed to the client bundle by Vite and must not contain a secret.

The ad manager script is loaded from `https://js.onclckvd.com/in-stream-ad-admanager/tma.js` in `index.html`. The `useOnclicka` hook initializes the SDK and exposes its display function once ready.

## Reward flow

The Footy Coins page calls Onclicka's returned show function from the user's button click. Coins are requested from the existing backend reward endpoint only after that function resolves successfully. A rejected ad promise does not grant a reward.
