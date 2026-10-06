import type { UIMessage } from "ai";

function getTextFromMessage(message: UIMessage): string {
  const texts: string[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      texts.push(part.text);
    }
  }
  return texts.join("\n");
}

export function exportAsMarkdown(messages: UIMessage[], title?: string): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`# ${title}`, "");
  }

  for (const message of messages) {
    const text = getTextFromMessage(message);
    if (!text.trim()) continue;

    if (message.role === "user") {
      lines.push("**User**", "", text, "");
    } else if (message.role === "assistant") {
      lines.push("**Assistant**", "", text, "");
    }
  }

  return lines.join("\n");
}

/** Share transcript loading across exports; PDF must fail rather than print a partial window. */
export async function resolveExportMessages(
  messages: UIMessage[],
  fetchTranscript: () => Promise<UIMessage[]>,
  requireFullTranscript = false,
): Promise<UIMessage[]> {
  try {
    const transcript = await fetchTranscript();
    return transcript.length > 0 ? transcript : messages;
  } catch (error) {
    if (requireFullTranscript) throw error;
    return messages;
  }
}

export function exportAsJson(messages: UIMessage[]): string {
  return JSON.stringify(messages, null, 2);
}

export function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Print the resolved transcript, independently of the lazy conversation window. */
export async function exportAsPdf(
  messages: UIMessage[],
  {
    title,
    userLabel,
    assistantLabel,
  }: { title?: string; userLabel: string; assistantLabel: string },
): Promise<void> {
  const container = document.createElement("main");
  container.id = "chat-print-transcript";
  const style = document.createElement("style");
  // There is no existing print stylesheet. Hide the app only for this export;
  // textContent below keeps message HTML and scripts inert.
  style.textContent = `
    #chat-print-transcript { display: none; }
    @media print {
      body > *:not(#chat-print-transcript) { display: none !important; }
      html, body { height: auto !important; overflow: visible !important; }
      #chat-print-transcript {
        display: block !important; color: #000; background: #fff;
        font: 12pt/1.5 system-ui, sans-serif;
      }
      #chat-print-transcript h1 { font-size: 20pt; }
      #chat-print-transcript h2 { font-size: 12pt; break-after: avoid; }
      #chat-print-transcript p { white-space: pre-wrap; overflow-wrap: anywhere; }
    }
  `;
  if (title) {
    const heading = document.createElement("h1");
    heading.textContent = title;
    container.append(heading);
  }
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = getTextFromMessage(message);
    if (!text.trim()) continue;
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = message.role === "user" ? userLabel : assistantLabel;
    const content = document.createElement("p");
    content.textContent = text;
    section.append(heading, content);
    container.append(section);
  }
  document.head.append(style);
  document.body.append(container);

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.removeEventListener("afterprint", afterPrint);
      container.remove();
      style.remove();
    };
    const afterPrint = () => {
      cleanup();
      resolve();
    };
    window.addEventListener("afterprint", afterPrint, { once: true });
    // Let the print-only DOM reach layout before opening the print dialog.
    window.requestAnimationFrame(() => {
      try {
        window.print();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  });
}
