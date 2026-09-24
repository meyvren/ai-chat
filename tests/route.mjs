import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/chat/route.ts";

function chatRequest(messages = [{ role: "user", content: "Привет" }]) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

test("keeps the key on the server and reports missing configuration", async () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const response = await POST(chatRequest());
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /OPENROUTER_API_KEY/);
  } finally {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});

test("forwards a stream and maps upstream rate limiting", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-secret";
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer test-secret");
      assert.equal(JSON.parse(options.body).stream, true);
      return new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      });
    };
    const success = await POST(chatRequest());
    assert.equal(success.status, 200);
    assert.equal(await success.text(), "data: [DONE]\n\n");
    assert.equal(success.headers.get("Content-Type"), "text/event-stream; charset=utf-8");

    globalThis.fetch = async () => new Response("limit", { status: 429 });
    const limited = await POST(chatRequest());
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /ограничивает запросы/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
