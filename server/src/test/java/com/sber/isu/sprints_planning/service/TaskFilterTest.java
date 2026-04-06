package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TaskFilterTest {

    @Test
    void fromParsesFlagsIdsAndStatuses() {
        String quarterId = "11111111-1111-1111-1111-111111111111";
        String participantId = "22222222-2222-2222-2222-222222222222";
        String releaseId = "33333333-3333-3333-3333-333333333333";

        TaskFilter filter = TaskFilter.from(
            quarterId + ",invalid",
            "1,2,oops",
            "InProgress,BACKLOG",
            releaseId,
            "Stream A,Stream B",
            "true",
            "Customer A,Customer B",
            "true",
            participantId + ",bad-id",
            "BA,DEV",
            "Core,Payments",
            "  Search Text  ",
            "true",
            null
        );

        assertThat(filter.quarterIds()).containsExactly(UUID.fromString(quarterId));
        assertThat(filter.priorities()).containsExactly((short) 1, (short) 2);
        assertThat(filter.statuses()).isEqualTo(Set.of("inprogress", "backlog"));
        assertThat(filter.releaseDateId()).isEqualTo(UUID.fromString(releaseId));
        assertThat(filter.streams()).containsExactly("Stream A", "Stream B");
        assertThat(filter.withoutStream()).isTrue();
        assertThat(filter.customers()).containsExactly("Customer A", "Customer B");
        assertThat(filter.withoutCustomer()).isTrue();
        assertThat(filter.participantIds()).containsExactly(UUID.fromString(participantId));
        assertThat(filter.roles()).containsExactly("ba", "dev");
        assertThat(filter.userStreams()).containsExactly("core", "payments");
        assertThat(filter.searchQuery()).isEqualTo("search text");
        assertThat(filter.withoutQuarter()).isTrue();
    }

    @Test
    void emptyProducesSafeDefaults() {
        TaskFilter filter = TaskFilter.empty();

        assertThat(filter.quarterIds()).isEmpty();
        assertThat(filter.priorities()).isEmpty();
        assertThat(filter.statuses()).isEmpty();
        assertThat(filter.streams()).isEmpty();
        assertThat(filter.customers()).isEmpty();
        assertThat(filter.participantIds()).isEmpty();
        assertThat(filter.roles()).isEmpty();
        assertThat(filter.userStreams()).isEmpty();
        assertThat(filter.searchQuery()).isNull();
        assertThat(filter.withoutQuarter()).isFalse();
        assertThat(filter.withoutStream()).isFalse();
        assertThat(filter.withoutCustomer()).isFalse();
    }
}
