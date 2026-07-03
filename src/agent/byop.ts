/**
 * Pollinations BYOP (Bring Your Own Pollen) — device authorization flow.
 * https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md
 *
 * Users authorize Sprout to spend their Pollen; Pollinations returns a scoped
 * sk_ key. The publishable App Key (pk_...) attributes traffic for developer earnings.
 */

import { execa } from "execa";

export const POLLINATIONS_ENTER_URL = "https://enter.pollinations.ai";

/** Publishable App Key — safe to ship; overridden by POLLINATIONS_BYOP_KEY in dev. */
export const DEFAULT_BYOP_CLIENT_ID = "pk_AixR2lSZdrdT17l7";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in?: number;
  interval?: number;
}

export interface DeviceUserInfo {
  sub: string;
  preferred_username?: string;
  picture?: string;
  name?: string;
  email?: string;
}

export function resolveByopClientId(): string | null {
  const fromEnv =
    process.env.POLLINATIONS_BYOP_KEY?.trim() ||
    process.env.SPROUT_BYOP_KEY?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_BYOP_CLIENT_ID;
}

export function deviceVerificationUrl(verificationUri: string): string {
  if (verificationUri.startsWith("http://") || verificationUri.startsWith("https://")) {
    return verificationUri;
  }
  const base = POLLINATIONS_ENTER_URL.replace(/\/$/, "");
  const path = verificationUri.startsWith("/") ? verificationUri : `/${verificationUri}`;
  return `${base}${path}`;
}

export async function requestDeviceCode(clientId: string): Promise<DeviceCodeResponse> {
  const res = await fetch(`${POLLINATIONS_ENTER_URL}/api/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Could not start Pollen sign-in (${res.status}). ${body}`.trim());
  }

  const data = (await res.json()) as DeviceCodeResponse;
  if (!data.device_code || !data.user_code) {
    throw new Error("Pollinations returned an incomplete device authorization response.");
  }
  return data;
}

export type DevicePollError =
  | "authorization_pending"
  | "slow_down"
  | "expired_token"
  | "access_denied"
  | "invalid_grant";

export interface DevicePollResult {
  ok: boolean;
  accessToken?: string;
  error?: DevicePollError;
  retryAfterMs?: number;
}

/** Single poll attempt — returns pending/slow_down without throwing. */
export async function pollDeviceTokenOnce(deviceCode: string): Promise<DevicePollResult> {
  const res = await fetch(`${POLLINATIONS_ENTER_URL}/api/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: deviceCode }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    retry_after?: number;
  };

  if (res.ok && body.access_token) {
    return { ok: true, accessToken: body.access_token };
  }

  const err = body.error as DevicePollError | undefined;
  if (err === "authorization_pending") {
    return { ok: false, error: err };
  }
  if (err === "slow_down") {
    const retry = typeof body.retry_after === "number" ? body.retry_after * 1000 : 10_000;
    return { ok: false, error: err, retryAfterMs: retry };
  }
  if (err === "expired_token" || err === "access_denied" || err === "invalid_grant") {
    return { ok: false, error: err };
  }

  throw new Error(
    `Pollen sign-in failed (${res.status})${body.error ? `: ${body.error}` : ""}`.trim()
  );
}

export interface PollDeviceTokenOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onPending?: (elapsedMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

export async function pollDeviceToken(
  deviceCode: string,
  opts: PollDeviceTokenOptions = {}
): Promise<string> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();
  let intervalMs = opts.intervalMs ?? 5000;

  while (Date.now() - started < timeoutMs) {
    const result = await pollDeviceTokenOnce(deviceCode);

    if (result.ok && result.accessToken) return result.accessToken;

    if (result.error === "expired_token") {
      throw new Error("Pollen sign-in code expired — run sprout login again.");
    }
    if (result.error === "access_denied") {
      throw new Error("Pollen sign-in was denied.");
    }
    if (result.error === "invalid_grant") {
      throw new Error("Pollen sign-in grant is no longer valid — run sprout login again.");
    }

    if (result.error === "slow_down" && result.retryAfterMs) {
      intervalMs = Math.max(intervalMs, result.retryAfterMs);
    }

    opts.onPending?.(Date.now() - started);
    await sleep(intervalMs);
  }

  throw new Error("Pollen sign-in timed out — approve in the browser, then run sprout login again.");
}

export async function fetchDeviceUserInfo(accessToken: string): Promise<DeviceUserInfo | null> {
  try {
    const res = await fetch(`${POLLINATIONS_ENTER_URL}/api/device/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as DeviceUserInfo;
  } catch {
    return null;
  }
}

export async function openBrowser(url: string): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      await execa("open", [url]);
      return true;
    }
    if (process.platform === "win32") {
      await execa("cmd", ["/c", "start", "", url], { shell: true });
      return true;
    }
    await execa("xdg-open", [url]);
    return true;
  } catch {
    return false;
  }
}

export interface ByopLoginHooks {
  onDeviceCode?: (info: { userCode: string; verifyUrl: string; opened: boolean }) => void;
  onWaiting?: (elapsedMs: number) => void;
  onAuthorized?: (info: { user?: DeviceUserInfo | null }) => void;
}

/** Full device-flow login: request code → user approves in browser → poll for sk_. */
export async function runByopLogin(clientId: string, hooks: ByopLoginHooks = {}): Promise<string> {
  const device = await requestDeviceCode(clientId);
  const verifyUrl = deviceVerificationUrl(device.verification_uri);
  const opened = await openBrowser(verifyUrl);
  hooks.onDeviceCode?.({ userCode: device.user_code, verifyUrl, opened });

  const intervalMs = typeof device.interval === "number" ? device.interval * 1000 : 5000;
  const accessToken = await pollDeviceToken(device.device_code, {
    intervalMs,
    onPending: hooks.onWaiting,
  });

  const user = await fetchDeviceUserInfo(accessToken);
  hooks.onAuthorized?.({ user });
  return accessToken;
}