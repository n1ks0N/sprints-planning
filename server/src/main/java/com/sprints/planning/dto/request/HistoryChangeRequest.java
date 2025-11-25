package com.sprints.planning.dto.request;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public class HistoryChangeRequest {

    private String user;

    @NotBlank
    private String action;

    @NotBlank
    private String createdAt;

    private Map<String, Object> undo;

    public String getUser() {
        return user;
    }

    public void setUser(String user) {
        this.user = user;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(String createdAt) {
        this.createdAt = createdAt;
    }

    public Map<String, Object> getUndo() {
        return undo;
    }

    public void setUndo(Map<String, Object> undo) {
        this.undo = undo;
    }
}
