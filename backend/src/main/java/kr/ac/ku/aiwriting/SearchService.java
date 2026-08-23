package kr.ac.ku.aiwriting;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** Small search adapter. The model stays OSS; search is an explicit backend tool. */
@Component
public class SearchService {
    private static final Logger log = LoggerFactory.getLogger(SearchService.class);
    private static final String DEFAULT_ENDPOINT = "http://localhost:8080/search";
    private static final int RESULT_LIMIT = 5;

    private final ObjectMapper mapper;
    private final String endpoint;
    private final HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build();

    public SearchService(
        ObjectMapper mapper,
        @Value("${ku.search.endpoint:}") String endpoint,
        @Value("${ku.groq.dotenv-enabled:true}") boolean dotenvEnabled
    ) {
        this.mapper = mapper;
        this.endpoint = AiService.resolveSetting(endpoint, dotenvEnabled, "SEARCH_API_URL", DEFAULT_ENDPOINT);
    }

    public boolean enabled() {
        return !endpoint.isBlank();
    }

    public List<Result> search(String query) {
        return searchDetailed(query).results();
    }

    public SearchOutcome searchDetailed(String query) {
        if (!enabled()) return new SearchOutcome(Status.UNAVAILABLE, List.of());
        if (query == null || query.isBlank()) return new SearchOutcome(Status.NO_RESULTS, List.of());
        try {
            String separator = endpoint.contains("?") ? "&" : "?";
            URI uri = URI.create(endpoint + separator + "q="
                + URLEncoder.encode(query.trim(), StandardCharsets.UTF_8)
                + "&format=json&language=ko-KR&pageno=1");
            HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "application/json")
                .GET()
                .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("Search request failed: status={}", response.statusCode());
                return new SearchOutcome(Status.UNAVAILABLE, List.of());
            }
            List<Result> results = parseResults(mapper.readTree(response.body()));
            return new SearchOutcome(results.isEmpty() ? Status.NO_RESULTS : Status.SUCCESS, results);
        } catch (Exception exception) {
            log.warn("Search request failed: error={}", exception.getClass().getSimpleName());
            return new SearchOutcome(Status.UNAVAILABLE, List.of());
        }
    }

    static List<Result> parseResults(JsonNode root) {
        List<Result> results = new ArrayList<>();
        for (JsonNode item : root.path("results")) {
            String title = item.path("title").asText("").trim();
            String url = item.path("url").asText("").trim();
            String snippet = item.path("content").asText("").trim();
            if (!title.isBlank() && (url.startsWith("https://") || url.startsWith("http://"))) {
                results.add(new Result(title, url, snippet));
            }
            if (results.size() >= RESULT_LIMIT) break;
        }
        return List.copyOf(results);
    }

    public record Result(String title, String url, String snippet) { }

    public record SearchOutcome(Status status, List<Result> results) { }

    public enum Status { SUCCESS, NO_RESULTS, UNAVAILABLE }
}
