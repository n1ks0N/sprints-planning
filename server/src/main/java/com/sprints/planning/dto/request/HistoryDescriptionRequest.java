package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class HistoryDescriptionRequest {

    @NotNull
    private UUID id;

    private String description;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
