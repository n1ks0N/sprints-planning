package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class HistoryRollbackRequest {

    @NotNull
    private UUID id;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }
}
