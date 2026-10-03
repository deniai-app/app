import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ComparisonSettingsControls } from "./comparison-settings";
import { comparisonSettingsSchema } from "@/lib/comparison-settings";
import { models } from "@/lib/constants";

vi.mock("next-intl", () => ({ useExtracted: () => (message: string) => message }));

const model = {
  ...models[0],
  efforts: ["low", "high"] as const,
  supportsProMode: true,
  supportsFastMode: true,
};
function render(
  options: {
    disabled?: boolean;
    webToolsAvailable?: boolean;
    enabledTools?: ("search" | "browse")[];
  } = {},
) {
  return renderToStaticMarkup(
    createElement(ComparisonSettingsControls, {
      model,
      settings: comparisonSettingsSchema.parse({
        enabledTools: options.enabledTools ?? ["search", "browse"],
      }),
      onChange: () => {},
      disabled: options.disabled ?? false,
      webToolsAvailable: options.webToolsAvailable ?? true,
    }),
  );
}

test("comparison controls expose effort, search, research, modes and tool permissions", () => {
  const html = render();
  for (const label of [
    "Reasoning effort",
    "Search",
    "Deep Research",
    "Pro",
    "Fast",
    "Search tool",
    "Browse tool",
  ])
    expect(html).toContain(label);
  expect(html.match(/role="switch"/g)).toHaveLength(6);
  expect(html).toContain('role="combobox"');
});

test("unconfigured web tools are hidden", () => {
  const html = render({ webToolsAvailable: false });
  expect(html).not.toMatch(/Allowed tools|Search tool|Browse tool|Deep Research/);
  expect(html.match(/role="switch"/g)).toHaveLength(2);
});

test("all settings are disabled during generation", () => {
  const html = render({ disabled: true });
  expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  const switches = html.match(/<span[^>]*role="switch"[^>]*>/g) ?? [];
  expect(switches).toHaveLength(6);
  for (const control of switches) expect(control).toContain('aria-disabled="true"');
  expect(html.match(/<button[^>]*role="combobox"[^>]*>/)?.[0]).toContain('disabled=""');
});

test("forcing search and research is disabled when search tool is forbidden", () => {
  const html = render({ enabledTools: ["browse"] });
  const controls = html.match(/<span[^>]*role="switch"[^>]*>/g) ?? [];
  expect(controls).toHaveLength(6);
  expect(controls[0]).toContain('aria-disabled="true"');
  expect(controls[1]).toContain('aria-disabled="true"');
  expect(controls[5]).not.toContain('aria-disabled="true"');
});
