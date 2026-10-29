package kr.ac.ku.aiwriting;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PlatformControllerTest {
    private static final String RECORD = PlatformController.normalizeForGrounding(
        "AI가 제안한 개요 중 두 번째 항목은 근거가 약해 보여서 다시 질문했습니다.\n"
            + "이 글은 생성형 AI를 자료 조사 단계에서만 활용했습니다."
    );

    @Test
    void keepsEvidenceQuotedVerbatimFromTheStudentRecord() {
        assertThat(PlatformController.grounded(RECORD, "두 번째 항목은 근거가 약해 보여서")).isTrue();
        assertThat(PlatformController.grounded(RECORD, "두번째  항목은 근거가 약해   보여서")).isTrue();
    }

    @Test
    void rejectsEvidenceThatIsNotInTheStudentRecord() {
        assertThat(PlatformController.grounded(RECORD, "학생이 AI 답변에 반론을 제기했습니다")).isFalse();
        assertThat(PlatformController.grounded(RECORD, "")).isFalse();
        assertThat(PlatformController.grounded(RECORD, null)).isFalse();
    }

    @Test
    void rejectsShortQuotesThatCouldMatchByAccident() {
        assertThat(PlatformController.grounded(RECORD, "AI가 제안한")).isFalse();
    }
}
