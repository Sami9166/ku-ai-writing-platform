-- 교수자 화면의 나머지 9명에게도 대화, 탐구 행동, 제출물 데모 기록을 제공합니다.
-- 교수 점수는 교수자가 직접 입력해야 하므로 seed하지 않습니다.

INSERT INTO ai_interactions (id, assignment_id, student_id, role, content, created_at)
SELECT CONCAT('demo-', s.id, '-user-1'), 1, s.id, 'user',
       CONCAT(s.name, '입니다. 고려대학교의 AI 교육 발전 방향을 설명하는 글을 쓰고 싶어. 현재 과제의 배경과 핵심 쟁점을 먼저 정리해줘.'),
       '2026-08-08 13:00:00'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO ai_interactions (id, assignment_id, student_id, role, content, created_at)
SELECT CONCAT('demo-', s.id, '-ai-1'), 1, s.id, 'ai',
       '고려대학교는 AI 교과목 확대, 전공 간 융합 교육, 산학협력 프로젝트를 통해 AI 교육을 발전시킬 수 있습니다. 학생이 실제 문제를 해결하는 프로젝트 경험을 늘리는 것도 중요합니다.',
       '2026-08-08 13:00:01'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO ai_interactions (id, assignment_id, student_id, role, content, created_at)
SELECT CONCAT('demo-', s.id, '-user-2'), 1, s.id, 'user',
       '그 설명에서 실제 근거가 필요한 부분은 무엇이야? 보고서 형식으로 쓰되 1,000자 범위에서 학생 관점의 주장과 검증 방법이 드러나게 다시 정리해줘.',
       '2026-08-08 13:01:00'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO ai_interactions (id, assignment_id, student_id, role, content, created_at)
SELECT CONCAT('demo-', s.id, '-ai-2'), 1, s.id, 'ai',
       '교과목 수, 융합 교육의 실제 운영 사례, 산학협력 성과는 공식 자료나 참고 문헌으로 확인해야 합니다. 확인한 근거를 바탕으로 자신의 주장과 개선 방향을 구분해 작성해 보세요.',
       '2026-08-08 13:01:01'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO ai_events
    (id, assignment_id, student_id, type, response_id, highlighted_text, executed, created_at)
SELECT CONCAT('demo-', s.id, '-highlight-1'), 1, s.id, 'highlight',
       CONCAT('demo-', s.id, '-ai-1'),
       '고려대학교는 AI 교과목 확대, 전공 간 융합 교육, 산학협력 프로젝트를 통해 AI 교육을 발전시킬 수 있습니다.',
       FALSE, '2026-08-08 13:02:00'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO ai_events
    (id, assignment_id, student_id, type, response_id, highlighted_text, verdict, reason, executed, created_at)
SELECT CONCAT('demo-', s.id, '-verdict-1'), 1, s.id, 'verdict',
       CONCAT('demo-', s.id, '-ai-1'),
       '고려대학교는 AI 교과목 확대, 전공 간 융합 교육, 산학협력 프로젝트를 통해 AI 교육을 발전시킬 수 있습니다.',
       'verify', '현재 실제로 운영되는 프로그램과 성과를 확인할 근거가 필요함',
       FALSE, '2026-08-08 13:02:01'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO ai_events
    (id, assignment_id, student_id, type, response_id, method, parent_event_id, executed, created_at)
SELECT CONCAT('demo-', s.id, '-followup-1'), 1, s.id, 'followup',
       CONCAT('demo-', s.id, '-ai-1'), '참고 문헌 확인하기',
       CONCAT('demo-', s.id, '-verdict-1'), TRUE, '2026-08-08 13:03:00'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO ai_events
    (id, assignment_id, student_id, type, response_id, highlighted_text, verdict, reason, executed, created_at)
SELECT CONCAT('demo-', s.id, '-verdict-2'), 1, s.id, 'verdict',
       CONCAT('demo-', s.id, '-ai-2'),
       '확인한 근거를 바탕으로 자신의 주장과 개선 방향을 구분해 작성해 보세요.',
       'valid', '근거 확인과 자신의 관점 구분을 함께 제안해 과제 목적에 적절함',
       FALSE, '2026-08-08 13:04:00'
FROM students s
WHERE s.id <> '2022000009';

INSERT INTO submissions (assignment_id, student_id, status, content, created_at)
SELECT 1, s.id, 'submitted',
       CONCAT(
           s.name,
           '은 고려대학교의 AI 교육 발전을 위해 전공 간 융합 수업과 실제 문제 해결 프로젝트가 함께 확대되어야 한다고 본다. ',
           'AI는 과제의 배경을 정리하고 검증이 필요한 쟁점을 찾는 목적으로 사용했다. ',
           'AI가 제시한 교과목과 산학협력 관련 내용은 참고 문헌으로 확인했으며, 확인되지 않은 표현은 제외했다. ',
           '최종 글의 논리 구조와 개선 방향은 나의 관점으로 재구성하고 문장도 직접 수정했다.'
       ),
       '2026-08-08 14:59:59'
FROM students s
WHERE s.id <> '2022000009';
