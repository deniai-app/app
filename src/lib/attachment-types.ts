/**
 * Plain-text attachments (JSON, CSV, Markdown, source code, ...). They have no
 * magic bytes, so they are accepted by extension and then checked to really be
 * decodable text. They are stored under a safe type (never HTML or SVG) and
 * inlined into the prompt rather than sent to the model as a file part.
 */
const JSON_TYPE = "application/json";
const MARKDOWN_TYPE = "text/markdown";
const CSV_TYPE = "text/csv";
const PLAIN_TYPE = "text/plain";

const TEXT_EXTENSION_TYPES: Record<string, string> = {
  json: JSON_TYPE,
  ipynb: JSON_TYPE,
  md: MARKDOWN_TYPE,
  markdown: MARKDOWN_TYPE,
  mdx: MARKDOWN_TYPE,
  csv: CSV_TYPE,
};

const PLAIN_TEXT_EXTENSIONS = [
  "txt",
  "text",
  "log",
  "jsonl",
  "ndjson",
  "tsv",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "mjs",
  "cjs",
  "jsx",
  "ts",
  "tsx",
  "vue",
  "svelte",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "scala",
  "dart",
  "lua",
  "r",
  "c",
  "h",
  "cc",
  "cpp",
  "hpp",
  "cs",
  "php",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "tex",
  "srt",
  "vtt",
  "diff",
  "patch",
];

for (const extension of PLAIN_TEXT_EXTENSIONS) {
  TEXT_EXTENSION_TYPES[extension] = PLAIN_TYPE;
}

/** Largest text file accepted. Text goes into the prompt, so it is kept well below the 10 MB binary limit. */
export const MAX_TEXT_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** The type a text attachment is stored under, or `null` when the file name is not an accepted text type. */
export function textMediaTypeForName(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const extension = name.slice(dot + 1).toLowerCase();
  // Own-property check: `constructor` and `__proto__` must not pass as extensions.
  return Object.hasOwn(TEXT_EXTENSION_TYPES, extension) ? TEXT_EXTENSION_TYPES[extension] : null;
}

export function isTextMediaType(mediaType: string | null | undefined) {
  return Boolean(mediaType) && (mediaType === JSON_TYPE || mediaType?.startsWith("text/"));
}

/** C0 controls other than tab, newline, form feed and carriage return, plus DEL. */
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\x00-\x08\x0b\x0e-\x1f\x7f]/;

/** At most 10% high bytes (or two, for tiny files) and no run of four: CJK double-byte text is made of long high-byte runs. */
function looksLikeWesternText(bytes: Uint8Array) {
  let high = 0;
  let run = 0;
  for (const byte of bytes) {
    if (byte < 0x80) {
      run = 0;
      continue;
    }
    high += 1;
    run += 1;
    if (run >= 4) return false;
  }
  return high <= Math.max(2, bytes.length * 0.1);
}

function hasNullByte(bytes: Uint8Array) {
  return bytes.subarray(0, 8192).includes(0);
}

function decodeStrict(label: string, bytes: Uint8Array) {
  try {
    return new TextDecoder(label, { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decode an uploaded text file to a string, or `null` when it is binary.
 * Covers UTF-8, UTF-16 with a byte-order mark, Shift_JIS (CSV exports from
 * Japanese spreadsheets) and, as a last resort, windows-1252 (Western "ANSI"
 * exports), which accepts every byte but the few it leaves undefined.
 */
export function decodeTextAttachment(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decodeStrict("utf-16le", bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decodeStrict("utf-16be", bytes);

  // UTF-16 text has NUL bytes by design, so only reject them for the 8-bit encodings.
  if (hasNullByte(bytes)) return null;

  const strict = decodeStrict("utf-8", bytes) ?? decodeStrict("shift_jis", bytes);
  if (strict !== null) return strict;

  // windows-1252 never fails, so it would turn binary files and other legacy
  // encodings (EUC-JP, GBK, Big5, EUC-KR) into mojibake. Accept it only for text
  // that looks Western: mostly ASCII, with accented letters scattered singly.
  if (!looksLikeWesternText(bytes)) return null;
  const legacy = decodeStrict("windows-1252", bytes);
  return legacy !== null && !CONTROL_CHARACTERS.test(legacy.slice(0, 8192)) ? legacy : null;
}
