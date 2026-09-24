import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { createExactSystemPromptExtension } = await jiti.import("./exact-system-prompt.ts");

function loadHandlers(extensionFactory) {
  const handlers = new Map();
  extensionFactory({
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  });
  return { handlers };
}

test("forces the exact prompt for each run through before_agent_start", async () => {
  let prompt = "context files";
  const { handlers } = loadHandlers(createExactSystemPromptExtension(() => prompt));
  assert.deepEqual([...handlers.keys()], ["before_agent_start"]);
  const handler = handlers.get("before_agent_start");
  const event = { type: "before_agent_start", prompt: "hi", systemPrompt: "Pi sections" };

  assert.deepEqual(await handler(event, {}), { systemPrompt: "context files" });
  // Reloaded context files are picked up by the next run.
  prompt = "updated context files";
  assert.deepEqual(await handler(event, {}), { systemPrompt: "updated context files" });
});

test("leaves the prompt alone when no exact prompt is configured", async () => {
  const { handlers } = loadHandlers(createExactSystemPromptExtension(() => undefined));
  assert.equal(await handlers.get("before_agent_start")({ type: "before_agent_start", prompt: "hi" }, {}), undefined);
});