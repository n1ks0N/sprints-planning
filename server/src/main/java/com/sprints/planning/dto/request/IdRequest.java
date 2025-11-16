package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;

public record IdRequest(@NotNull String id) {
}
