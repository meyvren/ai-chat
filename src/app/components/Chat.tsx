"use client";

import { ArrowUp, Square, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "../../../types/types";
import { readStream } from "../../lib/readStream";

type ChatPhase = "idle" | "streaming";

export default function Chat() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"stop" | "timeout" | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

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
    if (!content || phase === "streaming") return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const history = [...messages, userMessage];
    const assistantId = crypto.randomUUID();
    const controller = new AbortController();
    controllerRef.current = controller;
    abortReasonRef.current = null;

    setMessages(history);
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
            setMessages((current) => [
              ...current,
              { id: assistantId, role: "assistant", content: chunk },
            ]);
          } else {
            setMessages((current) =>
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
          setMessages((current) =>
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
    <main className="mx-auto flex h-dvh w-full max-w-4xl flex-col px-4 text-slate-100 sm:px-6">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 py-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">AI Chat</h1>
          <p className="text-xs text-slate-400">Диалог с бесплатной моделью OpenRouter</p>
        </div>
        <button
          type="button"
          disabled={isStreaming || messages.length === 0}
          onClick={() => { setMessages([]); setError(null); }}
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
              disabled={!text.trim()}
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
    </main>
  );
}
