// Groq via its OpenAI-compatible REST API (plain fetch; server only).
import { AI_TIMEOUT_MS, SYSTEM_PROMPT } from "../prompt";

export async function groqComplete(user: string): Promise<{ text: string; model: string }> {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  if (!key || !model) throw new Error("Groq is not configured");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      // The open-weight models on Groq reason before answering; leave room for that and keep it short.
      max_completion_tokens: 2000,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq returned HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new Error("Groq returned no text");
  return { text, model };
}
