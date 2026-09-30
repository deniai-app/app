"use client";

import { MessageSquare, Code, Image, FileText, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ChatComposer, type ComposerMessage } from "@/components/chat/chat-composer";
import { ProjectSelect } from "@/components/projects/project-select";
import { useAvailableModels } from "@/hooks/use-available-models";
import { useNewChat } from "@/hooks/use-new-chat";
import { defaultModel, getPreferredReasoningEffort, type ReasoningEffort } from "@/lib/constants";
import { trpc } from "@/lib/trpc/react";

// Storage key for passing initial message data to chat page
const INITIAL_MESSAGE_STORAGE_KEY = "deni_initial_message:v1";

export type InitialMessageData = {
  text: string;
  files: Array<{
    type: "file";
    filename?: string;
    mediaType: string;
    url: string;
  }>;
  webSearch: boolean;
  model: string;
  videoMode: boolean;
  imageMode: boolean;
  reasoningEffort: ReasoningEffort;
  proMode: boolean;
  fastMode: boolean;
  deepResearch: boolean;
  projectId: string | null;
};

type SuggestionCardProps = {
  icon: React.ElementType;
  title: string;
  prompt: string;
  onClick: (prompt: string) => void;
};

function SuggestionCard({ icon: Icon, title, prompt, onClick }: SuggestionCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(prompt)}
      className="group flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-card text-left transition-colors hover:bg-accent"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{prompt}</p>
    </button>
  );
}

export default function ChatHome() {
  const t = useExtracted();
  const { push } = useRouter();
  const startNewChat = useNewChat();
  const { availableModels, platformCapabilities } = useAvailableModels();
  const { features } = platformCapabilities;
  const [input, setInput] = useState("");
  const [model, setModel] = useState(defaultModel.value);
  const [webSearch, setWebSearch] = useState(false);
  const [videoMode, setVideoMode] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() =>
    getPreferredReasoningEffort(defaultModel.efforts),
  );
  const [proMode, setProMode] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const projectsQuery = trpc.projects.list.useQuery();
  const selectedModel = availableModels.find((entry) => entry.value === model);
  const effectiveWebSearch = features.webSearch && webSearch;
  const effectiveVideoMode = features.videoGeneration && videoMode;
  const effectiveImageMode = features.imageGeneration && imageMode;
  const effectiveDeepResearch = features.webSearch && deepResearch;

  // Fall back when the current selection is not allowed on this plan.
  if (!selectedModel && availableModels.length > 0) {
    setModel(
      availableModels.some((entry) => entry.value === defaultModel.value)
        ? defaultModel.value
        : availableModels[0].value,
    );
  }

  const handleProjectChange = (nextProjectId: string | null) => {
    setProjectId(nextProjectId);
    const nextProject = projectsQuery.data?.find((project) => project.id === nextProjectId);
    const nextModel = nextProject?.defaultModel;
    if (nextModel && availableModels.some((entry) => entry.value === nextModel)) {
      setModel(nextModel);
    }
  };

  const handleSubmit = (
    message: ComposerMessage,
    options: {
      model: string;
      webSearch: boolean;
      videoMode: boolean;
      imageMode: boolean;
      reasoningEffort: ReasoningEffort;
      proMode: boolean;
      fastMode: boolean;
      deepResearch: boolean;
    },
  ) => {
    if ((!message.text.trim() && message.files.length === 0) || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const initialMessageData: InitialMessageData = {
        text: message.text,
        files: message.files.map((file) => ({
          type: "file" as const,
          filename: file.filename,
          mediaType: file.mediaType,
          url: file.url,
        })),
        webSearch: options.webSearch,
        model: options.model,
        videoMode: options.videoMode,
        imageMode: options.imageMode,
        reasoningEffort: options.reasoningEffort,
        proMode: options.proMode,
        fastMode: options.fastMode,
        deepResearch: options.deepResearch,
        projectId,
      };

      sessionStorage.setItem(INITIAL_MESSAGE_STORAGE_KEY, JSON.stringify(initialMessageData));

      startNewChat({ projectId });
    } catch (error) {
      console.error("Failed to start chat:", error);
      toast.error(t("An error occurred while starting the chat."));
      setIsSubmitting(false);
    }
  };

  const handleModelChange = (value: string) => {
    setModel(value);
    const nextModel = availableModels.find((entry) => entry.value === value);
    if (!nextModel?.supportsProMode) {
      setProMode(false);
    }
    if (!nextModel?.supportsFastMode) {
      setFastMode(false);
    }
    const nextEfforts = nextModel?.efforts;
    if (!nextEfforts) {
      return;
    }
    setReasoningEffort((current) =>
      nextEfforts.includes(current) ? current : getPreferredReasoningEffort(nextEfforts),
    );
  };

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
  };

  const suggestions = [
    {
      icon: PenLine,
      title: t("Creative Writing"),
      prompt: t("Write a short story about a robot learning to paint"),
    },
    {
      icon: Code,
      title: t("Code Help"),
      prompt: t("Explain how async/await works in JavaScript"),
    },
    {
      icon: FileText,
      title: t("Summarize"),
      prompt: t("Summarize the key benefits of renewable energy"),
    },
    {
      icon: Image,
      title: t("Analyze"),
      prompt: t("What makes a good user interface design?"),
    },
  ];

  return (
    <section
      aria-labelledby="chat-home-title"
      className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-4 [justify-content:safe_center]"
    >
      <div className="w-full max-w-2xl space-y-6 py-6">
        {/* Greeting */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" id="chat-home-title">
            {t("What's on your mind?")}
          </h1>
        </div>

        {/* Suggestions */}
        {/*<div className="grid grid-cols-2 gap-2">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.title}
              icon={suggestion.icon}
              title={suggestion.title}
              prompt={suggestion.prompt}
              onClick={handleSuggestionClick}
            />
          ))}
        </div>*/}

        {/* Composer */}
        <div>
          <ChatComposer
            bottomContent={
              <ProjectSelect
                projects={projectsQuery.data ?? []}
                value={projectId}
                onValueChange={handleProjectChange}
                onCreateClick={() => push("/settings/projects")}
                className="flex-wrap"
              />
            }
            value={input}
            onValueChange={setInput}
            onSubmit={handleSubmit}
            placeholder={t("Ask me anything...")}
            isSubmitDisabled={isSubmitting || availableModels.length === 0}
            availableModels={availableModels}
            model={model}
            onModelChange={handleModelChange}
            webSearch={effectiveWebSearch}
            onWebSearchChange={(enabled) => setWebSearch(enabled && features.webSearch)}
            webSearchAvailable={features.webSearch}
            videoMode={effectiveVideoMode}
            onVideoModeChange={(enabled) => setVideoMode(enabled && features.videoGeneration)}
            imageMode={effectiveImageMode}
            onImageModeChange={(enabled) => setImageMode(enabled && features.imageGeneration)}
            reasoningEffort={reasoningEffort}
            onReasoningEffortChange={setReasoningEffort}
            proMode={proMode}
            onProModeChange={setProMode}
            fastMode={fastMode}
            onFastModeChange={setFastMode}
            deepResearch={effectiveDeepResearch}
            onDeepResearchChange={(enabled) => setDeepResearch(enabled && features.webSearch)}
          />
        </div>
      </div>
    </section>
  );
}
