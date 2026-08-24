package kr.ac.ku.aiwriting;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = {
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "https://ku-ai-writing-platform.vercel.app",
    "https://ku-ai-writing-platform-git-main-ksm031216-4819s-projects.vercel.app"
})
public class PlatformController {
    private static final List<String> RUBRIC_IDS = List.of("initiative", "prompt", "critical", "creative", "transparent");
    private static final Map<String, String> RUBRIC_LABELS = Map.of(
        "initiative", "주도적 상호작용", "prompt", "프롬프트 설계", "critical", "비판적 평가",
        "creative", "창의적 재구성", "transparent", "윤리적 투명성"
    );
    private static final Set<String> VERIFY_METHODS = Set.of("AI에게 추가 질문하기", "참고 문헌 확인하기", "직접 검색하기");
    // ponytail: character budgets approximate tokens; use provider tokenization only if quota precision becomes necessary.
    private static final int RECENT_CONTEXT_MESSAGES = 8;
    private static final int MAX_CONTEXT_CHARACTERS = 8_000;
    private static final int MAX_REMOTE_SUMMARY_CHARACTERS = 6_000;
    private static final int EVALUATION_RECENT_MESSAGES = 8;
    private static final int EVALUATION_RECENT_EVENTS = 6;
    private static final int MAX_EVALUATION_SUMMARY_CHARACTERS = 1_000;
    private static final int MAX_EVALUATION_CONVERSATION_CHARACTERS = 2_500;
    private static final int MAX_EVALUATION_SUBMISSION_CHARACTERS = 4_000;

    private final DatabaseStore store;
    private final AiService ai;
    private final ObjectMapper mapper;

    public PlatformController(DatabaseStore store, AiService ai, ObjectMapper mapper) {
        this.store = store;
        this.ai = ai;
        this.mapper = mapper;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return mapOf("ok", true, "mode", "mysql", "ai", mapOf(
            "student", ai.studentEnabled() ? ai.studentModel() : "mock",
            "rubric", ai.rubricEnabled() ? ai.rubricModel() : "mock"
        ));
    }

    @GetMapping("/assignments")
    public Map<String, Object> assignments() { return mapOf("assignments", store.assignments()); }

    @GetMapping("/students")
    public Map<String, Object> students(@RequestParam(required = false) Long assignmentId) {
        return mapOf("students", store.students(store.assignmentIdOrDefault(assignmentId)));
    }

    @GetMapping("/students/{studentId}/summary")
    public Map<String, Object> summary(@PathVariable String studentId, @RequestParam(required = false) Long assignmentId) {
        return buildSummary(store.assignmentIdOrDefault(assignmentId), studentId, false);
    }

    public Map<String, Object> summary(String studentId) {
        return buildSummary(store.assignmentIdOrDefault(null), studentId, false);
    }

    @PostMapping("/chat")
    public Map<String, Object> chat(@RequestBody Map<String, Object> body) {
        long assignmentId = assignmentId(body);
        String studentId = text(body, "studentId", "2022000009");
        String message = text(body, "message", "").trim();
        if (message.isBlank()) return mapOf("error", "message is required");
        store.addInteraction(assignmentId, studentId, interaction("user", message));

        ConversationContext context = conversationContext(assignmentId, studentId, store.interactions(assignmentId, studentId));
        Optional<AiService.ChatReply> generatedReply = ai.chat(context.messages(), context.summary());
        AiService.ChatReply reply = generatedReply
            .orElseGet(() -> new AiService.ChatReply(mockReply(message), List.of()));
        Map<String, Object> aiMessage = interaction("ai", reply.text());
        aiMessage.put("sources", reply.sources());
        store.addInteraction(assignmentId, studentId, aiMessage);
        store.markRubricSourceChanged(assignmentId, studentId);
        return mapOf("message", aiMessage, "mode", generatedReply.isPresent() ? "groq" : "mock");
    }

