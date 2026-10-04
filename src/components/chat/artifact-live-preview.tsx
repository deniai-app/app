"use client";

import * as React from "react";
import { AlertCircleIcon } from "lucide-react";
import { startTransition, useEffect, useMemo, useReducer, useRef } from "react";
import { useExtracted } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { sha256Hex } from "@/lib/hash";
import { cn } from "@/lib/utils";

const DIRECT_JSX_REGEX = /^\s*(?:<>|<\w|<\s*[A-Z])/;
const REACT_IMPORT_SPECIFIERS = new Set([
  "react",
  "react-dom/client",
  "react/jsx-dev-runtime",
  "react/jsx-runtime",
]);
const PREVIEW_ERROR_MESSAGE_TYPE = "deni-ai:artifact-preview:error";

const COMPONENT_NAME_PATTERNS = [
  /\bexport\s+function\s+([A-Z]\w*)\b/,
  /\bfunction\s+([A-Z]\w*)\b/,
  /\bconst\s+([A-Z]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
  /\blet\s+([A-Z]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
  /\bvar\s+([A-Z]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
] as const;

type PreviewState =
  | { status: "idle" | "loading" }
  | { status: "ready"; resetKey: string; srcDoc: string }
  | { status: "error"; error: Error };

type PreviewAction =
  | { type: "loading" }
  | { type: "ready"; resetKey: string; srcDoc: string }
  | { type: "error"; error: Error };

type PreviewMessages = {
  exportComponentError: string;
  nothingToPreview: string;
  unknownError: string;
  unsupportedImports: (imports: string) => string;
};

const stripCodeFence = (code: string) =>
  code
    .replace(/^\s*```[\w-]*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();

function previewReducer(_state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case "loading":
      return { status: "loading" };
    case "ready":
      return { status: "ready", resetKey: action.resetKey, srcDoc: action.srcDoc };
    case "error":
      return { status: "error", error: action.error };
  }
}

const findUnsupportedImports = (source: string) =>
  Array.from(source.matchAll(/^\s*import[\s\S]*?from\s*["']([^"']+)["'];?\s*$/gm)).flatMap(
    (match) => {
      const specifier = match[1];
      return REACT_IMPORT_SPECIFIERS.has(specifier) ? [] : [specifier];
    },
  );

const createUnsupportedImportsMessage = (messages: PreviewMessages, specifiers: string[]) =>
  messages.unsupportedImports(specifiers.map((specifier) => `"${specifier}"`).join(", "));

const resolvePreviewSource = (rawCode: string, messages: PreviewMessages) => {
  const source = stripCodeFence(rawCode);

  if (!source) {
    throw new Error(messages.nothingToPreview);
  }

  const unsupportedImports = findUnsupportedImports(source);
  if (unsupportedImports.length > 0) {
    throw new Error(createUnsupportedImportsMessage(messages, unsupportedImports));
  }

  if (DIRECT_JSX_REGEX.test(source)) {
    return `export default function Preview() { return (${source}); }`;
  }

  if (/\bexport\s+default\b/.test(source)) {
    return source;
  }

  for (const pattern of COMPONENT_NAME_PATTERNS) {
    const match = source.match(pattern);
    if (match) {
      return `${source}\n\nexport default ${match[1]};`;
    }
  }

  return `export default function Preview() { return (${source}); }`;
};

const createPreviewDocument = ({
  previewId,
  transpiledCode,
  unsupportedImportsMessage,
  exportComponentError,
}: {
  previewId: string;
  transpiledCode: string;
  unsupportedImportsMessage: string;
  exportComponentError: string;
}) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
      }

      html,
      body,
      #root {
        height: 100%;
      }

      body {
        margin: 0;
        background: transparent;
        color: #111827;
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      #root {
        box-sizing: border-box;
        overflow: auto;
        padding: 16px;
      }

      .artifact-preview-error {
        white-space: pre-wrap;
        word-break: break-word;
        color: #b91c1c;
        font-size: 14px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">
      // Preview rendering currently depends on esm.sh for React runtime modules.
      // If that CDN is unavailable or blocked, preview rendering fails until these imports are cached or replaced with bundled/local copies.
      import React from "https://esm.sh/react@19";
      import * as ReactDomClient from "https://esm.sh/react-dom@19/client";
      import * as ReactJsxRuntime from "https://esm.sh/react@19/jsx-runtime";
      import * as ReactJsxDevRuntime from "https://esm.sh/react@19/jsx-dev-runtime";

      const previewId = ${JSON.stringify(previewId)};
      const transpiledCode = ${JSON.stringify(transpiledCode)};
      const unsupportedImportsMessage = ${JSON.stringify(unsupportedImportsMessage)};
      const exportComponentError = ${JSON.stringify(exportComponentError)};

      const rootElement = document.getElementById("root");

      const escapeHtml = (value) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const sendError = (message) => {
        window.parent.postMessage(
          {
            type: ${JSON.stringify(PREVIEW_ERROR_MESSAGE_TYPE)},
            previewId,
            message,
          },
          "*",
        );
      };

      const unknownErrorMessage = ${JSON.stringify("{{unknownError}}")};

      const resolveErrorMessage = (error) =>
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : unknownErrorMessage;

      let capturedElement = null;

      const reactDomClientShim = {
        createRoot() {
          return {
            render(children) {
              if (React.isValidElement(children)) {
                capturedElement = children;
              }
            },
            unmount() {},
          };
        },
        hydrateRoot(_container, initialChildren) {
          if (React.isValidElement(initialChildren)) {
            capturedElement = initialChildren;
          }

          return {
            render(children) {
              if (React.isValidElement(children)) {
                capturedElement = children;
              }
            },
            unmount() {},
          };
        },
      };

      window.addEventListener("error", (event) => {
        sendError(resolveErrorMessage(event.error ?? event.message));
      });

      window.addEventListener("unhandledrejection", (event) => {
        sendError(resolveErrorMessage(event.reason));
      });

      try {
        const module = { exports: {} };
        const exports = module.exports;
        const require = (specifier) => {
          if (specifier === "react") {
            return React;
          }

          if (specifier === "react-dom/client") {
            return reactDomClientShim;
          }

          if (specifier === "react/jsx-runtime") {
            return ReactJsxRuntime;
          }

          if (specifier === "react/jsx-dev-runtime") {
            return ReactJsxDevRuntime;
          }

          throw new Error(
            unsupportedImportsMessage.replace("{imports}", \`"\${specifier}"\`),
          );
        };

        const evaluated = new Function(
          "exports",
          "module",
          "require",
          "React",
          \`\${transpiledCode}
return module.exports.default ?? exports.default ?? module.exports;\`,
        )(exports, module, require, React);

        const element =
          capturedElement ??
          (React.isValidElement(evaluated)
            ? evaluated
            : typeof evaluated === "function"
              ? React.createElement(evaluated)
              : (() => {
                  throw new Error(exportComponentError);
                })());

        const root = ReactDomClient.createRoot(rootElement);
        root.render(element);
      } catch (error) {
        const message = resolveErrorMessage(error);
        rootElement.innerHTML = \`<div class="artifact-preview-error">\${escapeHtml(message)}</div>\`;
        sendError(message);
      }
    </script>
  </body>
</html>`;

const evaluatePreview = async (rawCode: string, messages: PreviewMessages) => {
  // TypeScript 7 no longer ships the classic compiler API (transpileModule).
  // Sucrase is a lightweight browser-friendly TS/TSX → JS transform for previews.
  const { transform } = await import("sucrase");
  const source = resolvePreviewSource(rawCode, messages);

  let transpiledCode: string;
  try {
    transpiledCode = transform(source, {
      transforms: ["typescript", "jsx", "imports"],
      production: true,
    }).code;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  const hash = await sha256Hex(rawCode);
  const resetKey = `${rawCode.length}:${hash}`;

  return {
    resetKey,
    srcDoc: createPreviewDocument({
      previewId: resetKey,
      transpiledCode,
      unsupportedImportsMessage: messages.unsupportedImports("{imports}"),
      exportComponentError: messages.exportComponentError,
    }).replaceAll("{{unknownError}}", messages.unknownError),
  };
};

function PreviewErrorMessage({
  error,
  title,
  className,
}: {
  error: Error;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-xl items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-left text-sm text-destructive",
        className,
      )}
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="whitespace-pre-wrap break-words text-destructive/90">{error.message}</p>
      </div>
    </div>
  );
}

export function ArtifactLivePreview({ code }: { code: string }) {
  const t = useExtracted();
  const messages = useMemo<PreviewMessages>(
    () => ({
      exportComponentError: t("The code must export a React component."),
      nothingToPreview: t("There is nothing to preview."),
      unknownError: t("Unknown error"),
      unsupportedImports: (imports) =>
        t("Only React imports are supported in previews. Unsupported imports: {imports}", {
          imports,
        }),
    }),
    [t],
  );
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const activePreviewIdRef = useRef<string | null>(null);
  const [state, dispatchPreview] = useReducer(previewReducer, { status: "idle" });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const data =
        event.data && typeof event.data === "object"
          ? (event.data as { message?: string; previewId?: string; type?: string })
          : null;

      if (
        data?.type !== PREVIEW_ERROR_MESSAGE_TYPE ||
        data.previewId !== activePreviewIdRef.current ||
        !data.message
      ) {
        return;
      }

      startTransition(() => {
        dispatchPreview({ type: "error", error: new Error(data.message) });
      });
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    activePreviewIdRef.current = null;

    dispatchPreview({ type: "loading" });

    void evaluatePreview(code, messages)
      .then(({ resetKey, srcDoc }) => {
        if (cancelled) {
          return;
        }

        activePreviewIdRef.current = resetKey;
        startTransition(() => {
          dispatchPreview({ type: "ready", resetKey, srcDoc });
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          dispatchPreview({
            type: "error",
            error: error instanceof Error ? error : new Error(t("Preview failed")),
          });
        });
      });

    return () => {
      cancelled = true;
      activePreviewIdRef.current = null;
    };
  }, [code, messages, t]);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        <span>{t("Building preview…")}</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <PreviewErrorMessage error={state.error} title={t("Preview failed")} />
      </div>
    );
  }

  if (state.status !== "ready") {
    return null;
  }

  return (
    <iframe
      key={state.resetKey}
      ref={iframeRef}
      className="size-full border-0"
      sandbox="allow-scripts"
      srcDoc={state.srcDoc}
      title={t("Preview")}
    />
  );
}
