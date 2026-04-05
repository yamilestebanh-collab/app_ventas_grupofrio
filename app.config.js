// app.config.js — Expo merge layer on top of app.json at build/run time.
//
// BLD-20260405-022 (Fase 1 fast-track): inject the shared service-user
// api_key as a build-time env var so kold-field can authenticate against
// Odoo without consuming one internal license per vendor.
//
// Consumers read it via:
//   import Constants from 'expo-constants';
//   const key = Constants.expoConfig?.extra?.gfSvcApiKey;
//
// The value is NEVER committed. It comes from:
//   - Local dev:  a `.env` file (ignored by git) or an exported shell var
//                 `GF_SVC_API_KEY=...` before running `expo start`.
//   - EAS Build:  an EAS secret created once per project:
//                 `eas secret:create --scope project --name GF_SVC_API_KEY \
//                   --value 2a28de09...` (see BLD-022 handover to Sebastián).
//
// Rotation: updating the key = rotate EAS secret + new EAS build + distribute
// APK. See BLD-20260405-022 spec section on rotation policy.

const base = require('./app.json');

module.exports = () => {
  const expo = { ...base.expo };
  expo.extra = {
    ...(expo.extra || {}),
    // BLD-022 Fase 1 — shared service-user api_key, null outside builds
    // that have the env var populated. `null` is handled gracefully by
    // src/services/api.ts::buildHeaders (falls back to SecureStore).
    gfSvcApiKey: process.env.GF_SVC_API_KEY || null,
  };
  return { expo };
};
