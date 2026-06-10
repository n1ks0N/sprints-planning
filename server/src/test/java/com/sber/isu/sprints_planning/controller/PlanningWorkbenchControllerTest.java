package com.sber.isu.sprints_planning.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sber.isu.sprints_planning.dto.ParticipantDto;
import com.sber.isu.sprints_planning.dto.PlanningSessionParticipantLoadCellDto;
import com.sber.isu.sprints_planning.dto.PlanningSessionParticipantLoadRowDto;
import com.sber.isu.sprints_planning.dto.PlanningSessionSolveSummaryDto;
import com.sber.isu.sprints_planning.dto.PlanningWorkbenchItemDto;
import com.sber.isu.sprints_planning.dto.PlanningWorkbenchPreviewDto;
import com.sber.isu.sprints_planning.dto.TaskDto;
import com.sber.isu.sprints_planning.dto.TaskPlanningDemandDto;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchApplyRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchItemRequest;
import com.sber.isu.sprints_planning.dto.request.PlanningWorkbenchPreviewRequest;
import com.sber.isu.sprints_planning.service.PlanningWorkbenchService;
import com.sber.isu.sprints_planning.config.CapacityProperties;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean;

class PlanningWorkbenchControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final StubPlanningWorkbenchService service = new StubPlanningWorkbenchService();

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        LocalValidatorFactoryBean validator = new LocalValidatorFactoryBean();
        validator.afterPropertiesSet();
        mockMvc = MockMvcBuilders
            .standaloneSetup(new PlanningWorkbenchController(service))
            .setControllerAdvice(new ApiExceptionHandler())
            .setValidator(validator)
            .build();
    }

    @Test
    void getBacklogNormalizesTeamKey() throws Exception {
        service.backlog = List.of(item("item-1"));

        mockMvc.perform(get("/Team-A/planning-workbench/backlog"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value("item-1"));

        org.assertj.core.api.Assertions.assertThat(service.lastTeamKey).isEqualTo("team-a");
    }

    @Test
    void createItemNormalizesTeamKey() throws Exception {
        service.createdItem = item("item-1");

        mockMvc.perform(post("/TEAM-A/planning-workbench/items")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new PlanningWorkbenchItemRequest(
                    "Task",
                    "Desc",
                    "DoD",
                    (short) 1,
                    List.of("Customer"),
                    List.of("Core"),
                    List.of(new com.sber.isu.sprints_planning.dto.request.TaskPlanningDemandRequest(
                        "ROLE",
                        "DEV",
                        null,
                        "Core",
                        new BigDecimal("4")
                    )),
                    null,
                    null,
                    List.of(),
                    List.of(),
                    null
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("item-1"));

        org.assertj.core.api.Assertions.assertThat(service.lastTeamKey).isEqualTo("team-a");
    }

    @Test
    void previewNormalizesTeamKeyAndPassesRequest() throws Exception {
        service.preview = preview();

        mockMvc.perform(post("/TEAM-A/planning-workbench/preview")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                    new PlanningWorkbenchPreviewRequest("ALGORITHM", List.of("item-1"))
                )))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.selectedItemIds[0]").value("item-1"))
            .andExpect(jsonPath("$.participantSummary[0].cells[0].free").value(3));

        org.assertj.core.api.Assertions.assertThat(service.lastTeamKey).isEqualTo("team-a");
    }

    @Test
    void applyPassesHeadersAndMatrix() throws Exception {
        service.updatedTasks = List.of(task("task-1", "inprogress"));

        mockMvc.perform(post("/team-a/planning-workbench/apply")
                .header("X-Session-Id", "session-1")
                .header("X-User-Name", "user-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "itemIds": ["item-1"],
                      "allocations": {
                        "item-1": {
                          "participant-1": {
                            "sprint-1": 5
                          }
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].status").value("inprogress"));

        org.assertj.core.api.Assertions.assertThat(service.lastTeamKey).isEqualTo("team-a");
        org.assertj.core.api.Assertions.assertThat(service.lastSessionHeader).isEqualTo("session-1");
        org.assertj.core.api.Assertions.assertThat(service.lastUserName).isEqualTo("user-1");
    }

    @Test
    void updateItemNormalizesTeamKey() throws Exception {
        service.updatedItem = item("item-1");

        mockMvc.perform(put("/TEAM-A/planning-workbench/items/item-1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new PlanningWorkbenchItemRequest(
                    "Task",
                    "Desc",
                    "DoD",
                    (short) 1,
                    List.of("Customer"),
                    List.of("Core"),
                    List.of(),
                    null,
                    null,
                    List.of(),
                    List.of(),
                    null
                ))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value("item-1"));

        org.assertj.core.api.Assertions.assertThat(service.lastTeamKey).isEqualTo("team-a");
    }

    @Test
    void deleteItemNormalizesTeamKey() throws Exception {
        mockMvc.perform(delete("/TEAM-A/planning-workbench/items/item-1"))
            .andExpect(status().isNoContent());

        org.assertj.core.api.Assertions.assertThat(service.lastTeamKey).isEqualTo("team-a");
        org.assertj.core.api.Assertions.assertThat(service.lastDeletedItemId).isEqualTo("item-1");
    }

    private PlanningWorkbenchPreviewDto preview() {
        return new PlanningWorkbenchPreviewDto(
            List.of("item-1"),
            List.of("sprint-1"),
            new PlanningSessionSolveSummaryDto(1, 1, new BigDecimal("5"), BigDecimal.ZERO, 0),
            List.of(),
            List.of(item("item-1")),
            List.of(new PlanningSessionParticipantLoadRowDto(
                new ParticipantDto("participant-1", "Participant 1", "DEV", 1.0, List.of("Core"), null),
                List.of(new PlanningSessionParticipantLoadCellDto(
                    "participant-1",
                    "sprint-1",
                    new BigDecimal("10"),
                    new BigDecimal("2"),
                    new BigDecimal("5"),
                    new BigDecimal("7"),
                    BigDecimal.ZERO,
                    new BigDecimal("3")
                )),
                10,
                2,
                5,
                7,
                0,
                3
            )),
            true
        );
    }

    private PlanningWorkbenchItemDto item(String id) {
        return new PlanningWorkbenchItemDto(
            id,
            "Task",
            "Desc",
            "DoD",
            (short) 2,
            List.of("Customer"),
            List.of("Core"),
            new BigDecimal("5"),
            List.of(new TaskPlanningDemandDto(
                "ROLE",
                "DEV",
                null,
                "Core",
                new BigDecimal("5")
            )),
            List.of("quarter-1"),
            List.of("sprint-1"),
            Map.of(),
            Map.of(),
            null,
            null,
            1,
            "2026-01-01",
            "2026-01-01"
        );
    }

    private TaskDto task(String id, String status) {
        return new TaskDto(
            id,
            "Task",
            "Desc",
            "DoD",
            (short) 2,
            status,
            List.of("Customer"),
            List.of("Core"),
            List.of("participant-1"),
            List.of("quarter-1"),
            List.of("sprint-1"),
            Map.of(),
            Map.of("participant-1", Map.of("sprint-1", new BigDecimal("5"))),
            Map.of(),
            Map.of(),
            null,
            null,
            null,
            null,
            1,
            "2026-01-01",
            "2026-01-01"
        );
    }

    private static final class StubPlanningWorkbenchService extends PlanningWorkbenchService {
        private String lastTeamKey;
        private String lastSessionHeader;
        private String lastUserName;
        private List<PlanningWorkbenchItemDto> backlog = List.of();
        private PlanningWorkbenchItemDto createdItem;
        private PlanningWorkbenchItemDto updatedItem;
        private PlanningWorkbenchPreviewDto preview;
        private List<TaskDto> updatedTasks = List.of();
        private String lastDeletedItemId;

        private StubPlanningWorkbenchService() {
            super(null, null, null, null, null, null, null, new CapacityProperties(1.0, 0.8), List.of());
        }

        @Override
        public List<PlanningWorkbenchItemDto> getBacklogCandidates(String teamKey) {
            this.lastTeamKey = teamKey;
            return backlog;
        }

        @Override
        public PlanningWorkbenchItemDto createItem(String teamKey, PlanningWorkbenchItemRequest request) {
            this.lastTeamKey = teamKey;
            return createdItem;
        }

        @Override
        public PlanningWorkbenchItemDto updateItem(String teamKey, String itemId, PlanningWorkbenchItemRequest request) {
            this.lastTeamKey = teamKey;
            return updatedItem;
        }

        @Override
        public void deleteItem(String teamKey, String itemId) {
            this.lastTeamKey = teamKey;
            this.lastDeletedItemId = itemId;
        }

        @Override
        public PlanningWorkbenchPreviewDto preview(String teamKey, PlanningWorkbenchPreviewRequest request) {
            this.lastTeamKey = teamKey;
            return preview;
        }

        @Override
        public List<TaskDto> apply(
            String teamKey,
            PlanningWorkbenchApplyRequest request,
            String rawSessionId,
            String rawUserName
        ) {
            this.lastTeamKey = teamKey;
            this.lastSessionHeader = rawSessionId;
            this.lastUserName = rawUserName;
            return updatedTasks;
        }
    }
}
