package com.sber.isu.sprints_planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "releases")
public class ReleaseEntity {

    private static final String DEFAULT_TEAM_KEY = "customlab";

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @UuidGenerator
    private UUID id;

    private String name;

    @Column(name = "prom_date", nullable = false)
    private LocalDate promDate;

    @Column(name = "psi_date")
    private LocalDate psiDate;

    @Column(name = "ops_start")
    private LocalDate opsStart;

    @Column(name = "ops_end")
    private LocalDate opsEnd;

    @Column(name = "regress_start")
    private LocalDate regressStart;

    @Column(name = "regress_end")
    private LocalDate regressEnd;

    @Column(name = "ff_date")
    private LocalDate ffDate;

    @Column(name = "ff_inner_date")
    private LocalDate ffInnerDate;

    @Column(name = "ift_start")
    private LocalDate iftStart;

    @Column(name = "ift_end")
    private LocalDate iftEnd;

    @Column(name = "build_date")
    private LocalDate buildDate;

    @Column(name = "cr_date")
    private LocalDate crDate;

    @Column(name = "dev_start")
    private LocalDate devStart;

    @Column(name = "dev_end")
    private LocalDate devEnd;

    @Column(name = "st_date")
    private LocalDate stDate;

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

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public LocalDate getPromDate() {
        return promDate;
    }

    public void setPromDate(LocalDate promDate) {
        this.promDate = promDate;
    }

    public LocalDate getPsiDate() {
        return psiDate;
    }

    public void setPsiDate(LocalDate psiDate) {
        this.psiDate = psiDate;
    }

    public LocalDate getOpsStart() {
        return opsStart;
    }

    public void setOpsStart(LocalDate opsStart) {
        this.opsStart = opsStart;
    }

    public LocalDate getOpsEnd() {
        return opsEnd;
    }

    public void setOpsEnd(LocalDate opsEnd) {
        this.opsEnd = opsEnd;
    }

    public LocalDate getRegressStart() {
        return regressStart;
    }

    public void setRegressStart(LocalDate regressStart) {
        this.regressStart = regressStart;
    }

    public LocalDate getRegressEnd() {
        return regressEnd;
    }

    public void setRegressEnd(LocalDate regressEnd) {
        this.regressEnd = regressEnd;
    }

    public LocalDate getFfDate() {
        return ffDate;
    }

    public void setFfDate(LocalDate ffDate) {
        this.ffDate = ffDate;
    }

    public LocalDate getFfInnerDate() {
        return ffInnerDate;
    }

    public void setFfInnerDate(LocalDate ffInnerDate) {
        this.ffInnerDate = ffInnerDate;
    }

    public LocalDate getIftStart() {
        return iftStart;
    }

    public void setIftStart(LocalDate iftStart) {
        this.iftStart = iftStart;
    }

    public LocalDate getIftEnd() {
        return iftEnd;
    }

    public void setIftEnd(LocalDate iftEnd) {
        this.iftEnd = iftEnd;
    }

    public LocalDate getBuildDate() {
        return buildDate;
    }

    public void setBuildDate(LocalDate buildDate) {
        this.buildDate = buildDate;
    }

    public LocalDate getCrDate() {
        return crDate;
    }

    public void setCrDate(LocalDate crDate) {
        this.crDate = crDate;
    }

    public LocalDate getDevStart() {
        return devStart;
    }

    public void setDevStart(LocalDate devStart) {
        this.devStart = devStart;
    }

    public LocalDate getDevEnd() {
        return devEnd;
    }

    public void setDevEnd(LocalDate devEnd) {
        this.devEnd = devEnd;
    }

    public LocalDate getStDate() {
        return stDate;
    }

    public void setStDate(LocalDate stDate) {
        this.stDate = stDate;
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

    @PrePersist
    public void onCreate() {
        if (teamKey == null) {
            teamKey = DEFAULT_TEAM_KEY;
        }
    }
}
