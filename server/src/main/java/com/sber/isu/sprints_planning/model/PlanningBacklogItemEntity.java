package com.sber.isu.sprints_planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "planning_backlog_items")
public class PlanningBacklogItemEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @UuidGenerator
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false)
    private String dod;

    @Column(nullable = false)
    private short priority;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "customers", columnDefinition = "jsonb")
    private List<String> customers = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "streams", columnDefinition = "jsonb")
    private List<String> streams = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "planning_demands", columnDefinition = "jsonb")
    private List<TaskPlanningDemandValue> planningDemands = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "planning_quarter_ids", columnDefinition = "jsonb")
    private List<UUID> planningQuarterIds = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "planning_sprint_ids", columnDefinition = "jsonb")
    private List<UUID> planningSprintIds = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "release_date_id")
    private ReleaseEntity releaseDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "initial_quarter_id")
    private QuarterEntity initialQuarter;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "created_at", nullable = false)
    private LocalDate createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDate updatedAt;

    @Column(name = "team_key", nullable = false)
    private String teamKey;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getDod() {
        return dod;
    }

    public void setDod(String dod) {
        this.dod = dod;
    }

    public short getPriority() {
        return priority;
    }

    public void setPriority(short priority) {
        this.priority = priority;
    }

    public List<String> getCustomers() {
        return customers;
    }

    public void setCustomers(List<String> customers) {
        this.customers = customers;
    }

    public List<String> getStreams() {
        return streams;
    }

    public void setStreams(List<String> streams) {
        this.streams = streams;
    }

    public List<TaskPlanningDemandValue> getPlanningDemands() {
        return planningDemands;
    }

    public void setPlanningDemands(List<TaskPlanningDemandValue> planningDemands) {
        this.planningDemands = planningDemands;
    }

    public List<UUID> getPlanningQuarterIds() {
        return planningQuarterIds;
    }

    public void setPlanningQuarterIds(List<UUID> planningQuarterIds) {
        this.planningQuarterIds = planningQuarterIds;
    }

    public List<UUID> getPlanningSprintIds() {
        return planningSprintIds;
    }

    public void setPlanningSprintIds(List<UUID> planningSprintIds) {
        this.planningSprintIds = planningSprintIds;
    }

    public ReleaseEntity getReleaseDate() {
        return releaseDate;
    }

    public void setReleaseDate(ReleaseEntity releaseDate) {
        this.releaseDate = releaseDate;
    }

    public QuarterEntity getInitialQuarter() {
        return initialQuarter;
    }

    public void setInitialQuarter(QuarterEntity initialQuarter) {
        this.initialQuarter = initialQuarter;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public LocalDate getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDate createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDate getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDate updatedAt) {
        this.updatedAt = updatedAt;
    }

    public String getTeamKey() {
        return teamKey;
    }

    public void setTeamKey(String teamKey) {
        this.teamKey = teamKey;
    }
}
