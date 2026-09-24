import assert from "node:assert/strict";
import test from "node:test";
import { parseSavedChats, serializeSavedChats } from "../src/lib/chatStorage.ts";

test("restores saved chats and their active conversation", () => {
  const chats = {
    conversations: [{
      id: "chat-1",
      title: "Привет",
      updatedAt: 123,
      messages: [{ id: "message-1", role: "user", content: "Привет" }],
    }],
    activeId: "chat-1",
  };
  assert.deepEqual(parseSavedChats(serializeSavedChats(chats)), chats);
});

test("ignores damaged storage and missing active chats", () => {
  assert.deepEqual(parseSavedChats("not json"), { conversations: [], activeId: null });
  const saved = serializeSavedChats({ conversations: [], activeId: "deleted" });
  assert.deepEqual(parseSavedChats(saved), { conversations: [], activeId: null });
});
