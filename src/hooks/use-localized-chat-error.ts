import { useExtracted } from "next-intl";
import { toDisplayChatRequestError } from "@/lib/chat-request-error";

/** Translates the English chat error strings returned by `/api/chat`. */
export function useLocalizedChatError() {
  const t = useExtracted();

  return (error: unknown): string => {
    const text = toDisplayChatRequestError(error, t("An unexpected error occurred."));

    const unavailable = text.match(
      /^(.+) models are currently unavailable\. Please try again later\.$/,
    );
    if (unavailable) {
      return t("{provider} models are currently unavailable. Please try again later.", {
        provider: unavailable[1],
      });
    }

    const highDemand = text.match(
      /^(.+) models are experiencing high demand right now\. Please try again later\.$/,
    );
    if (highDemand) {
      return t(
        "{provider} models are experiencing high demand right now. Please try again later.",
        {
          provider: highDemand[1],
        },
      );
    }

    const contextWithTokens = text.match(
      /^(.+) exceeded its context window \(([\d,]+) tokens\)\. Start a new chat or trim earlier messages\/files\.$/,
    );
    if (contextWithTokens) {
      return t(
        "{model} exceeded its context window ({tokens} tokens). Start a new chat or trim earlier messages/files.",
        { model: contextWithTokens[1], tokens: contextWithTokens[2] },
      );
    }

    const context = text.match(
      /^(.+) exceeded its context window\. Start a new chat or trim earlier messages\/files\.$/,
    );
    if (context) {
      return t(
        "{model} exceeded its context window. Start a new chat or trim earlier messages/files.",
        { model: context[1] },
      );
    }

    switch (text) {
      case "You've hit the usage limit for your plan.":
      case "Usage limit reached for your plan.":
        return t("You've hit the usage limit for your plan.");
      case "This model is not available on the Free plan. Upgrade to Plus or higher to use it.":
        return t(
          "This model is not available on the Free plan. Upgrade to Plus or higher to use it.",
        );
      case "Pro mode is not available on the Free plan. Upgrade to Plus or higher to use it.":
        return t(
          "Pro mode is not available on the Free plan. Upgrade to Plus or higher to use it.",
        );
      case "Only GPT-6 Luna is available for guest sessions.":
        return t("Only GPT-6 Luna is available for guest sessions. Log in to use more models.");
      case "Pro mode is not available for guest sessions.":
        return t("Pro mode is not available for guest sessions. Log in to use it.");
      case "Premium models are not available for guest sessions.":
        return t("Premium models are not available for guest sessions. Log in to use them.");
      case "Fast, Pro, and Deep Research are not available for guest sessions.":
        return t(
          "Fast, Pro, and Deep Research are not available for guest sessions. Log in to use them.",
        );
      default:
        return text;
    }
  };
}
