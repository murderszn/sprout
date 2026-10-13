import { test } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { checkModelStatus } from "../src/agent/pollinations.js";

const catalog = [
  { id: "openai/gpt-5.4-nano", aliases: ["openai"] },
  { id: "unchanged-model" },
];

for (const [model, expected] of [
  ["openai", true],
  ["openai/gpt-5.4-nano", true],
  ["unchanged-model", true],
  ["missing-model", false],
] as const) {
  test(`model status recognizes ${model}: ${expected}`, async (t) => {
    t.mock.method(OpenAI.Models.prototype, "list", async () => ({ data: catalog }));
    t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));

    const result = await checkModelStatus("test-key", model);

    assert.equal(result.ok, expected);
    assert.ok(result.detail.includes(model));
  });
}

test("model status still reports a rejected API key", async (t) => {
  t.mock.method(OpenAI.Models.prototype, "list", async () => {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  });

  const result = await checkModelStatus("test-key", "openai");

  assert.equal(result.ok, false);
  assert.match(result.detail, /API key rejected/);
});
