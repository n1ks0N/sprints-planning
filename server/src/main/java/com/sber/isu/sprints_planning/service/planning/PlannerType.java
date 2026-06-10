package com.sber.isu.sprints_planning.service.planning;

public enum PlannerType {
    ALGORITHM,
    AI;

    public static PlannerType from(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            throw new IllegalArgumentException("Planner type is required");
        }
        return PlannerType.valueOf(rawValue.trim().toUpperCase());
    }
}
