package com.sber.isu.sprints_planning.service.planning;
import java.time.LocalDate;
import java.util.List;

public record PlanningDraftTask(
    String taskId,
    String title,
    short priority,
    int estimateDays,
    String assignmentMode,
    String role,
    String stream,
    LocalDate releasePromDate,
    LocalDate releaseDevEnd,
    LocalDate releaseIftStart,
    LocalDate releaseRegressStart,
    List<String> orderedParticipantIds,
    List<String> allowedSprintIds,
    int demandOrder
) {
    public PlanningDraftTask(
        String taskId,
        String title,
        short priority,
        int estimateDays,
        String assignmentMode,
        String role,
        String stream,
        LocalDate releasePromDate,
        LocalDate releaseDevEnd,
        LocalDate releaseIftStart,
        LocalDate releaseRegressStart,
        List<String> orderedParticipantIds,
        List<String> allowedSprintIds
    ) {
        this(
            taskId,
            title,
            priority,
            estimateDays,
            assignmentMode,
            role,
            stream,
            releasePromDate,
            releaseDevEnd,
            releaseIftStart,
            releaseRegressStart,
            orderedParticipantIds,
            allowedSprintIds,
            0
        );
    }
}
