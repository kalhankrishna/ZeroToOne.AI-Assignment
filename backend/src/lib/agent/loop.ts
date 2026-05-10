import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { TOOLS } from "./tools.js";
import {
  toolSearchCgFields,
  toolSearchLocation,
  toolSearchTransaction,
  toolAddSignal,
  toolRemoveSignal,
  toolGetSignals,
  toolConfirmSignals,
  toolEstimateAudience,
} from "./toolHandlers.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentContext {
  conversationId: string;
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
  signals: {
    id: string;
    type: string;
    label: string;
    confidence: number;
    data: unknown;
  }[];
  status: "BUILDING" | "CONFIRMED" | "SIZED";
}

export interface AgentResult {
  assistantMessage: string;
  toolCallsMade: string[];
  estimateCalled: boolean;
}

// ─── Context Injection ────────────────────────────────────────────────────────

function buildStateInjection(ctx: AgentContext): string {
  const signalList = ctx.signals.map((s) => ({
    id:         s.id,
    type:       s.type,
    label:      s.label,
    confidence: s.confidence,
    data:       s.data,
  }));

  return `[CONTEXT]
CONVERSATION_ID (use this exact string for all tool calls): ${ctx.conversationId}
Status: ${ctx.status}
Current signals (${ctx.signals.length}):
${JSON.stringify(signalList, null, 2)}
[/CONTEXT]

Please continue helping the media planner with their audience definition.`;
}

function buildMessages(ctx: AgentContext): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  // Inject current state first if signals exist
  if (ctx.signals.length > 0) {
    messages.push({
      role:    "user",
      content: buildStateInjection(ctx),
    });
    messages.push({
      role:    "assistant",
      content: "Understood. I have the current audience definition loaded.",
    });
  }

  // Append conversation history
  for (const msg of ctx.history) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Append current user message
  messages.push({ role: "user", content: ctx.userMessage });

  return messages;
}

// ─── Tool Dispatch ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  conversationId: string  // injected from context, not from Claude
): Promise<unknown> {
  // Always override whatever conversationId Claude passes
  const safeInput = { ...input, conversationId };

  switch (name) {
    case "search_cg_fields":
      return toolSearchCgFields(safeInput as { query: string; conversationId: string });
    case "search_location_taxonomy":
      return toolSearchLocation(safeInput as { query: string; conversationId: string });
    case "search_transaction_taxonomy":
      return toolSearchTransaction(safeInput as { query: string; conversationId: string });
    case "add_signal":
      return toolAddSignal(safeInput as {
        conversationId: string;
        type: "LOCATION" | "TRANSACTION" | "CONSUMER_GRAPH";
        label: string;
        confidence: number;
        data: Record<string, unknown>;
      });
    case "remove_signal":
      return toolRemoveSignal(safeInput as { conversationId: string; signalId: string });
    case "get_signals":
      return toolGetSignals(safeInput as { conversationId: string });
    case "confirm_signals":
      return toolConfirmSignals(safeInput as { conversationId: string });
    case "estimate_audience":
      return toolEstimateAudience(safeInput as { conversationId: string });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ─── Agent Loop ───────────────────────────────────────────────────────────────

const client = new Anthropic();

export async function runAgentLoop(ctx: AgentContext): Promise<AgentResult> {
  const messages = buildMessages(ctx);
  const toolCallsMade: string[] = [];
  let estimateCalled = false;
  let turns = 0;
  const MAX_TURNS = 10;

  while (true) {
    if (turns++ >= MAX_TURNS) {
      return {
        assistantMessage: "I ran into an issue processing your request. Please try again.",
        toolCallsMade,
        estimateCalled,
      };
    }

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      tools:      TOOLS,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const assistantMessage = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return { assistantMessage, toolCallsMade, estimateCalled };
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          toolCallsMade.push(block.name);
          if (block.name === "estimate_audience") estimateCalled = true;

          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>,
            ctx.conversationId
          );

          if (block.name === "estimate_audience") {
            const r = result as any;
            if (r.low != null && r.high != null) {
              estimateCalled = true;
            }
          }

          return {
            type:        "tool_result" as const,
            tool_use_id: block.id,
            content:     JSON.stringify(result),
          };
        })
      );

      // Append assistant turn + tool results to messages for next iteration
      messages.push({
        role:    "assistant",
        content: response.content as Anthropic.MessageParam["content"],
      });
      messages.push({
        role:    "user",
        content: toolResults,
      });
    }
  }
}