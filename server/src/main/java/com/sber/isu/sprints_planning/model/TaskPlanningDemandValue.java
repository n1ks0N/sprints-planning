package com.sber.isu.sprints_planning.model;

import java.math.BigDecimal;
import java.util.UUID;

public class TaskPlanningDemandValue {

    private String kind;
    private String role;
    private UUID participantId;
    private String stream;
    private BigDecimal days;

    public TaskPlanningDemandValue() {
    }

    public TaskPlanningDemandValue(String kind, String role, UUID participantId, String stream, BigDecimal days) {
        this.kind = kind;
        this.role = role;
        this.participantId = participantId;
        this.stream = stream;
        this.days = days;
    }

    public String getKind() {
        return kind;
    }

    public void setKind(String kind) {
        this.kind = kind;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public UUID getParticipantId() {
        return participantId;
    }

    public void setParticipantId(UUID participantId) {
        this.participantId = participantId;
    }

    public String getStream() {
        return stream;
    }

    public void setStream(String stream) {
        this.stream = stream;
    }

    public BigDecimal getDays() {
        return days;
    }

    public void setDays(BigDecimal days) {
        this.days = days;
    }
}
