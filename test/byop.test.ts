import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deviceVerificationUrl,
  pollDeviceToken,
  pollDeviceTokenOnce,
  resolveByopClientId,
  DEFAULT_BYOP_CLIENT_ID,
} from "../src/agent/byop.js";

test("resolveByopClientId prefers POLLINATIONS_BYOP_KEY", () => {
  const prev = process.env.POLLINATIONS_BYOP_KEY;
  process.env.POLLINATIONS_BYOP_KEY = "pk_test_override";
  assert.equal(resolveByopClientId(), "pk_test_override");
  if (prev === undefined) delete process.env.POLLINATIONS_BYOP_KEY;
  else process.env.POLLINATIONS_BYOP_KEY = prev;
});

test("resolveByopClientId falls back to shipped publishable key", () => {
  const prev = process.env.POLLINATIONS_BYOP_KEY;
  const prev2 = process.env.SPROUT_BYOP_KEY;
  delete process.env.POLLINATIONS_BYOP_KEY;
  delete process.env.SPROUT_BYOP_KEY;
  assert.equal(resolveByopClientId(), DEFAULT_BYOP_CLIENT_ID);
  if (prev !== undefined) process.env.POLLINATIONS_BYOP_KEY = prev;
  if (prev2 !== undefined) process.env.SPROUT_BYOP_KEY = prev2;
});

test("deviceVerificationUrl resolves relative paths", () => {
  assert.equal(deviceVerificationUrl("/device"), "https://enter.pollinations.ai/device");
  assert.equal(deviceVerificationUrl("https://enter.pollinations.ai/foo"), "https://enter.pollinations.ai/foo");
});

test("pollDeviceTokenOnce returns token when ready", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ access_token: "sk_test_abc", token_type: "bearer" }), { status: 200 })) as typeof fetch;

  const result = await pollDeviceTokenOnce("device-code-1");
  assert.equal(result.ok, true);
  assert.equal(result.accessToken, "sk_test_abc");

  globalThis.fetch = original;
});

test("pollDeviceTokenOnce surfaces authorization_pending", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 })) as typeof fetch;

  const result = await pollDeviceTokenOnce("device-code-2");
  assert.equal(result.ok, false);
  assert.equal(result.error, "authorization_pending");

  globalThis.fetch = original;
});

test("pollDeviceToken resolves after pending polls", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) {
      return new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 });
    }
    return new Response(JSON.stringify({ access_token: "sk_after_poll" }), { status: 200 });
  }) as typeof fetch;

  const token = await pollDeviceToken("device-code-3", {
    intervalMs: 1,
    sleep: async () => {},
  });
  assert.equal(token, "sk_after_poll");
  assert.equal(calls, 3);

  globalThis.fetch = original;
});