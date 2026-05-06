// Thin wrapper around Ably so the rest of the app does not need to know
// whether realtime is currently enabled. When NEXT_PUBLIC_ABLY_ENABLED is
// "false" or no key is provided, every helper degrades to a safe no-op.

import * as Ably from "ably";

// Read flags once at module load — they're public env vars so this is fine.
const isEnabledFlag = process.env.NEXT_PUBLIC_ABLY_ENABLED === "true";
const apiKey = process.env.NEXT_PUBLIC_ABLY_KEY ?? "";
const channelName =
  process.env.NEXT_PUBLIC_ABLY_CHANNEL ?? "ar-art:peace-board:v1";

// Cache the singleton so we don't open multiple websockets per tab
let realtime: Ably.Realtime | null = null;

/** True only when both the flag is on AND we have a key to authenticate with. */
export function isAblyEnabled(): boolean {
  return isEnabledFlag && apiKey.length > 0;
}

/** Lazily create + return the shared Realtime client (null when disabled). */
export function getRealtime(): Ably.Realtime | null {
  if (!isAblyEnabled()) return null;
  if (realtime) return realtime;
  realtime = new Ably.Realtime({ key: apiKey, clientId: randomClientId() });
  return realtime;
}

/** Convenience: return the channel everyone shares state on (or null). */
export function getSharedChannel() {
  return getRealtime()?.channels.get(channelName) ?? null;
}

/** Generate a stable-ish client id for presence (anonymous, per-tab). */
function randomClientId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return "anon-" + Math.random().toString(36).slice(2, 10);
}
