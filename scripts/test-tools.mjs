// S2: does Muse Spark do tool calling, and does it accept a rejected call?
// Run with:  node --env-file=.env scripts/test-tools.mjs

const API_URL = "https://api.meta.ai/v1/chat/completions";
const MODEL = "muse-spark-1.3";
const KEY = process.env.META_API_KEY;
if (!KEY) {
  console.error("META_API_KEY is missing. Put it in .env");
  process.exit(1);
}

// What really exists in this room. The AI does not decide this.
const room = { name: "Crypt", items: ["rusty key"], enemy: "goblin" };

const tools = [
  {
    type: "function",
    function: {
      name: "roll_dice",
      description: "Roll a die. Use for any attack or risky action.",
      parameters: {
        type: "object",
        properties: { sides: { type: "integer", description: "Number of sides, e.g. 20" } },
        required: ["sides"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "give_item",
      description: "Give the player an item that is in the current room.",
      parameters: {
        type: "object",
        properties: { item: { type: "string" } },
        required: ["item"],
      },
    },
  },
];

// The rule engine: code decides what actually happens.
function runTool(name, args) {
  if (name === "roll_dice") {
    const sides = Number(args.sides) || 20;
    return { ok: true, roll: 1 + Math.floor(Math.random() * sides), sides };
  }
  if (name === "give_item") {
    if (room.items.includes(args.item)) return { ok: true, item: args.item };
    return { ok: false, reason: `There is no "${args.item}" in the ${room.name}.` };
  }
  return { ok: false, reason: `Unknown tool ${name}` };
}

async function chat(messages) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto" }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, JSON.stringify(body, null, 2));
    process.exit(1);
  }
  return body.choices[0].message;
}

const messages = [
  {
    role: "system",
    content:
      `You are the game master. The player is in the ${room.name} with a ${room.enemy}. ` +
      `Items here: ${room.items.join(", ")}. You can only change the game by calling tools. ` +
      `If a tool returns ok:false, tell the player it failed. Keep narration to 2 sentences.`,
  },
  { role: "user", content: "I attack the goblin, then I grab the legendary sword from the corner." },
];

console.log("--- Request 1: player action ---");
const first = await chat(messages);

if (!first.tool_calls?.length) {
  console.log("No tool calls returned. Raw reply:\n", JSON.stringify(first, null, 2));
  process.exit(0);
}

messages.push(first);
for (const call of first.tool_calls) {
  const args = JSON.parse(call.function.arguments || "{}");
  const result = runTool(call.function.name, args);
  console.log(`${result.ok ? "ACCEPTED" : "REJECTED"}  ${call.function.name}(${JSON.stringify(args)}) ->`, result);
  messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
}

console.log("\n--- Request 2: narration after the rule engine ---");
const second = await chat(messages);
console.log(second.content);