package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public class HistoryLockRequest {

    @NotNull
    private UUID id;

    private boolean locked;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public boolean isLocked() {
        return locked;
    }

    public void setLocked(boolean locked) {
        this.locked = locked;
    }
}
