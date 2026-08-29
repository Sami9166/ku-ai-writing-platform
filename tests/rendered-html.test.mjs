import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the KU AI writing workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>KUtrace \| 고려대학교 AI 협업 과정 기록 플랫폼<\/title>/i);
  assert.match(html, /글쓰기 2주차_고려대학교의 AI 발전을 위한 탐구/);
  assert.match(html, /AI 협업 진행 상황/);
  assert.match(html, /과제 본문 편집기/);
  assert.match(html, /학생·교수자 화면 전환/);
  assert.match(html, /href="\/instructor"/);
  assert.doesNotMatch(html, /AI 답변 평가/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);

  const instructorResponse = await render("/instructor");
  assert.equal(instructorResponse.status, 200);
  const instructorHtml = await instructorResponse.text();
  assert.match(instructorHtml, /AI 기반 학생 협업 요약/);
  assert.match(instructorHtml, /루브릭 반영률/);
  assert.match(instructorHtml, /학생 AI 탐구 기록/);
  assert.match(instructorHtml, /점수 저장하기/);
  assert.match(instructorHtml, /href="\/"/);

  const [page, instructorPage, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/instructor/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /contentEditable/);
  assert.match(page, /captureSelection/);
  assert.match(page, /setHighlights/);
  assert.match(page, /highlights\.some\(\(item\) => item\.responseId === responseId && item\.text === text\)/);
  assert.match(page, /if \(highlights\.length === 0\) return;/);
  assert.match(page, /clearHighlights/);
  assert.match(page, /renderPlainText/);
  assert.doesNotMatch(page, /renderMarkdown/);
  assert.match(page, /형광펜 취소/);
  assert.match(page, /editorSelectionRef/);
  assert.match(page, /styleWithCSS/);
  assert.match(page, /onMouseDown=\{rememberEditorSelection\}/);
  assert.match(page, /followup-card/);
  assert.match(page, /\/ku-logo-horizontal\.png/);
  assert.match(page, /Malgun Gothic/);
  assert.match(page, /Nanum Myeongjo/);
  assert.doesNotMatch(page, /Noto Sans KR|Nanum Gothic|NanumSquare|Batang|Noto Serif KR|Arial|Georgia/);
  assert.match(page, /\/profile-avatar\.png/);
  assert.match(page, /\/ai-tiger\.png/);
  assert.match(page, /aria-label="글자 크기" defaultValue="3"/);
  assert.match(page, /role-switch-option active/);
  assert.match(page, /href="\/instructor"/);
  assert.match(instructorPage, /setHelpOpen/);
  assert.match(instructorPage, /setConversationOpen/);
  assert.match(instructorPage, /chooseScore/);
  assert.match(instructorPage, /전체 대화 기록 보기/);
  assert.match(instructorPage, /renderPlainText/);
  assert.doesNotMatch(instructorPage, /renderMarkdown/);
  assert.match(instructorPage, /종합 점수/);
  assert.match(instructorPage, /role-switch-option active/);
  assert.match(layout, /KUtrace \| 고려대학교 AI 협업 과정 기록 플랫폼/);
  assert.match(layout, /og\.png/);
  assert.match(packageJson, /"dev":\s*"vinext dev"/);
  assert.doesNotMatch(packageJson, /WRANGLER_LOG_PATH=/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
