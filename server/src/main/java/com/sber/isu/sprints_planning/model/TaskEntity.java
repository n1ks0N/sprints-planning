package com.sber.isu.sprints_planning.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "tasks")
public class TaskEntity {

    private static final String DEFAULT_TEAM_KEY = "customlab";
    private static final String DEFAULT_STATUS = "inprogress";

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

    @Column(nullable = false)
    private String status;

    @Column(nullable = false)
    private String customer;

    @Column(nullable = false)
    private String stream;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "release_date_id")
    private ReleaseEntity releaseDate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<UUID, String> notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "leader_participant_id")
    private ParticipantEntity leaderParticipant;

    @Column(name = "created_at", nullable = false)
    private LocalDate createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDate updatedAt;

    @Column(name = "team_key", nullable = false)
    private String teamKey;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @OneToMany(mappedBy = "task", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<TaskParticipantEntity> participants = new HashSet<>();

    @OneToMany(mappedBy = "task", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<TaskLoadEntity> loads = new HashSet<>();

    @OneToMany(mappedBy = "task", cascade = CascadeType.ALL, orphanRemoval = true)
    private Set<TaskAllocationEntity> allocations = new HashSet<>();

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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getCustomer() {
        return customer;
    }

    public void setCustomer(String customer) {
        this.customer = customer;
    }

    public String getStream() {
        return stream;
    }

    public void setStream(String stream) {
        this.stream = stream;
    }

    public ReleaseEntity getReleaseDate() {
        return releaseDate;
    }

    public void setReleaseDate(ReleaseEntity releaseDate) {
        this.releaseDate = releaseDate;
    }

    public Map<UUID, String> getNotes() {
        return notes;
    }

    public void setNotes(Map<UUID, String> notes) {
        this.notes = notes;
    }

    public ParticipantEntity getLeaderParticipant() {
        return leaderParticipant;
    }

    public void setLeaderParticipant(ParticipantEntity leaderParticipant) {
        this.leaderParticipant = leaderParticipant;
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

    public Set<TaskParticipantEntity> getParticipants() {
        return participants;
    }

    public void setParticipants(Set<TaskParticipantEntity> participants) {
        this.participants = participants;
    }

    public Set<TaskLoadEntity> getLoads() {
        return loads;
    }

    public void setLoads(Set<TaskLoadEntity> loads) {
        this.loads = loads;
    }

    public Set<TaskAllocationEntity> getAllocations() {
        return allocations;
    }

    public void setAllocations(Set<TaskAllocationEntity> allocations) {
        this.allocations = allocations;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public String getTeamKey() {
        return teamKey;
    }

    public void setTeamKey(String teamKey) {
        this.teamKey = teamKey;
    }

    @PrePersist
    public void onCreate() {
        if (teamKey == null) {
            teamKey = DEFAULT_TEAM_KEY;
        }
        if (status == null) {
            status = DEFAULT_STATUS;
        }
    }
}
