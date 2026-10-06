function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeUrl(raw: string) {
  const url = raw.trim();
  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return "";
}

function renderInline(value: string) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-secondary px-1.5 py-0.5 text-[0.9em]">$1</code>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const safeHref = sanitizeUrl(href);
      if (!safeHref) {
        return label;
      }
      const external = safeHref.startsWith("http");
      // `href` comes from text that is already escaped; escaping again would corrupt `&` in query strings.
      return `<a href="${safeHref}" class="font-medium text-foreground underline-offset-4 hover:underline"${external ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`;
    });
}

export function renderBlogMarkdown(markdown: string) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inCode = false;
  const codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listItems = [];
      listType = null;
      return;
    }
    const items = listItems.map((item) => `<li>${renderInline(item)}</li>`).join("");
    html.push(
      listType === "ol"
        ? `<ol class="list-decimal space-y-2 pl-5">${items}</ol>`
        : `<ul class="list-disc space-y-2 pl-5">${items}</ul>`,
    );
    listItems = [];
    listType = null;
  };

  const flushCode = () => {
    if (!inCode) {
      return;
    }
    html.push(
      `<pre class="overflow-x-auto rounded-2xl border border-border bg-secondary/40 p-4 text-sm"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    );
    codeLines.length = 0;
    inCode = false;
  };

  for (const line of lines) {
    const fence = line.trim().startsWith("```");
    if (fence) {
      flushParagraph();
      flushList();
      if (inCode) {
        flushCode();
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const className =
        level === 1
          ? "text-3xl font-semibold tracking-tight text-foreground"
          : level === 2
            ? "text-2xl font-semibold tracking-tight text-foreground"
            : "text-lg font-semibold tracking-tight text-foreground";
      html.push(`<h${level} class="${className}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      html.push('<hr class="border-border/70" />');
      continue;
    }

    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      html.push(
        `<blockquote class="rounded-2xl border border-border/70 bg-secondary/20 px-5 py-4">${renderInline(line.slice(2))}</blockquote>`,
      );
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushCode();
  flushParagraph();
  flushList();

  return html.join("\n");
}
