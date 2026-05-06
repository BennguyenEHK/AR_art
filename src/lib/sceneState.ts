// Shared scene-state primitives. Today this only carries presence + a small
// rotation so we can prove "everyone sees the same world live". Future phases
// (agents, statue progress) will extend this same SceneState type.

import type * as Ably from "ably";
import { getSharedChannel, isAblyEnabled } from "./ably";

export type SceneState = {
  // How many viewers are currently connected to the same channel
  presenceCount: number;
  // Yaw (radians) of the shared object — synced across clients
  worldYaw: number;
  // Server-ish wall-clock so late joiners can detect stale snapshots
  updatedAt: number;
};

export const initialSceneState: SceneState = {
  presenceCount: 1,
  worldYaw: 0,
  updatedAt: Date.now(),
};

/**
 * Subscribe to remote scene-state snapshots.
 * Returns an unsubscribe function (safe to call even when sharing is disabled).
 */
export function subscribeSceneState(
  onUpdate: (s: SceneState) => void,
): () => void {
  const channel = getSharedChannel();
  if (!channel) return () => {};

  // Ably's InboundMessage.data is optional; gate the cast on its presence
  const listener = (msg: Ably.InboundMessage) => {
    if (msg.data) onUpdate(msg.data as SceneState);
  };
  channel.subscribe("scene", listener);
  return () => {
    channel.unsubscribe("scene", listener);
  };
}

/** Publish a scene-state snapshot. No-op when sharing is disabled. */
export function publishSceneState(state: SceneState): void {
  const channel = getSharedChannel();
  if (!channel) return;
  channel.publish("scene", state);
}

// Re-export so components only need to import from one place
export const sharingEnabled = isAblyEnabled;
