// Gemini via the REST API (plain fetch; the key travels in a header and never reaches the browser).
import { AI_TIMEOUT_MS, SYSTEM_PROMPT } from "../prompt";

export async function geminiComplete(user: string): Promise<{ text: string; model: string }> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!key || !model) throw new Error("Gemini is not configured");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no text");
  return { text, model };
}
