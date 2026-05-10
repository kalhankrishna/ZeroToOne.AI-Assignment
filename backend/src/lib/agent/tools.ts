import type Anthropic from "@anthropic-ai/sdk";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_cg_fields",
    description: `Searches the consumer graph taxonomy for signals about WHO people are.
Use for: age, gender, income, education, language, religion, ethnicity, interests,
hobbies, lifestyle, household composition, children, credit cards, investing,
donation behavior, property ownership, financial behavior, purchase behaviors.
Do NOT use for physical places people visit or purchase/transaction categories.
Returns results with similarity scores, zone assessments, and decoded value options
for ALPHA fields.`,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language description of the consumer attribute to search for",
        },
        conversationId: {
          type: "string",
          description: "The current conversation ID",
        },
      },
      required: ["query", "conversationId"],
    },
  },

  {
    name: "search_location_taxonomy",
    description: `Searches the location taxonomy for signals about WHERE people physically go.
Use for: retail stores, restaurants, gyms, fitness centers, offices, venues,
service businesses, healthcare facilities, entertainment venues, any category
of real-world place people visit.
Do NOT use for who people are, their demographics, interests, or what they buy.
Returns results with similarity scores and zone assessments.`,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language description of the type of place people visit",
        },
        conversationId: {
          type: "string",
          description: "The current conversation ID",
        },
      },
      required: ["query", "conversationId"],
    },
  },

  {
    name: "search_transaction_taxonomy",
    description: `Searches the transaction taxonomy for signals about WHAT people buy.
Use for: purchase categories, spending behavior, transaction history, retail
purchase types, product categories people spend money on.
Do NOT use for demographics, interests, or physical location visits.
Returns results with similarity scores and zone assessments.`,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language description of the purchase or spending behavior",
        },
        conversationId: {
          type: "string",
          description: "The current conversation ID",
        },
      },
      required: ["query", "conversationId"],
    },
  },

  {
    name: "add_signal",
    description: `Adds a confirmed targeting signal to the audience definition for this conversation.
Call immediately for HIGH zone results.
Call only after user selects their preferred option for MEDIUM zone results.
Never call for LOW zone results.`,
    input_schema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "The current conversation ID",
        },
        type: {
          type: "string",
          enum: ["LOCATION", "TRANSACTION", "CONSUMER_GRAPH"],
          description: "The taxonomy source this signal came from",
        },
        label: {
          type: "string",
          description: "Human-readable label for this signal shown in the UI",
        },
        confidence: {
          type: "number",
          description: "The similarity score from the search result (0-1)",
        },
        data: {
          type: "object",
          description: `Structured signal data. Shape varies by type:
LOCATION: { type, top_category, sub_category }
TRANSACTION: { type, level1, level2?, level3?, level4? }
CONSUMER_GRAPH BOOL: { type, field, fieldType, value: boolean }
CONSUMER_GRAPH INT: { type, field, fieldType, range: { min, max } }
CONSUMER_GRAPH ALPHA single: { type, field, fieldType, value: string, label: string }
CONSUMER_GRAPH ALPHA multi: { type, field, fieldType, values: string[], labels: string[] }`,
        },
      },
      required: ["conversationId", "type", "label", "confidence", "data"],
    },
  },

  {
    name: "remove_signal",
    description: `Removes a targeting signal from the audience definition.
Call when the user asks to remove, delete, or exclude a signal.
Call get_signals first if you need to find the signalId.`,
    input_schema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "The current conversation ID",
        },
        signalId: {
          type: "string",
          description: "The ID of the signal to remove",
        },
      },
      required: ["conversationId", "signalId"],
    },
  },

  {
    name: "get_signals",
    description: `Retrieves the current confirmed signal set for this conversation.
Use mid-turn when you need signalIds for removal.
Not needed at conversation start — the signal set is already injected into context.`,
    input_schema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "The current conversation ID",
        },
      },
      required: ["conversationId"],
    },
  },

  {
    name: "confirm_signals",
    description: `Marks the current signal set as confirmed and locks it in for audience estimation.
    Call when the user explicitly approves the signal set with phrases like "looks good",
    "confirmed", "yes", "go ahead", "that works", or any clear expression of approval.
    Must be called before estimate_audience will work.`,
    input_schema: {
        type: "object",
        properties: {
        conversationId: {
            type: "string",
            description: "The current conversation ID",
        },
        },
        required: ["conversationId"],
    },
    },

  {
    name: "estimate_audience",
    description: `Estimates the reachable audience size for the current confirmed signal set.
Only call after the user has explicitly confirmed their signal set.
Never call on an unconfirmed or partial signal set.
Fetches current signals internally — no need to pass signals explicitly.`,
    input_schema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
          description: "The current conversation ID",
        },
      },
      required: ["conversationId"],
    },
  },
];