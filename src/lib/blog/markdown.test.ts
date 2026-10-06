import { expect, test } from "vitest";
import { renderBlogMarkdown } from "./markdown";

test("keeps every query parameter of a link intact", () => {
  const html = renderBlogMarkdown("[x](https://a.com/?a=1&b=2)");
  expect(html).toContain('href="https://a.com/?a=1&amp;b=2"');
  expect(html).not.toContain("&amp;amp;");
});

test("does not let a link break out of its attribute", () => {
  const html = renderBlogMarkdown('[x](https://a.com/?q="onmouseover=alert(1))');
  expect(html).not.toContain('"onmouseover');
});

test("drops links with unsafe protocols", () => {
  expect(renderBlogMarkdown("[x](javascript:alert(1))")).not.toContain("href");
});
