package com.sber.isu.sprints_planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.CollectionTable;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "participants")
public class ParticipantEntity {

    private static final String DEFAULT_TEAM_KEY = "customlab";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @UuidGenerator
    private UUID id;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false, precision = 4, scale = 2)
    private BigDecimal rate;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "participant_user_streams", joinColumns = @JoinColumn(name = "participant_id"))
    @Column(name = "user_stream", nullable = false)
    private Set<String> userStreams = new LinkedHashSet<>();

    @Column(name = "team_key", nullable = false)
    private String teamKey;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public BigDecimal getRate() {
        return rate;
    }

    public void setRate(BigDecimal rate) {
        this.rate = rate;
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

    public Set<String> getUserStreams() {
        return userStreams;
    }

    public void setUserStreams(Set<String> userStreams) {
        this.userStreams = userStreams;
    }

    @PrePersist
    public void onCreate() {
        if (teamKey == null) {
            teamKey = DEFAULT_TEAM_KEY;
        }
    }
}
