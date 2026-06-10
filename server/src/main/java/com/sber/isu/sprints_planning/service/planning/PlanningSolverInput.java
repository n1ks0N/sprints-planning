package com.sber.isu.sprints_planning.service.planning;

import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record PlanningSolverInput(
    PlannerType plannerType,
    String teamKey,
    List<PlanningDraftTask> tasks,
    List<ParticipantEntity> participants,
    List<SprintEntity> sprints,
    Map<String, Map<String, BigDecimal>> committedLoadByParticipantAndSprint,
    double normFactor
) {
}
