"use client";

import { FormEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { renderPlainText } from "./plain-text";

type Verdict = "valid" | "verify" | "revise";
type ChatSource = { title: string; url: string };
type ChatMessage = { id: string; role: "user" | "ai"; text: string; sources?: ChatSource[] };
type Highlight = { responseId: string; text: string };
type Assignment = { id: number; title: string; description: string; dueAt?: string; courseCode?: string };
type StudentSummary = {
  assignment?: Assignment;
  progress?: { review: number; edit: number; verify: number };
  submission?: { content?: string };
  conversation?: ChatMessage[];
};

const AI_ANSWER =
  "AI는 서비스 개발 과정에서 사용자 요구를 분석하고, 아이디어를 구체화하며, 기능을 설계하는 데 활용될 수 있어요. 또한 개발 과정에서는 코드 작성과 오류 수정, 테스트 자동화를 지원하여 개발 효율을 높일 수 있죠. AI가 제안하는 기능은 대부분 실제 사용자 검증 없이는 높은 정확도를 보장하므로 별도의 검증 과정을 마련해야 합니다.";

const fallbackAssignments: Assignment[] = [
  { id: 2, title: "글쓰기 1주차_AI 활용의 가능성과 한계", description: "AI 활용의 장점과 한계를 자신의 관점으로 정리해 보세요." },
  { id: 1, title: "글쓰기 2주차_고려대학교의 AI 발전을 위한 탐구", description: "고려대학교의 AI 교육·연구 현황과 향후 발전 방향을 탐구하는 글쓰기 과제입니다." },
  { id: 3, title: "글쓰기 3주차_AI 답변 검증과 근거 확인", description: "AI 답변의 근거를 확인하고 검증 결과를 글에 반영해 보세요." },
  { id: 4, title: "글쓰기 4주차_AI 활용 문제 해결 과정 성찰", description: "AI를 활용한 문제 해결 과정을 사례와 함께 작성해 보세요." },
  { id: 5, title: "글쓰기 5주차_책임 있는 AI 활용 선언", description: "AI 활용의 윤리와 투명성에 관한 자신의 기준을 제시해 보세요." },
];

const verdicts: { id: Verdict; label: string }[] = [
  { id: "valid", label: "타당함" },
  { id: "verify", label: "확인 필요" },
  { id: "revise", label: "수정 필요" },
];

const followups: Record<Verdict, { title: string; choices: string[] }> = {
  valid: {
    title: "이 판단을 어떻게 과제에 반영하시겠습니까?",
    choices: ["핵심 근거로 인용하기", "내 주장과 연결하기", "사례를 추가 요청하기"],
  },
  verify: {
    title: "이 문장을 어떻게 확인하시겠습니까?",
    choices: ["AI에게 추가 질문하기", "참고 문헌 확인하기", "직접 검색하기"],
  },
  revise: {
    title: "왜 수정이 필요하다고 판단했나요?",
    choices: ["근거가 부족해", "사실 여부가 불확실해", "다른 관점이 필요해", "기타"],
  },
};

const editorFonts = [
  { value: "Pretendard", label: "프리텐더드" },
  { value: "Malgun Gothic", label: "맑은 고딕" },
  { value: "Nanum Myeongjo", label: "나눔명조" },
];

const initialEssay = `
  <p><strong>1. 서론</strong><br />
  인공지능(AI)은 교육, 산업, 연구 등 사회 전반에 걸쳐 빠르게 확산되며 대학의 역할 또한 변화시키고 있다. 특히 대학은 AI 기술을 단순히 활용하는 것을 넘어, 새로운 연구를 수행하고 미래 인재를 양성하는 핵심 기관으로 자리 잡고 있다. 고려대학교의 AI 시대를 미래 핵심 성장 분야로 인식하고 다양한 교육과 연구를 추진하고 있지만, AI 기술의 발전 속도를 고려하면 더욱 체계적인 전략과 지속적인 혁신이 필요하다. 따라서 본 탐구에서는 고려대학교의 AI 교육 및 연구 현황을 살펴보고, 향후 AI 발전을 위해 필요한 방향을 제안하고자 한다.</p>
  <p><strong>2. 고려대학교 AI 교육 및 연구 현황</strong><br />
  현재 고려대학교는 다양한 전공에서 AI 관련 교과목을 운영하고 있으며, 컴퓨터학과를 비롯해 데이터사이언스, 산업경영공학, 경영학 등 여러 학문 분야에서 AI를 활용한 융합 교육이 이루어지고 있다. 또한 학생들은 머신러닝, 딥러닝, 데이터 분석 등의 과목을 수강하며 실제 프로젝트를 수행하고 있으며, 교내 연구실에서도 의료 AI, 자연어 처리(NLP), 컴퓨터 비전 등 다양한 분야의 연구가 진행되고 있다.</p>
  <p>이와 함께 학생들은 해커톤, 창업 동아리, 산학협력 프로젝트 등을 통해 AI 기술을 실제 서비스 개발에 적용하는 경험을 쌓고 있다.</p>
`;

export default function Home() {
  const studentId = "2022000009";
  const editorRef = useRef<HTMLDivElement>(null);
  const editorSelectionRef = useRef<Range | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  const [assignmentId, setAssignmentId] = useState(1);
  const [assignments, setAssignments] = useState<Assignment[]>(fallbackAssignments);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictResponseId, setVerdictResponseId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [progress, setProgress] = useState({ review: 13, edit: 4, verify: 2 });
  const [toast, setToast] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingEventIds, setPendingEventIds] = useState<string[]>([]);
  const verdictEventRequestRef = useRef<Promise<string | null> | null>(null);
  const currentAssignment = assignments.find((item) => item.id === assignmentId) ?? fallbackAssignments[1];

  useEffect(() => {
    const saved = window.localStorage.getItem("ku-ai-writing-draft");
    if (saved && editorRef.current) editorRef.current.innerHTML = saved;
  }, []);

  useEffect(() => {
    void apiFetch<{ assignments?: Assignment[] }>("/api/assignments").then((result) => {
      if (result?.assignments?.length) setAssignments(result.assignments);
    });
  }, []);

  useEffect(() => {
    let active = true;
    void apiFetch<StudentSummary>(`/api/students/${studentId}/summary?assignmentId=${assignmentId}`).then((summary) => {
      if (!active || !summary) return;
      if (summary.progress) setProgress(summary.progress);
      if (summary.conversation) setConversationHistory(summary.conversation);
      if (editorRef.current) {
        if (summary.submission?.content) {
          const parsed = new DOMParser().parseFromString(summary.submission.content, "text/html");
          editorRef.current.textContent = parsed.body.textContent ?? "";
        } else if ((summary.assignment?.id ?? assignmentId) === 1) {
          editorRef.current.innerHTML = initialEssay;
        } else {
          editorRef.current.textContent = `${summary.assignment?.description ?? currentAssignment.description}\n\n작성할 내용을 입력하세요.`;
        }
      }
    });
    return () => { active = false; };
  }, [assignmentId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const rememberEditorSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return;
    const range = selection.getRangeAt(0);
    if (editorRef.current.contains(range.commonAncestorContainer)) {
      editorSelectionRef.current = range.cloneRange();
    }
  };

  const restoreEditorSelection = () => {
    const selection = window.getSelection();
    const savedRange = editorSelectionRef.current;
    if (!selection || !savedRange || !editorRef.current?.contains(savedRange.commonAncestorContainer)) return;
    selection.removeAllRanges();
    selection.addRange(savedRange);
  };

  const runEditorCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    restoreEditorSelection();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    rememberEditorSelection();
  };

  const captureSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    const answerElement = element?.closest<HTMLElement>("[data-ai-response-id]");
    if (!answerElement) return;
    const responseId = answerElement.dataset.aiResponseId;
    if (!responseId) return;
    const text = selection.toString().trim();
    if (text.length > 2 && answerElement.textContent?.includes(text)) {
      const alreadyHighlighted = highlights.some((item) => item.responseId === responseId && item.text === text);
      const nextHighlights = alreadyHighlighted
        ? highlights.filter((item) => item.responseId !== responseId || item.text !== text)
        : [...highlights, { responseId, text }];
      setHighlights(nextHighlights);
      setActiveResponseId(nextHighlights.some((item) => item.responseId === responseId)
        ? responseId
        : nextHighlights.at(-1)?.responseId ?? null);
      void apiFetch("/api/events", {
        method: "POST",
        body: { studentId, assignmentId, type: "highlight", responseId, highlightedText: text, active: !alreadyHighlighted },
      });
      if (nextHighlights.length === 0) {
        setVerdict(null);
        setVerdictResponseId(null);
      }
    }
    selection.removeAllRanges();
  };

  const captureSelectionAfterTouch = () => {
    window.setTimeout(captureSelection, 0);
    window.setTimeout(captureSelection, 80);
  };

  const saveDraft = () => {
    if (editorRef.current) {
      const content = editorRef.current.innerHTML;
      window.localStorage.setItem("ku-ai-writing-draft", content);
      void apiFetch("/api/drafts", { method: "POST", body: { studentId, assignmentId, content } });
      setToast("현재 작성 내용이 임시 저장되었습니다.");
    }
  };

  const clearHighlights = () => {
    if (highlights.length === 0) return;
    void Promise.all(highlights.map((highlight) => apiFetch("/api/events", {
      method: "POST",
      body: { studentId, assignmentId, type: "highlight", responseId: highlight.responseId, highlightedText: highlight.text, active: false },
    })));
    setHighlights([]);
    setActiveResponseId(null);
    setVerdict(null);
    setVerdictResponseId(null);
    setPendingEventIds([]);
    verdictEventRequestRef.current = null;
    setToast("형광펜 표시를 모두 취소했습니다.");
  };

  const addEvidenceToEssay = async (nextVerdict: Verdict, responseId: string) => {
    const selectedHighlights = highlights.filter((highlight) => highlight.responseId === responseId);
    if (selectedHighlights.length === 0) {
      setToast("먼저 AI 답변에서 과제에 반영할 문장을 하이라이트해주세요.");
      return;
    }
    const label = verdicts.find((item) => item.id === nextVerdict)?.label ?? "AI 검토";
    const selectedText = selectedHighlights.map((highlight) => highlight.text).join("\n");
    const eventRequest = apiFetch<{ event?: { id?: string } }>("/api/events", {
      method: "POST",
      body: {
        studentId,
        assignmentId,
        type: "verdict",
        responseId,
        highlightedText: selectedHighlights.map((highlight) => highlight.text).join("\n"),
        verdict: nextVerdict,
        reason: nextVerdict === "revise" ? "수정 방향을 선택했습니다." : "AI 답변을 검토했습니다.",
      },
    }).then((result) => result?.event?.id ?? null).catch(() => null);
    verdictEventRequestRef.current = eventRequest;
    setPendingEventIds([]);
    setVerdict(nextVerdict);
    setVerdictResponseId(responseId);
    if (editorRef.current) {
      const note = document.createElement("p");
      note.className = `ai-note ai-note--${nextVerdict}`;
      note.innerHTML = `<strong>AI 참고 · ${label}</strong><br>${selectedText.replaceAll("\n", "<br />")}`;
      editorRef.current.appendChild(note);
      editorRef.current.scrollTop = editorRef.current.scrollHeight;
    }
    setProgress((current) => ({
      review: current.review + 1,
      edit: current.edit + (nextVerdict === "valid" ? 1 : 0),
      verify: current.verify + (nextVerdict === "verify" ? 1 : 0),
    }));
    setToast(`${selectedHighlights.length}개 선택 문장이 ‘${label}’ 기록으로 과제에 추가되었습니다.`);
    void eventRequest.then((eventId) => {
      if (verdictEventRequestRef.current !== eventRequest || !eventId) return;
      setPendingEventIds([eventId]);
    });
  };

  const chooseFollowup = async (choice: string) => {
    const selectedText = highlights
      .filter((highlight) => highlight.responseId === verdictResponseId)
      .map((highlight) => highlight.text)
      .join(" ");
    let parentEventIds = pendingEventIds;
    const pendingRequest = verdictEventRequestRef.current;
    if (parentEventIds.length === 0 && pendingRequest) {
      const eventId = await Promise.race([
        pendingRequest,
        new Promise<string | null>((resolve) => window.setTimeout(() => resolve(null), 1500)),
      ]);
      if (eventId) parentEventIds = [eventId];
    }
    void Promise.all(parentEventIds.map((parentEventId) => apiFetch("/api/events", {
      method: "POST",
      body: {
        studentId,
        assignmentId,
        type: "followup",
        parentEventId,
        method: choice,
        reason: verdict === "revise" ? choice : "확인 필요로 판단",
        executed: true,
      },
    })));
    verdictEventRequestRef.current = null;
    if (verdict === "verify") setProgress((current) => ({ ...current, verify: current.verify + 1 }));
    setVerdict(null);
    setVerdictResponseId(null);
    setPendingEventIds([]);
    const prompt = choice === "AI에게 추가 질문하기"
      ? `다음 AI 답변을 확인하고 싶어. 근거와 검증 방법을 구체적으로 알려줘: ${selectedText}`
      : choice === "참고 문헌 확인하기"
        ? `${selectedText}와 관련된 신뢰할 수 있는 참고 문헌이나 공식 자료를 찾아볼 수 있도록 검색어와 확인 기준을 제안해줘.`
        : choice === "직접 검색하기"
          ? `${selectedText}의 사실 여부를 직접 검색하려고 해. 검색어와 공식 출처 확인 방법을 알려줘.`
          : `${choice} 방향으로 다음 문장을 다듬고 싶어. ${selectedText}`;
    setInput(prompt);
    inputRef.current?.focus();
    setToast("다음 질문을 입력란에 준비했습니다. 내용을 확인한 뒤 전송해주세요.");
  };

  const sendAiMessage = async (message: string) => {
    const clean = message.trim();
    if (!clean || sendingRef.current) return;
    sendingRef.current = true;
    setIsSending(true);
    const userMessage: ChatMessage = { id: `local-user-${Date.now()}`, role: "user", text: clean };
    setMessages((current) => [...current, userMessage]);
    setConversationHistory((current) => [...current, userMessage]);
    setInput("");
    try {
      const result = await apiFetch<{ message?: { id?: string; text?: string; sources?: ChatSource[] } }>("/api/chat", { method: "POST", body: { studentId, assignmentId, message: clean } });
      const aiMessage: ChatMessage = {
        id: result?.message?.id ?? `local-ai-${Date.now()}`,
        role: "ai",
        text: result?.message?.text ?? "질문을 과제의 맥락과 연결해 검토했어요. 핵심 주장, 근거, 검증 방법을 구분해 작성하면 AI 활용 과정이 더 명확해집니다.",
        sources: result?.message?.sources ?? [],
      };
      setMessages((current) => [...current, aiMessage]);
      setConversationHistory((current) => [...current, aiMessage]);
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    await sendAiMessage(input);
  };

  const selectAssignment = (nextAssignmentId: number) => {
    if (nextAssignmentId === assignmentId) return;
    setHighlights([]);
    setActiveResponseId(null);
    setVerdict(null);
    setVerdictResponseId(null);
    setPendingEventIds([]);
    verdictEventRequestRef.current = null;
    setMessages([]);
    setAssignmentId(nextAssignmentId);
  };

  const submitEssay = async () => {
    const content = editorRef.current?.innerHTML ?? "";
    const result = await apiFetch<{ saved?: boolean }>("/api/submissions", { method: "POST", body: { studentId, assignmentId, content } });
    setSubmitOpen(false);
    setToast(result?.saved ? "과제가 성공적으로 제출되었습니다." : "로컬 서버가 꺼져 있어 화면에서만 제출 처리했습니다.");
  };

  const renderAnswer = (responseId: string, answer: string) => {
    const selectedHighlights = highlights
      .filter((highlight) => highlight.responseId === responseId)
      .map((highlight) => highlight.text);
    return renderPlainText(answer, {
      highlightTexts: selectedHighlights,
    });
  };

  const renderVerdictActions = (responseId: string, withAvatar = false) => {
    if (activeResponseId !== responseId || !highlights.some((highlight) => highlight.responseId === responseId)) return null;
    return (
      <div className={`verdict-actions${withAvatar ? " verdict-actions--with-avatar" : ""}`} aria-label="AI 답변 평가">
        {verdicts.map((item) => (
          <button
            key={item.id}
            type="button"
            className={verdict === item.id && verdictResponseId === responseId ? "selected" : ""}
            onClick={() => addEvidenceToEssay(item.id, responseId)}
          >
            {item.label}
          </button>
        ))}
        <button className="clear-highlight-button" type="button" onClick={clearHighlights}>
          형광펜 취소
        </button>
      </div>
    );
  };

  const preventToolbarBlur = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();

  return (
    <main className="workspace">
      <nav className="role-switch" aria-label="학생·교수자 화면 전환">
        {/* Native anchors avoid broken RSC prefetch in the static Vercel export. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="role-switch-option active" href="/" aria-current="page" onClick={(event) => { event.preventDefault(); window.location.assign("/"); }}>학생</a>
        <a className="role-switch-option" href="/instructor" onClick={(event) => { event.preventDefault(); window.location.assign("/instructor"); }}>교수자</a>
      </nav>
      <aside className="sidebar" aria-label="과제 탐색">
        <div>
          <div className="brand-lockup" aria-label="KUtrace">
            <img className="brand-lockup-logo" src="/ku-logo-horizontal.png" alt="고려대학교 로고" />
            <strong className="brand-lockup-name">KUtrace</strong>
            <span className="brand-lockup-tagline">고려대학교 AI 협업 과정 기록 및 평가 플랫폼</span>
          </div>
        </div>

        <nav className="assignment-list" aria-label="주차별 글쓰기 과제">
          {assignments.map((item) => (
            <button
              className={item.id === assignmentId ? "active" : ""}
              key={item.id}
              type="button"
              aria-pressed={item.id === assignmentId}
              onClick={() => selectAssignment(item.id)}
            >
              {item.title}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <section className="progress-card" aria-labelledby="progress-title">
            <h2 id="progress-title">AI 협업 진행 상황</h2>
            <div className="progress-grid">
              <button type="button" onClick={() => setToast("검토한 AI 답변 기록을 확인합니다.")}>
                <span>AI 답변 검토</span><strong>{progress.review}<small>회</small></strong>
              </button>
              <button type="button" onClick={() => setToast("과제에 반영한 수정 기록을 확인합니다.")}>
                <span>수정 반영</span><strong>{progress.edit}<small>회</small></strong>
              </button>
              <button type="button" onClick={() => setToast("근거 검증 기록을 확인합니다.")}>
                <span>근거 검증</span><strong>{progress.verify}<small>회</small></strong>
              </button>
            </div>
          </section>
            <div className="student-pill">
              <img className="student-avatar" src="/profile-avatar.png" alt="" aria-hidden="true" />
            <span>정지영&nbsp; | &nbsp;영어영문학과 4학년</span>
          </div>
        </div>
      </aside>

      <section className="writing-area" aria-labelledby="assignment-title">
        <h1 id="assignment-title">{currentAssignment.title}</h1>
        <div className="document-shell">
          <div className="editor-toolbar" aria-label="텍스트 편집 도구">
            <select aria-label="글꼴" defaultValue="Pretendard" onMouseDown={rememberEditorSelection} onChange={(event) => runEditorCommand("fontName", event.target.value)}>
              {editorFonts.map((font) => (
                <option value={font.value} key={font.value}>{font.label}</option>
              ))}
            </select>
            <select aria-label="글자 크기" defaultValue="3" onMouseDown={rememberEditorSelection} onChange={(event) => runEditorCommand("fontSize", event.target.value)}>
              <option value="2">12</option><option value="3">14</option><option value="4">18</option>
            </select>
            <button type="button" aria-label="굵게" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("bold")}><strong>가</strong></button>
            <button type="button" aria-label="기울임" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("italic")}><em>가</em></button>
            <button type="button" aria-label="밑줄" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("underline")}><u>가</u></button>
            <button type="button" className="cite-tool" onMouseDown={preventToolbarBlur} onClick={() => runEditorCommand("insertText", " [출처 필요]")}>인용</button>
          </div>
          <div
            ref={editorRef}
            className="essay-editor"
            contentEditable
            suppressContentEditableWarning
            spellCheck="true"
            role="textbox"
            aria-multiline="true"
            tabIndex={0}
            aria-label="과제 본문 편집기"
            onMouseUp={rememberEditorSelection}
            onKeyUp={rememberEditorSelection}
            onSelect={rememberEditorSelection}
            dangerouslySetInnerHTML={{ __html: initialEssay }}
          />
        </div>
        <div className="editor-actions">
          <button className="secondary-action" type="button" onClick={saveDraft}>임시저장</button>
          <button className="primary-action" type="button" onClick={() => setSubmitOpen(true)}>제출하기</button>
        </div>
      </section>

      <section className="ai-panel" aria-labelledby="ai-panel-title">
        <header className="ai-header">
          <h2 id="ai-panel-title">AI 협업 도우미</h2>
          <button className="menu-button" type="button" aria-label="AI 대화 메뉴" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <span /><span /><span />
          </button>
        </header>
        {menuOpen && (
          <div className="ai-menu">
            <button type="button" onClick={() => setMenuOpen(false)}>신고하기</button>
            <button type="button" onClick={() => { setMessages([]); setHighlights([]); setActiveResponseId(null); setVerdict(null); setVerdictResponseId(null); setPendingEventIds([]); verdictEventRequestRef.current = null; setMenuOpen(false); setToast("새 대화 화면을 준비했습니다. 기존 기록은 안전하게 보관됩니다."); }}>새 대화 시작</button>
            <button type="button" onClick={() => { setHistoryOpen(true); setMenuOpen(false); }}>이전 대화 보기</button>
            <button type="button" onClick={() => { setGuideOpen(true); setMenuOpen(false); }}>AI 활용 안내</button>
          </div>
        )}
        <p className="ai-instruction">AI 답변 중 과제에 반영할 중요 문장을 드래그해 하이라이트 표시해주세요.</p>
        <div className="chat-scroll">
            <img className="profile-icon user-profile" src="/profile-avatar.png" alt="" aria-hidden="true" />
          <div className="bubble bubble-user">AI를 서비스 개발에 어떻게 활용할 수 있어?</div>
          <div className="assistant-row">
              <img className="tiger" src="/ai-tiger.png" alt="" aria-hidden="true" />
            <div
              className="bubble bubble-ai"
              role="textbox"
              aria-readonly="true"
              tabIndex={0}
              data-ai-response-id="response-1"
              onMouseUp={captureSelection}
              onTouchEnd={captureSelectionAfterTouch}
              onKeyUp={captureSelection}
            >
              {renderAnswer("response-1", AI_ANSWER)}
            </div>
          </div>
          {renderVerdictActions("response-1", true)}
          {messages.map((message) => (
            message.role === "ai" ? (
              <div className="message-with-actions" key={message.id}>
                <div
                  className="bubble bubble-ai bubble-extra"
                  role="textbox"
                  aria-readonly="true"
                  data-ai-response-id={message.id}
                  tabIndex={0}
                  onMouseUp={captureSelection}
                  onTouchEnd={captureSelectionAfterTouch}
                  onKeyUp={captureSelection}
                >
                  <div className="message-text">{renderAnswer(message.id, message.text)}</div>
                  {message.sources && message.sources.length > 0 && (
                    <div className="source-links" aria-label="AI 답변 참고 링크">
                      <span>참고 링크</span>
                      {message.sources.map((source) => (
                        <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.title}</a>
                      ))}
                    </div>
                  )}
                </div>
                {renderVerdictActions(message.id)}
              </div>
            ) : (
            <div
              className="bubble bubble-user bubble-extra"
              key={message.id}
            >
              <span className="message-text">{message.text}</span>
            </div>
            )
          ))}
        </div>

        {verdict && (
          <section className="followup-card" aria-live="polite">
            <h3>{followups[verdict].title}</h3>
            {followups[verdict].choices.map((choice) => (
              <button type="button" key={choice} onClick={() => chooseFollowup(choice)}>
                <span>{choice}</span><span aria-hidden="true">→</span>
              </button>
            ))}
          </section>
        )}

        <form className="chat-input" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="ai-message">AI에게 질문하기</label>
          <input ref={inputRef} id="ai-message" value={input} onChange={(event) => setInput(event.target.value)} placeholder={isSending ? "AI가 답변을 작성하고 있습니다." : "제출 시 교수자가 AI 협업 과정을 함께 확인합니다."} disabled={isSending} />
          <button type="submit" aria-label={isSending ? "AI가 답변 작성 중" : "메시지 보내기"} disabled={isSending}>
            {isSending ? <span className="send-loading" aria-hidden="true"><i /><i /><i /></span> : <span className="send-arrow" aria-hidden="true">›</span>}
          </button>
        </form>
      </section>

      {toast && <div className="toast" role="status">{toast}</div>}
      {submitOpen && (
        <div className="modal-backdrop">
          <section className="submit-modal" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <span className="modal-icon">✓</span>
            <h2 id="submit-title">과제를 제출할까요?</h2>
            <p>작성 내용과 AI 협업 기록이 교수자에게 함께 제출됩니다.</p>
            <div>
              <button type="button" className="secondary-action" onClick={() => setSubmitOpen(false)}>돌아가기</button>
              <button type="button" className="primary-action" onClick={() => void submitEssay()}>최종 제출</button>
            </div>
          </section>
        </div>
      )}
      {historyOpen && (
        <div className="modal-backdrop">
          <section className="student-history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
            <button className="modal-close-button" type="button" aria-label="이전 대화 기록 닫기" onClick={() => setHistoryOpen(false)}>×</button>
            <h2 id="history-title">이전 AI 대화 기록</h2>
            <p>{currentAssignment.title}에서 저장된 학생과 AI의 대화입니다.</p>
            <div className="student-history-list">
              {conversationHistory.length > 0 ? conversationHistory.map((message) => (
                <article className={`student-history-message ${message.role}`} key={message.id}>
                  <strong>{message.role === "ai" ? "AI" : "학생"}</strong>
                  <div className="student-history-message-text">
                    {message.role === "ai" ? renderPlainText(message.text) : message.text}
                  </div>
                </article>
              )) : <p className="student-history-empty">저장된 대화가 아직 없습니다.</p>}
            </div>
          </section>
        </div>
      )}
      {guideOpen && (
        <div className="modal-backdrop">
          <section className="student-history-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title">
            <button className="modal-close-button" type="button" aria-label="AI 활용 안내 닫기" onClick={() => setGuideOpen(false)}>×</button>
            <h2 id="guide-title">AI 활용 안내</h2>
            <p>AI의 답변은 참고 자료입니다. 근거가 필요한 문장은 하이라이트한 뒤 확인 필요를 선택하고, 제안된 질문을 검토해 전송하세요.</p>
            <ul className="student-guide-list">
              <li>답변을 그대로 옮기기보다 자신의 주장과 논리로 다시 작성하세요.</li>
              <li>공식 자료나 참고 문헌으로 사실 여부를 확인하세요.</li>
              <li>제출문에는 AI를 사용한 목적과 활용 범위를 구체적으로 밝히세요.</li>
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
