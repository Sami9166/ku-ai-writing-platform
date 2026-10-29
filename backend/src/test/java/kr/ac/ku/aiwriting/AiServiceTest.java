package kr.ac.ku.aiwriting;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AiServiceTest {
    @Test
    void keepsPrimaryAndBackupKeysInOrderWithoutDuplicates() {
        assertThat(AiService.uniqueNonBlank(" primary ", "backup", "primary", " ", null))
            .isEqualTo(List.of("primary", "backup"));
    }

    @Test
    void onlyFailsOverForProviderAvailabilityOrCredentialFailures() {
        assertThat(AiService.shouldTryFallback(401)).isTrue();
        assertThat(AiService.shouldTryFallback(429)).isTrue();
        assertThat(AiService.shouldTryFallback(503)).isTrue();
        assertThat(AiService.shouldTryFallback(400)).isFalse();
        assertThat(AiService.shouldTryFallback(404)).isFalse();
    }

    @Test
    void removesUnverifiedUrlsFromGeneratedText() {
        assertThat(AiService.sanitizeAnswer("공식 자료는 [가짜 링크](https://example.invalid/page), <https://example.invalid/other> 입니다."))
            .doesNotContain("https://example.invalid");
        assertThat(AiService.sanitizeAnswer("전공 안내: <>"))
            .doesNotContain("<>");
    }

    @Test
    void removesMarkdownFormattingFromGeneratedAnswers() {
        String answer = AiService.sanitizeAnswer("# 제목\n\n**중요한 답변**\n- 첫 번째\n- 두 번째\n`코드`");

        assertThat(answer)
            .contains("제목", "중요한 답변", "첫 번째", "두 번째", "코드")
            .doesNotContain("# ", "**", "- ", "`");
    }

    @Test
    void readsTheSearchQueryFromToolCallArguments() {
        ObjectMapper mapper = new ObjectMapper();

        assertThat(AiService.searchToolQuery(mapper, "{\"query\":\" 고려대학교  AI 교육 현황 \"}"))
            .isEqualTo("고려대학교 AI 교육 현황");
        assertThat(AiService.searchToolQuery(mapper, "{\"query\":\"\"}")).isEmpty();
        assertThat(AiService.searchToolQuery(mapper, "{}")).isEmpty();
        assertThat(AiService.searchToolQuery(mapper, "")).isEmpty();
        assertThat(AiService.searchToolQuery(mapper, "검색해 주세요")).isEmpty();
        assertThat(AiService.searchToolQuery(mapper, "{\"query\":\"" + "가".repeat(400) + "\"}"))
            .hasSize(300);
    }
}
