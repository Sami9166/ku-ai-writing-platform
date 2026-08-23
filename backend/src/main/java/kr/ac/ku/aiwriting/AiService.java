package kr.ac.ku.aiwriting;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/** AI gateway. It is optional: without the selected provider key the controller uses the local evaluator. */
@Component
public class AiService {
    private static final Logger log = LoggerFactory.getLogger(AiService.class);
    private static final Pattern URL_PATTERN = Pattern.compile("https?://[^\\s)\\]}>\\\"]+");
    private static final Pattern MARKDOWN_LINK_PATTERN = Pattern.compile("\\[([^\\]\r\n]+)]\\((https?://[^\\s)]+)\\)");
    private static final Pattern SEARCH_REQUEST_PATTERN = Pattern.compile(
        "\\[\\[SEARCH_NEEDED\\s*:\\s*(.+?)]]",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );
    private static final Pattern SEARCH_LINE_PATTERN = Pattern.compile(
        "(?im)^\\s*SEARCH\\s*:\\s*([^\\r\\n]+)"
    );
    private static final Pattern NO_SEARCH_LINE_PATTERN = Pattern.compile(
        "(?im)^\\s*NO_SEARCH\\s*$"
    );
    private final ObjectMapper mapper;
    private final SearchService searchService;
    private final String apiKey;
    private final String googleApiKey;
    private final boolean searchEnabled;
    private final String studentModel;
    private final String rubricModel;
    private final String professorProvider;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public AiService(
        ObjectMapper mapper,
        SearchService searchService,
        @Value("${ku.groq.api-key:}") String apiKey,
        @Value("${ku.google.api-key:}") String googleApiKey,
        @Value("${ku.groq.dotenv-enabled:true}") boolean dotenvEnabled,
        @Value("${ku.search.enabled:true}") boolean searchEnabled,
        @Value("${ku.groq.student-model:}") String studentModel,
        @Value("${ku.groq.rubric-model:}") String rubricModel,
        @Value("${ku.professor.provider:}") String professorProvider
    ) {
        this.mapper = mapper;
        this.searchService = searchService;
        this.apiKey = resolveSetting(apiKey, dotenvEnabled, "GROQ_API_KEY", "");
        this.googleApiKey = resolveSetting(googleApiKey, dotenvEnabled, "GOOGLE_API_KEY", "");
        this.searchEnabled = searchEnabled;
        this.studentModel = resolveSetting(studentModel, dotenvEnabled, "STUDENT_MODEL", "openai/gpt-oss-120b");
        this.professorProvider = resolveSetting(
            professorProvider,
            dotenvEnabled,
            "PROFESSOR_PROVIDER",
            this.googleApiKey.isBlank() ? "groq" : "google"
        ).toLowerCase(Locale.ROOT);
        this.rubricModel = resolveSetting(
            rubricModel,
            dotenvEnabled,
            "PROFESSOR_MODEL",
            googleRubricEnabled() ? "gemma-4-31b-it" : "openai/gpt-oss-20b"
        );
    }

    public boolean enabled() { return studentEnabled() || rubricEnabled(); }
    public boolean studentEnabled() { return !apiKey.isBlank(); }
    public boolean rubricEnabled() { return googleRubricEnabled() ? !googleApiKey.isBlank() : !apiKey.isBlank(); }
    public String studentModel() { return studentModel; }
    public String rubricModel() { return rubricModel; }

