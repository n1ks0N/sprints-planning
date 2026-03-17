package com.sber.isu.sprints_planning.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sber.isu.sprints_planning.config.JiraProperties;
import com.sber.isu.sprints_planning.dto.JiraExportBatchItemDto;
import com.sber.isu.sprints_planning.dto.JiraExportBatchStartDto;
import com.sber.isu.sprints_planning.dto.JiraExportBatchStatusDto;
import com.sber.isu.sprints_planning.dto.JiraIssueRequestPreviewDto;
import com.sber.isu.sprints_planning.dto.TaskHistoryChangeDto;
import com.sber.isu.sprints_planning.dto.request.JiraIssueExportRequest;
import com.sber.isu.sprints_planning.dto.request.JiraIssueManualConfirmRequest;
import com.sber.isu.sprints_planning.model.JiraExportBatchEntity;
import com.sber.isu.sprints_planning.model.ParticipantEntity;
import com.sber.isu.sprints_planning.model.SprintEntity;
import com.sber.isu.sprints_planning.model.TaskAllocationEntity;
import com.sber.isu.sprints_planning.model.TaskEntity;
import com.sber.isu.sprints_planning.model.TaskJiraIssueEntity;
import com.sber.isu.sprints_planning.model.TaskParticipantEntity;
import com.sber.isu.sprints_planning.repository.JiraExportBatchRepository;
import com.sber.isu.sprints_planning.repository.SprintRepository;
import com.sber.isu.sprints_planning.repository.TaskJiraIssueRepository;
import com.sber.isu.sprints_planning.repository.TaskRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import java.math.BigDecimal;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicLong;
import org.hibernate.Hibernate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class JiraIssueExportService {

    private static final Logger log = LoggerFactory.getLogger(JiraIssueExportService.class);
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private static final String JIRA_API_BASE_URL = "http://jira.sberbank.ru:27062";
    private static final String JIRA_PUBLIC_BASE_URL = "https://jira.sberbank.ru";
    private static final String JIRA_ISSUE_TYPE_ID = "3";
    private static final String HISTORY_FIELD = "jiraIssue";
    private static final String HISTORY_LABEL = "Jira";

    private static final String LINK_STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String LINK_STATUS_CREATED = "CREATED";
    private static final String LINK_STATUS_FAILED = "FAILED";
    private static final String LINK_STATUS_MANUAL_CHECK_REQUIRED = "MANUAL_CHECK_REQUIRED";
    private static final long IN_PROGRESS_STALE_MINUTES = 15;

    private static final String ITEM_STATUS_PENDING = "PENDING";
    private static final String ITEM_STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String ITEM_STATUS_CREATED = "CREATED";
    private static final String ITEM_STATUS_FAILED = "FAILED";
    private static final String ITEM_STATUS_SKIPPED = "SKIPPED";
    private static final String ITEM_STATUS_MANUAL_CHECK_REQUIRED = "MANUAL_CHECK_REQUIRED";

    private static final String BATCH_STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String BATCH_STATUS_COMPLETED = "COMPLETED";
    private static final String BATCH_STATUS_COMPLETED_WITH_ERRORS = "COMPLETED_WITH_ERRORS";
    private static final String BATCH_STATUS_COMPLETED_WITH_MANUAL_ACTION = "COMPLETED_WITH_MANUAL_ACTION";

    private static final String BATCH_ENTITY_TYPE = "jira_export_batch";
    private static final String TASK_ENTITY_TYPE = "task";
    private static final AtomicLong MOCK_ISSUE_SEQUENCE = new AtomicLong(900000);

    private final TaskRepository taskRepository;
    private final TaskJiraIssueRepository taskJiraIssueRepository;
    private final SprintRepository sprintRepository;
    private final JiraExportBatchRepository jiraExportBatchRepository;
    private final ApiHistoryService apiHistoryService;
    private final JiraProperties jiraProperties;
    private final EntityManager entityManager;
    private final TransactionTemplate transactionTemplate;
    private final Executor jiraExportExecutor;
    private final ObjectMapper objectMapper;

    public JiraIssueExportService(
        TaskRepository taskRepository,
        TaskJiraIssueRepository taskJiraIssueRepository,
        SprintRepository sprintRepository,
        JiraExportBatchRepository jiraExportBatchRepository,
        ApiHistoryService apiHistoryService,
        JiraProperties jiraProperties,
        EntityManager entityManager,
        PlatformTransactionManager transactionManager,
        @Qualifier("jiraExportExecutor") Executor jiraExportExecutor,
        ObjectMapper objectMapper
    ) {
        this.taskRepository = taskRepository;
        this.taskJiraIssueRepository = taskJiraIssueRepository;
        this.sprintRepository = sprintRepository;
        this.jiraExportBatchRepository = jiraExportBatchRepository;
        this.apiHistoryService = apiHistoryService;
        this.jiraProperties = jiraProperties;
        this.entityManager = entityManager;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.jiraExportExecutor = jiraExportExecutor;
        this.objectMapper = objectMapper;
    }

    public JiraExportBatchStartDto startExport(
        String teamKey,
        JiraIssueExportRequest request,
        String sessionId,
        String rawUserName
    ) {
        String effectiveSessionId = StringUtils.hasText(sessionId) ? sessionId.trim() : UUID.randomUUID().toString();
        String userName = normalizeUserName(rawUserName);
        String jiraApiBaseUrl = JIRA_API_BASE_URL;
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

        List<BatchItemState> items = buildInitialBatchItems(
            teamKey,
            requestedTaskIds,
            tasksById,
            planningSprint,
            jiraSprintId,
            projectKey,
            labels,
            jiraApiBaseUrl
        );

        JiraExportBatchEntity batch = new JiraExportBatchEntity();
        batch.setTeamKey(teamKey);
        batch.setSessionId(effectiveSessionId);
        batch.setUserName(userName);
        batch.setPlanningSprint(entityManager.getReference(SprintEntity.class, planningSprintId));
        batch.setJiraSprintId(jiraSprintId);
        batch.setProjectKey(projectKey);
        batch.setLabelsJson(new ArrayList<>(labels));
        batch.setItemsJson(serializeItems(items));
        batch.setTotalItems(items.size());
        batch.setStatus(computeBatchStatus(items));
        JiraExportBatchEntity saved = jiraExportBatchRepository.save(batch);

        apiHistoryService.logEntityEvent(
            teamKey,
            effectiveSessionId,
            userName,
            "POST",
            "/jira/issues",
            202,
            BATCH_ENTITY_TYPE,
            saved.getId(),
            "jira.batch.started",
            "Запущен batch экспорта в Jira",
            List.of(),
            Map.of(
                "planningSprintId", planningSprintId.toString(),
                "jiraSprintId", jiraSprintId,
                "projectKey", projectKey,
                "totalItems", items.size()
            )
        );

        if (hasPendingItems(items)) {
            CompletableFuture.runAsync(() -> processBatch(saved.getId()), jiraExportExecutor)
                .exceptionally(ex -> {
                    log.error("Failed to process Jira export batch {}", saved.getId(), ex);
                    markBatchAsManualRequiredOnFatalError(saved.getId(), ex);
                    return null;
                });
        }

        return new JiraExportBatchStartDto(saved.getId().toString(), saved.getStatus(), saved.getTotalItems());
    }

    public JiraExportBatchStatusDto getBatchStatus(String teamKey, String batchId) {
        UUID id = parseRequiredUuid(batchId, "batchId");
        JiraExportBatchEntity batch = jiraExportBatchRepository.findByIdAndTeamKey(id, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Jira export batch not found"));
        return toBatchStatus(batch);
    }

    public JiraExportBatchStatusDto confirmCreated(
        String teamKey,
        String taskJiraIssueId,
        JiraIssueManualConfirmRequest request,
        String sessionId,
        String rawUserName
    ) {
        UUID issueId = parseRequiredUuid(taskJiraIssueId, "taskJiraIssueId");
        String jiraIssueKey = normalizeRequired(request.jiraIssueKey(), "jiraIssueKey");
        String userName = normalizeUserName(rawUserName);
        String effectiveSessionId = StringUtils.hasText(sessionId) ? sessionId.trim() : UUID.randomUUID().toString();

        UUID batchId = transactionTemplate.execute(status -> {
            TaskJiraIssueEntity entity = taskJiraIssueRepository.findByIdAndTeamKey(issueId, teamKey)
                .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));
            if (!LINK_STATUS_MANUAL_CHECK_REQUIRED.equalsIgnoreCase(normalizeOptional(entity.getStatus()))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Подтверждение доступно только для статуса MANUAL_CHECK_REQUIRED");
            }
            entity.setJiraIssueId(jiraIssueKey);
            entity.setJiraIssueKey(jiraIssueKey);
            entity.setJiraIssueUrl(issueUrl(jiraIssueKey));
            entity.setStatus(LINK_STATUS_CREATED);
            entity.setLastError(null);
            entity.setUpdatedAt(OffsetDateTime.now());
            taskJiraIssueRepository.saveAndFlush(entity);
            return entity.getExportBatch() != null ? entity.getExportBatch().getId() : null;
        });

        updateBatchItemByTaskJiraIssueId(
            issueId,
            item -> item.withManualConfirmation(ITEM_STATUS_CREATED, "Создание подтверждено вручную", jiraIssueKey, issueUrl(jiraIssueKey))
        );

        TaskJiraIssueEntity entity = taskJiraIssueRepository.findByIdAndTeamKey(issueId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));

        logTaskJiraEvent(
            teamKey,
            effectiveSessionId,
            userName,
            entity,
            "task.jira.export.confirm-created",
            "Подтверждено создание задачи в Jira",
            new TaskHistoryChangeDto(
                HISTORY_FIELD,
                HISTORY_LABEL,
                null,
                participantName(entity) + ": " + jiraIssueKey
            ),
            Map.of(
                "source", "POST /jira/issues/items/{id}/confirm-created",
                "jiraIssueKey", jiraIssueKey
            )
        );

        if (batchId != null) {
            apiHistoryService.logEntityEvent(
                teamKey,
                effectiveSessionId,
                userName,
                "POST",
                "/jira/issues/items/{id}/confirm-created",
                200,
                BATCH_ENTITY_TYPE,
                batchId,
                "jira.batch.item.confirm-created",
                "Подтверждено создание задачи в Jira вручную",
                List.of(),
                Map.of(
                    "taskJiraIssueId", issueId.toString(),
                    "jiraIssueKey", jiraIssueKey
                )
            );
            return getBatchStatus(teamKey, batchId.toString());
        }

        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Batch not found for Jira issue");
    }

    public JiraExportBatchStatusDto confirmNotCreated(
        String teamKey,
        String taskJiraIssueId,
        String sessionId,
        String rawUserName
    ) {
        UUID issueId = parseRequiredUuid(taskJiraIssueId, "taskJiraIssueId");
        String userName = normalizeUserName(rawUserName);
        String effectiveSessionId = StringUtils.hasText(sessionId) ? sessionId.trim() : UUID.randomUUID().toString();

        UUID batchId = transactionTemplate.execute(status -> {
            TaskJiraIssueEntity entity = taskJiraIssueRepository.findByIdAndTeamKey(issueId, teamKey)
                .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));
            if (!LINK_STATUS_MANUAL_CHECK_REQUIRED.equalsIgnoreCase(normalizeOptional(entity.getStatus()))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Подтверждение доступно только для статуса MANUAL_CHECK_REQUIRED");
            }
            entity.setStatus(LINK_STATUS_FAILED);
            entity.setLastError("Пользователь подтвердил, что Jira-задача не была создана");
            entity.setUpdatedAt(OffsetDateTime.now());
            entity.setJiraIssueId("PENDING");
            entity.setJiraIssueKey("PENDING");
            entity.setJiraIssueUrl("PENDING");
            taskJiraIssueRepository.saveAndFlush(entity);
            return entity.getExportBatch() != null ? entity.getExportBatch().getId() : null;
        });

        updateBatchItemByTaskJiraIssueId(
            issueId,
            item -> item.withStatus(ITEM_STATUS_FAILED, "Пользователь подтвердил, что Jira-задача не была создана")
        );

        TaskJiraIssueEntity entity = taskJiraIssueRepository.findByIdAndTeamKey(issueId, teamKey)
            .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));

        logTaskJiraEvent(
            teamKey,
            effectiveSessionId,
            userName,
            entity,
            "task.jira.export.confirm-not-created",
            "Подтверждено отсутствие задачи в Jira",
            new TaskHistoryChangeDto(
                HISTORY_FIELD,
                HISTORY_LABEL,
                "Требует проверки",
                "Не создана"
            ),
            Map.of(
                "source", "POST /jira/issues/items/{id}/confirm-not-created"
            )
        );

        if (batchId != null) {
            apiHistoryService.logEntityEvent(
                teamKey,
                effectiveSessionId,
                userName,
                "POST",
                "/jira/issues/items/{id}/confirm-not-created",
                200,
                BATCH_ENTITY_TYPE,
                batchId,
                "jira.batch.item.confirm-not-created",
                "Подтверждено отсутствие задачи в Jira вручную",
                List.of(),
                Map.of("taskJiraIssueId", issueId.toString())
            );
            return getBatchStatus(teamKey, batchId.toString());
        }

        throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Batch not found for Jira issue");
    }

    private List<BatchItemState> buildInitialBatchItems(
        String teamKey,
        List<UUID> requestedTaskIds,
        Map<UUID, TaskEntity> tasksById,
        SprintEntity planningSprint,
        Long jiraSprintId,
        String projectKey,
        List<String> labels,
        String jiraApiBaseUrl
    ) {
        List<BatchItemState> items = new ArrayList<>();

        for (UUID taskId : requestedTaskIds) {
            TaskEntity task = tasksById.get(taskId);
            if (task == null) {
                items.add(BatchItemState.failed(
                    taskId.toString(),
                    null,
                    null,
                    null,
                    planningSprint.getId().toString(),
                    planningSprint.getName(),
                    "Задача не найдена"
                ));
                continue;
            }

            List<TaskParticipantEntity> participants = task.getParticipants().stream()
                .sorted(Comparator.comparingInt(TaskParticipantEntity::getDisplayOrder))
                .toList();

            if (participants.isEmpty()) {
                items.add(BatchItemState.skipped(
                    task.getId().toString(),
                    task.getTitle(),
                    null,
                    null,
                    planningSprint.getId().toString(),
                    planningSprint.getName(),
                    "В задаче нет участников"
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
                    items.add(BatchItemState.skipped(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        planningSprint.getId().toString(),
                        planningSprint.getName(),
                        "В выбранном спринте нет нагрузки у участника"
                    ));
                    continue;
                }

                if (!StringUtils.hasText(participant.getJiraLogin())) {
                    items.add(BatchItemState.failed(
                        task.getId().toString(),
                        task.getTitle(),
                        participantId.toString(),
                        participantName,
                        planningSprint.getId().toString(),
                        planningSprint.getName(),
                        "У участника не заполнен Jira login"
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
                JiraIssueRequestPreviewDto requestPreview = buildRequestPreview(jiraApiBaseUrl, requestBody);
                items.add(BatchItemState.pending(
                    task.getId().toString(),
                    task.getTitle(),
                    participantId.toString(),
                    participantName,
                    planningSprint.getId().toString(),
                    planningSprint.getName(),
                    storyPoints,
                    requestPreview
                ));
            }
        }

        return items;
    }

    private void processBatch(UUID batchId) {
        JiraExportBatchEntity batch = jiraExportBatchRepository.findById(batchId)
            .orElseThrow(() -> new EntityNotFoundException("Jira export batch not found"));

        String teamKey = batch.getTeamKey();
        String jiraApiBaseUrl = JIRA_API_BASE_URL;
        String token = jiraProperties.mockEnabled() ? null : normalizedToken();
        RestClient jiraClient = jiraProperties.mockEnabled() ? null : createJiraRestClient(jiraApiBaseUrl, token);

        List<BatchItemState> items = deserializeItems(batch);
        for (BatchItemState item : items) {
            if (!ITEM_STATUS_PENDING.equals(item.status())) {
                continue;
            }

            updateBatchItem(batchId, item.withStatus(ITEM_STATUS_IN_PROGRESS, "Заведение задачи в Jira"));

            BatchItemState processed = processPendingItem(batch, item, jiraClient, jiraApiBaseUrl);
            updateBatchItem(batchId, processed);
        }

        JiraExportBatchStatusDto status = getBatchStatus(teamKey, batchId.toString());
        apiHistoryService.logEntityEvent(
            teamKey,
            batch.getSessionId(),
            batch.getUserName(),
            "SYSTEM",
            "/jira/issues/batches/{id}",
            200,
            BATCH_ENTITY_TYPE,
            batchId,
            "jira.batch.completed",
            "Завершен batch экспорта в Jira",
            List.of(),
            Map.of(
                "status", status.status(),
                "totalItems", status.totalItems(),
                "processedItems", status.processedItems(),
                "createdItems", status.createdItems(),
                "failedItems", status.failedItems(),
                "manualCheckItems", status.manualCheckItems(),
                "skippedItems", status.skippedItems()
            )
        );
    }

    private BatchItemState processPendingItem(
        JiraExportBatchEntity batch,
        BatchItemState item,
        RestClient jiraClient,
        String jiraApiBaseUrl
    ) {
        UUID taskId = parseRequiredUuid(item.taskId(), "taskId");
        UUID participantId = parseRequiredUuid(item.participantId(), "participantId");
        UUID planningSprintId = parseRequiredUuid(item.planningSprintId(), "planningSprintId");

        TaskEntity task = taskRepository.findWithDetailsById(taskId, batch.getTeamKey());
        if (task == null) {
            return item.withStatus(ITEM_STATUS_FAILED, "Задача не найдена");
        }

        ParticipantEntity participant = task.getParticipants().stream()
            .map(TaskParticipantEntity::getParticipant)
            .filter(Objects::nonNull)
            .filter(value -> Objects.equals(value.getId(), participantId))
            .findFirst()
            .orElse(null);
        if (participant == null) {
            return item.withStatus(ITEM_STATUS_FAILED, "Участник не найден в задаче");
        }

        SlotReservationResult reservation = reserveIssueSlot(
            batch,
            taskId,
            participantId,
            planningSprintId,
            batch.getProjectKey(),
            batch.getJiraSprintId(),
            item.storyPoints()
        );
        if (reservation.existingIssue() != null) {
            return toExistingIssueItem(item, reservation.existingIssue());
        }

        if (!StringUtils.hasText(participant.getJiraLogin())) {
            markIssueFailed(reservation.reservationId(), "У участника не заполнен Jira login");
            return item.withTaskJiraIssueId(reservation.reservationId().toString())
                .withStatus(ITEM_STATUS_FAILED, "У участника не заполнен Jira login");
        }

        JiraCreateIssueRequest requestBody = buildIssueRequest(
            batch.getProjectKey(),
            batch.getJiraSprintId(),
            normalizeLabels(batch.getLabelsJson()),
            task,
            participant,
            item.storyPoints()
        );
        JiraIssueRequestPreviewDto requestPreview = buildRequestPreview(jiraApiBaseUrl, requestBody);

        try {
            JiraCreateIssueResponse jiraResponse = createIssue(jiraClient, requestBody);
            completeIssueSlot(
                reservation.reservationId(),
                jiraResponse.id(),
                jiraResponse.key(),
                issueUrl(jiraResponse.key())
            );

            TaskJiraIssueEntity createdEntity = taskJiraIssueRepository.findById(reservation.reservationId())
                .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));

            logTaskJiraEvent(
                batch.getTeamKey(),
                batch.getSessionId(),
                batch.getUserName(),
                createdEntity,
                "task.jira.export",
                "Заведены задачи в Jira",
                new TaskHistoryChangeDto(
                    HISTORY_FIELD,
                    HISTORY_LABEL,
                    null,
                    participantName(createdEntity) + ": " + jiraResponse.key()
                ),
                Map.of(
                    "source", "POST /jira/issues",
                    "projectKey", batch.getProjectKey(),
                    "planningSprintId", planningSprintId.toString(),
                    "jiraSprintId", batch.getJiraSprintId(),
                    "participantId", participantId.toString()
                )
            );

            return item.withTaskJiraIssueId(reservation.reservationId().toString())
                .withCreated(
                    "Jira-задача создана",
                    jiraResponse.id(),
                    jiraResponse.key(),
                    issueUrl(jiraResponse.key()),
                    requestPreview
                );
        } catch (JiraIssueProcessingException ex) {
            if (ex.manualCheckRequired()) {
                markIssueManualCheckRequired(reservation.reservationId(), ex.getMessage());
                TaskJiraIssueEntity entity = taskJiraIssueRepository.findById(reservation.reservationId())
                    .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));
                logTaskJiraEvent(
                    batch.getTeamKey(),
                    batch.getSessionId(),
                    batch.getUserName(),
                    entity,
                    "task.jira.export.manual-check",
                    "Требуется ручная проверка Jira-задачи",
                    new TaskHistoryChangeDto(HISTORY_FIELD, HISTORY_LABEL, null, "Требуется ручная проверка"),
                    Map.of(
                        "source", "POST /jira/issues",
                        "error", ex.getMessage()
                    )
                );
                return item.withTaskJiraIssueId(reservation.reservationId().toString())
                    .withManualCheck(ex.getMessage(), requestPreview);
            }
            markIssueFailed(reservation.reservationId(), ex.getMessage());
            return item.withTaskJiraIssueId(reservation.reservationId().toString())
                .withFailed(ex.getMessage(), requestPreview);
        } catch (RuntimeException ex) {
            String message = "Экспорт в Jira не завершен, требуется ручная проверка";
            markIssueManualCheckRequired(reservation.reservationId(), message);
            return item.withTaskJiraIssueId(reservation.reservationId().toString())
                .withManualCheck(message, requestPreview);
        }
    }

    private SlotReservationResult reserveIssueSlot(
        JiraExportBatchEntity batch,
        UUID taskId,
        UUID participantId,
        UUID planningSprintId,
        String projectKey,
        Long jiraSprintId,
        BigDecimal storyPoints
    ) {
        return transactionTemplate.execute(status -> {
            TaskJiraIssueEntity existing = loadExistingIssue(batch.getTeamKey(), taskId, participantId, planningSprintId);
            if (existing != null) {
                String existingStatus = normalizeOptional(existing.getStatus());
                if (LINK_STATUS_CREATED.equalsIgnoreCase(existingStatus)) {
                    return SlotReservationResult.existing(existing);
                }
                if (LINK_STATUS_MANUAL_CHECK_REQUIRED.equalsIgnoreCase(existingStatus)) {
                    return SlotReservationResult.existing(existing);
                }
                if (LINK_STATUS_IN_PROGRESS.equalsIgnoreCase(existingStatus)) {
                    if (isStaleInProgress(existing)) {
                        existing.setStatus(LINK_STATUS_MANUAL_CHECK_REQUIRED);
                        existing.setLastError("Предыдущая попытка зависла: требуется ручная проверка, задача могла быть создана в Jira");
                        existing.setUpdatedAt(OffsetDateTime.now());
                        taskJiraIssueRepository.saveAndFlush(existing);
                    }
                    return SlotReservationResult.existing(existing);
                }
                if (LINK_STATUS_FAILED.equalsIgnoreCase(existingStatus)) {
                    existing.setExportBatch(batch);
                    existing.setPlanningSprint(entityManager.getReference(SprintEntity.class, planningSprintId));
                    existing.setJiraProjectKey(projectKey);
                    existing.setJiraSprintId(jiraSprintId);
                    existing.setStoryPoints(storyPoints);
                    existing.setJiraIssueId("PENDING");
                    existing.setJiraIssueKey("PENDING");
                    existing.setJiraIssueUrl("PENDING");
                    existing.setStatus(LINK_STATUS_IN_PROGRESS);
                    existing.setLastError(null);
                    existing.setUpdatedAt(OffsetDateTime.now());
                    TaskJiraIssueEntity saved = taskJiraIssueRepository.saveAndFlush(existing);
                    return SlotReservationResult.created(saved.getId());
                }
                return SlotReservationResult.existing(existing);
            }

            TaskJiraIssueEntity pending = new TaskJiraIssueEntity();
            pending.setTeamKey(batch.getTeamKey());
            pending.setTask(entityManager.getReference(TaskEntity.class, taskId));
            pending.setParticipant(entityManager.getReference(ParticipantEntity.class, participantId));
            pending.setPlanningSprint(entityManager.getReference(SprintEntity.class, planningSprintId));
            pending.setExportBatch(batch);
            pending.setJiraIssueId("PENDING");
            pending.setJiraIssueKey("PENDING");
            pending.setJiraIssueUrl("PENDING");
            pending.setJiraProjectKey(projectKey);
            pending.setJiraSprintId(jiraSprintId);
            pending.setStoryPoints(storyPoints);
            pending.setCreatedAt(OffsetDateTime.now());
            pending.setUpdatedAt(OffsetDateTime.now());
            pending.setStatus(LINK_STATUS_IN_PROGRESS);
            pending.setLastError(null);

            try {
                TaskJiraIssueEntity saved = taskJiraIssueRepository.saveAndFlush(pending);
                return SlotReservationResult.created(saved.getId());
            } catch (DataIntegrityViolationException ex) {
                TaskJiraIssueEntity existingAfterConflict = loadExistingIssue(
                    batch.getTeamKey(),
                    taskId,
                    participantId,
                    planningSprintId
                );
                if (existingAfterConflict != null) {
                    return SlotReservationResult.existing(existingAfterConflict);
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
            entity.setStatus(LINK_STATUS_CREATED);
            entity.setLastError(null);
            entity.setUpdatedAt(OffsetDateTime.now());
            taskJiraIssueRepository.saveAndFlush(entity);
        });
    }

    private void markIssueFailed(UUID reservationId, String message) {
        transactionTemplate.executeWithoutResult(status -> {
            TaskJiraIssueEntity entity = taskJiraIssueRepository.findById(reservationId)
                .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));
            entity.setStatus(LINK_STATUS_FAILED);
            entity.setLastError(message);
            entity.setUpdatedAt(OffsetDateTime.now());
            taskJiraIssueRepository.saveAndFlush(entity);
        });
    }

    private void markIssueManualCheckRequired(UUID reservationId, String message) {
        transactionTemplate.executeWithoutResult(status -> {
            TaskJiraIssueEntity entity = taskJiraIssueRepository.findById(reservationId)
                .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));
            entity.setStatus(LINK_STATUS_MANUAL_CHECK_REQUIRED);
            entity.setLastError(message);
            entity.setUpdatedAt(OffsetDateTime.now());
            taskJiraIssueRepository.saveAndFlush(entity);
        });
    }

    private TaskJiraIssueEntity loadExistingIssue(String teamKey, UUID taskId, UUID participantId, UUID planningSprintId) {
        return taskJiraIssueRepository.findByTeamKeyAndTaskIdAndParticipantIdAndPlanningSprintId(
                teamKey,
                taskId,
                participantId,
                planningSprintId
            )
            .orElse(null);
    }

    private BatchItemState toExistingIssueItem(BatchItemState item, TaskJiraIssueEntity existing) {
        String existingStatus = normalizeOptional(existing.getStatus());
        if (LINK_STATUS_CREATED.equalsIgnoreCase(existingStatus)) {
            return item.withTaskJiraIssueId(existing.getId().toString())
                .withExistingCreated(existing.getJiraIssueId(), existing.getJiraIssueKey(), existing.getJiraIssueUrl());
        }
        if (LINK_STATUS_IN_PROGRESS.equalsIgnoreCase(existingStatus)) {
            return item.withTaskJiraIssueId(existing.getId().toString())
                .withStatus(ITEM_STATUS_IN_PROGRESS, "Экспорт в Jira уже выполняется");
        }
        if (LINK_STATUS_FAILED.equalsIgnoreCase(existingStatus)) {
            return item.withTaskJiraIssueId(existing.getId().toString())
                .withFailed(
                    StringUtils.hasText(existing.getLastError()) ? existing.getLastError() : "Не удалось завести задачу в Jira",
                    item.jiraRequest()
                );
        }
        if (LINK_STATUS_MANUAL_CHECK_REQUIRED.equalsIgnoreCase(existingStatus)) {
            return item.withTaskJiraIssueId(existing.getId().toString())
                .withManualCheck(
                    StringUtils.hasText(existing.getLastError()) ? existing.getLastError() : "Требуется ручная проверка",
                    item.jiraRequest()
                );
        }
        return item.withTaskJiraIssueId(existing.getId().toString())
            .withFailed(
                StringUtils.hasText(existing.getLastError())
                    ? existing.getLastError()
                    : "Не удалось завести задачу в Jira",
                item.jiraRequest()
            );
    }

    private boolean isStaleInProgress(TaskJiraIssueEntity entity) {
        if (entity == null) {
            return false;
        }
        if (!LINK_STATUS_IN_PROGRESS.equalsIgnoreCase(normalizeOptional(entity.getStatus()))) {
            return false;
        }
        OffsetDateTime updatedAt = entity.getUpdatedAt();
        if (updatedAt == null) {
            updatedAt = entity.getCreatedAt();
        }
        if (updatedAt == null) {
            return true;
        }
        return updatedAt.isBefore(OffsetDateTime.now().minusMinutes(IN_PROGRESS_STALE_MINUTES));
    }

    private JiraCreateIssueResponse createIssue(RestClient jiraClient, JiraCreateIssueRequest body) {
        if (jiraProperties.mockEnabled()) {
            return mockCreateIssue(body);
        }
        if (jiraClient == null) {
            throw new JiraIssueProcessingException(false, "Jira client is not configured");
        }

        try {
            JiraCreateIssueResponse response = jiraClient.post()
                .uri("/rest/api/2/issue")
                .body(body)
                .retrieve()
                .body(JiraCreateIssueResponse.class);

            if (response == null || !StringUtils.hasText(response.id()) || !StringUtils.hasText(response.key())) {
                throw new JiraIssueProcessingException(false, "Jira не вернула данные созданной задачи");
            }
            return response;
        } catch (ResourceAccessException ex) {
            throw new JiraIssueProcessingException(true, "Jira недоступна или отвечает слишком долго", ex);
        } catch (RestClientResponseException ex) {
            String message = ex.getResponseBodyAsString();
            if (!StringUtils.hasText(message)) {
                message = ex.getMessage();
            }
            if (ex.getStatusCode().is4xxClientError()) {
                throw new JiraIssueProcessingException(false, "Jira вернула ошибку: " + message, ex);
            }
            throw new JiraIssueProcessingException(ex.getStatusCode().value() == 502
                || ex.getStatusCode().value() == 503
                || ex.getStatusCode().value() == 504, "Jira вернула ошибку: " + message, ex);
        }
    }

    private RestClient createJiraRestClient(String baseUrl, String token) {
        int connectTimeoutMs = normalizePositiveTimeout(jiraProperties.connectTimeoutMs(), 5000);
        int readTimeoutMs = normalizePositiveTimeout(jiraProperties.readTimeoutMs(), 30000);

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));

        return RestClient.builder()
            .baseUrl(baseUrl)
            .requestFactory(requestFactory)
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Basic " + token)
            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
            .build();
    }

    private int normalizePositiveTimeout(Integer timeoutMs, int fallbackMs) {
        if (timeoutMs == null || timeoutMs <= 0) {
            return fallbackMs;
        }
        return timeoutMs;
    }

    private JiraCreateIssueResponse mockCreateIssue(JiraCreateIssueRequest body) {
        long sequence = MOCK_ISSUE_SEQUENCE.incrementAndGet();
        String projectKey = body.fields().project().key();
        String key = projectKey + "-" + sequence;
        return new JiraCreateIssueResponse(
            String.valueOf(sequence),
            key,
            JIRA_PUBLIC_BASE_URL + "/rest/api/2/issue/" + sequence
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

    private JiraIssueRequestPreviewDto buildRequestPreview(String jiraApiBaseUrl, JiraCreateIssueRequest request) {
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
        return new JiraIssueRequestPreviewDto(
            "POST",
            jiraApiBaseUrl + "/rest/api/2/issue",
            headers,
            body
        );
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

    private UUID parseRequiredUuid(String value, String fieldName) {
        String normalized = normalizeRequired(value, fieldName);
        try {
            return UUID.fromString(normalized);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Поле " + fieldName + " должно быть UUID", ex);
        }
    }

    private List<UUID> parseRequiredUuidList(List<String> values, String fieldName) {
        if (values == null || values.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Поле " + fieldName + " обязательно");
        }

        List<UUID> parsed = new ArrayList<>();
        for (String value : values) {
            if (!StringUtils.hasText(value)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Поле " + fieldName + " содержит пустое значение");
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

    private String normalizeUserName(String rawUserName) {
        String normalized = normalizeOptional(rawUserName);
        if (normalized == null) {
            return "unknown";
        }
        try {
            return URLDecoder.decode(normalized, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return normalized;
        }
    }

    private boolean hasPendingItems(List<BatchItemState> items) {
        return items.stream().anyMatch(item -> ITEM_STATUS_PENDING.equals(item.status()));
    }

    private String computeBatchStatus(List<BatchItemState> items) {
        boolean hasInProgress = items.stream().anyMatch(item -> ITEM_STATUS_PENDING.equals(item.status()) || ITEM_STATUS_IN_PROGRESS.equals(item.status()));
        if (hasInProgress) {
            return BATCH_STATUS_IN_PROGRESS;
        }
        boolean hasManual = items.stream().anyMatch(item -> ITEM_STATUS_MANUAL_CHECK_REQUIRED.equals(item.status()));
        if (hasManual) {
            return BATCH_STATUS_COMPLETED_WITH_MANUAL_ACTION;
        }
        boolean hasFailed = items.stream().anyMatch(item -> ITEM_STATUS_FAILED.equals(item.status()));
        if (hasFailed) {
            return BATCH_STATUS_COMPLETED_WITH_ERRORS;
        }
        return BATCH_STATUS_COMPLETED;
    }

    private List<BatchItemState> deserializeItems(JiraExportBatchEntity batch) {
        if (batch.getItemsJson() == null || batch.getItemsJson().isEmpty()) {
            return List.of();
        }
        return batch.getItemsJson().stream()
            .map(item -> objectMapper.convertValue(item, BatchItemState.class))
            .toList();
    }

    private List<Map<String, Object>> serializeItems(List<BatchItemState> items) {
        return items.stream()
            .map(item -> objectMapper.convertValue(item, MAP_TYPE))
            .toList();
    }

    private void updateBatchItem(UUID batchId, BatchItemState updatedItem) {
        transactionTemplate.executeWithoutResult(status -> {
            JiraExportBatchEntity batch = jiraExportBatchRepository.findById(batchId)
                .orElseThrow(() -> new EntityNotFoundException("Jira export batch not found"));
            List<BatchItemState> items = new ArrayList<>(deserializeItems(batch));
            for (int i = 0; i < items.size(); i++) {
                if (Objects.equals(items.get(i).itemId(), updatedItem.itemId())) {
                    items.set(i, updatedItem);
                    batch.setItemsJson(serializeItems(items));
                    batch.setStatus(computeBatchStatus(items));
                    jiraExportBatchRepository.save(batch);
                    return;
                }
            }
            throw new EntityNotFoundException("Jira export batch item not found");
        });
    }

    private void updateBatchItemByTaskJiraIssueId(UUID taskJiraIssueId, java.util.function.UnaryOperator<BatchItemState> updater) {
        transactionTemplate.executeWithoutResult(status -> {
            TaskJiraIssueEntity issue = taskJiraIssueRepository.findById(taskJiraIssueId)
                .orElseThrow(() -> new EntityNotFoundException("Task Jira issue not found"));
            JiraExportBatchEntity batch = issue.getExportBatch();
            if (batch == null) {
                return;
            }
            List<BatchItemState> items = new ArrayList<>(deserializeItems(batch));
            for (int i = 0; i < items.size(); i++) {
                BatchItemState current = items.get(i);
                if (Objects.equals(current.taskJiraIssueId(), taskJiraIssueId.toString())) {
                    items.set(i, updater.apply(current));
                    batch.setItemsJson(serializeItems(items));
                    batch.setStatus(computeBatchStatus(items));
                    jiraExportBatchRepository.save(batch);
                    return;
                }
            }
        });
    }

    private JiraExportBatchStatusDto toBatchStatus(JiraExportBatchEntity batch) {
        List<BatchItemState> items = deserializeItems(batch);
        int createdItems = 0;
        int failedItems = 0;
        int skippedItems = 0;
        int manualCheckItems = 0;
        int processedItems = 0;
        List<JiraExportBatchItemDto> itemDtos = new ArrayList<>();

        for (BatchItemState item : items) {
            switch (item.status()) {
                case ITEM_STATUS_CREATED -> {
                    createdItems++;
                    processedItems++;
                }
                case ITEM_STATUS_FAILED -> {
                    failedItems++;
                    processedItems++;
                }
                case ITEM_STATUS_SKIPPED -> {
                    skippedItems++;
                    processedItems++;
                }
                case ITEM_STATUS_MANUAL_CHECK_REQUIRED -> {
                    manualCheckItems++;
                    processedItems++;
                }
                default -> {
                }
            }
            itemDtos.add(item.toDto());
        }

        return new JiraExportBatchStatusDto(
            batch.getId().toString(),
            batch.getStatus(),
            batch.getTotalItems(),
            processedItems,
            createdItems,
            failedItems,
            skippedItems,
            manualCheckItems,
            itemDtos
        );
    }

    private void markBatchAsManualRequiredOnFatalError(UUID batchId, Throwable ex) {
        transactionTemplate.executeWithoutResult(status -> {
            JiraExportBatchEntity batch = jiraExportBatchRepository.findById(batchId)
                .orElseThrow(() -> new EntityNotFoundException("Jira export batch not found"));
            List<BatchItemState> items = new ArrayList<>(deserializeItems(batch));
            List<BatchItemState> updated = items.stream()
                .map(item -> {
                    if (ITEM_STATUS_IN_PROGRESS.equals(item.status())) {
                        return item.withManualCheck(
                            "Фоновая обработка batch прервана: " + ex.getMessage()
                                + ". Требуется ручная проверка, задача могла быть создана в Jira",
                            item.jiraRequest()
                        );
                    }
                    if (ITEM_STATUS_PENDING.equals(item.status())) {
                        return item.withFailed("Фоновая обработка batch прервана: " + ex.getMessage(), item.jiraRequest());
                    }
                    return item;
                })
                .toList();
            batch.setItemsJson(serializeItems(updated));
            batch.setStatus(computeBatchStatus(updated));
            jiraExportBatchRepository.save(batch);
        });
    }

    private void logTaskJiraEvent(
        String teamKey,
        String sessionId,
        String userName,
        TaskJiraIssueEntity entity,
        String eventType,
        String action,
        TaskHistoryChangeDto change,
        Map<String, Object> meta
    ) {
        if (entity.getTask() == null || entity.getTask().getId() == null) {
            return;
        }
        apiHistoryService.logEntityEvent(
            teamKey,
            sessionId,
            userName,
            "POST",
            "/jira/issues",
            200,
            TASK_ENTITY_TYPE,
            entity.getTask().getId(),
            eventType,
            action,
            List.of(change),
            meta
        );
    }

    private String participantName(TaskJiraIssueEntity entity) {
        ParticipantEntity participant = entity.getParticipant();
        if (participant == null) {
            return "Участник";
        }
        if (!Hibernate.isInitialized(participant)) {
            return participant.getId() != null ? participant.getId().toString() : "Участник";
        }
        return StringUtils.hasText(participant.getFullName())
            ? participant.getFullName().trim()
            : participant.getId().toString();
    }

    private String issueUrl(String issueKey) {
        return JIRA_PUBLIC_BASE_URL + "/browse/" + issueKey;
    }

    private record SlotReservationResult(UUID reservationId, TaskJiraIssueEntity existingIssue) {
        private static SlotReservationResult created(UUID reservationId) {
            return new SlotReservationResult(reservationId, null);
        }

        private static SlotReservationResult existing(TaskJiraIssueEntity existingIssue) {
            return new SlotReservationResult(null, existingIssue);
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

    private static final class JiraIssueProcessingException extends RuntimeException {
        private final boolean manualCheckRequired;

        private JiraIssueProcessingException(boolean manualCheckRequired, String message) {
            super(message);
            this.manualCheckRequired = manualCheckRequired;
        }

        private JiraIssueProcessingException(boolean manualCheckRequired, String message, Throwable cause) {
            super(message, cause);
            this.manualCheckRequired = manualCheckRequired;
        }

        private boolean manualCheckRequired() {
            return manualCheckRequired;
        }
    }

    private record BatchItemState(
        String itemId,
        String taskJiraIssueId,
        String taskId,
        String taskTitle,
        String participantId,
        String participantName,
        String planningSprintId,
        String planningSprintName,
        BigDecimal storyPoints,
        String status,
        String message,
        String jiraIssueId,
        String jiraIssueKey,
        String jiraIssueUrl,
        JiraIssueRequestPreviewDto jiraRequest
    ) {
        private static BatchItemState pending(
            String taskId,
            String taskTitle,
            String participantId,
            String participantName,
            String planningSprintId,
            String planningSprintName,
            BigDecimal storyPoints,
            JiraIssueRequestPreviewDto jiraRequest
        ) {
            return new BatchItemState(
                UUID.randomUUID().toString(),
                null,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                ITEM_STATUS_PENDING,
                "Ожидает обработки",
                null,
                null,
                null,
                jiraRequest
            );
        }

        private static BatchItemState skipped(
            String taskId,
            String taskTitle,
            String participantId,
            String participantName,
            String planningSprintId,
            String planningSprintName,
            String message
        ) {
            return new BatchItemState(
                UUID.randomUUID().toString(),
                null,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                BigDecimal.ZERO,
                ITEM_STATUS_SKIPPED,
                message,
                null,
                null,
                null,
                null
            );
        }

        private static BatchItemState failed(
            String taskId,
            String taskTitle,
            String participantId,
            String participantName,
            String planningSprintId,
            String planningSprintName,
            String message
        ) {
            return new BatchItemState(
                UUID.randomUUID().toString(),
                null,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                BigDecimal.ZERO,
                ITEM_STATUS_FAILED,
                message,
                null,
                null,
                null,
                null
            );
        }

        private BatchItemState withStatus(String nextStatus, String nextMessage) {
            return new BatchItemState(
                itemId,
                taskJiraIssueId,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                nextStatus,
                nextMessage,
                jiraIssueId,
                jiraIssueKey,
                jiraIssueUrl,
                jiraRequest
            );
        }

        private BatchItemState withTaskJiraIssueId(String value) {
            return new BatchItemState(
                itemId,
                value,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                status,
                message,
                jiraIssueId,
                jiraIssueKey,
                jiraIssueUrl,
                jiraRequest
            );
        }

        private BatchItemState withCreated(
            String nextMessage,
            String nextJiraIssueId,
            String nextJiraIssueKey,
            String nextJiraIssueUrl,
            JiraIssueRequestPreviewDto nextJiraRequest
        ) {
            return new BatchItemState(
                itemId,
                taskJiraIssueId,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                ITEM_STATUS_CREATED,
                nextMessage,
                nextJiraIssueId,
                nextJiraIssueKey,
                nextJiraIssueUrl,
                nextJiraRequest
            );
        }

        private BatchItemState withExistingCreated(String nextJiraIssueId, String nextJiraIssueKey, String nextJiraIssueUrl) {
            return new BatchItemState(
                itemId,
                taskJiraIssueId,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                ITEM_STATUS_SKIPPED,
                "Jira-задача уже заведена",
                nextJiraIssueId,
                nextJiraIssueKey,
                nextJiraIssueUrl,
                jiraRequest
            );
        }

        private BatchItemState withManualCheck(String nextMessage, JiraIssueRequestPreviewDto nextJiraRequest) {
            return new BatchItemState(
                itemId,
                taskJiraIssueId,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                ITEM_STATUS_MANUAL_CHECK_REQUIRED,
                nextMessage,
                jiraIssueId,
                jiraIssueKey,
                jiraIssueUrl,
                nextJiraRequest
            );
        }

        private BatchItemState withFailed(String nextMessage, JiraIssueRequestPreviewDto nextJiraRequest) {
            return new BatchItemState(
                itemId,
                taskJiraIssueId,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                ITEM_STATUS_FAILED,
                nextMessage,
                jiraIssueId,
                jiraIssueKey,
                jiraIssueUrl,
                nextJiraRequest
            );
        }

        private BatchItemState withManualConfirmation(
            String nextStatus,
            String nextMessage,
            String nextJiraIssueKey,
            String nextJiraIssueUrl
        ) {
            return new BatchItemState(
                itemId,
                taskJiraIssueId,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                storyPoints,
                nextStatus,
                nextMessage,
                nextJiraIssueKey,
                nextJiraIssueKey,
                nextJiraIssueUrl,
                jiraRequest
            );
        }

        private JiraExportBatchItemDto toDto() {
            return new JiraExportBatchItemDto(
                itemId,
                taskJiraIssueId,
                taskId,
                taskTitle,
                participantId,
                participantName,
                planningSprintId,
                planningSprintName,
                status,
                message,
                jiraIssueId,
                jiraIssueKey,
                jiraIssueUrl,
                jiraRequest
            );
        }
    }
}
