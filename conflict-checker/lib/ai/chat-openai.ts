import { BaseChatProvider } from "./chat-base";

// Inert until OPENAI_API_KEY is set. Uses fetch (no SDK dependency required).
export class OpenAIChatProvider extends BaseChatProvider {
  readonly name = "openai";
  private model = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

  protected async complete(system: string, user: string): Promise<string> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY is not set. Use AI_CHAT_PROVIDER=groq or claude until you add a key.",
      );
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI chat failed: ${res.status}`);
    const json = (await res.json()) as {
      choices: { message: { content: string } }[];
    };
    return json.choices[0]?.message?.content ?? "";
  }
}
