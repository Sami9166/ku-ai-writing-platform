"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";
import { renderPlainText } from "../plain-text";

type Student = {
  id: string;
  name: string;
};
type Assignment = { id: number; title: string; description: string; dueAt?: string; courseCode?: string };

type RubricId = "initiative" | "prompt" | "critical" | "creative" | "transparent";

type Rubric = {
  id: RubricId;
  label: string;
  rate: number;
  reviewItems?: ReviewItem[];
};

type ScoreMap = Record<RubricId, number | null>;

type ReviewItem = {
  id: string;
  rubricId: RubricId;
  status: "needs_review" | "fulfilled" | "not_fulfilled";
  evidence: string;
  reason: string;
};

type ExplorationRecord = {
  id?: string;
  verdict: string;
  method: string;
  reason: string;
  sentence: string;
  executed?: boolean;
};

type ConversationMessage = { role: string; text: string };

type StudentSummary = {
  assignment?: Assignment;
  rubrics?: Partial<Record<RubricId, Rubric>>;
  scores?: Partial<ScoreMap>;
  explorationRecords?: ExplorationRecord[];
  conversation?: ConversationMessage[];
  submission?: { content?: string; submittedAt?: string; status?: string };
};

type EvaluationResult = {
  mode?: "local" | "groq" | "gemini";
  rubrics?: Partial<Record<RubricId, Rubric>>;
};

const fallbackStudents: Student[] = [
  { id: "2022000001", name: "김도연" },
  { id: "2023000002", name: "김민수" },
  { id: "2022000003", name: "김상민" },
  { id: "2024000004", name: "박지훈" },
  { id: "2022000005", name: "방소형" },
  { id: "2021000006", name: "이서연" },
  { id: "2022000007", name: "이현지" },
  { id: "2025000008", name: "정민준" },
  { id: "2022000009", name: "정지영" },
  { id: "2022000010", name: "주호빈" },
];

const fallbackAssignments: Assignment[] = [
  { id: 2, title: "글쓰기 1주차_AI 활용의 가능성과 한계", description: "AI 활용의 장점과 한계를 자신의 관점으로 정리해 보세요." },
  { id: 1, title: "글쓰기 2주차_고려대학교의 AI 발전을 위한 탐구", description: "고려대학교의 AI 교육·연구 현황과 향후 발전 방향을 탐구하는 글쓰기 과제입니다." },
  { id: 3, title: "글쓰기 3주차_AI 답변 검증과 근거 확인", description: "AI 답변의 근거를 확인하고 검증 결과를 글에 반영해 보세요." },
  { id: 4, title: "글쓰기 4주차_AI 활용 문제 해결 과정 성찰", description: "AI를 활용한 문제 해결 과정을 사례와 함께 작성해 보세요." },
  { id: 5, title: "글쓰기 5주차_책임 있는 AI 활용 선언", description: "AI 활용의 윤리와 투명성에 관한 자신의 기준을 제시해 보세요." },
];

const fallbackAssignmentDueDates: Record<number, string> = {
  1: "2026-08-08T23:59:59+09:00",
  2: "2026-08-01T23:59:59+09:00",
  3: "2026-08-15T23:59:59+09:00",
  4: "2026-08-22T23:59:59+09:00",
  5: "2026-08-29T23:59:59+09:00",
};

const fallbackAssignmentsWithDueDates = fallbackAssignments.map((assignment) => ({
  ...assignment,
  dueAt: fallbackAssignmentDueDates[assignment.id],
}));

const rubrics: Rubric[] = [
  { id: "initiative", label: "주도적 상호작용", rate: 68 },
  { id: "prompt", label: "프롬프트 설계", rate: 68 },
  { id: "critical", label: "비판적 평가", rate: 68 },
  { id: "creative", label: "창의적 재구성", rate: 68 },
  { id: "transparent", label: "윤리적 투명성", rate: 68 },
];

const initialScores: ScoreMap = {
  initiative: null,
  prompt: null,
  critical: null,
  creative: null,
  transparent: null,
};

const submissionText = (content?: string) => {
  if (!content) return "";
  const document = new DOMParser().parseFromString(content, "text/html");
  return document.body.textContent?.trim() ?? "";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(date);
};

const submissionStatus = (submittedAt?: string | null, dueAt?: string) => {
  if (!submittedAt || !dueAt) return null;
  const submitted = new Date(submittedAt).getTime();
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(submitted) || Number.isNaN(due)) return null;
  return submitted <= due ? "normal" : "late";
};

