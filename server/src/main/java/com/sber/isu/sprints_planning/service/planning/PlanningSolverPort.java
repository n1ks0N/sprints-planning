package com.sber.isu.sprints_planning.service.planning;

public interface PlanningSolverPort {
    PlannerType type();

    PlanningSolverResult solve(PlanningSolverInput input);
}