    @PostMapping("/events")
    public Map<String, Object> event(@RequestBody Map<String, Object> body) {
        long assignmentId = assignmentId(body);
        String studentId = text(body, "studentId", "2022000009");
        String type = text(body, "type", "");
        if (type.isBlank()) return mapOf("error", "type is required");
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("id", "event-" + UUID.randomUUID());
        event.put("type", type);
        event.put("responseId", text(body, "responseId", ""));
        event.put("highlightedText", text(body, "highlightedText", text(body, "text", "")));
        event.put("verdict", text(body, "verdict", ""));
        event.put("reason", text(body, "reason", ""));
        event.put("method", text(body, "method", ""));
        event.put("parentEventId", text(body, "parentEventId", ""));
        event.put("executed", Boolean.TRUE.equals(body.get("executed")));
        event.put("timestamp", Instant.now().toString());
        store.addEvent(assignmentId, studentId, event);
        store.markRubricSourceChanged(assignmentId, studentId);
        return mapOf("event", event, "progress", progress(assignmentId, studentId));
    }

    @PostMapping("/drafts")
    public Map<String, Object> draft(@RequestBody Map<String, Object> body) {
        long assignmentId = assignmentId(body);
        String studentId = text(body, "studentId", "2022000009");
        Map<String, Object> submission = mapOf("status", "draft", "content", text(body, "content", ""), "updatedAt", Instant.now().toString());
        store.putSubmission(assignmentId, studentId, submission);
        store.markRubricSourceChanged(assignmentId, studentId);
        return mapOf("saved", true, "submission", submission);
    }

    @PostMapping("/submissions")
    public Map<String, Object> submission(@RequestBody Map<String, Object> body) {
        long assignmentId = assignmentId(body);
        String studentId = text(body, "studentId", "2022000009");
        Map<String, Object> value = mapOf("status", "submitted", "content", text(body, "content", ""), "submittedAt", Instant.now().toString());
        store.putSubmission(assignmentId, studentId, value);
        store.markRubricSourceChanged(assignmentId, studentId);
        Map<String, Object> evaluation = evaluateAndSave(assignmentId, studentId, false);
        return mapOf("saved", true, "submission", value, "evaluation", evaluation);
    }

    @PostMapping("/scores")
    public Map<String, Object> scores(@RequestBody Map<String, Object> body) {
        long assignmentId = assignmentId(body);
        String studentId = text(body, "studentId", "2022000009");
        Map<String, Object> incoming = asMap(body.get("scores"));
        Map<String, Object> value = new LinkedHashMap<>();
        for (String id : RUBRIC_IDS) {
            Object raw = incoming.get(id);
            if (raw instanceof Number number && number.intValue() >= 1 && number.intValue() <= 5) value.put(id, number.intValue());
            else value.put(id, null);
        }
        value.put("updatedAt", Instant.now().toString());
        store.putScores(assignmentId, studentId, value);
        return mapOf("saved", true, "scores", value);
    }

    @PostMapping("/reviews/{reviewId}/resolve")
    public Map<String, Object> resolveReview(@PathVariable String reviewId, @RequestBody Map<String, Object> body) {
        long assignmentId = assignmentId(body);
        String studentId = text(body, "studentId", "2022000009");
        String status = text(body, "status", "");
        if (!Set.of("fulfilled", "not_fulfilled").contains(status)) return mapOf("error", "status must be fulfilled or not_fulfilled");
        store.addReviewResolution(assignmentId, studentId, mapOf("reviewId", reviewId, "status", status, "resolvedAt", Instant.now().toString()));
        store.markRubricSourceChanged(assignmentId, studentId);
        return mapOf("saved", true, "summary", buildSummary(assignmentId, studentId, false));
    }

    @PostMapping("/evaluations/{studentId}/run")
    public Map<String, Object> runEvaluation(@PathVariable String studentId, @RequestBody(required = false) Map<String, Object> body) {
        return mapOf("evaluation", evaluateAndSave(assignmentId(body), studentId, true));
    }

