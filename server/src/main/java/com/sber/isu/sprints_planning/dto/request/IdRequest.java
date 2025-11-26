package com.sber.isu.sprints_planning.dto.request;

import jakarta.validation.constraints.NotNull;

public record IdRequest(@NotNull String id) {
}
