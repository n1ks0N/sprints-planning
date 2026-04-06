package com.sber.isu.sprints_planning.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.sber.isu.sprints_planning.dto.ReleaseDto;
import com.sber.isu.sprints_planning.dto.request.ReleaseCreateRequest;
import com.sber.isu.sprints_planning.dto.request.ReleaseUpdateRequest;
import com.sber.isu.sprints_planning.model.ReleaseEntity;
import com.sber.isu.sprints_planning.repository.ReleaseRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class ReleaseServiceTest {

    @Mock
    private ReleaseRepository releaseRepository;

    private ReleaseService releaseService;

    @BeforeEach
    void setUp() {
        releaseService = new ReleaseService(releaseRepository);
    }

    @Test
    void createRecalculatesReleaseCycleFromPromDate() {
        LocalDate promDate = LocalDate.of(2026, 4, 20);
        when(releaseRepository.existsByTeamKeyAndPromDate("team-a", promDate)).thenReturn(false);
        when(releaseRepository.save(any(ReleaseEntity.class))).thenAnswer(invocation -> {
            ReleaseEntity entity = invocation.getArgument(0);
            entity.setId(UUID.fromString("11111111-1111-1111-1111-111111111111"));
            return entity;
        });

        ReleaseDto result = releaseService.create("team-a", new ReleaseCreateRequest("Release A", promDate));

        assertThat(result.promDate()).isEqualTo("2026-04-20");
        assertThat(result.psiDate()).isEqualTo(addBusinessDays(promDate, -1).toString());
        assertThat(result.opsStart()).isEqualTo(addBusinessDays(LocalDate.parse(result.psiDate()), -3).toString());
        assertThat(result.opsEnd()).isEqualTo(addBusinessDays(LocalDate.parse(result.opsStart()), 2).toString());
        assertThat(result.regressStart()).isEqualTo(addBusinessDays(LocalDate.parse(result.opsStart()), -4).toString());
        assertThat(result.regressEnd()).isEqualTo(addBusinessDays(LocalDate.parse(result.regressStart()), 3).toString());
        assertThat(result.devStart()).isEqualTo(addBusinessDays(LocalDate.parse(result.crDate()), -7).toString());
        assertThat(result.devEnd()).isEqualTo(addBusinessDays(LocalDate.parse(result.devStart()), 6).toString());
        assertThat(result.stDate()).isEqualTo(addBusinessDays(LocalDate.parse(result.devStart()), -1).toString());
    }

    @Test
    void updateRecalcWithoutAnchorFailsFast() {
        UUID releaseId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        ReleaseEntity entity = new ReleaseEntity();
        entity.setId(releaseId);
        when(releaseRepository.findByIdAndTeamKey(releaseId, "team-a")).thenReturn(Optional.of(entity));

        ReleaseUpdateRequest request = new ReleaseUpdateRequest(
            releaseId.toString(),
            null,
            null,
            "recalc",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null
        );

        assertThatThrownBy(() -> releaseService.update("team-a", request))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> {
                ResponseStatusException ex = (ResponseStatusException) error;
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            });
    }

    @Test
    void createRejectsDuplicatePromDate() {
        LocalDate promDate = LocalDate.of(2026, 5, 5);
        when(releaseRepository.existsByTeamKeyAndPromDate("team-a", promDate)).thenReturn(true);

        assertThatThrownBy(() -> releaseService.create("team-a", new ReleaseCreateRequest("Duplicate", promDate)))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(error -> {
                ResponseStatusException ex = (ResponseStatusException) error;
                assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
            });
    }

    private LocalDate addBusinessDays(LocalDate date, int delta) {
        if (delta == 0) {
            return date;
        }
        LocalDate current = date;
        int step = delta > 0 ? 1 : -1;
        int remaining = Math.abs(delta);
        while (remaining > 0) {
            current = current.plusDays(step);
            DayOfWeek day = current.getDayOfWeek();
            if (day != DayOfWeek.SATURDAY && day != DayOfWeek.SUNDAY) {
                remaining--;
            }
        }
        return current;
    }
}
