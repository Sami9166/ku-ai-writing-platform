# Design

## Source of truth
- Status: Draft
- Last refreshed: 2026-08-29
- Primary product surfaces: 학생 글쓰기 화면, 교수자 과제 평가 화면
- Evidence reviewed: `app/page.tsx`, `app/instructor/page.tsx`, `app/globals.css`, `public/ku-logo-horizontal.png`, `교수자화면.png` reference

## Brand
- Personality: 차분하고 신뢰할 수 있는 학습 기록 도구
- Trust signals: 고려대학교 로고, 명확한 제출 시각, 학생 동의 안내, 근거 중심의 AI 협업 기록
- Avoid: 마케팅형 히어로, 장식적인 그라디언트, 과도한 카드 중첩

## Product goals
- Goals: 학생의 글쓰기와 AI 협업 과정을 한 화면에서 확인하고, 교수자가 근거를 바탕으로 피드백하도록 돕습니다.
- Non-goals: AI 답변을 학생의 최종 글로 대체하거나 자동 평가를 확정하지 않습니다.
- Success signals: 교수자가 학생 글, 루브릭 현황, 탐구 기록, 점수 입력을 별도 페이지 이동 없이 확인합니다.

## Personas and jobs
- Primary personas: 글쓰기 과제를 수행하는 학생, 여러 학생의 과정을 검토하는 교수자
- User jobs: 학생은 작성·질문·검증 과정을 남기고, 교수자는 제출물과 협업 판단을 빠르게 비교합니다.
- Key contexts of use: 노트북 중심의 수업·평가 시간, 좁은 모바일 화면에서의 확인

## Information architecture
- Primary navigation: 학생/교수자 역할 전환, 교수자 과제 선택, 학생 선택
- Core routes/screens: `/`, `/instructor`
- Content hierarchy: 브랜드 → 선택 컨텍스트 → 학생 글 → AI 협업 요약 → 루브릭 점수

## Design principles
- Principle 1: 한 화면에서 비교하되, 데스크톱의 긴 콘텐츠는 해당 영역 안에서 독립적으로 스크롤하고 모바일 교수자 화면은 페이지 전체를 스크롤합니다.
- Principle 2: 요약 수치와 원문을 시각적으로 분리하고, 확인 필요 상태는 색상과 텍스트를 함께 사용합니다.
- Tradeoffs: 데스크톱은 전체 페이지 스크롤을 줄이는 대신 학생 글과 탐구 기록에 고정 높이 내부 스크롤을 두고, 모바일 교수자 화면은 단일 페이지 스크롤로 읽기 흐름을 단순화합니다.

## Visual language
- Color: 고려대학교 버건디 `#971f33`를 주요 강조색으로 사용하고, 본문은 검정·회색으로 유지합니다.
- Typography: 한국어 본문은 읽기 편한 13px 이상과 1.6 안팎의 행간을 사용합니다.
- Spacing/layout rhythm: 교수자 화면은 사이드바·원문·요약의 3열 구조를 유지합니다.
- Shape/radius/elevation: 큰 영역은 26–30px, 반복 기록은 얕은 7–10px 모서리와 가벼운 그림자를 사용합니다.
- Motion: hover와 focus는 짧은 색상 전환만 사용합니다.
- Imagery/iconography: 기존 고려대학교 로고와 프로필 이미지를 사용하고, 상태는 텍스트 배지로 표현합니다.

## Components
- Existing components to reuse: `instructor-document`, `instructor-summary-panel`, `exploration-card`, `rubric-rate-grid`, `student-row`
- New/changed components: `KUtrace` 브랜드 블록, 내부 스크롤 탐구 기록 목록, 종이형 학생 글 영역
- Variants and states: 선택 학생, 확인 필요/수정 필요, 실행 완료/기록 없음, 제출 상태
- Token/component ownership: 색상·간격은 `app/globals.css`의 기존 변수와 선택자에서 관리합니다.

## Accessibility
- Target standard: WCAG 2.1 AA에 준하는 대비와 키보드 접근
- Keyboard/focus behavior: 모든 선택·분석·점수 버튼을 Tab으로 이동하고 focus ring을 유지합니다.
- Contrast/readability: 버건디 배경 위 흰색 텍스트, 본문 13px 이상, 긴 문장 줄바꿈을 보장합니다.
- Screen-reader semantics: 섹션 제목, `aria-label`, modal `role="dialog"`를 유지합니다.
- Reduced motion and sensory considerations: 움직임을 최소화하고 색상만으로 상태를 전달하지 않습니다.

## Responsive behavior
- Mobile focus model: on screens <=760px, student work switches between `작성` and `AI 도우미`, while instructor work switches between `제출물` and `AI 분석 · 채점`; desktop panes remain unchanged. Each mobile tab keeps only its focused work surface visible, with the tab controls at the top of the page flow while the instructor surface uses one page-level scroll.
- Mobile controls use touch-sized actions and safe-area padding; tabs stay in the top flow instead of covering content while the instructor surface uses one page-level scroll.
- Supported breakpoints/devices: 1120px 이하 2열, 760px 이하 세로 흐름
- Layout adaptations: 데스크톱은 3열, 모바일은 원문과 요약을 순서대로 배치합니다.
- Touch/hover differences: 버튼 터치 영역을 유지하고 hover에 의존하지 않습니다.

## Interaction states
- Loading: 요약 패널 제목 옆에 불러오는 상태를 표시합니다.
- Empty: 제출 글·탐구 기록·대화가 없을 때 설명 문구를 표시합니다.
- Error: API 실패 시 기존 화면의 빈 상태와 재시도 동작을 보존합니다.
- Success: 분석 완료와 점수 저장 완료 상태를 토스트로 알립니다.
- Disabled: AI 분석 중 분석 버튼을 비활성화합니다.
- Offline/slow network, if applicable: 학생 편집·대화 영역은 내부 스크롤을 유지하고, 교수자 모바일의 명단·제출물·분석은 페이지 흐름 안에서 함께 스크롤합니다.

## Content voice
- Tone: 짧고 명확하며 평가를 단정하지 않는 안내 문장
- Terminology: `KUtrace`, `AI 협업 과정`, `학생 AI 탐구 기록`, `교수 확인 필요`
- Microcopy rules: 상태 배지에는 행동 또는 판단 상태를 직접 적고, 동의가 필요한 기록에는 안내 문구를 함께 둡니다.

## Implementation constraints
- Framework/styling system: React 19, TypeScript, vinext/Vite, `app/globals.css`
- Design-token constraints: 기존 `--ku`, `--ku-dark`, `--panel`, `--line` 변수를 우선 사용합니다.
- Performance constraints: 새 UI 라이브러리와 이미지 의존성을 추가하지 않습니다.
- Compatibility constraints: Vercel 정적 배포와 EC2 API rewrite를 유지합니다.
- Test/screenshot expectations: `npm.cmd run lint`, `npm.cmd test`, 데스크톱·모바일 교수자 화면 확인

## Open questions
- [ ] `public/og.png`의 공유 미리보기 문구를 `KUtrace`로 교체할지 결정
