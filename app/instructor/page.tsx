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

type FallbackTurn = {
  question: string;
  answer: string;
};

type FallbackProfile = {
  rates: Record<RubricId, number>;
  turns: FallbackTurn[];
  records: ExplorationRecord[];
  submission: string;
  submittedAt: string;
};

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
  { id: "2022000010", name: "주효빈" },
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

const fallbackProfiles: Record<string, FallbackProfile> = {
  "2022000001": {
    rates: { initiative: 25, prompt: 25, critical: 50, creative: 33, transparent: 0 },
    turns: [
      {
        question: "AI 활용이 필요하다고 생각해. {{topic}}의 핵심 쟁점을 한 문단으로 정리해줘.",
        answer: "{{topic}}에서는 AI를 빠르게 쓰는 것보다 활용 목적과 확인할 근거를 정하는 일이 먼저입니다.",
      },
      {
        question: "좋아. 교과목 확대가 실제로 운영되는지 직접 검색할 키워드와 확인 순서를 알려줘.",
        answer: "대학 공식 홈페이지와 교육과정 공지를 먼저 찾아 교과목명, 운영 시기, 대상 전공을 차례로 확인해 보세요.",
      },
    ],
    records: [
      {
        id: "fallback-2022000001-verify-1",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "교과목 확대가 실제 운영되는지 공식 자료로 확인하고 싶음",
        sentence: "{{topic}}에서 AI 교과목 확대가 필요하다는 주장은 운영 자료를 확인해야 한다.",
        executed: true,
      },
      {
        id: "fallback-2022000001-revise-1",
        verdict: "수정 필요",
        method: "선택하지 않음",
        reason: "주장이 짧아 근거와 활용 범위를 보완해야 함",
        sentence: "AI 활용이 필요하다.",
        executed: false,
      },
    ],
    submission: "AI 교육 확대는 필요하다고 생각한다. 특히 전공 수업에서 배운 내용을 실제 문제에 적용해 보는 기회가 늘어나면, 학생들이 기술을 단순히 사용하는 데서 그치지 않고 어떤 문제를 해결할지 스스로 고민할 수 있다.\n\n다만 확대 자체가 목표가 되어서는 안 된다. 운영 중인 교과목과 학생 참여 조건을 학교 공식 자료로 확인하고, 확인한 정보와 나의 제안을 구분해 글을 작성했다.",
    submittedAt: "2026-08-08T14:58:00Z",
  },
  "2023000002": {
    rates: { initiative: 50, prompt: 75, critical: 33, creative: 33, transparent: 33 },
    turns: [
      {
        question: "고려대 AI 교육에 관해 글을 쓰고 싶어. {{topic}}에서 실습이 필요한 이유를 설명해줘.",
        answer: "실습은 AI 개념을 실제 문제에 적용하고 결과를 검토하는 경험을 제공한다는 점에서 의미가 있습니다.",
      },
      {
        question: "이 답변의 근거는 무엇인지 참고 문헌으로 확인하려고 해. 확인할 자료 유형을 나눠줘.",
        answer: "교육과정 공지, 수업 운영 사례, 연구 보고서를 나누어 확인하고 자료의 발행 기관과 시점을 기록하세요.",
      },
      {
        question: "학생 입장에서 주장과 근거를 800자 보고서 형식으로 다시 정리해줘.",
        answer: "주장, 확인한 근거, 한계와 제안의 순서로 구성하면 짧은 보고서에서도 관점이 분명해집니다.",
      },
    ],
    records: [
      {
        id: "fallback-2023000002-verify-1",
        verdict: "확인 필요",
        method: "참고 문헌 확인하기",
        reason: "실습 중심 교육의 실제 사례가 있는지 확인해야 함",
        sentence: "실습 수업이 학습 성과를 높인다는 표현은 연구 보고서로 확인할 필요가 있다.",
        executed: false,
      },
      {
        id: "fallback-2023000002-verify-2",
        verdict: "확인 필요",
        method: "참고 문헌 확인하기",
        reason: "학생 관점의 주장과 자료의 범위를 구분하고 싶음",
        sentence: "{{topic}}의 개선 방향은 수업 운영 사례와 학생 경험을 함께 비교해야 한다.",
        executed: true,
      },
    ],
    submission: "나는 고려대학교의 AI 교육에 실습이 더 필요하다고 본다. 개념을 배우는 수업만으로는 결과가 실제 문제에 어떻게 연결되는지 알기 어렵기 때문에, 전공별 프로젝트와 협업 과제를 함께 운영해야 한다.\n\n교육과정 공지와 연구 보고서를 비교해 주장과 근거를 나누었고, 자료를 확인하는 과정에서 발견한 한계도 마지막 문단에 덧붙였다.",
    submittedAt: "2026-08-08T14:55:00Z",
  },
  "2022000003": {
    rates: { initiative: 67, prompt: 75, critical: 67, creative: 67, transparent: 33 },
    turns: [
      {
        question: "과제 주제는 고려대 AI 교육이야. {{topic}}의 배경과 핵심 문제를 정리해줘.",
        answer: "대학의 AI 교육은 전공별 기초 역량과 실제 적용 경험을 함께 제공해야 한다는 문제의식에서 출발할 수 있습니다.",
      },
      {
        question: "결과를 분량 800자 보고서 형식으로 바꿔야 할까? 학생의 주장과 근거가 보이게 구성해줘.",
        answer: "800자라면 배경 한 문장, 자신의 주장 두 문장, 확인한 근거와 한계, 제안 순서가 적절합니다.",
      },
      {
        question: "반대 관점에서는 어떤 우려를 제기할 수 있어? 내 주장과 함께 비교해줘.",
        answer: "AI 교육 확대의 속도와 비용, 전공별 격차를 우려하는 관점을 함께 제시하면 논지가 균형을 얻습니다.",
      },
      {
        question: "마지막 문단은 내가 직접 쓴 것처럼 너무 과장되지 않게 다시 다듬어줘.",
        answer: "확인한 사실과 제안의 범위를 구분하고, 단정 대신 조건을 붙여 자신의 판단을 드러내 보세요.",
      },
    ],
    records: [
      {
        id: "fallback-2022000003-verify-1",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "교육 현황을 설명하는 수치와 사례의 최신성을 확인하고 싶음",
        sentence: "고려대학교의 AI 교육 현황은 최근 교육과정과 공식 발표를 기준으로 확인해야 한다.",
        executed: true,
      },
      {
        id: "fallback-2022000003-revise-1",
        verdict: "수정 필요",
        method: "AI에게 추가 질문하기",
        reason: "확대의 장점만 있어 비용과 전공 격차를 함께 반영해야 함",
        sentence: "AI 교육을 확대하면 모든 전공의 학습 성과가 높아진다.",
        executed: true,
      },
      {
        id: "fallback-2022000003-verify-2",
        verdict: "확인 필요",
        method: "참고 문헌 확인하기",
        reason: "제안과 사실 설명을 구분해 참고 문헌을 남기고 싶음",
        sentence: "전공 간 수업을 넓히려면 실제 운영 사례와 참여 조건을 함께 살펴봐야 한다.",
        executed: true,
      },
    ],
    submission: "전공 간 AI 수업을 먼저 넓혀야 한다고 생각한다. 서로 다른 전공의 학생들이 같은 문제를 바라보면 기술을 배우는 데서 그치지 않고, 실제 사회 문제에 적용하는 방법까지 고민할 수 있다. 다만 모든 전공에 같은 수업을 일괄적으로 적용하면 참여 격차가 커질 수 있으므로 기초 과정과 선택형 프로젝트를 함께 마련해야 한다.\n\n초안을 만들 때는 AI로 쟁점과 반대 사례를 정리하고 교육과정 자료를 다시 확인했다. 최종 문장과 결론은 내 관점에 맞게 직접 고쳤다.",
    submittedAt: "2026-08-08T14:50:00Z",
  },
  "2024000004": {
    rates: { initiative: 50, prompt: 50, critical: 33, creative: 67, transparent: 67 },
    turns: [
      {
        question: "학생 대상 발표문을 만들고 싶어. {{topic}}의 배경을 쉽게 설명해줘.",
        answer: "학생 발표라면 AI가 왜 필요한지와 대학에서 어떤 경험을 제공할 수 있는지를 먼저 설명하면 좋습니다.",
      },
      {
        question: "결과물 조건을 다르게 정리해줄 수 있어? 3분 발표에 맞춰 핵심만 남겨줘.",
        answer: "도입 30초, 현황과 사례 1분, 기대와 우려 1분, 제안 30초로 나누면 전달하기 쉽습니다.",
      },
    ],
    records: [
      {
        id: "fallback-2024000004-verify-1",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "발표에 넣을 사례가 실제 프로그램인지 확인해야 함",
        sentence: "학생 대상 AI 프로젝트가 실제로 운영되고 있는지 공식 안내에서 확인해야 한다.",
        executed: false,
      },
      {
        id: "fallback-2024000004-revise-1",
        verdict: "수정 필요",
        method: "선택하지 않음",
        reason: "발표 시간에 맞게 설명의 범위를 줄일 필요가 있음",
        sentence: "AI 교육은 다양한 장점이 있으므로 모든 내용을 발표에 넣어야 한다.",
        executed: false,
      },
    ],
    submission: "고려대학교의 AI 교육은 실습 중심으로 바뀌어야 한다고 본다. 학생들이 수업에서 배운 내용을 실제 문제에 적용해 보면, 기술의 장점뿐 아니라 결과를 검토하고 책임지는 과정도 함께 배울 수 있다.\n\n전공 간 수업을 연결하고 실제 문제를 해결하는 프로젝트를 늘리자는 제안을 3분 발표문으로 재구성했다. 발표 대상이 이해하기 어려운 용어는 줄이고, 확인이 필요한 사례는 별도로 표시했다.",
    submittedAt: "2026-08-08T14:57:00Z",
  },
  "2022000005": {
    rates: { initiative: 67, prompt: 100, critical: 33, creative: 67, transparent: 100 },
    turns: [
      {
        question: "고려대학교 AI 연구 주제의 발표를 작성해줘. 대상은 1학년이고 분량은 500자야.",
        answer: "1학년 발표라면 연구 주제를 쉬운 말로 소개하고, 어떤 문제를 해결하는지와 학생에게 필요한 태도를 연결해 보세요.",
      },
      {
        question: "산학협력 사례가 부족해. 다른 근거로 수정해줘.",
        answer: "산학협력 대신 교과목 운영, 학생 프로젝트, 연구실 공개 자료처럼 확인 가능한 근거를 중심으로 다시 구성할 수 있습니다.",
      },
      {
        question: "자료를 그대로 옮기지 않고 내 주장과 한계를 500자 안에 넣어줘.",
        answer: "자료의 사실 설명과 자신의 판단을 문단별로 나누고, 확인하지 못한 부분은 한계로 명시하세요.",
      },
    ],
    records: [
      {
        id: "fallback-2022000005-verify-1",
        verdict: "확인 필요",
        method: "참고 문헌 확인하기",
        reason: "산학협력 성과를 다른 공식 근거로 대체하고 싶음",
        sentence: "교과목 운영과 학생 프로젝트 자료가 산학협력 성과를 대신할 수 있는지 확인해야 한다.",
        executed: false,
      },
      {
        id: "fallback-2022000005-revise-1",
        verdict: "수정 필요",
        method: "AI에게 추가 질문하기",
        reason: "발표 대상에 맞지 않는 전문 용어를 줄여야 함",
        sentence: "AI 연구를 설명할 때 전문 용어를 많이 넣을수록 설득력이 높아진다.",
        executed: true,
      },
      {
        id: "fallback-2022000005-verify-2",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "최종 문단의 사례 출처를 다시 대조함",
        sentence: "학생 프로젝트 사례의 운영 시기와 참여 조건은 원문 공지에서 대조해야 한다.",
        executed: true,
      },
    ],
    submission: "AI 사용의 장점은 자료를 빠르게 정리하는 데 있지만, 답변을 그대로 받아들이면 나의 판단이 사라질 수 있다. 따라서 사용 목적을 논점 구조화와 검토할 질문을 찾는 일로 한정하고, 근거가 필요한 문장은 원문 자료와 대조해야 한다.\n\n발표문에서는 확인한 자료와 내 결론을 구분했다. 특히 자료에 없는 내용을 추측으로 채우지 않고, 500자 안에서 확인된 사실과 제안을 차례로 배치했다.",
    submittedAt: "2026-08-08T14:52:00Z",
  },
  "2021000006": {
    rates: { initiative: 0, prompt: 25, critical: 0, creative: 0, transparent: 33 },
    turns: [
      {
        question: "AI 서비스.",
        answer: "{{topic}}에서 AI 서비스를 다룬다면 먼저 어떤 문제를 해결하려는지와 사용자를 정해 보는 것이 좋습니다.",
      },
    ],
    records: [
      {
        id: "fallback-2021000006-revise-1",
        verdict: "수정 필요",
        method: "선택하지 않음",
        reason: "질문만으로는 과제 목적과 근거가 드러나지 않음",
        sentence: "AI 서비스.",
        executed: false,
      },
    ],
    submission: "AI 서비스라는 말만으로는 어떤 문제를 해결하려는지 알기 어렵다. 먼저 사용자를 정하고, 그 사람이 겪는 불편을 한 문장으로 설명한 뒤 필요한 기능을 좁혀야 한다.\n\n이번 글에서는 생성형 AI를 아이디어를 정리하는 데만 참고했다. 최종 사례와 문장 표현은 직접 확인하고 작성했다.",
    submittedAt: "2026-08-08T14:59:00Z",
  },
  "2022000007": {
    rates: { initiative: 100, prompt: 75, critical: 67, creative: 33, transparent: 67 },
    turns: [
      {
        question: "나는 고려대학교 AI 교육 과제의 문제를 분석하고 싶어. 현재 배경과 결론 조건을 정리해줘.",
        answer: "배경은 대학 AI 교육의 확산으로, 결론은 실제 운영 근거와 학생 관점의 제안이 함께 있어야 한다는 조건으로 정리할 수 있습니다.",
      },
      {
        question: "내 주장과 반대되는 사례도 추가해서 방향을 바꿔볼래?",
        answer: "확대에 따른 비용과 접근성 격차를 반대 사례로 넣고, 모든 전공에 같은 방식이 적합한지 비교해 보세요.",
      },
      {
        question: "반대 사례를 확인할 검색어와 문헌 기준을 제안해줘.",
        answer: "대학 AI 교육 격차, 수업 접근성, 전공별 프로젝트 참여 조건을 검색어로 삼고 발행 기관과 조사 대상을 기록하세요.",
      },
      {
        question: "이제 내 결론을 조건부 주장으로 다시 써줘.",
        answer: "기초 교육과 참여 조건을 함께 마련한다면 전공 간 AI 프로젝트를 단계적으로 확대할 수 있다는 식으로 정리해 보세요.",
      },
    ],
    records: [
      {
        id: "fallback-2022000007-verify-1",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "AI 교육 격차에 관한 반대 사례를 찾아 주장의 범위를 조정함",
        sentence: "모든 전공에 같은 AI 수업을 적용할 때 참여 조건의 차이를 확인해야 한다.",
        executed: true,
      },
      {
        id: "fallback-2022000007-revise-1",
        verdict: "수정 필요",
        method: "AI에게 추가 질문하기",
        reason: "확대의 장점만 말하지 않고 비용과 접근성 문제를 반영함",
        sentence: "AI 교육 확대는 언제나 모든 학생에게 같은 효과를 준다.",
        executed: true,
      },
      {
        id: "fallback-2022000007-verify-2",
        verdict: "확인 필요",
        method: "참고 문헌 확인하기",
        reason: "조건부 결론을 뒷받침할 조사 대상을 확인해야 함",
        sentence: "전공별 프로젝트 참여 조건이 실제 학생 경험에 어떤 차이를 만드는지 살펴봐야 한다.",
        executed: false,
      },
    ],
    submission: "AI 교육을 확대할 때는 모든 전공에 같은 방식을 적용하기보다 학생이 참여할 수 있는 조건부터 살펴봐야 한다. 기초 수업과 선택형 프로젝트를 단계적으로 운영하면 전공이 다른 학생도 자신의 문제의식에서 출발해 AI를 활용할 수 있다.\n\nAI는 쟁점을 정리하고 반대 사례를 찾는 데 참고했으며, 실제 사례의 타당성과 자료의 최신성은 직접 검토했다. 최종 결론은 장점만 나열하지 않고 비용과 접근성 문제까지 포함해 다시 구성했다.",
    submittedAt: "2026-08-08T14:54:00Z",
  },
  "2025000008": {
    rates: { initiative: 50, prompt: 50, critical: 67, creative: 33, transparent: 33 },
    turns: [
      {
        question: "과제에서 고려대 AI 교육 개선안을 작성하려고 해. 전공생 30명을 대상으로 700자 이내 제안서 형식이 필요해.",
        answer: "대상, 분량, 형식을 정했으니 학생이 겪는 문제와 실현 가능한 개선안 두 가지를 중심으로 구성해 보세요.",
      },
      {
        question: "좋아, 이대로 둘게. 그래도 제안서의 근거가 될 자료를 한 번만 확인해줘.",
        answer: "공식 교육과정, 학생 지원 프로그램, 공개된 운영 결과를 확인하고 자료의 날짜와 범위를 제안서에 남기세요.",
      },
    ],
    records: [
      {
        id: "fallback-2025000008-verify-1",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "제안서의 대상과 운영 조건을 확인해야 함",
        sentence: "전공생 30명을 대상으로 한 AI 교육 개선안은 실제 지원 프로그램과 연결해 검토해야 한다.",
        executed: true,
      },
      {
        id: "fallback-2025000008-revise-1",
        verdict: "수정 필요",
        method: "선택하지 않음",
        reason: "제안은 있으나 자신의 사용 범위와 한계가 짧게 드러남",
        sentence: "AI를 참고해 고려대학교의 교육 방향을 간단히 정리했다.",
        executed: false,
      },
    ],
    submission: "학생 참여를 넓히려면 AI 교육을 한 번에 크게 확대하기보다 작은 프로젝트부터 시작하는 편이 현실적이다. 전공생 30명이 참여하는 시범 수업을 운영하고, 참여 과정에서 생긴 어려움과 결과를 기록하면 다음 수업을 개선하는 근거로 삼을 수 있다.\n\nAI는 제안서의 구조를 잡는 데만 활용했다. 운영 조건과 근거 자료는 직접 확인하고, 확인하지 못한 내용은 제안에서 제외했다.",
    submittedAt: "2026-08-08T14:56:00Z",
  },
  "2022000009": {
    rates: { initiative: 33, prompt: 25, critical: 67, creative: 33, transparent: 33 },
    turns: [
      {
        question: "고려대 AI 교육 현황을 조사해봐",
        answer: "검색 결과가 없어요. 질문의 범위나 시점을 조금 더 구체적으로 입력해 다시 시도해 주세요.",
      },
      {
        question: "고려대 AI 교육 현황을 조사해서 링크와 함꼐 보내줘",
        answer: "AI 답변을 과제에 활용할 때는 필요한 핵심만 골라 자신의 관점과 근거를 더해 정리해 보세요. 질문에 목적, 배경, 원하는 형식을 함께 적으면 다음 답변도 더 구체적으로 받을 수 있습니다.",
      },
      {
        question: "고려대 AI 교육 현황이 어떻게 되지?",
        answer: "AI 답변을 과제에 활용할 때는 필요한 핵심만 골라 자신의 관점과 근거를 더해 정리해 보세요. 질문에 목적, 배경, 원하는 형식을 함께 적으면 다음 답변도 더 구체적으로 받을 수 있습니다.",
      },
    ],
    records: [
      {
        id: "fallback-2022000009-verify-1",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "사실 여부가 불확실함",
        sentence: "AI가 제안하는 기능은 대부분 실제 사용자 검증 없이는 높은 정확도를 보장하므로 별도의 검증 과정이 필요합니다.",
        executed: true,
      },
      {
        id: "fallback-2022000009-revise-1",
        verdict: "수정 필요",
        method: "선택하지 않음",
        reason: "논리적 오류 또는 비약이 있음",
        sentence: "AI 활용 교육은 기술 사용법만 익히는 것이 아니라, 근거를 확인하고 자신의 관점으로 재구성하는 과정까지 포함해야 합니다.",
        executed: false,
      },
      {
        id: "fallback-2022000009-verify-2",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "근거를 한 번 더 확인해 보고 싶습니다.",
        sentence: "AI 교육을 도입하기 전 가장 먼저 고민해야 할 점은 목표와 활용 범위야. 기대되는 점과 걱정되는 점을 나누어 검토해야 한다.",
        executed: true,
      },
    ],
    submission: "고려대학교의 AI 발전은 기술을 많이 도입하는 데서 끝나지 않고, 학생들이 직접 질문하고 결과를 검증하는 경험을 늘리는 방향이어야 한다. 전공과 상관없이 연구 자료를 빠르게 탐색하고 아이디어를 구체화할 수 있다는 점은 분명한 장점이다.\n\n그러나 AI의 답변을 그대로 믿으면 전공별 맥락과 책임이 빠질 수 있다. 수업에서는 출처 확인과 토론을 함께 다루고, 학생이 확인한 근거를 자신의 관점으로 다시 설명하도록 해야 한다. 이번 글에서는 기대되는 점과 우려되는 점을 나누어 고려대학교의 발전 방향을 제안했다.",
    submittedAt: "2026-08-08T14:59:59Z",
  },
  "2022000010": {
    rates: { initiative: 67, prompt: 75, critical: 33, creative: 67, transparent: 67 },
    turns: [
      {
        question: "고려대 AI 교육 과제의 개선 방향을 알고 싶어. 논지와 근거를 분리해줘.",
        answer: "논지는 교육에 근거 확인을 포함해야 한다는 주장이고, 근거는 교육과정과 학생 프로젝트의 실제 운영 자료로 나누어 제시할 수 있습니다.",
      },
      {
        question: "답변의 근거를 직접 검색해 보니 다른 통계가 있어. 그 부분을 수정해줘.",
        answer: "서로 다른 통계의 조사 시점과 대상을 먼저 비교한 뒤, 확인된 범위만 사용하도록 문장을 조정하세요.",
      },
      {
        question: "사용 목적과 활용 범위도 밝히면서 최종 문단을 내 말로 다시 써줘.",
        answer: "자료 구조화와 질문 정리에 AI를 사용했고, 최종 주장과 표현은 직접 검토했다는 점을 문단에 넣어 보세요.",
      },
    ],
    records: [
      {
        id: "fallback-2022000010-verify-1",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "교육 현황을 설명하는 통계의 조사 시점을 대조해야 함",
        sentence: "AI 교육 참여율 통계는 조사 대상과 시점을 원문에서 다시 확인해야 한다.",
        executed: true,
      },
      {
        id: "fallback-2022000010-verify-2",
        verdict: "확인 필요",
        method: "직접 검색하기",
        reason: "두 번째 답변도 직접 근거를 확인할 필요가 있음",
        sentence: "서로 다른 통계를 비교할 때는 같은 기준의 자료인지 먼저 확인해야 한다.",
        executed: true,
      },
      {
        id: "fallback-2022000010-revise-1",
        verdict: "수정 필요",
        method: "AI에게 추가 질문하기",
        reason: "통계의 단정적 표현을 확인 가능한 범위로 줄임",
        sentence: "고려대학교의 모든 학생이 AI 교육을 원한다.",
        executed: true,
      },
    ],
    submission: "고려대학교의 AI 교육은 근거 확인을 수업 안에 포함해야 한다고 생각한다. 학생이 AI로 자료를 찾은 뒤 출처와 조사 시점을 다시 확인하는 절차를 거치면, 빠른 탐색의 장점과 사실 검토의 책임을 함께 배울 수 있다.\n\n나는 AI를 자료 구조화와 질문 정리에만 사용했다. 출처와 최종 주장, 문장 표현은 직접 검토해 다시 구성했고, 확인하지 못한 통계는 글에서 제외했다.",
    submittedAt: "2026-08-08T14:53:00Z",
  },
};

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

