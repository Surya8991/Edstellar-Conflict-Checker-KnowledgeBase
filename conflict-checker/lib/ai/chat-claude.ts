import Anthropic from "@anthropic-ai/sdk";
import { BaseChatProvider } from "./chat-base";

export class ClaudeChatProvider extends BaseChatProvider {
  readonly name = "claude";
  private client: Anthropic;
  private model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  constructor() {
    super();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
    this.client = new Anthropic({ apiKey: key });
  }

  protected async complete(system: string, user: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      temperature: 0.2,
      system: `${system} Respond with valid JSON only — no markdown fences.`,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text : "";
  }
}
