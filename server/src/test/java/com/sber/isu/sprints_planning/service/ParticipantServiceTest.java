package com.sber.isu.sprints_planning.service;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.dto.request.ParticipantUpdateRequest;
import com.sber.isu.sprints_planning.repository.ParticipantRepository;
import com.sber.isu.sprints_planning.repository.ParticipantRoleValueRepository;
import com.sber.isu.sprints_planning.repository.ParticipantStreamValueRepository;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ParticipantServiceTest {

    @Mock
    private ParticipantRepository participantRepository;
    @Mock
    private ParticipantRoleValueRepository participantRoleValueRepository;
    @Mock
    private ParticipantStreamValueRepository participantStreamValueRepository;

    private ParticipantService participantService;

    @BeforeEach
    void setUp() {
        participantService = new ParticipantService(
            participantRepository,
            participantRoleValueRepository,
            participantStreamValueRepository
        );
    }

    @Test
    void updateCleansUnusedReferenceValues() {
        ParticipantEntity entity = new ParticipantEntity();
        entity.setId(UUID.fromString("11111111-1111-1111-1111-111111111111"));
        entity.setFullName("User");
        entity.setRole("OLD_ROLE");
        entity.setRate(new BigDecimal("1.0"));
        entity.setUserStreams(Set.of("Legacy"));
        entity.setTeamKey("team-a");

        UUID unusedRoleId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        UUID unusedStreamId = UUID.fromString("33333333-3333-3333-3333-333333333333");

        when(participantRepository.findByIdAndTeamKey(entity.getId(), "team-a")).thenReturn(Optional.of(entity));
        when(participantRoleValueRepository.findByNameAndTeamKey("NEW_ROLE", "team-a")).thenReturn(Optional.empty());
        when(participantStreamValueRepository.findByNameAndTeamKey("New Stream", "team-a")).thenReturn(Optional.empty());
        when(participantRoleValueRepository.findUnusedIdsByTeamKey("team-a")).thenReturn(List.of(unusedRoleId));
        when(participantStreamValueRepository.findUnusedIdsByTeamKey("team-a")).thenReturn(List.of(unusedStreamId));

        participantService.update("team-a", new ParticipantUpdateRequest(
            entity.getId().toString(),
            "Updated User",
            "NEW_ROLE",
            1.0,
            List.of("New Stream"),
            "jira.user"
        ));

        verify(participantRoleValueRepository).deleteAllByIdInBatch(List.of(unusedRoleId));
        verify(participantStreamValueRepository).deleteAllByIdInBatch(List.of(unusedStreamId));
    }
}
