// Messaging between the host window and the board window.
// Both windows are pages of the same site, so a BroadcastChannel connects
// them directly; no server is involved.

const CHANNEL_NAME = 'calculated-risk';

export const syncSupported = typeof BroadcastChannel !== 'undefined';

export function openChannel(onMessage) {
  if (!syncSupported) return { send() {} };
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event) => onMessage(event.data);
  return { send: (msg) => channel.postMessage(msg) };
}
