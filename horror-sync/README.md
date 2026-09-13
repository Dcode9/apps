# Horror Sync

Dual-phone horror sound controller for iOS and Android browsers.

## How it works

- **Controller** creates a room code.
- **Player** enters the code on a second phone.
- A WebRTC data connection carries control messages directly between the two devices after pairing.
- Horror effects are synthesized locally with Web Audio, so they do not depend on downloading sound files and start with very low latency.
- Music search is handled through an unofficial JioSaavn API. The implementation accepts several common response/media URL shapes because unofficial APIs can change.

## Important browser behavior

The app must be served over **HTTPS** (or localhost) for reliable browser behavior. iOS Safari can require a user gesture before audio playback; the Player screen therefore expects the user to tap Connect before remote audio is triggered.

The WebRTC connection is peer-to-peer once signaling is complete, but WebRTC cannot guarantee a direct path on every network. PeerJS's hosted signaling service is used here, with the browser's WebRTC ICE/STUN/TURN behavior handling connectivity.

## Music API

The current frontend uses `https://saavn.dev/api/search?query=...`. This is an unofficial JioSaavn interface and can change, rate-limit, or become unavailable. Do not treat it as a guaranteed music-streaming service. The preloaded horror effects remain independent of it.

For production-grade reliability, replace the public API dependency with a self-hosted, monitored instance of the project's API and add caching/failover.

## Files

- `index.html` — complete zero-build web app.

## Run

Open `horror-sync/index.html` through the HTTPS deployment used by the apps site. Open it on both phones, select Controller on one and Player on the other, and pair using the room code.
