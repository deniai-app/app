type ActiveGeneration = {
  generationId: string;
  abortController: AbortController;
};

const activeGenerations = new Map<string, ActiveGeneration>();

export function startChatGeneration(chatId: string, generationId: string) {
  activeGenerations.get(chatId)?.abortController.abort("replaced");

  const abortController = new AbortController();
  activeGenerations.set(chatId, { generationId, abortController });

  return { abortController };
}

/** Abort only the given generation, never one that replaced it on this instance. */
export function stopChatGeneration(chatId: string, generationId: string) {
  const activeGeneration = activeGenerations.get(chatId);
  if (activeGeneration?.generationId !== generationId) {
    return false;
  }

  activeGeneration.abortController.abort("stopped");
  activeGenerations.delete(chatId);
  return true;
}

export function clearChatGeneration(chatId: string, generationId: string) {
  const activeGeneration = activeGenerations.get(chatId);
  if (activeGeneration?.generationId !== generationId) {
    return;
  }

  activeGenerations.delete(chatId);
}

export function isCurrentChatGeneration(chatId: string, generationId: string) {
  return activeGenerations.get(chatId)?.generationId === generationId;
}
