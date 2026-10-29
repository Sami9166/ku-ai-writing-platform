package kr.ac.ku.aiwriting;

import com.fasterxml.jackson.core.type.TypeReference;
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
    private static final String SEARCH_TOOL_NAME = "web_search";
    private static final int MAX_TOOL_TURNS = 3;
    private static final Map<String, Object> SEARCH_TOOL_SCHEMA = Map.of(
        "type", "function",
        "function", Map.of(
            "name", SEARCH_TOOL_NAME,
            "description", "최신 현황·통계·정책·기관 정보처럼 변할 수 있는 사실이나 출처가 필요할 때 웹을 검색한다.",
            "parameters", Map.of(
                "type", "object",
                "properties", Map.of("query", Map.of("type", "string", "description", "한국어 검색어")),
                "required", List.of("query")
            )
        )
    );
    private final ObjectMapper mapper;
    private final SearchService searchService;
    private final List<String> groqApiKeys;
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
        @Value("${ku.groq.backup-api-key:}") String backupApiKey,
        @Value("${ku.google.api-key:}") String googleApiKey,
        @Value("${ku.groq.dotenv-enabled:true}") boolean dotenvEnabled,
        @Value("${ku.search.enabled:true}") boolean searchEnabled,
        @Value("${ku.groq.student-model:}") String studentModel,
        @Value("${ku.groq.rubric-model:}") String rubricModel,
        @Value("${ku.professor.provider:}") String professorProvider
    ) {
        this.mapper = mapper;
        this.searchService = searchService;
        this.groqApiKeys = uniqueNonBlank(
            resolveSetting(apiKey, dotenvEnabled, "GROQ_API_KEY", ""),
            resolveSetting(backupApiKey, dotenvEnabled, "GROQ_API_KEY_BACKUP", "")
        );
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
    public boolean studentEnabled() { return !groqApiKeys.isEmpty(); }
    public boolean studentFallbackEnabled() { return groqApiKeys.size() > 1; }
    public boolean rubricEnabled() { return googleRubricEnabled() ? !googleApiKey.isBlank() : !groqApiKeys.isEmpty(); }
    public String studentModel() { return studentModel; }
    public String rubricModel() { return rubricModel; }
    public String rubricProvider() { return googleRubricEnabled() ? "gemini" : "groq"; }

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
            """;
        boolean searchAvailable = searchEnabled && searchService.enabled();
        String searchToolInstructions = searchAvailable ? """

            [검색 도구]
            최신 현황·통계·정책·기관 정보처럼 변할 수 있는 사실이나 학생이 요청한 출처는 web_search 도구로 확인한 뒤 답합니다.
            개념 설명, 아이디어 구체화, 문장 수정, 글쓰기 조언은 도구를 부르지 않고 바로 답합니다.
            검색 결과에 없는 사실은 추측하지 말고, 확인하지 못했다고 알립니다.
            """ : "";
        return generateResponse(
            studentModel,
            studentInstructions + searchToolInstructions + rememberedContext,
            history,
            false,
            searchAvailable
        ).map(response -> new ChatReply(sanitizeAnswer(response.text()), response.sources()));
    }

    /** Runs one web_search tool call and appends its sources, returning the tool message the model reads next. */
    private Map<String, Object> toolResult(JsonNode call, List<Source> sources) {
        String id = call.path("id").asText("");
        if (!SEARCH_TOOL_NAME.equals(call.path("function").path("name").asText(""))) {
            return Map.of("role", "tool", "tool_call_id", id,
                "content", "알 수 없는 도구입니다. " + SEARCH_TOOL_NAME + "만 호출할 수 있습니다.");
        }
        String query = searchToolQuery(mapper, call.path("function").path("arguments").asText(""));
        if (query.isBlank()) {
            return Map.of("role", "tool", "tool_call_id", id,
                "content", "검색어가 비어 있습니다. 구체적인 검색어로 다시 호출하세요.");
        }
        SearchService.SearchOutcome outcome = searchService.searchDetailed(query);
        if (outcome.status() == SearchService.Status.UNAVAILABLE) {
            return Map.of("role", "tool", "tool_call_id", id,
                "content", "검색 서비스에 연결하지 못했습니다. 추측하지 말고 지금은 확인할 수 없다고 답하세요.");
        }
        if (outcome.status() == SearchService.Status.NO_RESULTS) {
            return Map.of("role", "tool", "tool_call_id", id,
                "content", "검색 결과가 없습니다. 검색어를 바꿔 한 번 더 시도하거나, 확인하지 못했다고 답하세요.");
        }
        StringBuilder content = new StringBuilder(
            "아래 검색 결과만 외부 사실의 근거로 사용하세요. 답변 본문에는 URL, Markdown 링크, 꺾쇠 링크(<https://...>)를 직접 쓰지 마세요. "
                + "사용할 출처는 화면의 별도 참고 링크 영역에서 표시합니다.");
        for (SearchService.Result result : outcome.results()) {
            content.append("\n- ").append(result.title())
                .append("\n  URL: ").append(result.url())
                .append("\n  요약: ").append(result.snippet());
            sources.add(new Source(result.title(), result.url()));
        }
        return Map.of("role", "tool", "tool_call_id", id, "content", content.toString());
    }

    /** Tool arguments arrive as a JSON string the model wrote, so malformed input yields no query instead of failing. */
    static String searchToolQuery(ObjectMapper mapper, String arguments) {
        try {
            String query = mapper.readTree(arguments == null || arguments.isBlank() ? "{}" : arguments)
                .path("query").asText("").replaceAll("\\s+", " ").trim();
            return query.length() <= 300 ? query : query.substring(0, 300);
        } catch (Exception exception) {
            return "";
        }
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
        return generateResponse(model, system, history, json, false).map(GeneratedResponse::text);
    }

    private Optional<GeneratedResponse> generateResponse(
        String model, String system, List<Map<String, String>> history, boolean json, boolean searchTool
    ) {
        if (!studentEnabled()) {
            log.warn("Groq generation skipped: no API key is configured");
            return Optional.empty();
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        messages.add(Map.of("role", "system", "content", system));
        for (Map<String, String> message : history) {
            messages.add(Map.of(
                "role", "ai".equals(message.get("role")) ? "assistant" : "user",
                "content", message.getOrDefault("text", "")
            ));
        }

        List<Source> sources = new ArrayList<>();
        for (int turn = 0; turn <= MAX_TOOL_TURNS; turn++) {
            // The last turn withholds the tool so the model has to answer instead of searching forever.
            Optional<JsonNode> choice = requestCompletion(model, messages, json, searchTool && turn < MAX_TOOL_TURNS);
            if (choice.isEmpty()) return Optional.empty();
            JsonNode message = choice.get().path("message");
            JsonNode toolCalls = message.path("tool_calls");
            if (!toolCalls.isArray() || toolCalls.isEmpty()) {
                return Optional.of(new GeneratedResponse(
                    message.path("content").asText("").trim(),
                    mergeSources(List.of(), sources)
                ));
            }
            messages.add(mapper.convertValue(message, new TypeReference<Map<String, Object>>() { }));
            for (JsonNode call : toolCalls) messages.add(toolResult(call, sources));
        }
        return Optional.empty();
    }

    private Optional<JsonNode> requestCompletion(String model, List<Map<String, Object>> messages, boolean json, boolean searchTool) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", model);
        request.put("messages", messages);
        request.put("stream", false);
        if (!model.startsWith("groq/compound")) request.put("reasoning_effort", "low");
        if (json) request.put("response_format", Map.of("type", "json_object"));
        if (searchTool) {
            request.put("tools", List.of(SEARCH_TOOL_SCHEMA));
            request.put("tool_choice", "auto");
        }

        final String requestBody;
        try {
            requestBody = mapper.writeValueAsString(request);
        } catch (Exception exception) {
            log.warn("Groq request could not be prepared: model={}, error={}", model, exception.getClass().getSimpleName());
            return Optional.empty();
        }

        String endpoint = "https://api.groq.com/openai/v1/chat/completions";
        for (int keyIndex = 0; keyIndex < groqApiKeys.size(); keyIndex++) {
            String keySlot = keySlot(keyIndex);
            try {
                HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(45))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + groqApiKeys.get(keyIndex))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build();
                HttpResponse<String> response = client.send(httpRequest, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    String reason = "no error message";
                    try {
                        JsonNode error = mapper.readTree(response.body()).path("error");
                        reason = safeReason(error.path("message").asText(reason));
                        String failedGeneration = error.path("failed_generation").asText("");
                        if (!failedGeneration.isBlank()) reason += " failed_generation=" + safeReason(failedGeneration);
                    } catch (Exception ignored) {
                        // Keep the status-based failover decision even if the provider error is not JSON.
                    }
                    log.warn("Groq generation failed: model={}, keySlot={}, status={}, reason={}", model, keySlot, response.statusCode(), reason);
                    if (!shouldTryFallback(response.statusCode()) || keyIndex + 1 >= groqApiKeys.size()) return Optional.empty();
                    log.warn("Retrying Groq generation with keySlot={} after keySlot={} failure", keySlot(keyIndex + 1), keySlot);
                    continue;
                }
                JsonNode root = mapper.readTree(response.body());
                JsonNode choice = root.path("choices").path(0);
                JsonNode message = choice.path("message");
                boolean requestedTool = message.path("tool_calls").isArray() && !message.path("tool_calls").isEmpty();
                if (!requestedTool && message.path("content").asText("").trim().isEmpty()) {
                    log.warn("Groq generation returned no text: model={}, keySlot={}, finishReason={}", model, keySlot, choice.path("finish_reason").asText("unknown"));
                    if (keyIndex + 1 < groqApiKeys.size()) continue;
                    return Optional.empty();
                }
                return Optional.of(choice);
            } catch (Exception exception) {
                if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
                log.warn("Groq generation request failed: model={}, keySlot={}, error={}", model, keySlot, exception.getClass().getSimpleName());
                if (keyIndex + 1 >= groqApiKeys.size()) return Optional.empty();
                log.warn("Retrying Groq generation with keySlot={} after keySlot={} request failure", keySlot(keyIndex + 1), keySlot);
            }
        }
        return Optional.empty();
    }

    static boolean shouldTryFallback(int statusCode) {
        return statusCode == 401 || statusCode == 403 || statusCode == 408 || statusCode == 425 || statusCode == 429 || statusCode >= 500;
    }

    static List<String> uniqueNonBlank(String... values) {
        List<String> result = new ArrayList<>();
        for (String value : values) {
            if (value == null || value.isBlank()) continue;
            String trimmed = value.trim();
            if (!result.contains(trimmed)) result.add(trimmed);
        }
        return List.copyOf(result);
    }

    private static String keySlot(int index) {
        return index == 0 ? "primary" : "backup-" + index;
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
    private record GeneratedResponse(String text, List<Source> sources) { }
}
