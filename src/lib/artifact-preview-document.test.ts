import { load } from "cheerio";
import { expect, test } from "vitest";
import { createSandboxedPreviewDocument } from "./artifact-preview-document";

test("untrusted scripts and quote breakouts stay inside an opaque sandbox", () => {
  const code =
    '" onload="alert(1)"><script>fetch("/api/trpc/apiKeys.create",{credentials:"include"})</script><p>&copy;</p>';
  const document = load(createSandboxedPreviewDocument(code));
  const iframe = document("iframe");
  expect(iframe).toHaveLength(1);
  expect(iframe.attr("srcdoc")).toBe(code);
  expect(iframe.attr("sandbox")).toBe("allow-scripts");
  expect(document("script")).toHaveLength(0);
  expect(document("[onload]")).toHaveLength(0);
});

test("sandboxed previews cannot navigate the app, open popups, or inherit its origin", () => {
  const iframe = load(createSandboxedPreviewDocument("<h1>Interactive preview</h1>"))("iframe");
  expect(iframe.attr("sandbox")?.split(" ")).toEqual(["allow-scripts"]);
  expect(iframe.attr("referrerpolicy")).toBe("no-referrer");
});
