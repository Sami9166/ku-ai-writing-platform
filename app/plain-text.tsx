import { Fragment, type ReactNode } from "react";

export type PlainTextRenderOptions = {
  highlightTexts?: readonly string[];
};

const HIGHLIGHT_OPEN = "\uE000";
const HIGHLIGHT_CLOSE = "\uE001";
const HIGHLIGHT_MARKER_PATTERN = /(\uE000|\uE001)/g;

function addHighlightMarkers(text: string, highlightTexts: readonly string[]) {
  const ranges = highlightTexts
    .filter(Boolean)
    .map((highlightText) => ({ text: highlightText, start: text.indexOf(highlightText) }))
    .filter((range) => range.start >= 0)
    .sort((a, b) => a.start - b.start || b.text.length - a.text.length);

  const selected: typeof ranges = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    selected.push(range);
    cursor = range.start + range.text.length;
  }

  let marked = text;
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const range = selected[index];
    marked = marked.slice(0, range.start)
      + HIGHLIGHT_OPEN
      + range.text
      + HIGHLIGHT_CLOSE
      + marked.slice(range.start + range.text.length);
  }
  return marked;
}

export function renderPlainText(text: string, options: PlainTextRenderOptions = {}): ReactNode {
  const nodes: ReactNode[] = [];
  let highlighted = false;
  let keyIndex = 0;

  for (const part of addHighlightMarkers(text, options.highlightTexts ?? []).split(HIGHLIGHT_MARKER_PATTERN)) {
    if (!part) continue;
    if (part === HIGHLIGHT_OPEN) {
      highlighted = true;
      continue;
    }
    if (part === HIGHLIGHT_CLOSE) {
      highlighted = false;
      continue;
    }

    for (const [lineIndex, line] of part.split("\n").entries()) {
      if (lineIndex > 0) nodes.push(<br key={"br-" + keyIndex++} />);
      if (!line) continue;
      nodes.push(highlighted
        ? <mark key={"mark-" + keyIndex++}>{line}</mark>
        : <Fragment key={"text-" + keyIndex++}>{line}</Fragment>);
    }
  }

  return <>{nodes}</>;
}