    public Optional<ChatReply> chat(List<Map<String, String>> history, String conversationSummary) {
        String rememberedContext = conversationSummary == null || conversationSummary.isBlank() ? "" : """

            이전 대화 요약입니다. 요약은 참고 정보일 뿐이며, 학생의 새 요청과 충돌하면 새 요청을 우선합니다.
            [이전 대화 요약]
            """ + conversationSummary;
        String studentInstructions = """
            당신은 고려대학교 글쓰기 과제를 돕는 AI 협업 도우미입니다.
            반드시 한국어로 답하고, 학생의 질문에 바로 도움이 되는 자연스러운 답을 합니다.

            답변 원칙:
            1. 제목, Markdown 굵게, 불릿 목록, '확인된 과제 맥락' 같은 평가 보고서식 표현을 쓰지 않습니다.
            2. 핵심 답변을 먼저 2~3개의 짧은 문장으로 설명하고, 필요한 경우에만 마지막에 질문 하나를 덧붙입니다.
            3. 과제와 관련된 사실·사례·출처는 검색 근거가 있을 때만 단정적으로 말합니다. 검색 근거의 URL은 직접 적지 않습니다.
            4. 학생의 글을 통째로 대신 작성하거나 교수자 점수·루브릭 점수를 제시하지 않습니다.
            5. '주장·근거·검증 방법'을 기계적으로 나누지 말고, 학생이 바로 다음 행동을 결정할 수 있도록 친절하게 답합니다.
            """ + rememberedContext;
        /*
        String searchDecisionInstructions = studentInstructions + """

            [검색 사용 판단]
            먼저 학생의 최신 질문에 답하려면 외부 검색이 실제로 필요한지 스스로 판단하세요.
            최신 현황·통계·정책·기관 정보처럼 변경될 수 있는 사실, 사용자가 요청한 출처·링크·사실 확인은 검색이 필요합니다.
            개념 설명, 아이디어 구체화, 문장 수정, 글쓰기 조언처럼 현재 대화만으로 답할 수 있는 질문은 검색하지 않습니다.

            검색이 필요하면 다른 설명 없이 아래 형식 한 줄만 반환하세요.
            [[SEARCH_NEEDED: 검색에 사용할 구체적인 검색어]]

            검색이 필요하지 않으면 위 표시를 쓰지 말고 학생에게 보여줄 최종 답변을 바로 작성하세요.
            """;

        String structuredSearchDecisionInstructions = studentInstructions + """

            [SEARCH DECISION JSON CONTRACT]
            Decide whether the latest student question needs external search before answering.
            Search is required for changing facts, current institutional information, statistics,
            policies, or an explicit request for sources or links. Search is not required for
            explanations, brainstorming, writing advice, or sentence editing.
            Return exactly one JSON object and nothing else. Do not use Markdown, code fences,
            function calls, or tool calls. The object must have exactly these fields:
            {"needsSearch":false,"query":"","answer":"student-facing final answer in natural Korean"}
            If search is required, set needsSearch to true, put a concise Korean search query
            in query, and set answer to an empty string. If search is not required, set
            needsSearch to false, leave query empty, and put the complete answer in answer.
            """;
        */
        String routingInstructions = """
            You are a search-routing classifier for a Korean student writing assistant.
            Inspect the latest user message in the conversation and decide whether an external
            web search is necessary before answering it. Search only for current or changeable
            facts, institutional information, statistics, policies, or an explicit request for
            sources or links. Do not search for general explanations, brainstorming, writing
            advice, or sentence editing.
            Return exactly one line:
            SEARCH: concise Korean query
            or
            NO_SEARCH
            Use SEARCH only when a current or changeable fact, institutional information,
            statistic, policy, or explicit request for sources/links requires a lookup.
            Use NO_SEARCH for explanations, brainstorming, writing advice, and sentence editing.
            Never answer the user, never emit Markdown, and never perform the lookup yourself.
            """;
        Optional<GeneratedResponse> firstResponse = generateResponse(studentModel, routingInstructions, history, false);
        if (firstResponse.isEmpty()) return Optional.empty();

        SearchDecision decision = parseSearchDecision(firstResponse.get().text());
        if (!decision.needsSearch()) {
            Optional<GeneratedResponse> answerResponse = generateResponse(studentModel, studentInstructions, history, false);
            if (answerResponse.isPresent()) {
                return Optional.of(new ChatReply(sanitizeAnswer(answerResponse.get().text()), List.of()));
            }
            if (!decision.answer().isBlank()) {
                return Optional.of(new ChatReply(sanitizeAnswer(decision.answer()), List.of()));
            }
            return Optional.empty();
        }
        String requestedQuery = decision.query();
        if (requestedQuery.isBlank()) return Optional.empty();
        if (!searchEnabled) {
            return Optional.of(new ChatReply(
                "이 질문은 최신 자료 확인이 필요하지만 현재 검색 기능이 꺼져 있어요. 확인되지 않은 내용을 추측하지 않고, 검색 기능이 켜지면 다시 확인해 드릴게요.",
                List.of()
            ));
        }

        SearchContext search = searchContext(requestedQuery);
        if (search.status() == SearchService.Status.UNAVAILABLE) {
            return Optional.of(new ChatReply(
                "검색 연결이 잠시 끊겨 최신 정보를 확인하지 못했어요. 확인되지 않은 내용이나 링크를 만들지 않고, 잠시 후 다시 시도해 주세요.",
                List.of()
            ));
        }
        if (search.status() == SearchService.Status.NO_RESULTS) {
            return Optional.of(new ChatReply(
                "검색 결과가 없어요. 질문의 범위나 시점을 조금 더 구체적으로 입력해 다시 시도해 주세요.",
                List.of()
            ));
        }

        return generateResponse(studentModel,
            studentInstructions + search.instructions() + """

                검색 필요 여부 판단은 이미 끝났습니다. 검색 요청 표시를 다시 출력하지 말고,
                제공된 검색 결과를 근거로 학생에게 보여줄 최종 답변만 자연스럽게 작성하세요.
                """,
            history,
            false
        ).map(response -> new ChatReply(
            sanitizeAnswer(response.text()),
            mergeSources(List.of(), search.sources())
        ));
    }

