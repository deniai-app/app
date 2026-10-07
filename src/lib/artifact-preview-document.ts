/** The top-level blob belongs to the app; untrusted HTML belongs only to an opaque iframe. */
export function createSandboxedPreviewDocument(code: string, title = "Preview"): string {
  const srcDoc = code
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const escapedTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escapedTitle}</title><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block}</style></head><body><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${srcDoc}"></iframe></body></html>`;
}
