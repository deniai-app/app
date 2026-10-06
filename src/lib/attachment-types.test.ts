import { expect, test } from "vitest";
import { decodeTextAttachment, textMediaTypeForName } from "./attachment-types";

test("accepts known text extensions only", () => {
  expect(textMediaTypeForName("notes.md")).toBe("text/markdown");
  expect(textMediaTypeForName("data.JSON")).toBe("application/json");
  expect(textMediaTypeForName("a.constructor")).toBeNull();
  expect(textMediaTypeForName("a.__proto__")).toBeNull();
  expect(textMediaTypeForName("archive.zip")).toBeNull();
  expect(textMediaTypeForName("noextension")).toBeNull();
});

test("decodes UTF-8, Shift_JIS and Western ANSI text", () => {
  expect(decodeTextAttachment(new TextEncoder().encode("こんにちは"))).toBe("こんにちは");
  // "日本" in Shift_JIS
  expect(decodeTextAttachment(new Uint8Array([0x93, 0xfa, 0x96, 0x7b]))).toBe("日本");
  // "café " in windows-1252: 0xE9 followed by a space is invalid UTF-8 and Shift_JIS.
  expect(decodeTextAttachment(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x20, 0x6f, 0x6b]))).toBe(
    "café ok",
  );
});

test("does not turn other legacy encodings into mojibake", () => {
  // "日本語" in EUC-JP
  expect(decodeTextAttachment(new Uint8Array([0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec]))).toBeNull();
});

test("rejects binary content", () => {
  expect(decodeTextAttachment(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toBeNull();
  expect(decodeTextAttachment(new Uint8Array([0x81, 0x02, 0x03, 0xff, 0xfe, 0x01]))).toBeNull();
});