    private Map<String, Object> buildSummary(long assignmentId, String studentId, boolean useAi) {
        Map<String, Object> evaluation = useAi ? evaluateAndSave(assignmentId, studentId, true) : storedOrLocalEvaluation(assignmentId, studentId);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("student", findStudent(assignmentId, studentId));
        response.put("assignment", store.assignment(assignmentId));
        response.put("evaluation", evaluation);
        response.put("rubrics", asMap(evaluation.get("rubrics")));
        response.put("scores", store.scores(assignmentId, studentId));
        response.put("conversation", store.interactions(assignmentId, studentId));
        response.put("explorationRecords", explorationRecords(assignmentId, studentId));
        response.put("progress", progress(assignmentId, studentId));
        response.put("submission", store.submission(assignmentId, studentId));
        return response;
    }

    private Map<String, Object> storedOrLocalEvaluation(long assignmentId, String studentId) {
        Map<String, Object> stored = store.evaluation(assignmentId, studentId);
        int sourceVersion = store.rubricSourceVersion(assignmentId, studentId);
        return stored.isEmpty() || integer(stored.get("sourceVersion"), -1) != sourceVersion
            ? evaluateAndSave(assignmentId, studentId, false)
            : stored;
    }

    private ConversationContext conversationContext(long assignmentId, String studentId, List<Map<String, Object>> interactions) {
        int summaryBoundary = Math.max(0, interactions.size() - RECENT_CONTEXT_MESSAGES);
        Map<String, Object> stored = store.conversationSummary(assignmentId, studentId);
        String summary = text(stored, "summary", "");
        int summarizedCount = Math.min(integer(stored.get("summarizedInteractionCount"), 0), summaryBoundary);

        if (summaryBoundary > summarizedCount) {
            List<Map<String, String>> olderMessages = interactionHistory(interactions.subList(summarizedCount, summaryBoundary));
            String previousSummary = summary;
            summary = totalCharacters(olderMessages) <= MAX_REMOTE_SUMMARY_CHARACTERS
                ? ai.summarizeConversation(previousSummary, olderMessages)
                    .orElseGet(() -> localConversationSummary(previousSummary, olderMessages))
                : localConversationSummary(previousSummary, olderMessages);
            summarizedCount = summaryBoundary;
            store.putConversationSummary(assignmentId, studentId, summary, summarizedCount);
        }
        List<Map<String, String>> recentMessages = interactionHistory(interactions.subList(summarizedCount, interactions.size()));
        return new ConversationContext(summary, limitHistory(recentMessages, MAX_CONTEXT_CHARACTERS));
    }

    private List<Map<String, String>> interactionHistory(List<Map<String, Object>> interactions) {
        List<Map<String, String>> history = new ArrayList<>();
        for (Map<String, Object> item : interactions) {
            history.add(Map.of("role", text(item, "role", "user"), "text", text(item, "text", "")));
        }
        return history;
    }

    private int totalCharacters(List<Map<String, String>> messages) {
        return messages.stream().mapToInt(message -> message.getOrDefault("text", "").length()).sum();
    }

    private List<Map<String, String>> limitHistory(List<Map<String, String>> messages, int maxCharacters) {
        if (totalCharacters(messages) <= maxCharacters) return messages;
        List<Map<String, String>> limited = new ArrayList<>();
        int characters = 0;
        for (int index = messages.size() - 1; index >= 0 && characters < maxCharacters; index--) {
            Map<String, String> message = messages.get(index);
            String content = message.getOrDefault("text", "");
            int remaining = maxCharacters - characters;
            if (content.length() > remaining) content = content.substring(content.length() - remaining);
            limited.add(0, Map.of("role", message.getOrDefault("role", "user"), "text", content));
            characters += content.length();
        }
        return limited;
    }

