package kr.ac.ku.aiwriting;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** MySQL-backed persistence while preserving the frontend API's map-shaped contract. */
@Repository
public class DatabaseStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final long defaultAssignmentId;

    public DatabaseStore(JdbcTemplate jdbc, ObjectMapper mapper, @Value("${ku.assignment-id:1}") long assignmentId) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.defaultAssignmentId = assignmentId;
    }

    public List<Map<String, Object>> assignments() {
        return jdbc.query("""
            SELECT a.id, a.title, a.description, a.due_at, c.code AS course_code
              FROM assignments a
              JOIN courses c ON c.id = a.course_id
             ORDER BY CASE a.id WHEN 2 THEN 1 WHEN 1 THEN 2 ELSE a.id END
            """, (rs, rowNum) -> mapOf(
                "id", rs.getLong("id"),
                "title", rs.getString("title"),
                "description", empty(rs.getString("description")),
                "dueAt", instant(rs, "due_at"),
                "courseCode", rs.getString("course_code")
            ));
    }

    public Map<String, Object> assignment(long assignmentId) {
        return jdbc.query("""
            SELECT a.id, a.title, a.description, a.due_at, c.code AS course_code
              FROM assignments a
              JOIN courses c ON c.id = a.course_id
             WHERE a.id = ?
            """, (rs, rowNum) -> mapOf(
                "id", rs.getLong("id"),
                "title", rs.getString("title"),
                "description", empty(rs.getString("description")),
                "dueAt", instant(rs, "due_at"),
                "courseCode", rs.getString("course_code")
            ), assignmentId).stream().findFirst().orElseGet(LinkedHashMap::new);
    }

    public long assignmentIdOrDefault(Long requestedId) {
        if (requestedId != null && !assignment(requestedId).isEmpty()) return requestedId;
        return defaultAssignmentId;
    }

    // Default-assignment overloads keep the existing test and local utility surface stable.
    public List<Map<String, Object>> students() { return students(defaultAssignmentId); }
    public List<Map<String, Object>> interactions(String studentId) { return interactions(defaultAssignmentId, studentId); }
    public Map<String, Object> conversationSummary(String studentId) { return conversationSummary(defaultAssignmentId, studentId); }
    public int rubricSourceVersion(String studentId) { return rubricSourceVersion(defaultAssignmentId, studentId); }
    public List<Map<String, Object>> events(String studentId) { return events(defaultAssignmentId, studentId); }
    public Map<String, Object> submission(String studentId) { return submission(defaultAssignmentId, studentId); }
    public Map<String, Object> scores(String studentId) { return scores(defaultAssignmentId, studentId); }
    public List<Map<String, Object>> reviewResolutions(String studentId) { return reviewResolutions(defaultAssignmentId, studentId); }
    public Map<String, Object> evaluation(String studentId) { return evaluation(defaultAssignmentId, studentId); }
    public void putSubmission(String studentId, Map<String, Object> value) { putSubmission(defaultAssignmentId, studentId, value); }
    public void putScores(String studentId, Map<String, Object> value) { putScores(defaultAssignmentId, studentId, value); }
    public void putEvaluation(String studentId, Map<String, Object> value) { putEvaluation(defaultAssignmentId, studentId, value); }
    public void addInteraction(String studentId, Map<String, Object> value) { addInteraction(defaultAssignmentId, studentId, value); }
    public void putConversationSummary(String studentId, String summary, int count) { putConversationSummary(defaultAssignmentId, studentId, summary, count); }
    public void markRubricSourceChanged(String studentId) { markRubricSourceChanged(defaultAssignmentId, studentId); }
    public void addEvent(String studentId, Map<String, Object> value) { addEvent(defaultAssignmentId, studentId, value); }
    public void addReviewResolution(String studentId, Map<String, Object> value) { addReviewResolution(defaultAssignmentId, studentId, value); }

    public List<Map<String, Object>> students(long assignmentId) {
        return jdbc.query("""
            SELECT s.id, s.name
              FROM students s
              JOIN enrollments e ON e.student_id = s.id
              JOIN assignments a ON a.course_id = e.course_id
             WHERE a.id = ?
             ORDER BY s.id
            """, (rs, rowNum) -> mapOf("id", rs.getString("id"), "name", rs.getString("name")), assignmentId);
    }

    public List<Map<String, Object>> interactions(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT id, role, content, sources_json, created_at
              FROM ai_interactions
             WHERE assignment_id = ? AND student_id = ?
             ORDER BY created_at, id
            """, (rs, rowNum) -> mapOf(
                "id", rs.getString("id"),
                "role", rs.getString("role"),
                "text", rs.getString("content"),
                "sources", readJsonList(rs.getObject("sources_json")),
                "timestamp", instant(rs, "created_at")
            ), assignmentId, studentId);
    }

    public Map<String, Object> conversationSummary(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT summary, summarized_interaction_count, updated_at
              FROM conversation_summaries
             WHERE assignment_id = ? AND student_id = ?
            """, (rs, rowNum) -> mapOf(
                "summary", rs.getString("summary"),
                "summarizedInteractionCount", rs.getInt("summarized_interaction_count"),
                "updatedAt", instant(rs, "updated_at")
            ), assignmentId, studentId).stream().findFirst().orElseGet(LinkedHashMap::new);
    }

    public int rubricSourceVersion(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT source_version
              FROM rubric_source_versions
             WHERE assignment_id = ? AND student_id = ?
            """, (rs, rowNum) -> rs.getInt("source_version"), assignmentId, studentId)
            .stream().findFirst().orElse(0);
    }

    public List<Map<String, Object>> events(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT id, type, response_id, highlighted_text, verdict, reason, method,
                   parent_event_id, executed, created_at
              FROM ai_events
             WHERE assignment_id = ? AND student_id = ?
             ORDER BY created_at, id
            """, (rs, rowNum) -> {
                Map<String, Object> value = mapOf(
                    "id", rs.getString("id"),
                    "type", rs.getString("type"),
                    "responseId", empty(rs.getString("response_id")),
                    "highlightedText", empty(rs.getString("highlighted_text")),
                    "verdict", empty(rs.getString("verdict")),
                    "reason", empty(rs.getString("reason")),
                    "method", empty(rs.getString("method")),
                    "parentEventId", empty(rs.getString("parent_event_id")),
                    "executed", rs.getBoolean("executed"),
                    "timestamp", instant(rs, "created_at")
                );
                return value;
            }, assignmentId, studentId);
    }

    public Map<String, Object> submission(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT status, content, created_at
              FROM submissions
             WHERE assignment_id = ? AND student_id = ?
             ORDER BY id DESC
             LIMIT 1
            """, (rs, rowNum) -> {
                String status = rs.getString("status");
                String timeKey = "submitted".equals(status) ? "submittedAt" : "updatedAt";
                return mapOf("status", status, "content", rs.getString("content"), timeKey, instant(rs, "created_at"));
            }, assignmentId, studentId).stream().findFirst().orElseGet(LinkedHashMap::new);
    }

    public Map<String, Object> scores(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT initiative, prompt, critical, creative, transparent, updated_at
              FROM professor_scores
             WHERE assignment_id = ? AND student_id = ?
            """, (rs, rowNum) -> {
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("initiative", nullableInteger(rs, "initiative"));
                value.put("prompt", nullableInteger(rs, "prompt"));
                value.put("critical", nullableInteger(rs, "critical"));
                value.put("creative", nullableInteger(rs, "creative"));
                value.put("transparent", nullableInteger(rs, "transparent"));
                value.put("updatedAt", instant(rs, "updated_at"));
                return value;
            }, assignmentId, studentId).stream().findFirst().orElseGet(LinkedHashMap::new);
    }

    public List<Map<String, Object>> reviewResolutions(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT review_id, status, created_at
              FROM review_resolutions
             WHERE assignment_id = ? AND student_id = ?
             ORDER BY id
            """, (rs, rowNum) -> mapOf(
                "reviewId", rs.getString("review_id"),
                "status", rs.getString("status"),
                "resolvedAt", instant(rs, "created_at")
            ), assignmentId, studentId);
    }

    public Map<String, Object> evaluation(long assignmentId, String studentId) {
        return jdbc.query("""
            SELECT result_json
              FROM rubric_evaluations
             WHERE assignment_id = ? AND student_id = ?
             ORDER BY id DESC
             LIMIT 1
            """, (rs, rowNum) -> readJson(rs.getObject("result_json")), assignmentId, studentId)
            .stream().findFirst().orElseGet(LinkedHashMap::new);
    }

    @Transactional
    public void putSubmission(long assignmentId, String studentId, Map<String, Object> value) {
        ensureStudent(assignmentId, studentId);
        String status = text(value, "status", "draft");
        String time = "submitted".equals(status) ? text(value, "submittedAt", "") : text(value, "updatedAt", "");
        jdbc.update("INSERT INTO submissions (assignment_id, student_id, status, content, created_at) VALUES (?, ?, ?, ?, ?)",
            assignmentId, studentId, status, text(value, "content", ""), timestamp(time));
    }

    @Transactional
    public void putScores(long assignmentId, String studentId, Map<String, Object> value) {
        ensureStudent(assignmentId, studentId);
        jdbc.update("""
            INSERT INTO professor_scores
                (assignment_id, student_id, initiative, prompt, critical, creative, transparent, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                initiative = VALUES(initiative), prompt = VALUES(prompt), critical = VALUES(critical),
                creative = VALUES(creative), transparent = VALUES(transparent), updated_at = VALUES(updated_at)
            """, assignmentId, studentId,
            nullableNumber(value.get("initiative")), nullableNumber(value.get("prompt")), nullableNumber(value.get("critical")),
            nullableNumber(value.get("creative")), nullableNumber(value.get("transparent")), timestamp(text(value, "updatedAt", "")));
    }

    @Transactional
    public void putEvaluation(long assignmentId, String studentId, Map<String, Object> value) {
        ensureStudent(assignmentId, studentId);
        try {
            jdbc.update("INSERT INTO rubric_evaluations (assignment_id, student_id, mode, result_json, created_at) VALUES (?, ?, ?, ?, ?)",
                assignmentId, studentId, text(value, "mode", "local"), mapper.writeValueAsString(value),
                timestamp(text(value, "generatedAt", "")));
        } catch (Exception error) {
            throw new IllegalStateException("루브릭 평가 결과를 JSON으로 저장할 수 없습니다.", error);
        }
    }

    @Transactional
    public void addInteraction(long assignmentId, String studentId, Map<String, Object> value) {
        ensureStudent(assignmentId, studentId);
        jdbc.update("INSERT INTO ai_interactions (id, assignment_id, student_id, role, content, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            text(value, "id", "interaction-" + System.nanoTime()), assignmentId, studentId,
            text(value, "role", "user"), text(value, "text", ""), writeJson(value.get("sources")), timestamp(text(value, "timestamp", "")));
    }

    @Transactional
    public void putConversationSummary(long assignmentId, String studentId, String summary, int summarizedInteractionCount) {
        ensureStudent(assignmentId, studentId);
        jdbc.update("""
            INSERT INTO conversation_summaries
                (assignment_id, student_id, summary, summarized_interaction_count, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                summary = VALUES(summary),
                summarized_interaction_count = VALUES(summarized_interaction_count),
                updated_at = VALUES(updated_at)
            """, assignmentId, studentId, summary, Math.max(summarizedInteractionCount, 0), Timestamp.from(Instant.now()));
    }

    @Transactional
    public void markRubricSourceChanged(long assignmentId, String studentId) {
        ensureStudent(assignmentId, studentId);
        jdbc.update("""
            INSERT INTO rubric_source_versions (assignment_id, student_id, source_version, updated_at)
            VALUES (?, ?, 1, ?)
            ON DUPLICATE KEY UPDATE
                source_version = source_version + 1,
                updated_at = VALUES(updated_at)
            """, assignmentId, studentId, Timestamp.from(Instant.now()));
    }

    @Transactional
    public void addEvent(long assignmentId, String studentId, Map<String, Object> value) {
        ensureStudent(assignmentId, studentId);
        jdbc.update("""
            INSERT INTO ai_events
                (id, assignment_id, student_id, type, response_id, highlighted_text, verdict, reason,
                 method, parent_event_id, executed, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, text(value, "id", "event-" + System.nanoTime()), assignmentId, studentId,
            text(value, "type", ""), nullIfBlank(text(value, "responseId", "")),
            nullIfBlank(text(value, "highlightedText", "")), nullIfBlank(text(value, "verdict", "")),
            nullIfBlank(text(value, "reason", "")), nullIfBlank(text(value, "method", "")),
            nullIfBlank(text(value, "parentEventId", "")), Boolean.TRUE.equals(value.get("executed")),
            timestamp(text(value, "timestamp", "")));
    }

    @Transactional
    public void addReviewResolution(long assignmentId, String studentId, Map<String, Object> value) {
        ensureStudent(assignmentId, studentId);
        jdbc.update("INSERT INTO review_resolutions (assignment_id, student_id, review_id, status, created_at) VALUES (?, ?, ?, ?, ?)",
            assignmentId, studentId, text(value, "reviewId", ""), text(value, "status", ""),
            timestamp(text(value, "resolvedAt", "")));
    }

    private void ensureStudent(long assignmentId, String studentId) {
        Integer studentCount = jdbc.queryForObject("SELECT COUNT(*) FROM students WHERE id = ?", Integer.class, studentId);
        if (studentCount == null || studentCount == 0) {
            jdbc.update("INSERT INTO students (id, name) VALUES (?, ?)", studentId, "학생");
        }
        Integer enrollmentCount = jdbc.queryForObject("""
            SELECT COUNT(*)
              FROM enrollments e
              JOIN assignments a ON a.course_id = e.course_id
             WHERE a.id = ? AND e.student_id = ?
            """, Integer.class, assignmentId, studentId);
        if (enrollmentCount == null || enrollmentCount == 0) {
            jdbc.update("""
                INSERT INTO enrollments (course_id, student_id)
                SELECT course_id, ? FROM assignments WHERE id = ?
                """, studentId, assignmentId);
        }
    }

    private Map<String, Object> readJson(Object raw) {
        if (raw == null) return new LinkedHashMap<>();
        try {
            String json = raw instanceof byte[] bytes ? new String(bytes, StandardCharsets.UTF_8) : String.valueOf(raw);
            JsonNode node = mapper.readTree(json);
            if (node.isTextual()) json = node.textValue();
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception error) {
            throw new IllegalStateException("저장된 루브릭 평가 JSON을 읽을 수 없습니다.", error);
        }
    }

    private List<Map<String, Object>> readJsonList(Object raw) {
        if (raw == null) return List.of();
        try {
            String json = raw instanceof byte[] bytes ? new String(bytes, StandardCharsets.UTF_8) : String.valueOf(raw);
            return mapper.readValue(json, new TypeReference<>() {});
        } catch (Exception error) {
            return List.of();
        }
    }

    private String writeJson(Object value) {
        if (value == null) return null;
        try { return mapper.writeValueAsString(value); }
        catch (Exception error) { throw new IllegalStateException("AI 출처를 JSON으로 저장할 수 없습니다.", error); }
    }

    private Timestamp timestamp(String value) {
        if (value == null || value.isBlank()) return Timestamp.from(Instant.now());
        try { return Timestamp.from(Instant.parse(value)); }
        catch (DateTimeParseException ignored) { return Timestamp.from(Instant.now()); }
    }

    private String instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? "" : value.toInstant().toString();
    }

    private Integer nullableInteger(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    private Integer nullableNumber(Object value) { return value instanceof Number number ? number.intValue() : null; }
    private String nullIfBlank(String value) { return value == null || value.isBlank() ? null : value; }
    private String empty(String value) { return value == null ? "" : value; }
    private String text(Map<String, Object> value, String key, String fallback) {
        Object raw = value.get(key);
        return raw == null ? fallback : String.valueOf(raw);
    }

    private Map<String, Object> mapOf(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i + 1 < values.length; i += 2) result.put(String.valueOf(values[i]), values[i + 1]);
        return result;
    }
}
