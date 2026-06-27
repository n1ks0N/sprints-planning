package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.ApiCallHistoryDto;
import com.sber.isu.sprints_planning.dto.ApiSessionHistoryDto;
import com.sber.isu.sprints_planning.dto.TaskHistoryChangeDto;
import com.sber.isu.sprints_planning.dto.TaskHistoryItemDto;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.repository.ApiHistorySessionSummaryProjection;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import com.sber.isu.sprints_planning.repository.TeamRepository;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class ApiHistoryService {

    private static final Logger logger = LoggerFactory.getLogger(ApiHistoryService.class);
    private static final String TASK_ENTITY_TYPE = "task";

    private final ApiCallHistoryRepository historyRepository;
    private final ApiActionDescriptionResolver actionDescriptionResolver;
    private final TeamRepository teamRepository;
    private final Executor apiHistoryExecutor;
    private final java.util.Set<String> teamsBeingDeleted = ConcurrentHashMap.newKeySet();

    public ApiHistoryService(ApiCallHistoryRepository historyRepository,
        ApiActionDescriptionResolver actionDescriptionResolver,
        TeamRepository teamRepository,
        @Qualifier("apiHistoryExecutor") Executor apiHistoryExecutor) {
        this.historyRepository = historyRepository;
        this.actionDescriptionResolver = actionDescriptionResolver;
        this.teamRepository = teamRepository;
        this.apiHistoryExecutor = apiHistoryExecutor;
    }

    public void logAsync(
        String httpMethod,
        String requestUri,
        String contextPath,
        String sessionId,
        String rawUserName,
        int statusCode
    ) {
        String userName = decodeUserName(rawUserName);
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }
        ApiCallLogEntry entry = new ApiCallLogEntry(
            sessionId,
            userName,
            httpMethod,
            extractPath(requestUri, contextPath),
            statusCode
        );
        try {
            apiHistoryExecutor.execute(() -> persistApiCall(entry));
        } catch (RuntimeException e) {
            logger.warn("Failed to enqueue API call history persistence", e);
        }
    }

    @Transactional
    private void persistApiCall(ApiCallLogEntry entry) {
        String teamKey = resolveTeamKey(entry.path());
        if (teamKey != null && teamsBeingDeleted.contains(teamKey)) {
            return;
        }

        ApiCallHistoryEntity entity = new ApiCallHistoryEntity();
        entity.setSessionId(entry.sessionId());
        entity.setUserName(entry.userName() == null || entry.userName().isBlank() ? "unknown" : entry.userName());
        entity.setHttpMethod(entry.httpMethod());
        entity.setPath(entry.path());
        entity.setAction(actionDescriptionResolver.resolve(entity.getHttpMethod(), entity.getPath()));
        entity.setStatusCode(entry.statusCode());
        entity.setCreatedAt(OffsetDateTime.now());
        entity.setTeamKey(teamKey);

        try {
            historyRepository.save(entity);
        } catch (Exception e) {
            logger.warn("Failed to persist API call history", e);
        }
    }

    public void markTeamDeletionInProgress(String teamKey) {
        if (teamKey == null || teamKey.isBlank()) {
            return;
        }
        teamsBeingDeleted.add(teamKey);
    }

    public void clearTeamDeletionInProgress(String teamKey) {
        if (teamKey == null || teamKey.isBlank()) {
            return;
        }
        teamsBeingDeleted.remove(teamKey);
    }

    @Transactional(readOnly = true)
    public List<ApiSessionHistoryDto> getHistory(String teamKey, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, size);
        Pageable pageable = PageRequest.of(safePage, safeSize);
        Page<ApiHistorySessionSummaryProjection> summaryPage = historyRepository.findActionSessionSummaries(teamKey, pageable);
        if (summaryPage.isEmpty()) {
            return List.of();
        }

        LinkedHashMap<String, SessionSummary> orderedSessions = new LinkedHashMap<>();
        for (ApiHistorySessionSummaryProjection summary : summaryPage.getContent()) {
            orderedSessions.put(sessionKey(summary.getSessionId(), summary.getUserName()), new SessionSummary(
                summary.getSessionId(),
                summary.getUserName(),
                toOffsetDateTime(summary.getLatestCreatedAt())
            ));
        }
        List<ApiCallHistoryEntity> actions = historyRepository.findActionHistoryByTeamKeyAndSessionIds(
            teamKey,
            orderedSessions.values().stream().map(SessionSummary::sessionId).distinct().toList()
        );
        Map<String, List<ApiCallHistoryEntity>> actionsBySession = new LinkedHashMap<>();
        orderedSessions.keySet().forEach(key -> actionsBySession.put(key, new ArrayList<>()));
        for (ApiCallHistoryEntity entity : actions) {
            String key = sessionKey(entity.getSessionId(), entity.getUserName());
            List<ApiCallHistoryEntity> sessionActions = actionsBySession.get(key);
            if (sessionActions != null) {
                sessionActions.add(entity);
            }
        }

        return orderedSessions.entrySet().stream()
            .map(entry -> toSessionDto(entry.getValue(), actionsBySession.getOrDefault(entry.getKey(), List.of())))
            .toList();
    }

    @Transactional(readOnly = true)
    public Page<TaskHistoryItemDto> getTaskHistory(String teamKey, UUID taskId, int page, int size) {
        int safePage = Math.max(0, page);
        int safeSize = Math.max(1, size);
        Pageable pageable = PageRequest.of(safePage, safeSize, Sort.by(Sort.Direction.DESC, "createdAt"));
        return historyRepository
            .findAllByTeamKeyAndEntityTypeAndEntityId(teamKey, TASK_ENTITY_TYPE, taskId, pageable)
            .map(this::toTaskHistoryItemDto);
    }

    @Transactional
    public void logTaskChange(
        String teamKey,
        UUID taskId,
        String eventType,
        String action,
        List<TaskHistoryChangeDto> changes,
        Map<String, Object> meta
    ) {
        HttpServletRequest request = currentRequest();
        if (request == null || taskId == null) {
            return;
        }

        String sessionId = request.getHeader("X-Session-Id");
        String userName = decodeUserName(request.getHeader("X-User-Name"));
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }

        ApiCallHistoryEntity entity = new ApiCallHistoryEntity();
        entity.setSessionId(sessionId);
        entity.setUserName(userName == null || userName.isBlank() ? "unknown" : userName);
        entity.setHttpMethod(request.getMethod());
        String path = extractPath(request);
        entity.setPath(path);
        if (action != null && !action.isBlank()) {
            entity.setAction(action);
        } else {
            entity.setAction(actionDescriptionResolver.resolve(entity.getHttpMethod(), path));
        }
        entity.setStatusCode(200);
        entity.setCreatedAt(OffsetDateTime.now());
        entity.setTeamKey(teamKey);
        entity.setEntityType(TASK_ENTITY_TYPE);
        entity.setEntityId(taskId);
        entity.setEventType(eventType);
        entity.setChangesJson(buildChangesJson(changes));
        entity.setMetaJson(meta == null ? Map.of() : new LinkedHashMap<>(meta));

        try {
            historyRepository.save(entity);
        } catch (Exception e) {
            logger.warn("Failed to persist task change history", e);
        }
    }

    @Transactional
    public void logEntityEvent(
        String teamKey,
        String sessionId,
        String userName,
        String httpMethod,
        String path,
        int statusCode,
        String entityType,
        UUID entityId,
        String eventType,
        String action,
        List<TaskHistoryChangeDto> changes,
        Map<String, Object> meta
    ) {
        if (sessionId == null || sessionId.isBlank() || entityId == null) {
            return;
        }

        ApiCallHistoryEntity entity = new ApiCallHistoryEntity();
        entity.setSessionId(sessionId);
        entity.setUserName(userName == null || userName.isBlank() ? "unknown" : userName);
        entity.setHttpMethod(httpMethod == null || httpMethod.isBlank() ? "SYSTEM" : httpMethod);
        entity.setPath(path == null || path.isBlank() ? "/system" : path);
        entity.setAction(action == null || action.isBlank()
            ? actionDescriptionResolver.resolve(entity.getHttpMethod(), entity.getPath())
            : action);
        entity.setStatusCode(statusCode);
        entity.setCreatedAt(OffsetDateTime.now());
        entity.setTeamKey(teamKey);
        entity.setEntityType(entityType);
        entity.setEntityId(entityId);
        entity.setEventType(eventType);
        entity.setChangesJson(buildChangesJson(changes));
        entity.setMetaJson(meta == null ? Map.of() : new LinkedHashMap<>(meta));

        try {
            historyRepository.save(entity);
        } catch (Exception e) {
            logger.warn("Failed to persist custom entity history", e);
        }
    }

    private String decodeUserName(String rawHeader) {
        if (rawHeader == null || rawHeader.isBlank()) {
            return rawHeader;
        }

        try {
            return URLDecoder.decode(rawHeader, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            logger.warn("Failed to decode user name header", ex);
            return rawHeader;
        }
    }

    private OffsetDateTime toOffsetDateTime(Instant value) {
        return value == null ? null : OffsetDateTime.ofInstant(value, ZoneOffset.UTC);
    }

    private ApiSessionHistoryDto toSessionDto(SessionSummary summary, List<ApiCallHistoryEntity> entities) {
        if (entities.isEmpty()) {
            return new ApiSessionHistoryDto(summary.sessionId(), summary.userName(), summary.latestCreatedAt(), List.of());
        }
        List<ApiCallHistoryEntity> sorted = entities.stream()
            .sorted(Comparator.comparing(ApiCallHistoryEntity::getCreatedAt).reversed())
            .toList();
        ApiCallHistoryEntity latest = sorted.get(0);
        List<ApiCallHistoryEntity> trimmed = collapseConsecutiveActions(sorted);
        List<ApiCallHistoryDto> actions = trimmed.stream()
            .map(DtoMapper::toApiCallHistoryDto)
            .toList();
        return new ApiSessionHistoryDto(latest.getSessionId(), latest.getUserName(),
            latest.getCreatedAt(), actions);
    }

    private List<ApiCallHistoryEntity> collapseConsecutiveActions(List<ApiCallHistoryEntity> actions) {
        if (actions.isEmpty()) {
            return actions;
        }

        List<ApiCallHistoryEntity> result = new ArrayList<>();
        ApiCallHistoryEntity runFirst = actions.get(0);
        ApiCallHistoryEntity runLast = runFirst;
        int runLength = 1;

        for (int i = 1; i < actions.size(); i++) {
            ApiCallHistoryEntity current = actions.get(i);
            if (isSameAction(runLast, current)) {
                runLast = current;
                runLength++;
                continue;
            }

            result.add(runFirst);
            if (runLength > 1) {
                result.add(runLast);
            }

            runFirst = current;
            runLast = current;
            runLength = 1;
        }

        result.add(runFirst);
        if (runLength > 1) {
            result.add(runLast);
        }

        return result;
    }

    private boolean isSameAction(ApiCallHistoryEntity left, ApiCallHistoryEntity right) {
        if (left == null || right == null) {
            return false;
        }
        return left.getHttpMethod().equalsIgnoreCase(right.getHttpMethod())
            && left.getPath().equalsIgnoreCase(right.getPath());
    }

    private TaskHistoryItemDto toTaskHistoryItemDto(ApiCallHistoryEntity entity) {
        List<TaskHistoryChangeDto> changes = extractChanges(entity.getChangesJson());
        Map<String, Object> meta = entity.getMetaJson() == null
            ? Map.of()
            : new LinkedHashMap<>(entity.getMetaJson());

        return new TaskHistoryItemDto(
            entity.getId(),
            entity.getEntityId() != null ? entity.getEntityId().toString() : null,
            entity.getEventType(),
            entity.getAction(),
            entity.getUserName(),
            entity.getSessionId(),
            entity.getStatusCode(),
            entity.getCreatedAt(),
            changes,
            meta
        );
    }

    private List<TaskHistoryChangeDto> extractChanges(Map<String, Object> changesJson) {
        if (changesJson == null || changesJson.isEmpty()) {
            return List.of();
        }
        Object rawChanges = changesJson.get("changes");
        if (!(rawChanges instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        List<TaskHistoryChangeDto> result = new ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> changeMap)) {
                continue;
            }
            String field = asString(changeMap.get("field"));
            String label = asString(changeMap.get("label"));
            Object before = changeMap.get("before");
            Object after = changeMap.get("after");
            result.add(new TaskHistoryChangeDto(field, label, before, after));
        }
        return result;
    }

    private Map<String, Object> buildChangesJson(List<TaskHistoryChangeDto> changes) {
        List<Map<String, Object>> list = new ArrayList<>();
        if (changes != null) {
            for (TaskHistoryChangeDto change : changes) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("field", change.field());
                item.put("label", change.label());
                item.put("before", change.before());
                item.put("after", change.after());
                list.add(item);
            }
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", 1);
        payload.put("changes", list);
        return payload;
    }

    private String asString(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof String stringValue) {
            return stringValue;
        }
        return String.valueOf(value);
    }

    private HttpServletRequest currentRequest() {
        var requestAttributes = RequestContextHolder.getRequestAttributes();
        if (!(requestAttributes instanceof ServletRequestAttributes servletAttributes)) {
            return null;
        }
        return servletAttributes.getRequest();
    }

    private String extractPath(HttpServletRequest request) {
        return extractPath(request.getRequestURI(), request.getContextPath());
    }

    private String extractPath(String uri, String contextPath) {
        if (uri == null) {
            return null;
        }
        if (contextPath != null && !contextPath.isBlank() && uri.startsWith(contextPath)) {
            return uri.substring(contextPath.length());
        }
        return uri;
    }

    private String resolveTeamKey(String path) {
        if (path == null) {
            return null;
        }

        String[] segments = path.split("/");
        for (String segment : segments) {
            if (segment == null || segment.isBlank()) {
                continue;
            }

            // Some endpoints (e.g. "/teams" list, swagger, actuator) do not include
            // a team slug in the URL. For those, record history without binding to
            // any team.
            if (isNonTeamSegment(segment)) {
                return null;
            }

            try {
                String normalized = com.sber.isu.sprints_planning.util.TeamKeyNormalizer.normalize(segment);
                if (teamRepository.existsById(normalized)) {
                    return normalized;
                }
                return null;
            } catch (Exception ex) {
                return null;
            }
        }
        return null;
    }

    private boolean isNonTeamSegment(String segment) {
        String normalized = segment.toLowerCase();
        return normalized.equals("teams")
            || normalized.equals("swagger-ui")
            || normalized.equals("swagger-ui.html")
            || normalized.equals("v3")
            || normalized.equals("api-docs")
            || normalized.equals("actuator");
    }

    private String sessionKey(String sessionId, String userName) {
        return (sessionId == null ? "" : sessionId) + '\u0000' + (userName == null ? "" : userName);
    }

    private record ApiCallLogEntry(
        String sessionId,
        String userName,
        String httpMethod,
        String path,
        int statusCode
    ) {
    }

    private record SessionSummary(
        String sessionId,
        String userName,
        OffsetDateTime latestCreatedAt
    ) {
    }
}
