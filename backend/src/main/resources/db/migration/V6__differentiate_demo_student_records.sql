-- 교수자 화면에서 학생마다 서로 다른 AI 협업 양상을 확인할 수 있도록 데모 원자료를 구분합니다.
UPDATE ai_interactions
SET content = CASE id
    WHEN 'demo-2022000001-user-1' THEN 'AI 활용이 필요하다.'
    WHEN 'demo-2022000001-user-2' THEN '좋아.'
    WHEN 'demo-2023000002-user-1' THEN '고려대 AI 교육에 관해 글을 쓰고 싶어.'
    WHEN 'demo-2023000002-user-2' THEN '이 답변의 근거는 무엇인지 참고 문헌으로 확인하려고 해.'
    WHEN 'demo-2022000003-user-1' THEN '과제 주제는 고려대 AI 교육이야. 어떤 내용을 정리해야 해?'
    WHEN 'demo-2022000003-user-2' THEN '결과를 분량 800자 보고서 형식으로 바꿔야 할까?'
    WHEN 'demo-2024000004-user-1' THEN '학생 대상 발표문을 만들고 싶어. AI 교육의 배경을 설명해줘.'
    WHEN 'demo-2024000004-user-2' THEN '결과물 조건을 다르게 정리해줄 수 있어?'
    WHEN 'demo-2022000005-user-1' THEN '고려대학교 AI 연구 주제의 발표를 작성해줘. 대상은 1학년이고 분량은 500자야.'
    WHEN 'demo-2022000005-user-2' THEN '산학협력 사례가 부족해. 다른 근거로 수정해줘.'
    WHEN 'demo-2021000006-user-1' THEN 'AI 서비스.'
    WHEN 'demo-2021000006-user-2' THEN '고마워.'
    WHEN 'demo-2022000007-user-1' THEN '나는 고려대학교 AI 교육 과제의 문제를 분석하고 싶어. 현재 배경과 결론 조건을 정리해줘.'
    WHEN 'demo-2022000007-user-2' THEN '내 주장과 반대되는 사례도 추가해서 방향을 바꿔볼래?'
    WHEN 'demo-2025000008-user-1' THEN '과제에서 고려대 AI 교육 개선안을 작성하려고 해. 전공생 30명을 대상으로 700자 이내 제안서 형식이 필요해.'
    WHEN 'demo-2025000008-user-2' THEN '좋아, 이대로 둘게.'
    WHEN 'demo-2022000010-user-1' THEN '고려대 AI 교육 과제의 개선 방향을 알고 싶어. 논지와 근거를 분리해줘.'
    WHEN 'demo-2022000010-user-2' THEN '답변의 근거를 직접 검색해 보니 다른 통계가 있어. 그 부분을 수정해줘.'
END
WHERE id IN (
    'demo-2022000001-user-1', 'demo-2022000001-user-2',
    'demo-2023000002-user-1', 'demo-2023000002-user-2',
    'demo-2022000003-user-1', 'demo-2022000003-user-2',
    'demo-2024000004-user-1', 'demo-2024000004-user-2',
    'demo-2022000005-user-1', 'demo-2022000005-user-2',
    'demo-2021000006-user-1', 'demo-2021000006-user-2',
    'demo-2022000007-user-1', 'demo-2022000007-user-2',
    'demo-2025000008-user-1', 'demo-2025000008-user-2',
    'demo-2022000010-user-1', 'demo-2022000010-user-2'
);

UPDATE ai_events
SET executed = FALSE
WHERE id IN (
    'demo-2023000002-followup-1', 'demo-2022000003-followup-1',
    'demo-2021000006-followup-1', 'demo-2025000008-followup-1'
);

UPDATE ai_events
SET verdict = 'verify', reason = '두 번째 답변도 직접 근거를 확인할 필요가 있음'
WHERE id = 'demo-2022000010-verdict-2';

INSERT INTO ai_events
    (id, assignment_id, student_id, type, response_id, method, parent_event_id, executed, created_at)
VALUES
    ('demo-2022000010-followup-2', 1, '2022000010', 'followup',
     'demo-2022000010-ai-2', '직접 검색하기', 'demo-2022000010-verdict-2', TRUE, '2026-08-08 13:04:30');

UPDATE submissions
SET content = CASE student_id
    WHEN '2022000001' THEN 'AI 교육 확대가 필요하다.'
    WHEN '2023000002' THEN '나는 고려대학교의 AI 교육에 실습이 더 필요하다고 본다.'
    WHEN '2022000003' THEN '내 관점에서는 전공 간 수업을 먼저 넓혀야 한다. 따라서 프로젝트 경험을 함께 늘려야 한다.'
    WHEN '2024000004' THEN '나의 관점에서 AI를 참고해 고려대학교의 교육은 실습 중심으로 바뀌어야 한다. 따라서 첫째, 전공 간 수업을 연결하고 둘째, 학생이 실제 문제를 해결하는 프로젝트를 늘려야 한다. 이러한 변화는 수업에서 배운 이론을 현실의 문제와 연결하게 하며, 학생이 스스로 근거를 검토하는 경험도 넓혀 준다.'
    WHEN '2022000005' THEN '나의 관점에서 AI 사용은 자료를 정리하는 데 도움이 되지만, 사용 목적은 논점을 구조화하고 검토할 질문을 찾는 데 있다. 따라서 수업은 학생이 확인한 자료를 바탕으로 직접 결론을 구성하도록 도와야 하며, 단순한 답변 수용보다 근거 비교와 토론을 늘려야 한다.'
    WHEN '2021000006' THEN '나는 생성형 AI를 사용했다. 사용 목적은 자료 구조화다. 활용 범위는 아이디어 정리까지이며, 최종 글은 직접 작성했다.'
    WHEN '2022000007' THEN '내 주장으로는 AI를 자료 구조화에 사용하되, 사용 목적은 쟁점 정리로 제한해야 한다. 반면 실제 사례의 타당성은 학생이 직접 검토해야 한다.'
    WHEN '2025000008' THEN 'AI를 참고해 고려대학교의 교육 방향을 간단히 정리했다.'
    WHEN '2022000010' THEN '나의 관점에서 고려대학교의 AI 교육은 근거 확인을 수업 안에 포함해야 한다. 첫째, 학생이 AI를 활용한 뒤 출처를 확인하도록 해야 한다. 사용 목적은 자료 구조화와 질문 정리였고, 활용 범위는 아이디어 정리까지로 한정했다. 따라서 최종 주장과 문장 표현은 직접 검토해 다시 구성했다.'
END
WHERE assignment_id = 1 AND status = 'submitted' AND student_id IN (
    '2022000001', '2023000002', '2022000003', '2024000004', '2022000005',
    '2021000006', '2022000007', '2025000008', '2022000010'
);
