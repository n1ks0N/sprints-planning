package com.sber.isu.sprints_planning.model;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.Table;

@Entity
@Table(name = "run_vacation")
public class RunVacationEntity {

    @EmbeddedId
    private RunVacationId id;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("participantId")
    @JoinColumn(name = "participant_id")
    private ParticipantEntity participant;

    @ManyToOne(fetch = FetchType.LAZY)
    @MapsId("sprintId")
    @JoinColumn(name = "sprint_id")
    private SprintEntity sprint;

    @Column(name = "run_days", nullable = false)
    private int runDays;

    @Column(name = "vacation_norm_days", nullable = false)
    private int vacationNormDays;

    public RunVacationId getId() {
        return id;
    }

    public void setId(RunVacationId id) {
        this.id = id;
    }

    public ParticipantEntity getParticipant() {
        return participant;
    }

    public void setParticipant(ParticipantEntity participant) {
        this.participant = participant;
    }

    public SprintEntity getSprint() {
        return sprint;
    }

    public void setSprint(SprintEntity sprint) {
        this.sprint = sprint;
    }

    public int getRunDays() {
        return runDays;
    }

    public void setRunDays(int runDays) {
        this.runDays = runDays;
    }

    public int getVacationNormDays() {
        return vacationNormDays;
    }

    public void setVacationNormDays(int vacationNormDays) {
        this.vacationNormDays = vacationNormDays;
    }
}
