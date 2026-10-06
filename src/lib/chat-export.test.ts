import type { UIMessage } from "ai";
import { afterEach, expect, test, vi } from "vitest";
import { exportAsPdf, resolveExportMessages } from "./chat-export";

class Element {
  id = "";
  textContent = "";
  children: Element[] = [];
  removed = false;
  constructor(readonly tag: string) {}
  append(...elements: Element[]) {
    this.children.push(...elements);
  }
  remove() {
    this.removed = true;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
});

function printEnvironment(fail = false) {
  const body = new Element("body");
  const head = new Element("head");
  let afterPrint: (() => void) | undefined;
  const print = vi.fn(() => {
    if (fail) throw new Error("Print failed");
  });
  const removeEventListener = vi.fn();
  vi.stubGlobal("document", { body, head, createElement: (tag: string) => new Element(tag) });
  vi.stubGlobal("window", {
    print,
    requestAnimationFrame: (callback: () => void) => callback(),
    addEventListener: (_event: string, callback: () => void) => {
      afterPrint = callback;
    },
    removeEventListener,
  });
  return { body, head, print, removeEventListener, finish: () => afterPrint?.() };
}
const messages: UIMessage[] = Array.from({ length: 150 }, (_, index) => ({
  id: String(index),
  role: index % 2 ? "assistant" : "user",
  parts: [
    { type: "text", text: index === 0 ? "<script>older message</script>" : `Message ${index}` },
  ],
}));
const labels = { title: "Full transcript", userLabel: "ユーザー", assistantLabel: "Deni AI" };

test("PDF includes the full transcript in order and cleans up after print/cancel", async () => {
  const ui = printEnvironment();
  const pending = exportAsPdf(messages, labels);
  expect(ui.print).toHaveBeenCalledOnce();
  const container = ui.body.children[0];
  expect(container.children).toHaveLength(151);
  expect(container.children[1].children[0].textContent).toBe("ユーザー");
  expect(container.children[1].children[1].textContent).toBe("<script>older message</script>");
  expect(container.children[150].children[1].textContent).toBe("Message 149");
  expect(container.removed).toBe(false);
  expect(ui.head.children[0].textContent).toContain("@media print");
  ui.finish();
  await pending;
  expect(container.removed).toBe(true);
  expect(ui.head.children[0].removed).toBe(true);
  expect(ui.removeEventListener).toHaveBeenCalledOnce();
});

test("a print failure removes the temporary DOM and propagates to the menu", async () => {
  const ui = printEnvironment(true);
  await expect(exportAsPdf(messages, labels)).rejects.toThrow("Print failed");
  expect(ui.body.children[0].removed).toBe(true);
  expect(ui.head.children[0].removed).toBe(true);
});

test("PDF resolves the full saved transcript before printing", async () => {
  const fetchTranscript = vi.fn(async () => messages);
  const resolved = await resolveExportMessages(messages.slice(-10), fetchTranscript, true);
  const ui = printEnvironment();
  const pending = exportAsPdf(resolved, labels);
  expect(fetchTranscript).toHaveBeenCalledOnce();
  expect(ui.body.children[0].children).toHaveLength(151);
  ui.finish();
  await pending;
});

test("PDF rejects a failed transcript fetch while other formats keep their fallback", async () => {
  const loaded = messages.slice(-10);
  const fetchTranscript = async () => {
    throw new Error("Transcript unavailable");
  };
  await expect(resolveExportMessages(loaded, fetchTranscript, true)).rejects.toThrow(
    "Transcript unavailable",
  );
  await expect(resolveExportMessages(loaded, fetchTranscript)).resolves.toBe(loaded);
});