    private SearchContext searchContext(String query) {
        SearchService.SearchOutcome outcome = searchService.searchDetailed(query);
        List<SearchService.Result> results = outcome.results();
        if (outcome.status() != SearchService.Status.SUCCESS) {
            return new SearchContext(outcome.status(), "", List.of());
        }
        StringBuilder instructions = new StringBuilder("""

            [검색 결과]
            아래 검색 결과만 외부 사실의 근거로 사용하세요. 답변 본문에는 URL, Markdown 링크, 꺾쇠 링크(<https://...>)를 직접 작성하지 마세요.
            사용할 출처는 화면의 별도 참고 링크 영역에서 표시합니다. 검색 결과에 없는 사실은 추측하지 마세요.
            """);
        List<Source> sources = new ArrayList<>();
        for (SearchService.Result result : results) {
            instructions.append("\n- ").append(result.title())
                .append("\n  URL: ").append(result.url())
                .append("\n  요약: ").append(result.snippet());
            sources.add(new Source(result.title(), result.url()));
        }
        return new SearchContext(SearchService.Status.SUCCESS, instructions.toString(), mergeSources(List.of(), sources));
    }

    private List<Source> mergeSources(List<Source> first, List<Source> second) {
        Map<String, Source> unique = new LinkedHashMap<>();
        for (Source source : first) unique.putIfAbsent(source.url(), source);
        for (Source source : second) {
            unique.putIfAbsent(source.url(), source);
            if (unique.size() >= 5) break;
        }
        return unique.values().stream().limit(5).toList();
    }

    static Optional<String> searchQuery(String responseText) {
        var matcher = SEARCH_REQUEST_PATTERN.matcher(responseText == null ? "" : responseText.trim());
        if (!matcher.find()) return Optional.empty();
        String query = matcher.group(1).replaceAll("\\s+", " ").trim();
        if (query.isBlank()) return Optional.empty();
        return Optional.of(query.length() <= 300 ? query : query.substring(0, 300));
    }

    /**
     * Parses the model's search-routing contract. The legacy marker remains supported so
     * responses from an older running process do not get mistaken for a normal answer.
     */
    static SearchDecision parseSearchDecision(String responseText) {
        String raw = responseText == null ? "" : responseText.trim();
        var searchLine = SEARCH_LINE_PATTERN.matcher(raw);
        if (searchLine.find()) {
            String query = searchLine.group(1).replaceAll("\\s+", " ").trim();
            if (query.length() > 300) query = query.substring(0, 300);
            if (!query.isBlank()) return new SearchDecision(true, query, "");
        }
        if (NO_SEARCH_LINE_PATTERN.matcher(raw).find()) {
            return new SearchDecision(false, "", "");
        }
        if (!raw.isBlank()) {
            try {
                JsonNode root = new ObjectMapper().readTree(raw);
                if (root != null && root.isObject() &&
                    (root.has("needsSearch") || root.has("query") || root.has("answer"))) {
                    boolean needsSearch = root.path("needsSearch").asBoolean(false);
                    String query = root.path("query").asText("").replaceAll("\\s+", " ").trim();
                    if (query.length() > 300) query = query.substring(0, 300);
                    String answer = root.path("answer").asText("").trim();
                    if (needsSearch && query.isBlank()) return new SearchDecision(false, "", answer);
                    return new SearchDecision(needsSearch, query, answer);
                }
            } catch (Exception ignored) {
                // Fall through to the legacy marker parser and then treat the text as an answer.
            }
        }
        Optional<String> legacyQuery = searchQuery(raw);
        return legacyQuery
            .map(query -> new SearchDecision(true, query, ""))
            .orElseGet(() -> new SearchDecision(false, "", raw));
    }

