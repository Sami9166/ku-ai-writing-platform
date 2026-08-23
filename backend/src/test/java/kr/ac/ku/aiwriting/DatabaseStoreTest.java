package kr.ac.ku.aiwriting;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("test")
class DatabaseStoreTest {
    @Autowired
    private DatabaseStore store;

    @Autowired
    private PlatformController controller;

    @Test
    void flywaySeedAndAllPersistencePathsWork() {
        assertThat(((Map<?, ?>) controller.health().get("ai")).get("student")).isEqualTo("mock");
        assertThat(store.students()).hasSize(10);
        assertThat(store.assignments()).hasSize(5);
        assertThat(store.students(3)).hasSize(10);
        Map<String, Object> thirdAssignmentSummary = controller.summary("2022000009", 3L);
        assertThat(((Number) ((Map<?, ?>) thirdAssignmentSummary.get("assignment")).get("id")).longValue()).isEqualTo(3L);
        assertThat((List<?>) thirdAssignmentSummary.get("conversation")).isEmpty();
        store.students().forEach(student -> {
            String studentId = String.valueOf(student.get("id"));
            assertThat(store.interactions(studentId)).as("%s 학생의 AI 대화", studentId).hasSize(4);
            assertThat(store.events(studentId)).as("%s 학생의 탐구 이벤트", studentId).hasSizeGreaterThanOrEqualTo(4);
            assertThat(store.submission(studentId)).as("%s 학생의 제출물", studentId)
                .containsEntry("status", "submitted");

            Map<String, Object> summary = controller.summary(studentId);
            assertThat((List<?>) summary.get("conversation")).as("%s 학생의 교수자 대화 요약", studentId).hasSize(4);
            assertThat((List<?>) summary.get("explorationRecords")).as("%s 학생의 교수자 탐구 카드", studentId).hasSize(2);
            Map<?, ?> submission = (Map<?, ?>) summary.get("submission");
            assertThat(submission.get("status")).as("%s 학생의 교수자 제출물", studentId)
                .isEqualTo("submitted");
        });

        Map<String, Object> doyeonSummary = controller.summary("2022000001");
        Map<String, Object> junhoSummary = controller.summary("2022000010");
        int doyeonPromptRate = ((Number) ((Map<?, ?>) ((Map<?, ?>) doyeonSummary.get("rubrics")).get("prompt")).get("rate")).intValue();
        int junhoPromptRate = ((Number) ((Map<?, ?>) ((Map<?, ?>) junhoSummary.get("rubrics")).get("prompt")).get("rate")).intValue();
        assertThat(doyeonPromptRate).isNotEqualTo(junhoPromptRate);

        controller.draft(mapOf("studentId", "2022000001", "content", "수정한 학생 글"));
        Map<String, Object> refreshedSummary = controller.summary("2022000001");
        assertThat(refreshedSummary.get("evaluation"))
            .isInstanceOf(Map.class);
        assertThat(((Map<?, ?>) refreshedSummary.get("evaluation")).get("sourceVersion")).isEqualTo(1);

        String now = Instant.parse("2026-08-11T01:02:03Z").toString();
        store.addInteraction("2022000009", mapOf(
            "id", "test-interaction", "role", "user", "text", "테스트 질문", "timestamp", now
        ));
        assertThat(store.interactions("2022000009")).anyMatch(row -> "test-interaction".equals(row.get("id")));

        for (int i = 0; i < 7; i++) {
            controller.chat(mapOf("studentId", "2022000009", "message", "대화 맥락을 저장하는 테스트 질문 " + i));
        }
        assertThat(store.conversationSummary("2022000009"))
            .containsEntry("summarizedInteractionCount", 10)
            .containsKey("summary");

        store.putConversationSummary("2022000009", "과제 목적과 검증할 근거를 정리했다.", 4);
        assertThat(store.conversationSummary("2022000009"))
            .containsEntry("summary", "과제 목적과 검증할 근거를 정리했다.")
            .containsEntry("summarizedInteractionCount", 4);

        store.addEvent("2022000009", mapOf(
            "id", "test-event", "type", "highlight", "responseId", "response-1",
            "highlightedText", "검증할 문장", "timestamp", now
        ));
        assertThat(store.events("2022000009")).anyMatch(row -> "test-event".equals(row.get("id")));

        store.putSubmission("2022000009", mapOf(
            "status", "draft", "content", "수정 중인 초안", "updatedAt", now
        ));
        assertThat(store.submission("2022000009")).containsEntry("content", "수정 중인 초안");

        Map<String, Object> scores = mapOf(
            "initiative", 3, "prompt", 4, "critical", 5, "creative", 2, "transparent", 4,
            "updatedAt", now
        );
        store.putScores("2022000009", scores);
        assertThat(store.scores("2022000009")).containsEntry("critical", 5);

        Map<String, Object> evaluation = mapOf(
            "mode", "local", "rubrics", mapOf("initiative", mapOf("rate", 50)), "generatedAt", now
        );
        store.putEvaluation("2022000009", evaluation);
        assertThat(store.evaluation("2022000009")).containsEntry("mode", "local");

        store.addReviewResolution("2022000009", mapOf(
            "reviewId", "review-test", "status", "fulfilled", "resolvedAt", now
        ));
        assertThat(store.reviewResolutions("2022000009"))
            .anyMatch(row -> "review-test".equals(row.get("reviewId")) && "fulfilled".equals(row.get("status")));
    }

    private Map<String, Object> mapOf(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i + 1 < values.length; i += 2) result.put(String.valueOf(values[i]), values[i + 1]);
        return result;
    }
}