    private String localConversationSummary(String previousSummary, List<Map<String, String>> messages) {
        StringBuilder summary = new StringBuilder(previousSummary == null ? "" : previousSummary.trim());
        for (Map<String, String> message : messages) {
            if (!summary.isEmpty()) summary.append('\n');
            summary.append("ai".equals(message.get("role")) ? "AI: " : "학생: ")
                .append(message.getOrDefault("text", ""));
        }
        if (summary.length() <= 3_000) return summary.toString();
        return summary.substring(0, 1_500) + "\n[중간 대화 생략]\n" + summary.substring(summary.length() - 1_450);
    }

    private Map<String, Object> evaluateAndSave(long assignmentId, String studentId, boolean useAi) {
        int sourceVersion = store.rubricSourceVersion(assignmentId, studentId);
        Map<String, Object> local = evaluateLocal(assignmentId, studentId);
        if (useAi && ai.rubricEnabled()) {
            String prompt = evaluationPrompt(assignmentId, studentId);
            ai.rubric(prompt).map(this::parseJson).filter(value -> !value.isEmpty()).ifPresent(parsed -> mergeAiResult(local, parsed));
        }
        local.put("sourceVersion", sourceVersion);
        local.put("generatedAt", Instant.now().toString());
        store.putEvaluation(assignmentId, studentId, local);
        return local;
    }

    private Map<String, Object> evaluateLocal(long assignmentId, String studentId) {
        List<Map<String, Object>> interactions = store.interactions(assignmentId, studentId);
        List<Map<String, Object>> events = store.events(assignmentId, studentId);
        String submission = text(store.submission(assignmentId, studentId), "content", "");
        int aiInteractions = (int) interactions.stream().filter(item -> "ai".equals(text(item, "role", ""))).count();
        int meaningful = meaningfulFollowups(interactions);

        Map<String, Object> rubrics = new LinkedHashMap<>();
        rubrics.put("initiative", rubric("initiative", Math.min(meaningful, aiInteractions), aiInteractions, List.of("의미 있는 후속 개입은 추가 질문·수정 요청·방향 전환·반론처럼 학생의 목표가 드러난 후속 메시지만 셉니다."), List.of()));

        String prompts = interactions.stream().filter(item -> "user".equals(text(item, "role", ""))).map(item -> text(item, "text", "")).reduce("", (a, b) -> a + " " + b);
        List<String> promptEvidence = new ArrayList<>();
        int promptCount = 0;
        if (matches(prompts, "무엇|하고 싶|원해|목적|활용")) { promptCount++; promptEvidence.add("목적"); }
        if (matches(prompts, "과제|주제|고려대|서비스|배경|맥락")) { promptCount++; promptEvidence.add("맥락"); }
        if (matches(prompts, "조건|정리해|작성|결과|요구|반영")) { promptCount++; promptEvidence.add("요구사항"); }
        if (matches(prompts, "분량|형식|대상|범위|제약|근거")) { promptCount++; promptEvidence.add("제약조건"); }
        rubrics.put("prompt", rubric("prompt", promptCount, 4, promptEvidence, List.of()));

        Set<String> verifiedResponses = new HashSet<>();
        List<Map<String, Object>> reviewItems = new ArrayList<>();
        for (Map<String, Object> item : events) {
            if (!"verdict".equals(text(item, "type", "")) || !"verify".equals(text(item, "verdict", ""))) continue;
            String sourceId = text(item, "id", "");
            boolean executed = events.stream().anyMatch(next -> "followup".equals(text(next, "type", "")) && sourceId.equals(text(next, "parentEventId", "")) && Boolean.TRUE.equals(next.get("executed")) && VERIFY_METHODS.contains(text(next, "method", "")));
            if (executed || "fulfilled".equals(resolutionStatus(assignmentId, studentId, "review-critical-" + sourceId))) verifiedResponses.add(text(item, "responseId", sourceId));
            else if (!resolved(assignmentId, studentId, "review-critical-" + sourceId)) reviewItems.add(reviewItem("review-critical-" + sourceId, "critical", text(item, "highlightedText", ""), "확인 필요 뒤 실행한 검증 방법이 기록되었는지 교수자의 확인이 필요합니다."));
        }
        rubrics.put("critical", rubric("critical", verifiedResponses.size(), aiInteractions, List.of("완료된 확인 필요 → 방법 선택 → 실행 체인만 비판적 평가에 반영합니다."), reviewItems));

        int creative = 0;
        List<String> creativeEvidence = new ArrayList<>();
        if (matches(submission, "나의|내 관점|내 주장|나는|본인은|우리의")) { creative++; creativeEvidence.add("자신의 관점이나 주장"); }
        if (matches(submission, "첫째|둘째|따라서|반면|결론적으로|논리|구조")) { creative++; creativeEvidence.add("자신의 논리 구조"); }
        if (submission.length() >= 120 && !matches(submission, "그대로 복사|AI 답변을 그대로")) { creative++; creativeEvidence.add("자신의 언어로 수정"); }
        rubrics.put("creative", rubric("creative", creative, 3, creativeEvidence, List.of()));

        int transparent = 0;
        List<String> transparentEvidence = new ArrayList<>();
        if (matches(submission, "AI를|인공지능을|생성형 AI|AI 사용")) { transparent++; transparentEvidence.add("AI 사용 여부"); }
        if (matches(submission, "사용 목적|목적은|자료 구조화|검토 질문|아이디어")) { transparent++; transparentEvidence.add("사용 목적"); }
        if (matches(submission, "활용 범위|어디까지|문장 표현|근거를 직접|최종 주장")) { transparent++; transparentEvidence.add("AI 활용 범위"); }
        rubrics.put("transparent", rubric("transparent", transparent, 3, transparentEvidence, List.of()));
        return mapOf("mode", "local", "rubrics", rubrics);
    }

