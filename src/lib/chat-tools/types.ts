export type SearchResult = {
  title: string;
  url: string;
  description: string;
};

export type ChatToolUsageContext = {
  userId: string;
  isAnonymous: boolean;
};

export type CreateChatToolsOptions = {
  webSearch?: boolean;
  interactive?: boolean;
  enabledTools?: readonly ("search" | "browse")[];
  usage?: ChatToolUsageContext;
};
