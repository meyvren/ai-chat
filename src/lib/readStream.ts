type StreamEvent = {
  choices?: Array<{ delta?: { content?: string } }>;
  error?: { code?: number | string };
};

export async function readStream(
  response: Response,
  onText: (text: string) => void,
  onActivity: () => void,
) {
  if (!response.body) throw new Error("Ответ модели не содержит потока данных.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    onActivity();
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");

      if (data === "[DONE]") return;
      if (data) {
        let parsed: StreamEvent;
        try {
          parsed = JSON.parse(data) as StreamEvent;
        } catch {
          throw new Error("Модель вернула некорректный ответ.");
        }

        if (parsed.error) {
          throw new Error(
            Number(parsed.error.code) === 429
              ? "Бесплатная модель сейчас ограничивает запросы. Попробуйте позже или выберите другую модель."
              : "Модель прервала ответ. Попробуйте ещё раз.",
          );
        }

        const content = parsed.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) onText(content);
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  throw new Error("Соединение прервалось до завершения ответа.");
}
