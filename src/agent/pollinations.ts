/**
 * Thin wrapper around the official OpenAI SDK pointed at Pollinations'
 * OpenAI-compatible endpoint (https://gen.pollinations.ai/v1). This is the
 * ONLY place inference HTTP happens; nothing else imports `openai`.
 */

import OpenAI from "openai";

export const POLLINATIONS_BASE_URL = "https://gen.pollinations.ai/v1";

export function createClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: POLLINATIONS_BASE_URL,
    // Install loops involve slow package downloads between turns; don't let
    // the SDK's default retry storm a flaky endpoint.
    maxRetries: 1,
    timeout: 120_000,
  });
}

export interface ModelStatus {
  ok: boolean;
  detail: string;
}

/**
 * `sprout status` health check: confirms the key is accepted and the
 * configured model is listed/awake before doing real work. Uses the models
 * list (authenticated) as the key check, then reports what the status
 * endpoint knows about the chosen model.
 */
export async function checkModelStatus(apiKey: string, model: string): Promise<ModelStatus> {
  const client = createClient(apiKey);

  let listed = false;
  try {
    const models = await client.models.list();
    listed = models.data.some((m) => m.id === model);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return { ok: false, detail: "API key rejected (401/403). Check `sprout config` or SPROUT_API_KEY." };
    }
    return { ok: false, detail: `Could not reach ${POLLINATIONS_BASE_URL}/models: ${(err as Error).message}` };
  }
  if (!listed) {
    return { ok: false, detail: `Key is valid, but model '${model}' is not in the live model list. Pick another via \`sprout config --model <id>\`.` };
  }

  // Model-status endpoint (not part of the OpenAI surface) — best-effort.
  try {
    const res = await fetch(`${POLLINATIONS_BASE_URL}/models/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: Array<{ model: string; status_2xx: number; total_requests: number; latency_p50_ms: number }> };
      const row = body.data?.find((r) => r.model === model);
      if (row) {
        return {
          ok: true,
          detail: `model '${model}' is awake (recent: ${row.status_2xx}/${row.total_requests} OK, p50 ${Math.round(row.latency_p50_ms)}ms)`,
        };
      }
      return { ok: true, detail: `key valid; '${model}' is listed but has no recent traffic in the status feed (likely just idle).` };
    }
  } catch {
    // status endpoint being down shouldn't fail the health check
  }
  return { ok: true, detail: `key valid; model '${model}' is listed. (status endpoint unavailable)` };
}
