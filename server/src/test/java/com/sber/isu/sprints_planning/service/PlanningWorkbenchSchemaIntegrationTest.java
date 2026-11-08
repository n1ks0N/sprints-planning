package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;

/** Runs against an isolated migrated schema; the connection search_path must exclude planning_review. */
@EnabledIfEnvironmentVariable(named = "PLANNING_SCHEMA_TEST_URL", matches = ".+")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
    "spring.liquibase.enabled=false",
    "spring.jpa.hibernate.ddl-auto=validate",
    "spring.jpa.properties.hibernate.default_schema=planning_review"
})
@Transactional
class PlanningWorkbenchSchemaIntegrationTest {
    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getenv("PLANNING_SCHEMA_TEST_URL"));
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired PlanningWorkbenchService planning;
    @Autowired ReleaseService releases;

    @Test
    void listingFiltersSortingAndManualReleaseUseTheMappedSchema() {
        // The missing search_path entry is intentional: JPQL uses Hibernate's mapping,
        // while unqualified native SQL would fail with relation-not-found or read another schema.
        assertThat(jdbc.queryForObject("select current_schemas(false)::text", String.class))
            .doesNotContain("planning_review");
        String team = "schema-" + UUID.randomUUID();
        UUID quarter = UUID.randomUUID();
        UUID item = UUID.randomUUID();
        jdbc.update("insert into planning_review.teams(key, name) values (?, ?)", team, "Schema regression");
        jdbc.update("""
            insert into planning_review.quarters(id, team_key, year, number, name, start_date, end_date)
            values (?, ?, 2032, 1, 'Q1 2032', date '2032-01-01', date '2032-03-31')
            """, quarter, team);

        assertThat(planning.getBacklogCandidatesPage(team, "manual", "asc", 0, 20,
            null, null, null, null, null, null, false, false).getTotalElements()).isZero();
        var release = releases.resolveDate(team, "2032-02-15", null);
        assertThat(releases.resolveDate(team, "2032-02-15", null).getId()).isEqualTo(release.getId());
        jdbc.update("""
            insert into planning_review.planning_backlog_items
                (id, team_key, title, priority, streams, customers, initial_quarter_id, release_date_id)
            values (?, ?, 'Schema regression', 1, '["schema-stream"]'::jsonb,
                '["schema-customer"]'::jsonb, ?, ?)
            """, item, team, quarter, release.getId());

        for (String sort : List.of("manual", "priority", "load", "releaseDate")) {
            for (String direction : List.of("asc", "desc")) {
                var page = planning.getBacklogCandidatesPage(team, sort, direction, 0, 20,
                    List.of(quarter.toString()), "1,2", "date:2032-02-15", List.of("schema-stream"),
                    List.of("schema-customer"), "Schema", true, true);
                assertThat(page.getTotalElements()).as("%s %s", sort, direction).isEqualTo(1);
                assertThat(page.getContent()).singleElement().satisfies(dto -> {
                    assertThat(dto.id()).isEqualTo(item.toString());
                    assertThat(dto.releasePromDate()).isEqualTo(LocalDate.of(2032, 2, 15).toString());
                });
            }
        }
        var secondPage = planning.getBacklogCandidatesPage(team, "manual", "asc", 1, 1,
            null, null, null, null, null, null, false, false);
        assertThat(secondPage.getTotalElements()).isEqualTo(1);
        assertThat(secondPage.getContent()).isEmpty();
    }
}
