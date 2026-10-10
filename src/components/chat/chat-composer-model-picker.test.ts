import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ChatComposerModelPicker } from "./chat-composer-model-picker";
import { models } from "@/lib/constants";

vi.mock("next-intl", () => ({
  useExtracted: () => (message: string) => message,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-available-models", () => ({
  useAvailableModels: () => ({ shouldVerifyCard: false }),
}));
vi.mock("@/hooks/use-model-health", () => ({
  useModelHealth: () => ({}),
}));
vi.mock("@/lib/model-description-copy", () => ({
  useModelDescriptionCopy: () => ({}),
  translateModelDescription: () => "Description",
}));

const render = (props: { disabled?: boolean; ariaLabel?: string; className?: string } = {}) =>
  renderToStaticMarkup(
    createElement(ChatComposerModelPicker, {
      model: models[0].value,
      selectedModel: models[0],
      availableModels: [...models],
      onModelChange: () => {},
      ...props,
    }),
  );

test("the regular composer picker remains enabled by default", () => {
  const html = render();
  expect(html).toContain(models[0].name);
  expect(html.match(/<button[^>]*>/)?.[0]).not.toContain('disabled=""');
});

test("comparison pickers support independent accessible labels and constrained width", () => {
  const html = render({ ariaLabel: "First model", className: "max-w-full min-w-0" });
  expect(html).toContain('aria-label="First model"');
  expect(html).toContain("max-w-full min-w-0");
});

test("the picker can be disabled during generation or saving", () => {
  const html = render({ disabled: true, ariaLabel: "Second model" });
  const trigger = html.match(/<button[^>]*>/)?.[0];
  expect(trigger).toContain('disabled=""');
  expect(trigger).toContain('aria-label="Second model"');
  expect(trigger).toContain('aria-expanded="false"');
});
