package com.sber.isu.sprints_planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "jira_export_batches")
public class JiraExportBatchEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @UuidGenerator
    private UUID id;

    @Column(name = "team_key", nullable = false)
    private String teamKey;

    @Column(name = "session_id", nullable = false)
    private String sessionId;

    @Column(name = "user_name", nullable = false)
    private String userName;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "planning_sprint_id")
    private SprintEntity planningSprint;

    @Column(name = "jira_sprint_id", nullable = false)
    private Long jiraSprintId;

    @Column(name = "project_key", nullable = false)
    private String projectKey;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "labels_json", columnDefinition = "jsonb", nullable = false)
    private List<String> labelsJson = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "items_json", columnDefinition = "jsonb", nullable = false)
    private List<Map<String, Object>> itemsJson = new ArrayList<>();

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "total_items", nullable = false)
    private int totalItems;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    public void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getTeamKey() {
        return teamKey;
    }

    public void setTeamKey(String teamKey) {
        this.teamKey = teamKey;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getUserName() {
        return userName;
    }

    public void setUserName(String userName) {
        this.userName = userName;
    }

    public SprintEntity getPlanningSprint() {
        return planningSprint;
    }

    public void setPlanningSprint(SprintEntity planningSprint) {
        this.planningSprint = planningSprint;
    }

    public Long getJiraSprintId() {
        return jiraSprintId;
    }

    public void setJiraSprintId(Long jiraSprintId) {
        this.jiraSprintId = jiraSprintId;
    }

    public String getProjectKey() {
        return projectKey;
    }

    public void setProjectKey(String projectKey) {
        this.projectKey = projectKey;
    }

    public List<String> getLabelsJson() {
        return labelsJson;
    }

    public void setLabelsJson(List<String> labelsJson) {
        this.labelsJson = labelsJson;
    }

    public List<Map<String, Object>> getItemsJson() {
        return itemsJson;
    }

    public void setItemsJson(List<Map<String, Object>> itemsJson) {
        this.itemsJson = itemsJson;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getTotalItems() {
        return totalItems;
    }

    public void setTotalItems(int totalItems) {
        this.totalItems = totalItems;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