const rubricGuides = [
  {
    title: "주도적 상호작용",
    detail: "전체 AI 상호작용 중 학습자의 의도와 목표를 반영한 의미 있는 후속 개입이 나타난 비율입니다. 추가 질문, 수정 요청, 방향 전환, 반론 등을 포함합니다.",
  },
  {
    title: "프롬프트 설계",
    detail: "목적·맥락·요구사항·제약조건 네 요소 중 프롬프트에 포함된 요소 수를 기준으로 측정합니다. 충족 요소 수 ÷ 4 × 100으로 계산합니다.",
  },
  {
    title: "비판적 평가",
    detail: "AI 답변을 확인 필요로 표시한 뒤 추가 질문, 참고 문헌 확인, 직접 검색을 선택하고 실행한 행동과 그 이유를 대화 전체에서 분석합니다.",
  },
  {
    title: "창의적 재구성",
    detail: "최종 제출물에 자신의 관점·주장을 추가했는지, AI 내용을 자신의 논리 구조로 재구성했는지, AI 표현을 자신의 언어로 수정했는지를 확인합니다. 충족 요소 수 ÷ 3 × 100입니다.",
  },
  {
    title: "윤리적 투명성",
    detail: "최종 제출물에 AI 사용 여부, 사용 목적, AI 활용 범위를 구체적으로 밝혔는지 확인합니다. 충족 요소 수 ÷ 3 × 100입니다.",
  },
];



