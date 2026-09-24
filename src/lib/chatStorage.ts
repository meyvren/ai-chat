import type { Message } from "../../types/types";

export const CHAT_STORAGE_KEY = "ai-chat:conversations:v1";

export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};

export type SavedChats = {
  conversations: Conversation[];
  activeId: string | null;
};

const emptyChats: SavedChats = { conversations: [], activeId: null };

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    (item.role === "user" || item.role === "assistant") &&
    typeof item.content === "string" &&
    (item.stopped === undefined || typeof item.stopped === "boolean")
  );
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.updatedAt === "number" &&
    Number.isFinite(item.updatedAt) &&
    Array.isArray(item.messages) &&
    item.messages.every(isMessage)
  );
}

export function parseSavedChats(raw: string | null): SavedChats {
  if (!raw) return emptyChats;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return emptyChats;
    const data = value as Record<string, unknown>;
    if (data.version !== 1 || !Array.isArray(data.conversations)) return emptyChats;
    const conversations = data.conversations.filter(isConversation);
    const activeId =
      typeof data.activeId === "string" && conversations.some((chat) => chat.id === data.activeId)
        ? data.activeId
        : null;
    return { conversations, activeId };
  } catch {
    return emptyChats;
  }
}

export function serializeSavedChats(chats: SavedChats): string {
  return JSON.stringify({ version: 1, ...chats });
}