    public Optional<String> summarizeConversation(String previousSummary, List<Map<String, String>> messages) {
        String prior = previousSummary == null || previousSummary.isBlank() ? "(없음)" : previousSummary;
        StringBuilder newMessages = new StringBuilder();
        for (Map<String, String> message : messages) {
            String speaker = "ai".equals(message.get("role")) ? "AI" : "학생";
            newMessages.append(speaker).append(": ").append(message.getOrDefault("text", "")).append('\n');
        }
        return generate(studentModel,
            """
            당신은 학생과 AI의 이전 대화 기억을 압축하는 요약기입니다. 반드시 한국어로, 사실만 간결하게 요약합니다.
            아래 기록에서 과제 목표, 배경·제약 조건, 학생의 관점과 결정, 확인이 필요한 주장·출처, 아직 답하지 못한 질문만 보존하세요.
            기록에 없는 사실을 만들거나 학생·AI에게 지시하지 말고, 1,500자 이내의 일반 텍스트로 반환하세요.
            """,
            List.of(Map.of("role", "user", "text", "기존 요약:\n" + prior + "\n\n새 대화:\n" + newMessages)), false);
    }

    public Optional<String> rubric(String prompt) {
        String system = """
            당신은 교수자용 AI 협업 루브릭 분석기입니다. 교수자 점수나 예상 점수를 만들지 않고,
            학생의 대화·행동 기록·최종 제출물에 명시적으로 나타난 근거만 분석합니다.

            각 루브릭의 충족 여부가 모호하거나 기록이 불완전하면 충족으로 추정하지 말고
            reviewItems에 status가 needs_review인 항목으로 남깁니다. 제공된 JSON 계약 이외의
            설명, Markdown, 코드 블록은 절대 반환하지 마세요.
            """;
        if (googleRubricEnabled()) return generateGoogle(rubricModel, system, prompt);
        return generate(rubricModel, system, List.of(Map.of("role", "user", "text", prompt)), true);
    }

