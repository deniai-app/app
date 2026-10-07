import { createRequire } from "node:module";
import { expect, test } from "vitest";
const mathRequire = createRequire(import.meta.resolve("@streamdown/math"));
const katex = mathRequire("katex") as {
  renderToString: (source: string, options: Record<string, unknown>) => string;
};
test("inherited trust options cannot enable executable links in mathematical content", () => {
  const options = Object.assign(Object.create({ trust: true }), { throwOnError: false });
  const html = katex.renderToString("\\href{javascript:alert(1)}{click}", options);
  expect(html).not.toContain('href="javascript:');
});
