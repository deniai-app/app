export type SearchResult = {
  title: string;
  url: string;
  description: string;
};

export type ChatToolUsageContext = {
  userId: string;
  isAnonymous: boolean;
  onCharged?: (event: { amount: number; maxModeAmount: number }) => void;
  onRefunded?: (event: { amount: number; maxModeRefunded: number }) => void;
};

export type CreateChatToolsOptions = {
  webSearch?: boolean;
  usage?: ChatToolUsageContext;
};
