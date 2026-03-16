package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.config.JiraProperties;
import com.sber.isu.sprints_planning.dto.JiraIssueExportResponseDto;
import com.sber.isu.sprints_planning.dto.JiraIssueExportResultDto;
import com.sber.isu.sprints_planning.dto.JiraIssueRequestPreviewDto;
import com.sber.isu.sprints_planning.dto.TaskHistoryChangeDto;
import com.sber.isu.sprints_planning.dto.request.JiraIssueExportRequest;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskJiraIssueEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskJiraIssueRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class JiraIssueExportService {

    private static final Logger log = LoggerFactory.getLogger(JiraIssueExportService.class);
    private static final String JIRA_BASE_URL = "https://jira.sberbank.ru";
    private static final String JIRA_ISSUE_TYPE_ID = "3";
    private static final String HISTORY_FIELD = "jiraIssue";
    private static final String HISTORY_LABEL = "Jira";
    private static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String STATUS_CREATED = "CREATED";
    private static final long IN_PROGRESS_STALE_MINUTES = 15;
    private static final AtomicLong MOCK_ISSUE_SEQUENCE = new AtomicLong(900000);

    private final TaskRepository taskRepository;
    private final TaskJiraIssueRepository taskJiraIssueRepository;
    private final SprintRepository sprintRepository;
    private final ApiHistoryService apiHistoryService;
    private final JiraProperties jiraProperties;
    private final EntityManager entityManager;
    private final TransactionTemplate transactionTemplate;

    public JiraIssueExportService(
        TaskRepository taskRepository,
        TaskJiraIssueRepository taskJiraIssueRepository,
        SprintRepository sprintRepository,
        ApiHistoryService apiHistoryService,
        JiraProperties jiraProperties,
        EntityManager entityManager,
        PlatformTransactionManager transactionManager
    ) {
        this.taskRepository = taskRepository;
        this.taskJiraIssueRepository = taskJiraIssueRepository;
        this.sprintRepository = sprintRepository;
        this.apiHistoryService = apiHistoryService;
        this.jiraProperties = jiraProperties;
        this.entityManager = entityManager;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public JiraIssueExportResponseDto export(String teamKey, JiraIssueExportRequest request) {
        String baseUrl = normalizedBaseUrl();
        String token = jiraProperties.mockEnabled() ? null : normalizedToken();
        Long jiraSprintId = normalizedJiraSprintId(request.jiraSprintId());
        String projectKey = normalizeRequired(request.projectKey(), "projectKey");
        UUID planningSprintId = parseRequiredUuid(request.planningSprintId(), "planningSprintId");
        SprintEntity planningSprint = sprintRepository.findByIdAndTeamKey(planningSprintId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Sprint not found"));

        List<UUID> requestedTaskIds = parseRequiredUuidList(request.taskIds(), "taskIds");
        List<TaskEntity> loadedTasks = taskRepository.findAllByIdInAndTeamKey(requestedTaskIds, teamKey);
        Map<UUID, TaskEntity> tasksById = loadedTasks.stream()
            .collect(LinkedHashMap::new, (map, task) -> map.put(task.getId(), task), Map::putAll);

        List<String> labels = normalizeLabels(request.labels());
        List<JiraIssueExportResultDto> results = new ArrayList<>();

        for (UUID taskId : requestedTaskIds) {
            TaskEntity task = tasksById.get(taskId);
            if (task == null) {
                results.add(new JiraIssueExportResultDto(
                    taskId.toString(),
                    null,
                    null,
                    null,
                    "failed",
                    "Задача не найдена",
                    null,
                    null,
                    null,
                    null
                ));
                continue;
            }

            List<TaskHistoryChangeDto> createdChanges = new ArrayList<>();
            Map<String, Object> meta = new LinkedHashMap<>();
            boolean createdAny = false;

            List<TaskParticipantEntity> participants = task.getParticipants().stream()
                .sorted(Comparator.comparingInt(TaskParticipantEntity::getDisplayOrder))
                .toList();

            if (participants.isEmpty()) {
                results.add(new JiraIssueExportResultDto(
                    task.getId().toString(),
                    task.getTitle(),
                    null,
                    null,
                    "skipped",
                    "В задаче нет участников",
                    null,
                    null,
                    null,
                    null
                ));
                continue;
            }

            for (TaskParticipantEntity taskParticipant : participants) {
                ParticipantEntity participant = taskParticipant.getParticipant();
                if (participant == null || participant.getId() == null) {
                    continue;
                }

                UUID participantId = participant.getId();
                String participantName = participant.getFullName();

                BigDecimal storyPoints = resolveStoryPoints(task, participantId, planningSprint.getId());
                if (storyPoints.compareTo(BigDecimal.ZERO) <= 0) {
                    results.add(new JiraIssueExportResultDto(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        "skipped",
                        "В выбранном спринте нет нагрузки у участника",
                        null,
                        null,
                        null,
                        null
                    ));
                    continue;
                }

                if (!StringUtils.hasText(participant.getJiraLogin())) {
                    results.add(new JiraIssueExportResultDto(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        "failed",
                        "У участника не заполнен Jira login",
                        null,
                        null,
                        null,
                        null
                    ));
                    continue;
                }

                ReservationResult reservation = reserveIssueSlot(
                    teamKey,
                    task.getId(),
                    participantId,
                    planningSprint.getId(),
                    projectKey,
                    jiraSprintId,
                    storyPoints
                );
                if (reservation.existingIssue() != null) {
                    TaskJiraIssueEntity existing = reservation.existingIssue();
                    boolean createdStatus = STATUS_CREATED.equalsIgnoreCase(normalizeOptional(existing.getStatus()));
                    results.add(new JiraIssueExportResultDto(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        "skipped",
                        createdStatus
                            ? "Jira-задача уже заведена"
                            : "Экспорт в Jira уже выполняется или требует проверки",
                        createdStatus ? existing.getJiraIssueId() : null,
                        createdStatus ? existing.getJiraIssueKey() : null,
                        createdStatus ? existing.getJiraIssueUrl() : null,
                        null
                    ));
                    continue;
                }

                JiraCreateIssueRequest requestBody = buildIssueRequest(
                    projectKey,
                    jiraSprintId,
                    labels,
                    task,
                    participant,
                    storyPoints
                );
                JiraIssueRequestPreviewDto requestPreview = buildRequestPreview(baseUrl, token, requestBody);
                log.info(
                    "Jira POST /issue request: url={}, headers={}, body={}",
                    requestPreview.url(),
                    requestPreview.headers(),
                    requestPreview.body()
                );

                try {
                    JiraCreateIssueResponse jiraResponse = createIssue(baseUrl, token, requestBody);

                    completeIssueSlot(
                        reservation.reservationId(),
                        jiraResponse.id(),
                        jiraResponse.key(),
                        issueUrl(baseUrl, jiraResponse.key())
                    );

                    createdAny = true;
                    createdChanges.add(new TaskHistoryChangeDto(
                        HISTORY_FIELD,
                        HISTORY_LABEL,
                        null,
                        participantName + ": " + jiraResponse.key()
                    ));
                    meta.put(participantId.toString(), Map.of(
                        "participantName", participantName,
                        "jiraIssueKey", jiraResponse.key(),
                        "jiraIssueUrl", issueUrl(baseUrl, jiraResponse.key())
                    ));

                    results.add(new JiraIssueExportResultDto(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        "created",
                        "Jira-задача создана",
                        jiraResponse.id(),
                        jiraResponse.key(),
                        issueUrl(baseUrl, jiraResponse.key()),
                        requestPreview
                    ));
                } catch (ResponseStatusException ex) {
                    releaseIssueSlot(reservation.reservationId());
                    results.add(new JiraIssueExportResultDto(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        "failed",
                        ex.getReason(),
                        null,
                        null,
                        null,
                        requestPreview
                    ));
                } catch (RuntimeException ex) {
                    results.add(new JiraIssueExportResultDto(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        "failed",
                        "Экспорт в Jira не завершен, требуется проверка",
                        null,
                        null,
                        null,
                        requestPreview
                    ));
                }
            }

            if (createdAny) {
                try {
                    apiHistoryService.logTaskChange(
                        teamKey,
                        task.getId(),
                        "task.jira.export",
                        "Заведены задачи в Jira",
                        createdChanges,
                        Map.of(
                            "source", "POST /jira/issues",
                            "projectKey", projectKey,
                            "planningSprintId", planningSprint.getId().toString(),
                            "jiraSprintId", jiraSprintId,
                            "items", meta
                        )
                    );
                } catch (RuntimeException ex) {
                    // История не должна откатывать уже сохраненные Jira-связи.
                }
            }
        }

        return new JiraIssueExportResponseDto(results);
    }

    private ReservationResult reserveIssueSlot(
        String teamKey,
        UUID taskId,
        UUID participantId,
        UUID planningSprintId,
        String projectKey,
        Long jiraSprintId,
        BigDecimal storyPoints
    ) {
        return transactionTemplate.execute(status -> {
            TaskJiraIssueEntity existing = loadExistingIssue(teamKey, taskId, participantId);
            if (existing != null) {
                if (isStaleInProgress(existing)) {
                    log.warn(
                        "Retrying stale Jira export reservation: teamKey={}, taskId={}, participantId={}, reservationId={}, createdAt={}",
                        teamKey,
                        taskId,
                        participantId,
                        existing.getId(),
                        existing.getCreatedAt()
                    );
                    taskJiraIssueRepository.delete(existing);
                    taskJiraIssueRepository.flush();
                } else {
                    return ReservationResult.existing(existing);
                }
            }

            TaskJiraIssueEntity pending = new TaskJiraIssueEntity();
            pending.setTeamKey(teamKey);
            pending.setTask(entityManager.getReference(TaskEntity.class, taskId));
            pending.setParticipant(entityManager.getReference(ParticipantEntity.class, participantId));
            pending.setPlanningSprint(entityManager.getReference(SprintEntity.class, planningSprintId));
            pending.setJiraIssueId("PENDING");
            pending.setJiraIssueKey("PENDING");
            pending.setJiraIssueUrl("PENDING");
            pending.setJiraProjectKey(projectKey);
            pending.setJiraSprintId(jiraSprintId);
            pending.setStoryPoints(storyPoints);
            pending.setCreatedAt(OffsetDateTime.now());
            pending.setStatus(STATUS_IN_PROGRESS);

            try {
                TaskJiraIssueEntity saved = taskJiraIssueRepository.saveAndFlush(pending);
                return ReservationResult.created(saved.getId());
            } catch (DataIntegrityViolationException ex) {
                TaskJiraIssueEntity existingAfterConflict = loadExistingIssue(teamKey, taskId, participantId);
                if (existingAfterConflict != null) {
                    return ReservationResult.existing(existingAfterConflict);
                }
                throw ex;
            }
        });
    }

    private void completeIssueSlot(UUID reservationId, String jiraIssueId, String jiraIssueKey, String jiraIssueUrl) {
        transactionTemplate.executeWithoutResult(status -> {
            TaskJiraIssueEntity entity = taskJiraIssueRepository.findById(reservationId)
                .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));
            entity.setJiraIssueId(jiraIssueId);
            entity.setJiraIssueKey(jiraIssueKey);
            entity.setJiraIssueUrl(jiraIssueUrl);
            entity.setStatus(STATUS_CREATED);
            taskJiraIssueRepository.saveAndFlush(entity);
        });
    }

    private void releaseIssueSlot(UUID reservationId) {
        transactionTemplate.executeWithoutResult(status ->
            taskJiraIssueRepository.findById(reservationId)
                .ifPresent(taskJiraIssueRepository::delete)
        );
    }

    private TaskJiraIssueEntity loadExistingIssue(String teamKey, UUID taskId, UUID participantId) {
        return taskJiraIssueRepository.findByTeamKeyAndTaskIdAndParticipantId(teamKey, taskId, participantId)
            .orElse(null);
    }

    private boolean isStaleInProgress(TaskJiraIssueEntity entity) {
        if (entity == null) {
            return false;
        }
        if (!STATUS_IN_PROGRESS.equalsIgnoreCase(normalizeOptional(entity.getStatus()))) {
            return false;
        }
        OffsetDateTime createdAt = entity.getCreatedAt();
        if (createdAt == null) {
            return true;
        }
        return createdAt.isBefore(OffsetDateTime.now().minusMinutes(IN_PROGRESS_STALE_MINUTES));
    }

    private JiraCreateIssueResponse createIssue(
        String baseUrl,
        String token,
        JiraCreateIssueRequest body
    ) {
        if (jiraProperties.mockEnabled()) {
            return mockCreateIssue(body);
        }

        RestClient client = RestClient.builder()
            .baseUrl(baseUrl)
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Basic " + token)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();

        JiraCreateIssueResponse response;
        try {
            response = client.post()
                .uri("/rest/api/2/issue")
                .body(body)
                .retrieve()
                .body(JiraCreateIssueResponse.class);
        } catch (RestClientResponseException ex) {
            String message = ex.getResponseBodyAsString();
            if (!StringUtils.hasText(message)) {
                message = ex.getMessage();
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Jira вернула ошибку: " + message, ex);
        }

        if (response == null || !StringUtils.hasText(response.id()) || !StringUtils.hasText(response.key())) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Jira не вернула данные созданной задачи");
        }
        return response;
    }

    private JiraCreateIssueResponse mockCreateIssue(JiraCreateIssueRequest body) {
        long sequence = MOCK_ISSUE_SEQUENCE.incrementAndGet();
        String projectKey = body.fields().project().key();
        String key = projectKey + "-" + sequence;
        return new JiraCreateIssueResponse(
            String.valueOf(sequence),
            key,
            JIRA_BASE_URL + "/rest/api/2/issue/" + sequence
        );
    }

    private JiraCreateIssueRequest buildIssueRequest(
        String projectKey,
        Long jiraSprintId,
        List<String> labels,
        TaskEntity task,
        ParticipantEntity participant,
        BigDecimal storyPoints
    ) {
        return new JiraCreateIssueRequest(
            new JiraCreateIssueFields(
                new JiraProject(projectKey),
                new JiraIssueType(JIRA_ISSUE_TYPE_ID),
                normalizedTaskTitle(task),
                buildDescription(task),
                new JiraAssignee(participant.getJiraLogin().trim()),
                labels,
                storyPoints,
                jiraSprintId
            )
        );
    }

    private JiraIssueRequestPreviewDto buildRequestPreview(String baseUrl, String token, JiraCreateIssueRequest request) {
        Map<String, Object> project = new LinkedHashMap<>();
        project.put("key", request.fields().project().key());

        Map<String, Object> issueType = new LinkedHashMap<>();
        issueType.put("id", request.fields().issuetype().id());

        Map<String, Object> assignee = new LinkedHashMap<>();
        assignee.put("name", request.fields().assignee().name());

        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("project", project);
        fields.put("issuetype", issueType);
        fields.put("summary", request.fields().summary());
        fields.put("description", request.fields().description());
        fields.put("assignee", assignee);
        fields.put("labels", request.fields().labels());
        fields.put("customfield_10002", request.fields().customfield_10002());
        fields.put("customfield_10005", request.fields().customfield_10005());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("fields", fields);

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE);
        String authorizationHeader = maskedAuthorizationHeader(token);
        if (authorizationHeader != null) {
            headers.put(HttpHeaders.AUTHORIZATION, authorizationHeader);
        }

        return new JiraIssueRequestPreviewDto(
            "POST",
            baseUrl + "/rest/api/2/issue",
            headers,
            body
        );
    }

    private String maskedAuthorizationHeader(String token) {
        if (!StringUtils.hasText(token)) {
            return null;
        }
        String encoded = Base64.getEncoder().encodeToString(token.trim().getBytes(StandardCharsets.UTF_8));
        return "Basic " + encoded;
    }

    private BigDecimal resolveStoryPoints(TaskEntity task, UUID participantId, UUID sprintId) {
        return task.getAllocations().stream()
            .filter(allocation -> allocation.getParticipant() != null
                && Objects.equals(allocation.getParticipant().getId(), participantId))
            .filter(allocation -> allocation.getSprint() != null
                && Objects.equals(allocation.getSprint().getId(), sprintId))
            .map(TaskAllocationEntity::getDays)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private String buildDescription(TaskEntity task) {
        String description = normalizeOptional(task.getDescription());
        String dod = normalizeOptional(task.getDod());
        if (description != null && dod != null) {
            return description + "\n\nDoD:\n" + dod;
        }
        if (description != null) {
            return description;
        }
        if (dod != null) {
            return "DoD:\n" + dod;
        }
        return "";
    }

    private String normalizedTaskTitle(TaskEntity task) {
        String title = normalizeOptional(task.getTitle());
        return title != null ? title : "Без названия";
    }

    private List<String> normalizeLabels(List<String> labels) {
        if (labels == null || labels.isEmpty()) {
            return List.of();
        }
        return labels.stream()
            .filter(StringUtils::hasText)
            .map(String::trim)
            .distinct()
            .toList();
    }

    private String normalizedBaseUrl() {
        return JIRA_BASE_URL;
    }

    private UUID parseRequiredUuid(String value, String fieldName) {
        String normalized = normalizeRequired(value, fieldName);
        try {
            return UUID.fromString(normalized);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Поле " + fieldName + " должно быть UUID",
                ex
            );
        }
    }

    private List<UUID> parseRequiredUuidList(List<String> values, String fieldName) {
        if (values == null || values.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Поле " + fieldName + " обязательно");
        }

        List<UUID> parsed = new ArrayList<>();
        for (String value : values) {
            if (!StringUtils.hasText(value)) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Поле " + fieldName + " содержит пустое значение"
                );
            }
            parsed.add(parseRequiredUuid(value, fieldName));
        }
        return parsed.stream().distinct().toList();
    }

    private String normalizedToken() {
        String value = normalizeOptional(jiraProperties.basicToken());
        if (value == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Не настроен Jira token");
        }
        return value;
    }

    private Long normalizedJiraSprintId(String value) {
        String normalized = normalizeRequired(value, "jiraSprintId");
        try {
            return Long.valueOf(normalized);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Поле jiraSprintId должно быть числом", ex);
        }
    }

    private String normalizeRequired(String value, String fieldName) {
        String normalized = normalizeOptional(value);
        if (normalized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Поле " + fieldName + " обязательно");
        }
        return normalized;
    }

    private String normalizeOptional(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String issueUrl(String baseUrl, String issueKey) {
        return baseUrl + "/browse/" + issueKey;
    }

    private record ReservationResult(UUID reservationId, TaskJiraIssueEntity existingIssue) {
        private static ReservationResult created(UUID reservationId) {
            return new ReservationResult(reservationId, null);
        }

        private static ReservationResult existing(TaskJiraIssueEntity existingIssue) {
            return new ReservationResult(null, existingIssue);
        }
    }

    private record JiraCreateIssueRequest(JiraCreateIssueFields fields) {
    }

    private record JiraCreateIssueFields(
        JiraProject project,
        JiraIssueType issuetype,
        String summary,
        String description,
        JiraAssignee assignee,
        List<String> labels,
        BigDecimal customfield_10002,
        Long customfield_10005
    ) {
    }

    private record JiraProject(String key) {
    }

    private record JiraIssueType(String id) {
    }

    private record JiraAssignee(String name) {
    }

    private record JiraCreateIssueResponse(String id, String key, String self) {
    }
}
