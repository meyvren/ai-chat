"use client";

import { ArrowUp, History, Plus, Square, Sparkles, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "../../../types/types";
import {
  CHAT_STORAGE_KEY,
  parseSavedChats,
  serializeSavedChats,
  type Conversation,
} from "../../lib/chatStorage";
import { readStream } from "../../lib/readStream";

type ChatPhase = "idle" | "streaming";
const EMPTY_MESSAGES: Message[] = [];

export default function Chat() {
  const [text, setText] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"stop" | "timeout" | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const messages = conversations.find((chat) => chat.id === activeId)?.messages ?? EMPTY_MESSAGES;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = parseSavedChats(localStorage.getItem(CHAT_STORAGE_KEY));
        setConversations(saved.conversations);
        setActiveId(saved.activeId);
      } catch {
        setStorageError(true);
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, serializeSavedChats({ conversations, activeId }));
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [conversations, activeId, loaded]);

  function updateMessages(id: string, update: (messages: Message[]) => Message[]) {
    setConversations((current) =>
      current.map((chat) =>
        chat.id === id
          ? { ...chat, messages: update(chat.messages), updatedAt: Date.now() }
          : chat,
      ),
    );
  }

  function startNewChat() {
    if (phase === "streaming") return;
    setActiveId(null);
    setText("");
    setError(null);
    setHistoryOpen(false);
  }

  function openChat(id: string) {
    if (phase === "streaming") return;
    setActiveId(id);
    setText("");
    setError(null);
    setHistoryOpen(false);
  }

  function deleteChat(id: string) {
    if (phase === "streaming" || !window.confirm("Удалить этот чат из истории?")) return;
    setConversations((current) => current.filter((chat) => chat.id !== id));
    if (activeId === id) setActiveId(null);
  }

  const stopGeneration = useCallback(() => {
    if (!controllerRef.current) return;
    abortReasonRef.current = "stop";
    controllerRef.current.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") stopGeneration();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stopGeneration]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, phase, error]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = text.trim();
    if (!content || phase === "streaming" || !loaded) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const history = [...messages, userMessage];
    const chatId = activeId ?? crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const controller = new AbortController();
    controllerRef.current = controller;
    abortReasonRef.current = null;

    if (activeId) {
      updateMessages(chatId, () => history);
    } else {
      setConversations((current) => [
        { id: chatId, title: content.replace(/\s+/g, " ").slice(0, 48), updatedAt: Date.now(), messages: history },
        ...current,
      ]);
      setActiveId(chatId);
    }
    setText("");
    setError(null);
    setPhase("streaming");

    let receivedText = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const resetTimeout = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        abortReasonRef.current = "timeout";
        controller.abort();
      }, 60_000);
    };
    resetTimeout();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-30).map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || "Не удалось получить ответ модели.");
      }

      await readStream(
        response,
        (chunk) => {
          if (!receivedText) {
            receivedText = true;
            updateMessages(chatId, (current) => [
              ...current,
              { id: assistantId, role: "assistant", content: chunk },
            ]);
          } else {
            updateMessages(chatId, (current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: message.content + chunk }
                  : message,
              ),
            );
          }
        },
        resetTimeout,
      );

      if (!receivedText) throw new Error("Модель вернула пустой ответ. Попробуйте ещё раз.");
    } catch (caught) {
      if (abortReasonRef.current === "stop") {
        if (receivedText) {
          updateMessages(chatId, (current) =>
            current.map((message) =>
              message.id === assistantId ? { ...message, stopped: true } : message,
            ),
          );
        }
      } else if (abortReasonRef.current === "timeout") {
        setError("Модель слишком долго не отвечает. Попробуйте ещё раз.");
      } else {
        setError(
          caught instanceof TypeError ||
            (caught instanceof DOMException && caught.name === "AbortError")
            ? "Соединение прервалось. Проверьте сеть и попробуйте ещё раз."
            : caught instanceof Error
              ? caught.message
              : "Соединение прервалось. Попробуйте ещё раз.",
        );
      }
    } finally {
      clearTimeout(timeoutId);
      controllerRef.current = null;
      abortReasonRef.current = null;
      setPhase("idle");
    }
  }

  const isStreaming = phase === "streaming";

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-7xl text-slate-100">
      {historyOpen && (
        <button
          type="button"
          aria-label="Закрыть историю"
          className="fixed inset-0 z-10 bg-black/70 lg:hidden"
          onClick={() => setHistoryOpen(false)}
        />
      )}
      <aside
        aria-label="Сохранённые чаты"
        className={`${historyOpen ? "visible translate-x-0" : "invisible -translate-x-full"} fixed inset-y-0 left-0 z-20 flex w-[min(18rem,85vw)] flex-col border-r border-white/10 bg-[#111824] p-4 shadow-2xl transition-transform lg:visible lg:static lg:w-72 lg:shrink-0 lg:translate-x-0 lg:shadow-none`}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="font-semibold">История чатов</h2>
          <button type="button" aria-label="Закрыть историю" onClick={() => setHistoryOpen(false)} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <button
          type="button"
          disabled={isStreaming}
          onClick={startNewChat}
          className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-cyan-300/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40"
        >
          <Plus aria-hidden="true" className="size-4" /> Новый чат
        </button>
        <nav aria-label="Список чатов" className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-2 text-sm text-slate-400">Здесь появятся ваши диалоги.</p>
          ) : (
            <ul className="space-y-1">
              {[...conversations].sort((a, b) => b.updatedAt - a.updatedAt).map((chat) => (
                <li key={chat.id} className={`group flex items-center rounded-lg ${activeId === chat.id ? "bg-cyan-400/15" : "hover:bg-white/5"}`}>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={() => openChat(chat.id)}
                    aria-current={activeId === chat.id ? "page" : undefined}
                    className="min-w-0 flex-1 truncate px-3 py-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40"
                    title={chat.title}
                  >
                    {chat.title}
                  </button>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={() => deleteChat(chat.id)}
                    aria-label={`Удалить чат: ${chat.title}`}
                    title="Удалить чат"
                    className="mr-1 shrink-0 rounded-md p-2 text-slate-400 hover:bg-rose-400/15 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-rose-300 disabled:opacity-40"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">Чаты сохраняются в этом браузере.</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-4 sm:px-6">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 py-5">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" aria-label="Открыть историю чатов" onClick={() => setHistoryOpen(true)} className="shrink-0 rounded-lg p-2 text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-cyan-300 lg:hidden">
            <History aria-hidden="true" className="size-5" />
          </button>
          <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">AI Chat</h1>
          <p className="text-xs text-slate-400">Диалог с бесплатной моделью OpenRouter</p>
          </div>
        </div>
        <button
          type="button"
          disabled={isStreaming}
          onClick={startNewChat}
          className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-300/50 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Новый чат
        </button>
      </header>

      <section
        aria-label="История диалога"
        className="min-h-0 flex-1 overflow-y-auto py-6"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
              <Sparkles aria-hidden="true" className="size-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              С чего начнём?
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400 sm:text-base">
              Задайте вопрос, попросите объяснить сложную тему или обсудите идею.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-5">
            {messages.map((message) => (
              <li
                key={message.id}
                className={
                  message.role === "user"
                    ? "self-end max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-cyan-900 px-4 py-3 text-sm leading-relaxed sm:max-w-[75%] sm:text-base"
                    : "self-start max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] sm:text-base"
                }
              >
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-300/70">
                  {message.role === "user" ? "Вы" : "Модель"}
                </span>
                {message.content}
                {message.stopped && (
                  <span className="mt-2 block text-xs text-amber-200">Ответ остановлен</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {isStreaming && (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-400" role="status">
            <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            Модель отвечает…
          </div>
        )}
        <div ref={endRef} />
      </section>

      <div className="shrink-0 pb-4 pt-2">
        {storageError && (
          <p role="alert" className="mb-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Не удалось сохранить историю в браузере. Проверьте доступное место и настройки хранения.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        )}
        <form
          onSubmit={sendMessage}
          className="flex w-full min-w-0 items-end gap-2 rounded-2xl border border-white/20 bg-white/5 p-2 shadow-xl shadow-black/10 transition-colors focus-within:border-cyan-300/60 focus-within:ring-2 focus-within:ring-cyan-300/30"
        >
          <label htmlFor="chat-message" className="sr-only">Сообщение</label>
          <textarea
            id="chat-message"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Напишите сообщение…"
            rows={2}
            className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-6 text-white outline-none placeholder:text-slate-500"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stopGeneration}
              aria-label="Остановить ответ"
              title="Остановить ответ (Esc)"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-500 text-white transition-colors hover:bg-rose-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300"
            >
              <Square aria-hidden="true" className="size-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!text.trim() || !loaded}
              aria-label="Отправить сообщение"
              title="Отправить сообщение"
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-cyan-600 text-white transition-colors hover:bg-cyan-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <ArrowUp aria-hidden="true" className="size-5" />
            </button>
          )}
        </form>
        <p className="mt-2 px-1 text-center text-xs text-slate-500">
          Enter — отправить · Shift+Enter — новая строка · Esc — остановить
        </p>
      </div>
      </div>
    </main>
  );
}
