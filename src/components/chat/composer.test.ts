import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Composer } from "./composer";

vi.mock("next-intl", () => ({ useExtracted: () => (message: string) => message }));

const props = { value: "", onValueChange: () => {}, onSubmit: () => {} };

function addons(html: string) {
  return (html.match(/data-slot="input-group-addon"/g) ?? []).length;
}

test("the default Composer keeps its original header and expandable footer", () => {
  const html = renderToStaticMarkup(createElement(Composer, props));
  expect(addons(html)).toBe(2);
  expect(html).toContain("grid-rows-[0fr]");
  expect(html).toContain('aria-haspopup="menu"');
});

test("only explicitly compact text-only composers omit empty addon panels", () => {
  const html = renderToStaticMarkup(
    createElement(Composer, { ...props, compact: true, attachmentsEnabled: false }),
  );
  expect(addons(html)).toBe(0);
  expect(html).not.toContain("grid-rows-[0fr]");
  expect(html).not.toContain('aria-haspopup="menu"');
});
