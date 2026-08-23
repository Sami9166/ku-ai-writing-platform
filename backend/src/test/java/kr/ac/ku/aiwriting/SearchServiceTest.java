package kr.ac.ku.aiwriting;

import com.sun.net.httpserver.HttpServer;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SearchServiceTest {
    @Test
    void parsesAndLimitsSearxngResults() throws Exception {
        String json = """
            {"results":[
              {"title":"One","url":"https://one.example","content":"First"},
              {"title":"Two","url":"https://two.example","content":"Second"},
              {"title":"Bad","url":"not-a-url","content":"Ignored"}
            ]}
            """;

        List<SearchService.Result> results = SearchService.parseResults(new ObjectMapper().readTree(json));

        assertThat(results).extracting(SearchService.Result::title).containsExactly("One", "Two");
    }

    @Test
    void distinguishesNoResultsFromUnavailableSearch() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/search", exchange -> {
            byte[] body = "{\"results\":[]}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.start();
        try {
            SearchService service = new SearchService(
                new ObjectMapper(),
                "http://127.0.0.1:" + server.getAddress().getPort() + "/search",
                false
            );

            assertThat(service.searchDetailed("고려대학교 AI 교육").status())
                .isEqualTo(SearchService.Status.NO_RESULTS);
        } finally {
            server.stop(0);
        }

        SearchService unavailable = new SearchService(
            new ObjectMapper(),
            "http://127.0.0.1:1/search",
            false
        );
        assertThat(unavailable.searchDetailed("고려대학교 AI 교육").status())
            .isEqualTo(SearchService.Status.UNAVAILABLE);
    }
}