    private Map<String, Object> rubric(String id, int fulfilled, int denominator, List<String> evidence, List<Map<String, Object>> reviewItems) {
        int safeDenominator = Math.max(denominator, 0);
        int rate = safeDenominator == 0 ? 0 : Math.round(fulfilled * 100f / safeDenominator);
        return mapOf("id", id, "label", RUBRIC_LABELS.get(id), "rate", rate, "fulfilledCount", fulfilled, "denominator", safeDenominator, "evidence", evidence, "reviewItems", reviewItems);
    }

    private Map<String, Object> reviewItem(String id, String rubricId, String evidence, String reason) {
        return mapOf("id", id, "rubricId", rubricId, "status", "needs_review", "evidence", evidence, "reason", reason);
    }

    private void mergeAiResult(Map<String, Object> local, Map<String, Object> parsed) {
        Map<String, Object> parsedRubrics = asMap(parsed.get("rubrics"));
        if (parsedRubrics.isEmpty()) return;
        Map<String, Object> rubrics = asMap(local.get("rubrics"));
        for (String id : RUBRIC_IDS) {
            Map<String, Object> candidate = asMap(parsedRubrics.get(id));
            if (candidate.isEmpty()) continue;
            int denominator = integer(candidate.get("denominator"), integer(asMap(rubrics.get(id)).get("denominator"), 0));
            int fulfilled = integer(candidate.get("fulfilledCount"), -1);
            if (fulfilled < 0 || denominator < 0 || fulfilled > denominator) continue;
            Map<String, Object> current = asMap(rubrics.get(id));
            current.put("fulfilledCount", fulfilled);
            current.put("denominator", denominator);
            current.put("rate", denominator == 0 ? 0 : Math.round(fulfilled * 100f / denominator));
            if (candidate.get("evidence") instanceof List<?> evidence) current.put("evidence", evidence);
            if (candidate.get("reviewItems") instanceof List<?> reviews) current.put("reviewItems", reviews);
            rubrics.put(id, current);
        }
        local.put("mode", "groq");
        local.put("rubrics", rubrics);
    }

