package com.sber.isu.sprints_planning.mapper;

import com.sber.isu.sprints_planning.dto.ApiCallHistoryDto;
import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.dto.QuarterDto;
import com.sber.isu.sprints_planning.dto.ReleaseDto;
import com.sber.isu.sprints_planning.dto.SprintDto;
import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.TaskJiraIssueDto;
import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.QuarterEntity;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskCustomerEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskJiraIssueEntity;
import com.sber.isu.sprints_planning.model.TaskLoadEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.model.TaskStreamEntity;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Comparator;

public final class DtoMapper {

    private DtoMapper() {
    }

    public static QuarterDto toQuarterDto(QuarterEntity entity) {
        return new QuarterDto(
            entity.getId().toString(),
            entity.getYear(),
            entity.getNumber(),
            entity.getName(),
            toIso(entity.getStartDate()),
            toIso(entity.getEndDate())
        );
    }

    public static SprintDto toSprintDto(SprintEntity entity) {
        return new SprintDto(
            entity.getId().toString(),
            entity.getQuarter().getId().toString(),
            entity.getName(),
            toIso(entity.getStartDate()),
            toIso(entity.getEndDate()),
            entity.getWorkingDays(),
            entity.getOrder()
        );
    }

    public static ParticipantDto toParticipantDto(ParticipantEntity entity) {
        return new ParticipantDto(
            entity.getId().toString(),
            entity.getFullName(),
            entity.getRole(),
            entity.getRate() != null ? entity.getRate().doubleValue() : 0.0,
            entity.getUserStreams() == null
                ? java.util.List.of()
                : entity.getUserStreams().stream().toList(),
            entity.getJiraLogin()
        );
    }

    public static TaskDto toTaskDto(
        TaskEntity entity,
        String releaseSprintId,
        Map<String, TaskJiraIssueDto> jiraIssues
    ) {
        List<String> participantIds = new ArrayList<>();
        entity.getParticipants().stream()
            .sorted(Comparator.comparingInt(TaskParticipantEntity::getDisplayOrder))
            .forEach(participant -> participantIds.add(participant.getParticipant().getId().toString()));
        Map<String, java.math.BigDecimal> loads = new HashMap<>();
        for (TaskLoadEntity load : entity.getLoads()) {
            if (load.getDays() == null || load.getDays().signum() <= 0) {
                continue;
            }
            loads.put(load.getSprint().getId().toString(), load.getDays());
        }
        Map<String, Map<String, java.math.BigDecimal>> allocations = new HashMap<>();
        for (TaskAllocationEntity allocation : entity.getAllocations()) {
            if (allocation.getDays() == null || allocation.getDays().signum() <= 0) {
                continue;
            }
            String pid = allocation.getParticipant().getId().toString();
            allocations.computeIfAbsent(pid, k -> new HashMap<>())
                .put(allocation.getSprint().getId().toString(), allocation.getDays());
        }
        Map<String, String> notes = new HashMap<>();
        if (entity.getNotes() != null) {
            for (Map.Entry<UUID, String> entry : entity.getNotes().entrySet()) {
                notes.put(entry.getKey().toString(), entry.getValue());
            }
        }
        String releaseDateId = entity.getReleaseDate() != null
            ? entity.getReleaseDate().getId().toString()
            : null;
        String initialQuarterId = entity.getInitialQuarter() != null && entity.getInitialQuarter().getId() != null
            ? entity.getInitialQuarter().getId().toString()
            : null;

        // Extract customer names from many-to-many relationship
        List<String> customers = entity.getCustomers().stream()
            .map(TaskCustomerEntity::getName)
            .sorted()
            .toList();

        // Extract stream names from many-to-many relationship
        List<String> streams = entity.getStreams().stream()
            .map(TaskStreamEntity::getName)
            .sorted()
            .toList();

        return new TaskDto(
            entity.getId().toString(),
            entity.getTitle(),
            entity.getDescription(),
            entity.getDod(),
            entity.getPriority(),
            entity.getStatus(),
            customers,
            streams,
            participantIds,
            loads,
            allocations,
            notes,
            jiraIssues == null ? Map.of() : jiraIssues,
            releaseDateId,
            initialQuarterId,
            releaseSprintId,
            entity.getLeaderParticipant() != null ? entity.getLeaderParticipant().getId().toString() : null,
            entity.getDisplayOrder(),
            toIso(entity.getCreatedAt()),
            toIso(entity.getUpdatedAt())
        );
    }

    public static TaskJiraIssueDto toTaskJiraIssueDto(TaskJiraIssueEntity entity) {
        return new TaskJiraIssueDto(
            entity.getParticipant() != null && entity.getParticipant().getId() != null
                ? entity.getParticipant().getId().toString()
                : null,
            entity.getJiraIssueId(),
            entity.getJiraIssueKey(),
            entity.getJiraIssueUrl(),
            entity.getJiraProjectKey(),
            entity.getJiraSprintId(),
            entity.getStoryPoints(),
            entity.getCreatedAt() != null ? entity.getCreatedAt().toString() : null
        );
    }

    public static ReleaseDto toReleaseDto(ReleaseEntity entity) {
        return new ReleaseDto(
            entity.getId().toString(),
            entity.getName(),
            toIso(entity.getPromDate()),
            toIso(entity.getPsiDate()),
            toIso(entity.getOpsStart()),
            toIso(entity.getOpsEnd()),
            toIso(entity.getRegressStart()),
            toIso(entity.getRegressEnd()),
            toIso(entity.getFfDate()),
            toIso(entity.getFfInnerDate()),
            toIso(entity.getIftStart()),
            toIso(entity.getIftEnd()),
            toIso(entity.getBuildDate()),
            toIso(entity.getCrDate()),
            toIso(entity.getDevStart()),
            toIso(entity.getDevEnd()),
            toIso(entity.getStDate()),
            toIso(entity.getCreatedAt()),
            toIso(entity.getUpdatedAt())
        );
    }

    public static ApiCallHistoryDto toApiCallHistoryDto(ApiCallHistoryEntity entity) {
        return new ApiCallHistoryDto(
            entity.getId(),
            entity.getSessionId(),
            entity.getUserName(),
            entity.getAction(),
            entity.getPath(),
            entity.getHttpMethod(),
            entity.getStatusCode(),
            entity.getCreatedAt()
        );
    }

    private static String toIso(LocalDate date) {
        return date != null ? date.toString() : null;
    }
}