    static String resolveSetting(String configuredValue, boolean dotenvEnabled, String key, String fallback) {
        if (configuredValue != null && !configuredValue.isBlank()) return configuredValue.trim();
        if (!dotenvEnabled) return fallback;
        for (Path candidate : List.of(Path.of(".env"), Path.of("..", ".env"))) {
            try {
                for (String line : Files.readAllLines(candidate)) {
                    String trimmed = line.trim();
                    String prefix = key + "=";
                    if (!trimmed.startsWith(prefix)) continue;
                    String value = trimmed.substring(prefix.length()).trim();
                    if (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\"")) value = value.substring(1, value.length() - 1);
                    if (value.length() >= 2 && value.startsWith("'") && value.endsWith("'")) value = value.substring(1, value.length() - 1);
                    if (!value.isBlank()) return value;
                }
            } catch (Exception ignored) {
                // .env is optional; a real process environment variable always takes precedence.
            }
        }
        return fallback;
    }

    private Optional<String> generate(String model, String system, List<Map<String, String>> history, boolean json) {
        return generateResponse(model, system, history, json).map(GeneratedResponse::text);
    }

    private Optional<GeneratedResponse> generateResponse(String model, String system, List<Map<String, String>> history, boolean json) {
        if (!studentEnabled()) {
            log.warn("Groq generation skipped: no API key is configured");
            return Optional.empty();
        }
        try {
            List<Map<String, Object>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", system));
            for (Map<String, String> message : history) {
                messages.add(Map.of(
                    "role", "ai".equals(message.get("role")) ? "assistant" : "user",
                    "content", message.getOrDefault("text", "")
                ));
            }
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("model", model);
            request.put("messages", messages);
            request.put("stream", false);
            if (!model.startsWith("groq/compound")) request.put("reasoning_effort", "low");
            if (json) request.put("response_format", Map.of("type", "json_object"));
            String endpoint = "https://api.groq.com/openai/v1/chat/completions";
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(45))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(request)))
                .build();
            HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                JsonNode error = mapper.readTree(response.body()).path("error");
                String reason = safeReason(error.path("message").asText("no error message"));
                String failedGeneration = error.path("failed_generation").asText("");
                if (!failedGeneration.isBlank()) reason += " failed_generation=" + safeReason(failedGeneration);
                log.warn("Groq generation failed: model={}, status={}, reason={}", model, response.statusCode(), reason);
                return Optional.empty();
            }
            JsonNode root = mapper.readTree(response.body());
            JsonNode choice = root.path("choices").path(0);
            JsonNode message = choice.path("message");
            String text = message.path("content").asText("").trim();
            if (text.isEmpty()) {
                log.warn("Groq generation returned no text: model={}, finishReason={}", model, choice.path("finish_reason").asText("unknown"));
                return Optional.empty();
            }
            return Optional.of(new GeneratedResponse(text, List.of()));
        } catch (Exception exception) {
            log.warn("Groq generation request failed: model={}, error={}", model, exception.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private Optional<String> generateGoogle(String model, String system, String prompt) {
        if (googleApiKey.isBlank()) {
            log.warn("Google generation skipped: no API key is configured");
            return Optional.empty();
        }
        try {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("systemInstruction", Map.of(
                "parts", List.of(Map.of("text", system))
            ));
            request.put("contents", List.of(Map.of(
                "role", "user",
                "parts", List.of(Map.of("text", prompt))
            )));
            request.put("generationConfig", Map.of(
                "responseMimeType", "application/json",
                "thinkingConfig", Map.of("thinkingLevel", "minimal")
            ));

            String endpoint = "https://generativelanguage.googleapis.com/v1beta/models/"
                + model + ":generateContent";
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", googleApiKey)
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(request)))
                .build();
            HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            JsonNode root = mapper.readTree(response.body());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String reason = root.path("error").path("message").asText(
                    root.path("promptFeedback").path("blockReason").asText("no error message")
                );
                log.warn("Google generation failed: model={}, status={}, reason={}", model, response.statusCode(), safeReason(reason));
                return Optional.empty();
            }

            StringBuilder text = new StringBuilder();
            for (JsonNode part : root.path("candidates").path(0).path("content").path("parts")) {
                String value = part.path("text").asText("");
                if (!value.isBlank()) text.append(value);
            }
            if (text.isEmpty()) {
                log.warn("Google generation returned no text: model={}", model);
                return Optional.empty();
            }
            return Optional.of(text.toString().trim());
        } catch (Exception exception) {
            log.warn("Google generation request failed: model={}, error={}", model, exception.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private boolean googleRubricEnabled() {
        return "google".equals(professorProvider) || "gemini".equals(professorProvider);
    }

    private String safeReason(String value) {
        String compact = value.replaceAll("[\\r\\n\\t]+", " ").trim();
        return compact.length() <= 240 ? compact : compact.substring(0, 240) + "…";
    }

    static String sanitizeAnswer(String text) {
        String withoutMarkdownLinks = MARKDOWN_LINK_PATTERN.matcher(text).replaceAll("$1");
        String withoutUrls = URL_PATTERN.matcher(withoutMarkdownLinks).replaceAll("");
        return withoutUrls
            .replaceAll("(?m)^\\s*`{3,}[^\\r\\n]*\\r?\\n?", "")
            .replaceAll("(?m)^\\s*#{1,6}\\s+", "")
            .replaceAll("(?m)^\\s*[-*+]\\s+", "")
            .replaceAll("(?m)^\\s*\\d+[.)]\\s+", "")
            .replaceAll("(?m)^\\s*>\\s?", "")
            .replaceAll("(?m)^\\s*([-*_])(?:\\s*\\1){2,}\\s*$", "")
            .replaceAll("\\*\\*([^\\r\\n]+?)\\*\\*", "$1")
            .replaceAll("__([^\\r\\n]+?)__", "$1")
            .replaceAll("(?<!\\w)\\*([^\\r\\n*]+?)\\*(?!\\w)", "$1")
            .replaceAll("(?<!\\w)_([^\\r\\n_]+?)_(?!\\w)", "$1")
            .replace("`", "")
            .replaceAll("<\\s*>", "")
            .replaceAll("\\[\\s*\\]\\(\\s*\\)", "")
            .replaceAll("(?m)[ \\t]+$", "")
            .trim();
    }

    public record Source(String title, String url) { }
    public record ChatReply(String text, List<Source> sources) { }
    record SearchDecision(boolean needsSearch, String query, String answer) { }
    private record GeneratedResponse(String text, List<Source> sources) { }
    private record SearchContext(SearchService.Status status, String instructions, List<Source> sources) { }
}