const scoreMapFrom = (incoming?: Partial<ScoreMap>): ScoreMap => ({
  initiative: typeof incoming?.initiative === "number" ? incoming.initiative : null,
  prompt: typeof incoming?.prompt === "number" ? incoming.prompt : null,
  critical: typeof incoming?.critical === "number" ? incoming.critical : null,
  creative: typeof incoming?.creative === "number" ? incoming.creative : null,
  transparent: typeof incoming?.transparent === "number" ? incoming.transparent : null,
});

const fallbackTopic = (assignment: Assignment) => {
  const separatorIndex = assignment.title.indexOf("_");
  return separatorIndex >= 0 ? assignment.title.slice(separatorIndex + 1) : assignment.title;
};

const fillFallbackTokens = (value: string, student: Student, assignment: Assignment) => value
  .replaceAll("{{name}}", student.name)
  .replaceAll("{{topic}}", fallbackTopic(assignment));

const fallbackRubricList = (profile: FallbackProfile): Rubric[] => rubrics.map((rubric) => ({
  ...rubric,
  rate: profile.rates[rubric.id],
  reviewItems: rubric.id === "critical"
    ? profile.records
      .filter((record) => record.verdict === "확인 필요" && !record.executed)
      .map((record, index) => ({
        id: record.id ?? `fallback-review-${rubric.id}-${index}`,
        rubricId: "critical" as RubricId,
        status: "needs_review" as const,
        evidence: record.sentence,
        reason: record.reason,
      }))
    : [],
}));