export default function InstructorPage() {
  const [selectedStudentId, setSelectedStudentId] = useState("2022000009");
  const [assignmentId, setAssignmentId] = useState(1);
  const [assignments, setAssignments] = useState<Assignment[]>(fallbackAssignmentsWithDueDates);
  const [students, setStudents] = useState<Student[]>(fallbackStudents);
  const [scores, setScores] = useState<ScoreMap>(initialScores);
  const [saved, setSaved] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [rubricRates, setRubricRates] = useState<Rubric[]>(rubrics);
  const [studentRecords, setStudentRecords] = useState<ExplorationRecord[]>([]);
  const [studentConversation, setStudentConversation] = useState<ConversationMessage[]>([]);
  const [submittedContent, setSubmittedContent] = useState("");
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<ReviewItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const currentAssignment = assignments.find((assignment) => assignment.id === assignmentId) ?? fallbackAssignmentsWithDueDates[1];
  const currentSubmissionStatus = submissionStatus(submittedAt, currentAssignment.dueAt);

  const loadSummary = useCallback(async (studentId: string, selectedAssignmentId: number) => {
    setLoading(true);
    const summary = await apiFetch<StudentSummary>(`/api/students/${studentId}/summary?assignmentId=${selectedAssignmentId}`);
    if (summary) {
      const incomingRubrics = summary.rubrics ?? {};
      setRubricRates(rubrics.map((rubric) => ({ ...rubric, ...(incomingRubrics[rubric.id] ?? {}) })));
      setStudentRecords(summary.explorationRecords ?? []);
      setStudentConversation(summary.conversation ?? []);
      setSubmittedContent(submissionText(summary.submission?.content));
      setSubmittedAt(summary.submission?.submittedAt ?? null);
      const incomingScores = summary.scores ?? {};
      setScores({
        initiative: typeof incomingScores.initiative === "number" ? incomingScores.initiative : null,
        prompt: typeof incomingScores.prompt === "number" ? incomingScores.prompt : null,
        critical: typeof incomingScores.critical === "number" ? incomingScores.critical : null,
        creative: typeof incomingScores.creative === "number" ? incomingScores.creative : null,
        transparent: typeof incomingScores.transparent === "number" ? incomingScores.transparent : null,
      });
    } else {
      setRubricRates(rubrics);
      setStudentRecords([]);
      setStudentConversation([]);
      setSubmittedContent("");
      setSubmittedAt(null);
      setScores(initialScores);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void apiFetch<{ assignments?: Assignment[] }>("/api/assignments").then((result) => {
      if (result?.assignments?.length) setAssignments(result.assignments);
    });
  }, []);

  useEffect(() => {
    void apiFetch<{ students?: Student[] }>(`/api/students?assignmentId=${assignmentId}`).then((result) => {
      const nextStudents = result?.students?.length ? result.students : fallbackStudents;
      setStudents(nextStudents);
      setSelectedStudentId((current) => nextStudents.some((student) => student.id === current) ? current : nextStudents[0]?.id ?? "2022000009");
    });
  }, [assignmentId]);

  useEffect(() => {
    // 서버에서 선택 학생과 과제의 최신 기록을 동기화하는 외부 효과입니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSummary(selectedStudentId, assignmentId);
  }, [assignmentId, loadSummary, selectedStudentId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedStudent = students.find((student) => student.id === selectedStudentId) ?? students[0];
  const enteredScores = Object.values(scores).filter((score): score is number => score !== null);
  const overallScore = enteredScores.length === rubrics.length
    ? (enteredScores.reduce((sum, score) => sum + score, 0) / enteredScores.length).toFixed(1)
    : "—";

  const selectStudent = (student: Student) => {
    setSelectedStudentId(student.id);
    setSaved(false);
    setToast(`${student.name} 학생의 평가 기록을 확인합니다.`);
  };

  const selectAssignment = (nextAssignmentId: number) => {
    if (nextAssignmentId === assignmentId) return;
    setSubmittedContent("");
    setSubmittedAt(null);
    setAssignmentId(nextAssignmentId);
  };

  const chooseScore = (rubricId: RubricId, score: number) => {
    setScores((current) => ({ ...current, [rubricId]: score }));
    setSaved(false);
  };

  const saveScores = async () => {
    if (enteredScores.length !== rubrics.length) {
      setToast("5개 루브릭 점수를 모두 선택한 뒤 저장해주세요.");
      return;
    }
    const result = await apiFetch<{ saved?: boolean }>("/api/scores", { method: "POST", body: { studentId: selectedStudentId, assignmentId, scores } });
    if (!result?.saved) {
      setSaved(false);
      setToast("점수 저장에 실패했습니다.");
      return;
    }
    setSaved(true);
    setToast(`${selectedStudent.name} 학생의 종합 점수 ${overallScore}/5를 저장했습니다.`);
  };

  const resolveReview = async (status: "fulfilled" | "not_fulfilled") => {
    if (!reviewItem) return;
    await apiFetch(`/api/reviews/${reviewItem.id}/resolve`, { method: "POST", body: { studentId: selectedStudentId, assignmentId, status } });
    setReviewItem(null);
    await loadSummary(selectedStudentId, assignmentId);
    setToast(status === "fulfilled" ? "교수 확인 결과를 충족으로 반영했습니다." : "교수 확인 결과를 미충족으로 반영했습니다.");
  };

  const runAiEvaluation = async () => {
    setAnalyzing(true);
    const result = await apiFetch<{ evaluation?: EvaluationResult }>(`/api/evaluations/${selectedStudentId}/run`, { method: "POST", body: { assignmentId } });
    const evaluation = result?.evaluation;
    if (evaluation?.rubrics) {
      setRubricRates(rubrics.map((rubric) => ({ ...rubric, ...(evaluation.rubrics?.[rubric.id] ?? {}) })));
      setToast(evaluation.mode === "groq" || evaluation.mode === "gemini" ? "Groq로 루브릭 반영률을 갱신했습니다." : "Groq API 키가 없어 규칙 기반 분석으로 갱신했습니다.");
    } else {
      setToast("분석 결과를 불러오지 못했습니다. API 연결을 확인해주세요.");
    }
    setAnalyzing(false);
  };

  return (
    <main className="instructor-workspace">
      <nav className="role-switch" aria-label="학생·교수자 화면 전환">
        {/* Native anchors avoid broken RSC prefetch in the static Vercel export. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="role-switch-option" href="/" onClick={(event) => { event.preventDefault(); window.location.assign("/"); }}>학생</a>
        <a className="role-switch-option active" href="/instructor" aria-current="page" onClick={(event) => { event.preventDefault(); window.location.assign("/instructor"); }}>교수자</a>
      </nav>
      <aside className="instructor-sidebar" aria-label="교수자 과제와 학생 탐색">
        <div>
          <div className="instructor-brand" aria-label="Korea University">
            <img src="/ku-logo-horizontal.png" alt="고려대학교 로고" />
          </div>
          <p className="instructor-platform-name">고려대학교 AI 협업 과정 기록 플랫폼</p>

          <label className="course-select-label" htmlFor="course-select">과제 선택</label>
          <select id="course-select" className="course-select" value={assignmentId} onChange={(event) => selectAssignment(Number(event.target.value))}>
            {assignments.map((assignment) => (
              <option value={assignment.id} key={assignment.id}>{assignment.courseCode ?? "KORE001-1"} {assignment.title}</option>
            ))}
          </select>

          <h2 className="student-roster-title">학생 명단</h2>
          <div className="student-roster" role="list" aria-label="학생 명단">
            {students.map((student) => (
              <button
                className={`student-row ${student.id === selectedStudentId ? "active" : ""}`}
                type="button"
                aria-pressed={student.id === selectedStudentId}
                key={student.id}
                onClick={() => selectStudent(student)}
              >
                <span>{student.id}</span>
                <strong>{student.name}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="instructor-student-pill">
          <img src="/profile-avatar.png" alt="" aria-hidden="true" />
          <span>{selectedStudent.name}&nbsp; | &nbsp;영어영문학과 4학년</span>
        </div>
      </aside>

      <section className="instructor-writing-area" aria-labelledby="instructor-assignment-title">
        <h1 id="instructor-assignment-title">{currentAssignment.title}</h1>
        <article className="instructor-document" aria-label="학생 과제 원문">
          <div className="instructor-document-scroll">
            {submittedContent || "제출된 학생 과제 원문이 없습니다."}
          </div>
        </article>
        <p className="submission-time">{submittedAt ? `제출 시간: ${submittedAt}` : "제출 시간: 제출 기록 없음"}</p>
        <div className="submission-meta">
          <p className="submission-meta-line">제출 시간: {formatDateTime(submittedAt)}</p>
          <p className="submission-meta-line">마감 시간: {formatDateTime(currentAssignment.dueAt)}</p>
          {currentSubmissionStatus && (
            <span className={"submission-status submission-status--" + currentSubmissionStatus}>
              {currentSubmissionStatus === "normal" ? "정상 제출" : "지각 제출"}
            </span>
          )}
        </div>
      </section>

      <section className="instructor-summary-panel" aria-labelledby="summary-title">
        <header className="instructor-summary-header">
          <h2 id="summary-title">AI 기반 학생 협업 요약</h2>
          <button className="instructor-help-button" type="button" aria-label="루브릭 도움말 열기" onClick={() => setHelpOpen(true)}>?</button>
        </header>

        <div className="instructor-summary-scroll">
          <section className="rubric-rate-section" aria-labelledby="rate-title">
            <div className="instructor-section-heading">
              <h3 id="rate-title">루브릭 반영률</h3>
              <div className="analysis-actions">
                {loading && <span className="summary-loading">기록 불러오는 중…</span>}
                <button className="analysis-button" type="button" onClick={() => void runAiEvaluation()} disabled={analyzing}>
                  {analyzing ? "분석 중…" : "AI 분석 갱신"}
                </button>
              </div>
            </div>
            <div className="rubric-rate-grid">
              {rubricRates.map((rubric) => (
                <div className="rubric-rate" key={rubric.id}>
                  <div className="rubric-rate-heading"><span>{rubric.label}</span><strong>{rubric.rate}%</strong></div>
                  <div className="rubric-rate-track" aria-label={`${rubric.label} ${rubric.rate}%`}>
                    <span style={{ width: `${rubric.rate}%` }} />
                  </div>
                  {rubric.reviewItems?.filter((item) => item.status === "needs_review").map((item) => (
                    <button className="review-needed-button" type="button" key={item.id} onClick={() => setReviewItem(item)}>
                      교수 확인 필요
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="exploration-section" aria-labelledby="exploration-title">
            <div className="instructor-section-heading">
              <h3 id="exploration-title">학생 AI 탐구 기록</h3>
              <button type="button" className="conversation-button" onClick={() => setConversationOpen(true)}>전체 대화 기록 보기</button>
            </div>
            <div className="exploration-card">
              {studentRecords.map((record, index) => (
                <article className="exploration-record" key={record.id ?? `${record.verdict}-${index}`}>
                  <div className="record-meta">
                    <span className={`record-verdict record-verdict--${record.verdict === "확인 필요" ? "verify" : "revise"}`}>{record.verdict}</span>
                    <span><strong>검증 방법</strong> | {record.method}</span>
                    <span><strong>선택 사유</strong> | {record.reason}</span>
                    {record.verdict === "확인 필요" && <span className={record.executed ? "record-executed" : "record-pending"}>{record.executed ? "실행 완료" : "실행 기록 없음"}</span>}
                  </div>
                  <p><strong>탐구 문장</strong> <span>|</span> {record.sentence}</p>
                </article>
              ))}
            </div>
            <p className="consent-note">*전체 대화 기록을 보기 위해서는 학생의 동의가 필요해요.</p>
          </section>

          <section className="score-section" aria-labelledby="score-title">
            <h3 id="score-title">점수 입력</h3>
            <div className="score-grid">
              {rubrics.map((rubric) => (
                <fieldset className="score-item" key={rubric.id}>
                  <legend>{rubric.label}</legend>
                  <div className="score-options" aria-label={`${rubric.label} 점수`}>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        className={scores[rubric.id] === score ? "score-option selected" : "score-option"}
                        type="button"
                        aria-pressed={scores[rubric.id] === score}
                        key={score}
                        onClick={() => chooseScore(rubric.id, score)}
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="overall-score" aria-label={`종합 점수 ${overallScore}점`}>
                <span>종합 점수</span>
                <strong>{overallScore}<small>/5</small></strong>
              </div>
            </div>
          </section>
        </div>

        <button className={`save-score-button ${saved ? "saved" : ""}`} type="button" onClick={() => void saveScores()}>
          {saved ? "점수 저장됨" : "점수 저장하기"}
        </button>
      </section>

      {reviewItem && (
        <div className="instructor-modal-backdrop">
          <section className="instructor-modal review-modal" role="dialog" aria-modal="true" aria-labelledby="review-title">
            <button className="modal-close-button" type="button" aria-label="교수 확인 닫기" onClick={() => setReviewItem(null)}>×</button>
            <span className="review-modal-kicker">교수 확인 필요</span>
            <h2 id="review-title">{rubricRates.find((rubric) => rubric.id === reviewItem.rubricId)?.label ?? "루브릭"} 판정 확인</h2>
            <p>{reviewItem.reason}</p>
            <blockquote>{reviewItem.evidence || "기록된 문장이 없습니다."}</blockquote>
            <div className="review-modal-actions">
              <button type="button" className="review-reject-button" onClick={() => void resolveReview("not_fulfilled")}>미충족으로 반영</button>
              <button type="button" className="review-accept-button" onClick={() => void resolveReview("fulfilled")}>충족으로 반영</button>
            </div>
          </section>
        </div>
      )}

      {helpOpen && (
        <div className="instructor-modal-backdrop">
          <section className="instructor-modal rubric-help-modal" role="dialog" aria-modal="true" aria-labelledby="rubric-help-title">
            <button className="modal-close-button" type="button" aria-label="루브릭 도움말 닫기" onClick={() => setHelpOpen(false)}>×</button>
            <h2 id="rubric-help-title">루브릭 측정 기준</h2>
            <p>학생의 AI 대화, 하이라이트·버튼 선택, 답변과 최종 제출물을 함께 분석하는 프론트엔드 미리보기입니다.</p>
            <div className="rubric-guide-list">
              {rubricGuides.map((guide) => (
                <article key={guide.title}>
                  <h3>{guide.title}</h3>
                  <p>{guide.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {conversationOpen && (
        <div className="instructor-modal-backdrop">
          <section className="instructor-modal conversation-modal" role="dialog" aria-modal="true" aria-labelledby="conversation-title">
            <button className="modal-close-button" type="button" aria-label="전체 대화 기록 닫기" onClick={() => setConversationOpen(false)}>×</button>
            <h2 id="conversation-title">{selectedStudent.name} 학생 AI 전체 대화 기록</h2>
            <p className="conversation-consent">학생 동의 후 확인할 수 있는 저장된 대화 기록입니다.</p>
            <div className="conversation-list">
              {studentConversation.length === 0 ? (
                <p className="conversation-empty">저장된 대화 기록이 없습니다.</p>
              ) : (
                studentConversation.map((message, index) => (
                <div className={`conversation-message ${message.role === "학생" || message.role === "user" ? "student" : "ai"}`} key={`${message.role}-${index}`}>
                  <span>{message.role === "user" ? "학생" : message.role === "ai" ? "AI" : message.role}</span>
                  <div className="conversation-message-text">
                    {message.role === "ai" ? renderPlainText(message.text) : message.text}
                  </div>
                </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