    private String evaluationPrompt(long assignmentId, String studentId) {
        try {
            return """
                다음 학생 기록을 분석해 JSON 객체만 반환하세요. 교수자 점수·예상 점수·총점은 절대 만들지 마세요.

                반환 계약:
                {
                  "rubrics": {
                    "initiative": {"fulfilledCount": 0, "denominator": 0, "evidence": ["명시적 근거"], "reviewItems": []},
                    "prompt": {"fulfilledCount": 0, "denominator": 4, "evidence": [], "reviewItems": []},
                    "critical": {"fulfilledCount": 0, "denominator": 0, "evidence": [], "reviewItems": []},
                    "creative": {"fulfilledCount": 0, "denominator": 3, "evidence": [], "reviewItems": []},
                    "transparent": {"fulfilledCount": 0, "denominator": 3, "evidence": [], "reviewItems": []}
                  }
                }
                reviewItems의 각 항목은 id, rubricId, status("needs_review"), evidence, reason을 가집니다.
                fulfilledCount는 0 이상 denominator 이하의 정수여야 합니다. 근거가 없으면 0으로 두고,
                모호한 항목은 충족으로 추정하지 말고 needs_review로 남깁니다.

                판정 규칙:
                - initiative: 전체 AI 답변 수가 denominator입니다. 학생이 AI 답변 뒤에 자신의 목적·조건을 반영해
                  추가 질문, 특정 부분 수정 요청, 방향 전환, 답변 기반 후속 질문 또는 반론을 한 횟수만 셉니다.
                - prompt: 학생 메시지에 목적, 과제·주제 맥락, 결과물 요구사항, 제약조건(분량·형식·대상·범위)이
                  각각 명시되었는지 판정합니다. denominator는 항상 4입니다.
                - critical: 확인 필요 판정 뒤 'AI에게 추가 질문하기', '참고 문헌 확인하기', '직접 검색하기' 중 하나를
                  선택하고 실행한 체인만 셉니다. denominator는 전체 AI 답변 수입니다. 선택 또는 실행이 불명확하면
                  needs_review를 남깁니다.
                - creative: 최종 제출물에 자신의 관점·주장, 자신의 논리 구조 재구성, 자신의 언어로 수정한 흔적이
                  각각 명시됐는지 판정합니다. denominator는 항상 3입니다.
                - transparent: 최종 제출물에 AI 사용 여부, 사용 목적, 구체적 활용 범위가 각각 명시됐는지 판정합니다.
                  denominator는 항상 3입니다.

                학생 기록:
                """ + mapper.writeValueAsString(evaluationRecords(assignmentId, studentId));
        } catch (Exception error) { return "학생 기록을 분석하세요."; }
    }

    private Map<String, Object> evaluationRecords(long assignmentId, String studentId) {
        List<Map<String, Object>> interactions = store.interactions(assignmentId, studentId);
        int conversationStart = Math.max(0, interactions.size() - EVALUATION_RECENT_MESSAGES);
        List<Map<String, String>> conversation = limitHistory(
            interactionHistory(interactions.subList(conversationStart, interactions.size())),
            MAX_EVALUATION_CONVERSATION_CHARACTERS
        );

        List<Map<String, Object>> events = store.events(assignmentId, studentId);
        int eventStart = Math.max(0, events.size() - EVALUATION_RECENT_EVENTS);
        List<Map<String, Object>> recentEvents = events.subList(eventStart, events.size()).stream()
            .map(this::compactEvent)
            .toList();

        Map<String, Object> submission = new LinkedHashMap<>(store.submission(assignmentId, studentId));
        if (!submission.isEmpty()) {
            submission.put("content", boundedText(text(submission, "content", ""), MAX_EVALUATION_SUBMISSION_CHARACTERS));
        }

        List<Map<String, Object>> resolutions = store.reviewResolutions(assignmentId, studentId);
        int resolutionStart = Math.max(0, resolutions.size() - EVALUATION_RECENT_EVENTS);
        return mapOf(
            "conversationSummary", boundedText(text(store.conversationSummary(assignmentId, studentId), "summary", ""), MAX_EVALUATION_SUMMARY_CHARACTERS),
            "conversation", conversation,
            "events", recentEvents,
            "submission", submission,
            "reviewResolutions", resolutions.subList(resolutionStart, resolutions.size())
        );
    }