const fallbackSubmittedAt = (assignment: Assignment, profile: FallbackProfile, assignmentId: number) => {
  if (assignmentId === 1) return profile.submittedAt;
  const dueAt = assignment.dueAt ? new Date(assignment.dueAt).getTime() : Number.NaN;
  if (!Number.isFinite(dueAt)) return profile.submittedAt;
  const offset = Math.max(60_000, profile.turns.length * 90_000);
  return new Date(dueAt - offset).toISOString();
};

const buildFallbackSummary = (studentId: string, selectedAssignmentId: number): StudentSummary => {
  const student = fallbackStudents.find((item) => item.id === studentId) ?? { id: studentId, name: "학생" };
  const assignment = fallbackAssignmentsWithDueDates.find((item) => item.id === selectedAssignmentId) ?? {
    id: selectedAssignmentId,
    title: `과제 ${selectedAssignmentId}`,
    description: "학생의 AI 협업 과정을 확인하는 과제입니다.",
  };
  const profile = fallbackProfiles[studentId] ?? fallbackProfiles["2022000009"];
  const conversation = profile.turns.flatMap((turn) => [
    { role: "user", text: fillFallbackTokens(turn.question, student, assignment) },
    { role: "ai", text: fillFallbackTokens(turn.answer, student, assignment) },
  ]);
  const explorationRecords = profile.records.map((record) => ({
    ...record,
    id: `${record.id}-${selectedAssignmentId}`,
    reason: fillFallbackTokens(record.reason, student, assignment),
    sentence: fillFallbackTokens(record.sentence, student, assignment),
  }));
  const submission = selectedAssignmentId === 1
    ? fillFallbackTokens(profile.submission, student, assignment)
    : `${student.name}의 ${fallbackTopic(assignment)} 기록입니다.\n${fillFallbackTokens(profile.submission, student, assignment)}`;

  return {
    assignment,
    rubrics: Object.fromEntries(fallbackRubricList({ ...profile, records: explorationRecords }).map((rubric) => [rubric.id, rubric])) as Partial<Record<RubricId, Rubric>>,
    scores: initialScores,
    explorationRecords,
    conversation,
    submission: {
      content: submission,
      submittedAt: fallbackSubmittedAt(assignment, profile, selectedAssignmentId),
      status: "submitted",
    },
  };
};

