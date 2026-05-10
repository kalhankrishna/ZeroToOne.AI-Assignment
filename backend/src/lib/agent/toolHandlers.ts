import { prisma } from "../prisma.js";
import { estimateAudience } from "../sizing/estimate.js";
import {
  handleSearchCgFields,
  handleSearchLocation,
  handleSearchTransaction,
} from "../taxonomy/search.js";

// ─── Search Handlers ──────────────────────────────────────────────────────────

export async function toolSearchCgFields(input: {
  query: string;
  conversationId: string;
}) {
  return handleSearchCgFields(input);
}

export async function toolSearchLocation(input: {
  query: string;
  conversationId: string;
}) {
  return handleSearchLocation(input);
}

export async function toolSearchTransaction(input: {
  query: string;
  conversationId: string;
}) {
  return handleSearchTransaction(input);
}

// ─── Signal CRUD Handlers ─────────────────────────────────────────────────────

export async function toolAddSignal(input: {
  conversationId: string;
  type: "LOCATION" | "TRANSACTION" | "CONSUMER_GRAPH";
  label: string;
  confidence: number;
  data: Record<string, unknown>;
}) {

  await prisma.conversation.updateMany({
  where: {
    id:     input.conversationId,
    status: { in: ["CONFIRMED", "SIZED"] },
  },
  data: { status: "BUILDING" },
});

  const signal = await prisma.signal.create({
    data: {
      conversationId: input.conversationId,
      type:           input.type,
      label:          input.label,
      confidence:     input.confidence,
      data:           input.data as any,
    },
  });

  return {
    success: true,
    signalId: signal.id,
    label:    signal.label,
    type:     signal.type,
  };
}

export async function toolRemoveSignal(input: {
  conversationId: string;
  signalId: string;
}) {
  // Verify the signal belongs to this conversation before deleting
  const signal = await prisma.signal.findFirst({
    where: {
      id:             input.signalId,
      conversationId: input.conversationId,
    },
  });

  if (!signal) {
    return {
      success: false,
      error: `Signal ${input.signalId} not found in this conversation.`,
    };
  }

  await prisma.conversation.updateMany({
  where: {
    id:     input.conversationId,
    status: { in: ["CONFIRMED", "SIZED"] },
  },
  data: { status: "BUILDING" },
});

  await prisma.signal.delete({ where: { id: input.signalId } });

  return { success: true, signalId: input.signalId };
}

export async function toolGetSignals(input: { conversationId: string }) {
  const signals = await prisma.signal.findMany({
    where:   { conversationId: input.conversationId },
    orderBy: { createdAt: "asc" },
  });

  return {
    conversationId: input.conversationId,
    count:          signals.length,
    signals:        signals.map((s) => ({
      id:         s.id,
      type:       s.type,
      label:      s.label,
      confidence: s.confidence,
      data:       s.data,
    })),
  };
}

export async function toolConfirmSignals(input: { conversationId: string }) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
  });

  if (!conversation) {
    return { error: "Conversation not found." };
  }

  await prisma.conversation.update({
    where: { id: input.conversationId },
    data:  { status: "CONFIRMED" },
  });

  return { success: true, status: "CONFIRMED" };
}

// ─── Estimate Handler ─────────────────────────────────────────────────────────

export async function toolEstimateAudience(input: {
  conversationId: string;
}) {
  // Gate: conversation must be CONFIRMED
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
  });

  if (!conversation) {
    return { error: "Conversation not found." };
  }

  if (conversation.status !== "CONFIRMED" && conversation.status !== "SIZED") {
    return {
      error: `Audience must be confirmed before sizing. Current status: ${conversation.status}. Ask the user to confirm the signal set first.`,
    };
  }

  // Fetch current signals
  const signals = await prisma.signal.findMany({
    where: { conversationId: input.conversationId },
  });

  if (signals.length === 0) {
    return { error: "No signals defined. Add signals before estimating." };
  }

  const cgCount    = signals.filter((s) => s.type === "CONSUMER_GRAPH").length;
  const locCount   = signals.filter((s) => s.type === "LOCATION").length;
  const txnCount   = signals.filter((s) => s.type === "TRANSACTION").length;

  if (cgCount > 5 || locCount > 5 || txnCount > 5) {
    return {
      warning: true,
      low: null,
      high: null,
      message: `You have ${Math.max(cgCount, locCount, txnCount)} signals in a single category. The estimate will be very small due to signal overlap. Consider trimming to 2-3 strongest signals per category for a more meaningful reach number.`,
    };
  }

  // Compute estimate
  const { low, high } = estimateAudience(
    signals.map((s) => ({
      id:         s.id,
      type:       s.type as "LOCATION" | "TRANSACTION" | "CONSUMER_GRAPH",
      label:      s.label,
      confidence: s.confidence,
      data:       s.data as unknown as Parameters<typeof estimateAudience>[0][number]["data"],
    }))
  );

  // Persist low/high — reasoning will be filled in by route handler
  // after Claude writes its response text
  await prisma.audienceEstimate.upsert({
    where:  { conversationId: input.conversationId },
    create: {
      conversationId: input.conversationId,
      estimateLow:    low,
      estimateHigh:   high,
      reasoning:      "",
    },
    update: {
      estimateLow:  low,
      estimateHigh: high,
      reasoning:    "",
    },
  });

  // Update conversation status to SIZED
  await prisma.conversation.update({
    where: { id: input.conversationId },
    data:  { status: "SIZED" },
  });

  return { low, high };
}

export async function generateConversationTitle(
  conversationId: string,
  firstUserMessage: string
): Promise<void> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key":          process.env.ANTHROPIC_API_KEY!,
      "anthropic-version":  "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 20,
      messages: [
        {
          role:    "user",
          content: `Generate a concise 3-5 word title for an audience targeting campaign based on this description: "${firstUserMessage}". Respond with the title only. No punctuation, no quotes.`,
        },
      ],
    }),
  });

  if (!response.ok) return;

  const json = (await response.json()) as {
    content: { type: string; text: string }[];
  };

  const title = json.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (title) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data:  { title },
    });
  }
}