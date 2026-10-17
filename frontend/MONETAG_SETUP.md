# Monetag Ads Setup

The Monetag SDK script and zone are configured in `index.html`:

```html
<script src="https://libtl.com/sdk.js" data-zone="12051949" data-sdk="show_12051949"></script>
```

The `useMonetag` hook calls the SDK's `show_12051949()` rewarded-interstitial function. The Footy Coins page requests the existing backend reward only after the ad promise resolves successfully. If the ad promise rejects, no reward is requested.
