INSERT INTO courses (id, code, name)
VALUES (1, 'KORE001-1', '글쓰기');

INSERT INTO assignments (id, course_id, title, description, due_at)
VALUES (
    1,
    1,
    '글쓰기 2주차_고려대학교의 AI 발전을 위한 탐구',
    '고려대학교의 AI 교육·연구 현황과 향후 발전 방향을 탐구하는 글쓰기 과제',
    '2026-08-08 23:59:59'
);

INSERT INTO students (id, name, major, grade) VALUES
    ('2022000001', '김도연', NULL, NULL),
    ('2023000002', '김민수', NULL, NULL),
    ('2022000003', '김상민', NULL, NULL),
    ('2024000004', '박지훈', NULL, NULL),
    ('2022000005', '방소형', NULL, NULL),
    ('2021000006', '이서연', NULL, NULL),
    ('2022000007', '이현지', NULL, NULL),
    ('2025000008', '정민준', NULL, NULL),
    ('2022000009', '정지영', '영어영문학과', 4),
    ('2022000010', '주호빈', NULL, NULL);

INSERT INTO enrollments (course_id, student_id)
SELECT 1, id FROM students;

INSERT INTO ai_interactions (id, assignment_id, student_id, role, content, created_at) VALUES
    ('response-user-1', 1, '2022000009', 'user', 'AI를 서비스 개발에 어떻게 활용할 수 있어?', '2026-08-08 14:00:00'),
    ('response-1', 1, '2022000009', 'ai', 'AI는 사용자 요구 분석, 아이디어 구체화, 기능 설계에 활용할 수 있어요. 코드 작성과 오류 수정, 테스트 자동화에도 도움을 줍니다.', '2026-08-08 14:00:01'),
    ('response-user-2', 1, '2022000009', 'user', '사용자 검증이 필요한 부분을 중심으로 과제에 반영하고 싶어. 근거와 조건을 함께 정리해줘.', '2026-08-08 14:01:00'),
    ('response-2', 1, '2022000009', 'ai', '검증이 필요한 문장을 표시한 뒤 직접 검색이나 참고 문헌 확인으로 근거를 보완해 보세요.', '2026-08-08 14:01:01');

INSERT INTO ai_events
    (id, assignment_id, student_id, type, response_id, highlighted_text, verdict, reason, method, parent_event_id, executed, created_at)
VALUES
    ('highlight-1', 1, '2022000009', 'highlight', 'response-1', 'AI가 제안하는 기능은 대부분 실제 사용자 검증 없이는 높은 정확도를 보장하므로 별도의 검증 과정이 필요합니다.', NULL, NULL, NULL, NULL, FALSE, '2026-08-08 14:02:00'),
    ('verdict-1', 1, '2022000009', 'verdict', 'response-1', 'AI가 제안하는 기능은 대부분 실제 사용자 검증 없이는 높은 정확도를 보장하므로 별도의 검증 과정이 필요합니다.', 'verify', '사실 여부가 불확실함', NULL, NULL, FALSE, '2026-08-08 14:02:01'),
    ('followup-1', 1, '2022000009', 'followup', 'response-1', NULL, NULL, NULL, '직접 검색하기', 'verdict-1', TRUE, '2026-08-08 14:03:00'),
    ('verdict-2', 1, '2022000009', 'verdict', 'response-2', 'AI 활용 교육은 기술 사용법만 익히는 것이 아니라, 근거를 확인하고 자신의 관점으로 재구성하는 과정까지 포함해야 합니다.', 'revise', '논리적 오류 또는 비약이 있음', NULL, NULL, FALSE, '2026-08-08 14:04:00');

INSERT INTO submissions (assignment_id, student_id, status, content, created_at)
VALUES (
    1,
    '2022000009',
    'submitted',
    'AI를 활용해 고려대학교의 AI 교육과 연구 현황을 정리했다. 사용 목적은 자료 구조화와 검증 질문 생성이며, 최종 주장과 문장 표현은 나의 관점으로 다시 작성하고 근거를 직접 확인했다.',
    '2026-08-08 14:59:59'
);
