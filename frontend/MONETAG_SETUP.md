# Monetag Ads Setup

The frontend uses Monetag's `monetag-tg-sdk` package for Telegram Mini Apps. The rewarded-interstitial zone ID (`12051949`) is configured in `src/hooks/useMonetag.ts`. The package loads the Monetag SDK and creates the ad handler for that zone.

The Footy Coins page calls the handler from the user's click and requests the existing backend reward only after the ad promise resolves successfully. If the ad promise rejects, no reward is requested.
