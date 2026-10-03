import type { UIMessage } from "ai";

export function getComparisonTurns(messages: UIMessage[]) {
  const turns: { question: UIMessage; answers: UIMessage[] }[] = [];
  for (const message of messages) {
    if (message.role === "user") turns.push({ question: message, answers: [] });
    else if (message.role === "assistant") turns.at(-1)?.answers.push(message);
  }
  return turns;
}

export function isComparisonConversation(messages: UIMessage[], forSaving = false): boolean {
  if (messages.length === 0 || messages.length > 200 || messages[0].role !== "user") return false;
  if (messages.some((message) => message.role !== "user" && message.role !== "assistant"))
    return false;
  if (
    messages.some(
      (message) =>
        message.role === "user" &&
        (message.parts.some((part) => part.type !== "text") ||
          !message.parts.some((part) => part.type === "text" && part.text.trim())),
    )
  )
    return false;
  const last = messages.at(-1)!;
  return forSaving
    ? last.role === "assistant" &&
        last.parts.some((part) => part.type === "text" && Boolean(part.text.trim()))
    : last.role === "user";
}
