import type { GenerateInput, LLMEvent, LLMProvider } from "../llm";

/** Scripted events exercise the real loop without a network dependency. */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "firesync-mock-v1";
  constructor(private readonly script?: LLMEvent[][]) {}
  private step = 0;

  async *generate(input: GenerateInput): AsyncGenerator<LLMEvent> {
    input.signal.throwIfAborted();
    if (this.script) {
      for (const event of this.script[this.step++] ?? [
        { type: "finish", reason: "stop" },
      ]) {
        input.signal.throwIfAborted();
        yield event;
      }
      return;
    }
    const last = input.messages.at(-1);
    const en = input.system.includes("Response language: en");
    if (last?.role !== "tool") {
      yield {
        type: "tool_call",
        call: {
          id: "mock-guidance",
          name: "get_first_aid_guidance",
          arguments: { topic: "available_guidance", locale: en ? "en" : "es" },
        },
      };
      yield { type: "usage", usage: { input: 80, output: 20 } };
      yield { type: "finish", reason: "tool_calls" };
    } else {
      yield {
        type: "text",
        text: en
          ? "This is a scripted demonstration, not a Muse response. Reviewed first-aid content has not been loaded. In an emergency, call 9-1-1. A satellite detection is not a confirmed fire."
          : "Esta es una demostración guionizada, no una respuesta de Muse. Aún no se ha cargado contenido revisado de primeros auxilios. En una emergencia, llama al 9-1-1. Una detección satelital no es un incendio confirmado.",
      };
      yield { type: "usage", usage: { input: 100, output: 60 } };
      yield { type: "finish", reason: "stop" };
    }
  }
}
