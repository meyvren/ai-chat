type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function isValidMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    message.content.length <= 10_000
  );
}

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return errorResponse("Сервер не настроен: добавьте OPENROUTER_API_KEY в .env.local.", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Некорректный запрос.", 400);
  }

  const messages = (body as { messages?: unknown } | null)?.messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 30 ||
    !messages.every(isValidMessage) ||
    messages[messages.length - 1].role !== "user"
  ) {
    return errorResponse("Проверьте историю сообщений и попробуйте снова.", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "AI Chat Test Assignment",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b-20260604:free",
        messages,
        stream: true,
      }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (caught) {
    const cause = caught instanceof Error ? caught.cause : undefined;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    console.error("OpenRouter connection failed", { code, name: caught instanceof Error ? caught.name : "unknown" });
    if (code === "EACCES" || code === "EPERM") {
      return errorResponse("Серверу закрыт доступ к OpenRouter. Проверьте сетевые ограничения среды запуска.", 502);
    }
    return errorResponse("Нет связи с OpenRouter. Проверьте сеть и повторите попытку.", 502);
  }

  if (!upstream.ok) {
    if (upstream.status === 429) {
      return errorResponse("Бесплатная модель сейчас ограничивает запросы. Попробуйте позже или выберите другую модель.", 429);
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return errorResponse("OpenRouter отклонил ключ API. Проверьте настройку сервера.", 502);
    }
    return errorResponse("OpenRouter временно недоступен. Попробуйте ещё раз.", 502);
  }

  if (!upstream.body) {
    return errorResponse("OpenRouter не вернул поток ответа.", 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
