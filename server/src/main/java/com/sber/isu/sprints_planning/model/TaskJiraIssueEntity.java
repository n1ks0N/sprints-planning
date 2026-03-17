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
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "task_jira_issues")
public class TaskJiraIssueEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @UuidGenerator
    private UUID id;

    @Column(name = "team_key", nullable = false)
    private String teamKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "task_id", nullable = false)
    private TaskEntity task;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "participant_id", nullable = false)
    private ParticipantEntity participant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "planning_sprint_id")
    private SprintEntity planningSprint;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "export_batch_id")
    private JiraExportBatchEntity exportBatch;

    @Column(name = "jira_issue_id", nullable = false)
    private String jiraIssueId;

    @Column(name = "jira_issue_key", nullable = false)
    private String jiraIssueKey;

    @Column(name = "jira_issue_url", nullable = false)
    private String jiraIssueUrl;

    @Column(name = "jira_project_key", nullable = false)
    private String jiraProjectKey;

    @Column(name = "jira_sprint_id")
    private Long jiraSprintId;

    @Column(name = "story_points", precision = 10, scale = 2)
    private BigDecimal storyPoints;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "last_error")
    private String lastError;

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
        if (updatedAt == null) {
            updatedAt = createdAt;
        }
        if (status == null || status.isBlank()) {
            status = "CREATED";
        }
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

    public TaskEntity getTask() {
        return task;
    }

    public void setTask(TaskEntity task) {
        this.task = task;
    }

    public ParticipantEntity getParticipant() {
        return participant;
    }

    public void setParticipant(ParticipantEntity participant) {
        this.participant = participant;
    }

    public SprintEntity getPlanningSprint() {
        return planningSprint;
    }

    public void setPlanningSprint(SprintEntity planningSprint) {
        this.planningSprint = planningSprint;
    }

    public JiraExportBatchEntity getExportBatch() {
        return exportBatch;
    }

    public void setExportBatch(JiraExportBatchEntity exportBatch) {
        this.exportBatch = exportBatch;
    }

    public String getJiraIssueId() {
        return jiraIssueId;
    }

    public void setJiraIssueId(String jiraIssueId) {
        this.jiraIssueId = jiraIssueId;
    }

    public String getJiraIssueKey() {
        return jiraIssueKey;
    }

    public void setJiraIssueKey(String jiraIssueKey) {
        this.jiraIssueKey = jiraIssueKey;
    }

    public String getJiraIssueUrl() {
        return jiraIssueUrl;
    }

    public void setJiraIssueUrl(String jiraIssueUrl) {
        this.jiraIssueUrl = jiraIssueUrl;
    }

    public String getJiraProjectKey() {
        return jiraProjectKey;
    }

    public void setJiraProjectKey(String jiraProjectKey) {
        this.jiraProjectKey = jiraProjectKey;
    }

    public Long getJiraSprintId() {
        return jiraSprintId;
    }

    public void setJiraSprintId(Long jiraSprintId) {
        this.jiraSprintId = jiraSprintId;
    }

    public BigDecimal getStoryPoints() {
        return storyPoints;
    }

    public void setStoryPoints(BigDecimal storyPoints) {
        this.storyPoints = storyPoints;
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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError;
    }
}