    private Map<String, Object> compactEvent(Map<String, Object> event) {
        return mapOf(
            "type", text(event, "type", ""),
            "verdict", text(event, "verdict", ""),
            "highlightedText", boundedText(text(event, "highlightedText", ""), 180),
            "reason", boundedText(text(event, "reason", ""), 120),
            "method", boundedText(text(event, "method", ""), 80),
            "executed", Boolean.TRUE.equals(event.get("executed"))
        );
    }

    private String boundedText(String value, int maxCharacters) {
        if (value == null || value.length() <= maxCharacters) return value == null ? "" : value;
        String marker = "\n[...]\n";
        int available = Math.max(0, maxCharacters - marker.length());
        int head = available / 2;
        return value.substring(0, head) + marker + value.substring(value.length() - (available - head));
    }

    private Map<String, Object> parseJson(String text) {
        try {
            String cleaned = text.trim();
            int start = cleaned.indexOf('{');
            int end = cleaned.lastIndexOf('}');
            if (start >= 0 && end > start) cleaned = cleaned.substring(start, end + 1);
            return mapper.readValue(cleaned, new TypeReference<>() {});
        } catch (Exception ignored) { return Collections.emptyMap(); }
    }

    private List<Map<String, Object>> explorationRecords(long assignmentId, String studentId) {
        List<Map<String, Object>> records = new ArrayList<>();
        List<Map<String, Object>> events = store.events(assignmentId, studentId);
        for (Map<String, Object> item : events) {
            if (!"verdict".equals(text(item, "type", ""))) continue;
            Map<String, Object> record = new LinkedHashMap<>();
            record.put("id", text(item, "id", ""));
            record.put("verdict", switch (text(item, "verdict", "")) { case "verify" -> "확인 필요"; case "revise" -> "수정 필요"; default -> "타당함"; });
            Map<String, Object> followup = events.stream().filter(next -> "followup".equals(text(next, "type", "")) && text(item, "id", "").equals(text(next, "parentEventId", ""))).findFirst().orElse(null);
            record.put("method", followup == null ? "선택하지 않음" : text(followup, "method", ""));
            record.put("executed", followup != null && Boolean.TRUE.equals(followup.get("executed")));
            record.put("reason", text(item, "reason", "학생 선택 사유가 기록되지 않았습니다."));
            record.put("sentence", text(item, "highlightedText", ""));
            records.add(record);
        }
        return records;
    }

    private Map<String, Object> progress(long assignmentId, String studentId) {
        List<Map<String, Object>> events = store.events(assignmentId, studentId);
        int review = (int) events.stream().filter(item -> "verdict".equals(text(item, "type", ""))).count();
        int edit = (int) events.stream().filter(item -> "verdict".equals(text(item, "type", "")) && "valid".equals(text(item, "verdict", ""))).count();
        int verify = (int) events.stream().filter(item -> "followup".equals(text(item, "type", "")) && Boolean.TRUE.equals(item.get("executed")) && VERIFY_METHODS.contains(text(item, "method", ""))).count();
        return mapOf("review", review, "edit", edit, "verify", verify);
    }

    private Map<String, Object> findStudent(long assignmentId, String id) {
        return store.students(assignmentId).stream().filter(student -> id.equals(text(student, "id", ""))).findFirst().orElse(mapOf("id", id, "name", "학생"));
    }

