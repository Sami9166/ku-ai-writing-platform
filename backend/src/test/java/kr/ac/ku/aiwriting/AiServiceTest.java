package kr.ac.ku.aiwriting;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiServiceTest {
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
    void parsesTheAiSearchDecisionProtocol() {
        assertThat(AiService.searchQuery("[[SEARCH_NEEDED: 고려대학교 AI 교육 최신 현황 공식 자료]]"))
            .contains("고려대학교 AI 교육 최신 현황 공식 자료");
        assertThat(AiService.searchQuery("검색이 필요합니다.\n[[SEARCH_NEEDED: 고려대학교 AI 교육 현황]]"))
            .contains("고려대학교 AI 교육 현황");
        assertThat(AiService.searchQuery("AI는 아이디어를 구체화하는 데 활용할 수 있어요."))
            .isEmpty();
        assertThat(AiService.searchQuery("[[SEARCH_NEEDED:   ]]"))
            .isEmpty();
    }

    @Test
    void parsesTheStructuredSearchDecisionProtocol() {
        AiService.SearchDecision noSearch = AiService.parseSearchDecision(
            "{\"needsSearch\":false,\"query\":\"\",\"answer\":\"AI는 요구사항 분석과 기능 설계를 도울 수 있어요.\"}"
        );
        assertThat(noSearch.needsSearch()).isFalse();
        assertThat(noSearch.query()).isEmpty();
        assertThat(noSearch.answer()).contains("요구사항 분석");

        AiService.SearchDecision search = AiService.parseSearchDecision(
            "{\"needsSearch\":true,\"query\":\"고려대학교 AI 교육 현황 공식 자료\",\"answer\":\"\"}"
        );
        assertThat(search.needsSearch()).isTrue();
        assertThat(search.query()).contains("고려대학교 AI 교육 현황");
        assertThat(search.answer()).isEmpty();
    }

    @Test
    void keepsLegacySearchMarkerCompatible() {
        AiService.SearchDecision decision = AiService.parseSearchDecision(
            "[[SEARCH_NEEDED: 고려대학교 AI 교육 현황]]"
        );
        assertThat(decision.needsSearch()).isTrue();
        assertThat(decision.query()).contains("고려대학교 AI 교육 현황");
    }

    @Test
    void parsesPlainTextSearchRoutingProtocol() {
        AiService.SearchDecision search = AiService.parseSearchDecision(
            "SEARCH: 고려대학교 AI 교육 현황 공식 자료"
        );
        assertThat(search.needsSearch()).isTrue();
        assertThat(search.query()).isEqualTo("고려대학교 AI 교육 현황 공식 자료");

        AiService.SearchDecision noSearch = AiService.parseSearchDecision("NO_SEARCH");
        assertThat(noSearch.needsSearch()).isFalse();
        assertThat(noSearch.query()).isEmpty();
    }
}
