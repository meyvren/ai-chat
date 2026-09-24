import assert from "node:assert/strict";
import test from "node:test";
import { readStream } from "../src/lib/readStream.ts";

function responseFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

test("assembles SSE events split across network chunks", async () => {
  const chunks = [
    'data: {"choices":[{"delta":{"content":"При',
    'вет"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"!"}}]}\n',
    '\ndata: [DONE]\n\n',
  ];
  let answer = "";
  let activity = 0;
  await readStream(responseFromChunks(chunks), (text) => { answer += text; }, () => { activity++; });
  assert.equal(answer, "Привет!");
  assert.equal(activity, 3);
});

test("reports a streamed rate limit and a broken connection", async () => {
  await assert.rejects(
    readStream(responseFromChunks(['data: {"error":{"code":429}}\n\n']), () => {}, () => {}),
    /Лимит бесплатной модели/,
  );
  await assert.rejects(
    readStream(responseFromChunks(['data: {"choices":[{"delta":{"content":"часть"}}]}\n\n']), () => {}, () => {}),
    /Соединение прервалось/,
  );
});