const defaultFallbackSummary = buildFallbackSummary("2022000009", 1);

const submissionText = (content?: string) => {
  if (!content) return "";
  const document = new DOMParser().parseFromString(content, "text/html");
  const blockText = Array.from(document.body.querySelectorAll("h1, h2, h3, h4, p, li, blockquote"))
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean);
  if (blockText.length > 0) return blockText.join("\n\n");
  return document.body.textContent?.trim() ?? "";
};

const submissionParagraphs = (content?: string) => (content ?? "")
  .split(/\n{2,}/)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean);

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
  const [scores, setScores] = useState<ScoreMap>(() => scoreMapFrom(defaultFallbackSummary.scores));
  const [saved, setSaved] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [rubricRates, setRubricRates] = useState<Rubric[]>(() => fallbackRubricList(fallbackProfiles["2022000009"]));
  const [studentRecords, setStudentRecords] = useState<ExplorationRecord[]>(() => defaultFallbackSummary.explorationRecords ?? []);
  const [studentConversation, setStudentConversation] = useState<ConversationMessage[]>(() => defaultFallbackSummary.conversation ?? []);
  const [submittedContent, setSubmittedContent] = useState(() => defaultFallbackSummary.submission?.content ?? "");
  const [submittedAt, setSubmittedAt] = useState<string | null>(() => defaultFallbackSummary.submission?.submittedAt ?? null);
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
      setScores(scoreMapFrom(summary.scores));
    } else {
      const fallbackSummary = buildFallbackSummary(studentId, selectedAssignmentId);
      const fallbackRubrics = fallbackSummary.rubrics ?? {};
      setRubricRates(rubrics.map((rubric) => ({ ...rubric, ...(fallbackRubrics[rubric.id] ?? {}) })));
      setStudentRecords(fallbackSummary.explorationRecords ?? []);
      setStudentConversation(fallbackSummary.conversation ?? []);
      setSubmittedContent(fallbackSummary.submission?.content ?? "");
      setSubmittedAt(fallbackSummary.submission?.submittedAt ?? null);
      setScores(scoreMapFrom(fallbackSummary.scores));
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
  const documentParagraphs = submissionParagraphs(submittedContent);
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
    const result = await apiFetch<{ saved?: boolean }>(`/api/reviews/${reviewItem.id}/resolve`, { method: "POST", body: { studentId: selectedStudentId, assignmentId, status } });
    if (!result?.saved) {
      setToast("DB 연결 후 교수 확인 결과를 저장할 수 있습니다.");
      return;
    }
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
          <div className="instructor-brand" aria-label="KUtrace">
            <img src="/ku-logo-horizontal.png" alt="고려대학교 로고" />
          </div>
          <p className="instructor-platform-name">
            <strong>KUtrace</strong>
            <span>고려대학교 AI 협업 과정 기록 플랫폼</span>
          </p>

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
          <header className="instructor-document-toolbar">
            <span className="instructor-document-label"><span className="instructor-document-dot" aria-hidden="true" />학생 제출 원고</span>
            <span className="instructor-document-student">{selectedStudent.name}</span>
          </header>
          <div className="instructor-document-page">
            <div className="instructor-document-scroll">
              {documentParagraphs.length > 0 ? documentParagraphs.map((paragraph, index) => (
                <p key={`${paragraph.slice(0, 16)}-${index}`}>{paragraph}</p>
              )) : <p className="instructor-document-empty">제출된 학생 과제 원문이 없습니다.</p>}
            </div>
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
