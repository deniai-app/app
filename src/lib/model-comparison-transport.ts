import { DefaultChatTransport } from "ai";

export function createModelComparisonTransport() {
  return new DefaultChatTransport({
    prepareSendMessagesRequest: ({ body, messages, trigger, messageId }) => {
      // The SDK's default request body overwrites body.id with useChat's local ID.
      // Comparison uses explicit ephemeral IDs for each side of the conversation.
      if (typeof body?.id !== "string" || !body.id) {
        throw new Error("A comparison request ID is required.");
      }
      return { body: { ...body, messages, trigger, messageId, comparison: true } };
    },
  });
}
