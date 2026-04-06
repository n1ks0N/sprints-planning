package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.config.CapacityProperties;
import com.sber.isu.sprints_planning.dto.CapacityRowDto;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskAllocationRepository;
import com.sber.isu.sprints_planning.repository.WorkloadAggregation;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CapacityServiceTest {

    @Mock
    private ParticipantRepository participantRepository;

    @Mock
    private SprintRepository sprintRepository;

    @Mock
    private TaskAllocationRepository taskAllocationRepository;

    private CapacityService capacityService;

    @BeforeEach
    void setUp() {
        capacityService = new CapacityService(
            participantRepository,
            sprintRepository,
            taskAllocationRepository,
            new CapacityProperties(1.0, 0.8)
        );
    }

    @Test
    void calculateUsesParticipantRateAndAggregatedWorkload() {
        ParticipantEntity analyst = participant("11111111-1111-1111-1111-111111111111", "Analyst", "BA", 0.5, "Core");
        SprintEntity sprint = sprint("22222222-2222-2222-2222-222222222222", 10);

        when(participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc("team-a")).thenReturn(List.of(analyst));
        when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of(sprint));
        when(taskAllocationRepository.aggregateWorkloadByParticipantAndSprint("team-a", List.of(sprint.getId())))
            .thenReturn(List.of(new Aggregation(analyst.getId(), sprint.getId(), new BigDecimal("3.0"))));

        List<CapacityRowDto> result = capacityService.calculate("team-a", List.of(), List.of(), List.of(), List.of());

        assertThat(result).hasSize(1);
        CapacityRowDto row = result.get(0);
        assertThat(row.participant().fullName()).isEqualTo("Analyst");
        assertThat(row.participant().rate()).isEqualTo(0.5);
        assertThat(row.totalQuarterAvailable()).isEqualTo(5.0);
        assertThat(row.totalQuarterWorkload()).isEqualTo(3.0);
        assertThat(row.cells()).hasSize(1);
        assertThat(row.cells().get(0).availableDays()).isEqualTo(5.0);
        assertThat(row.cells().get(0).workloadDays()).isEqualTo(3.0);
    }

    @Test
    void calculateFiltersParticipantsByRoleAndUserStream() {
        ParticipantEntity analyst = participant("11111111-1111-1111-1111-111111111111", "Analyst", "BA", 1.0, "Core");
        ParticipantEntity developer = participant("33333333-3333-3333-3333-333333333333", "Developer", "DEV", 1.0, "Payments");
        SprintEntity sprint = sprint("22222222-2222-2222-2222-222222222222", 10);

        when(participantRepository.findAllByTeamKeyOrderByDisplayOrderAsc("team-a")).thenReturn(List.of(analyst, developer));
        when(sprintRepository.findByTeamKeyOrderByQuarterAndOrder("team-a")).thenReturn(List.of(sprint));
        when(taskAllocationRepository.aggregateWorkloadByParticipantAndSprint("team-a", List.of(sprint.getId())))
            .thenReturn(List.of());

        List<CapacityRowDto> result = capacityService.calculate(
            "team-a",
            List.of(),
            List.of(),
            List.of("DEV"),
            List.of("Payments")
        );

        assertThat(result).hasSize(1);
        assertThat(result.get(0).participant().fullName()).isEqualTo("Developer");
    }

    private ParticipantEntity participant(String id, String fullName, String role, double rate, String userStream) {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setId(UUID.fromString(id));
        entity.setFullName(fullName);
        entity.setRole(role);
        entity.setRate(BigDecimal.valueOf(rate));
        entity.setUserStreams(new LinkedHashSet<>(List.of(userStream)));
        return entity;
    }

    private SprintEntity sprint(String id, int workingDays) {
        QuarterEntity quarter = new QuarterEntity();
        quarter.setId(UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
        quarter.setName("Q1");
        quarter.setStartDate(LocalDate.of(2026, 1, 1));
        quarter.setEndDate(LocalDate.of(2026, 3, 31));

        SprintEntity sprint = new SprintEntity();
        sprint.setId(UUID.fromString(id));
        sprint.setQuarter(quarter);
        sprint.setName("Sprint 1");
        sprint.setStartDate(LocalDate.of(2026, 1, 12));
        sprint.setEndDate(LocalDate.of(2026, 1, 23));
        sprint.setWorkingDays(workingDays);
        sprint.setOrder(1);
        sprint.setTeamKey("team-a");
        return sprint;
    }

    private record Aggregation(UUID participantId, UUID sprintId, BigDecimal totalDays) implements WorkloadAggregation {
        @Override
        public UUID getParticipantId() {
            return participantId;
        }

        @Override
        public UUID getSprintId() {
            return sprintId;
        }

        @Override
        public BigDecimal getTotalDays() {
            return totalDays;
        }
    }
}