    private boolean resolved(long assignmentId, String studentId, String reviewId) {
        return store.reviewResolutions(assignmentId, studentId).stream().anyMatch(item -> reviewId.equals(text(item, "reviewId", "")));
    }

    private String resolutionStatus(long assignmentId, String studentId, String reviewId) {
        return store.reviewResolutions(assignmentId, studentId).stream()
            .filter(item -> reviewId.equals(text(item, "reviewId", "")))
            .map(item -> text(item, "status", ""))
            .reduce((first, second) -> second)
            .orElse("");
    }

    private boolean meaningful(String value) { return value.matches(".*([?]|왜|어떻게|수정|바꿔|다르게|반론|근거|조건|정리해|검증|비교|추가).*" ); }
    private int meaningfulFollowups(List<Map<String, Object>> interactions) {
        boolean sawAi = false;
        int count = 0;
        for (Map<String, Object> item : interactions) {
            if ("ai".equals(text(item, "role", ""))) {
                sawAi = true;
            } else if (sawAi && "user".equals(text(item, "role", "")) && meaningful(text(item, "text", ""))) {
                count++;
            }
        }
        return count;
    }
    private boolean matches(String value, String regex) { return Pattern.compile(regex).matcher(value).find(); }
    private int integer(Object value, int fallback) { return value instanceof Number number ? number.intValue() : fallback; }
    private long assignmentId(Map<String, Object> body) {
        return store.assignmentIdOrDefault(body == null ? null : (body.get("assignmentId") instanceof Number number ? number.longValue() : null));
    }
    private String text(Map<String, Object> value, String key, String fallback) { Object raw = value.get(key); return raw == null ? fallback : String.valueOf(raw); }
    private String text(Map<String, Object> value, String key) { return text(value, key, ""); }
    private Map<String, Object> asMap(Object value) { return value instanceof Map<?, ?> map ? mapper.convertValue(map, new TypeReference<>() {}) : new LinkedHashMap<>(); }

    private Map<String, Object> interaction(String role, String text) { return mapOf("id", "interaction-" + UUID.randomUUID(), "role", role, "text", text, "timestamp", Instant.now().toString()); }
    private String mockReply(String message) {
        if (message.contains("서비스 개발")) {
            return "AI는 사용자 요구를 분석하고 아이디어와 기능을 구체화하는 데 활용할 수 있어요. 개발 중에는 코드 작성, 오류 수정, 테스트 자동화를 도와 작업 속도를 높일 수 있지만, 제안한 기능은 실제 사용자 검증을 거쳐 적용하는 편이 좋습니다.";
        }
        if (message.contains("검증") || message.contains("근거")) {
            return "그 주장은 바로 과제에 넣기보다 공식 자료나 참고 문헌으로 한 번 확인하는 편이 좋아요. 확인한 근거를 자신의 말로 정리하면 글의 신뢰도도 함께 높아집니다.";
        }
        if (message.contains("수정") || message.contains("다르게")) {
            return "먼저 독자와 글의 형식을 정한 뒤, 필요한 내용만 골라 자신의 논리 순서로 다시 써 보세요. AI 문장을 그대로 옮기기보다 표현을 바꾸고 자신의 의견을 덧붙이면 더 자연스러운 글이 됩니다.";
        }
        return "AI 답변을 과제에 활용할 때는 필요한 핵심만 골라 자신의 관점과 근거를 더해 정리해 보세요. 질문에 목적, 배경, 원하는 형식을 함께 적으면 다음 답변도 더 구체적으로 받을 수 있습니다.";
    }


    private Map<String, Object> mapOf(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i + 1 < values.length; i += 2) result.put(String.valueOf(values[i]), values[i + 1]);
        return result;
    }

    private record ConversationContext(String summary, List<Map<String, String>> messages) { }
}
