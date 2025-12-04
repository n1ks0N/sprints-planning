package com.sber.isu.sprints_planning.service;

import com.sber.isu.sprints_planning.dto.ApiCallHistoryDto;
import com.sber.isu.sprints_planning.dto.ApiSessionHistoryDto;
import com.sber.isu.sprints_planning.mapper.DtoMapper;
import com.sber.isu.sprints_planning.model.ApiCallHistoryEntity;
import com.sber.isu.sprints_planning.repository.ApiCallHistoryRepository;
import com.sber.isu.sprints_planning.util.ApiActionDescriptionResolver;
import jakarta.servlet.http.HttpServletRequest;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ApiHistoryService {

    private static final Logger logger = LoggerFactory.getLogger(ApiHistoryService.class);

    private final ApiCallHistoryRepository historyRepository;
    private final ApiActionDescriptionResolver actionDescriptionResolver;

    public ApiHistoryService(ApiCallHistoryRepository historyRepository,
        ApiActionDescriptionResolver actionDescriptionResolver) {
        this.historyRepository = historyRepository;
        this.actionDescriptionResolver = actionDescriptionResolver;
    }

    @Transactional
    public void log(HttpServletRequest request, int statusCode) {
        String sessionId = request.getHeader("X-Session-Id");
        String userName = request.getHeader("X-User-Name");
        if (sessionId == null || sessionId.isBlank()) {
            return;
        }

        ApiCallHistoryEntity entity = new ApiCallHistoryEntity();
        entity.setSessionId(sessionId);
        entity.setUserName(userName == null || userName.isBlank() ? "unknown" : userName);
        entity.setHttpMethod(request.getMethod());
        entity.setPath(extractPath(request));
        entity.setAction(actionDescriptionResolver.resolve(entity.getHttpMethod(), entity.getPath()));
        entity.setStatusCode(statusCode);
        entity.setCreatedAt(OffsetDateTime.now());

        try {
            historyRepository.save(entity);
        } catch (Exception e) {
            logger.warn("Failed to persist API call history", e);
        }
    }

    @Transactional(readOnly = true)
    public List<ApiSessionHistoryDto> getHistory() {
        List<ApiCallHistoryEntity> items = historyRepository.findAll(
            Sort.by(Sort.Direction.DESC, "createdAt"));

        List<ApiCallHistoryEntity> actions = items.stream()
            .filter(this::isAction)
            .sorted(Comparator.comparing(ApiCallHistoryEntity::getCreatedAt).reversed())
            .toList();

        List<ApiSessionHistoryDto> result = new ArrayList<>();
        List<ApiCallHistoryEntity> current = new ArrayList<>();
        String currentSession = null;
        String currentUser = null;

        for (ApiCallHistoryEntity entity : actions) {
            boolean sameGroup = currentSession != null
                && currentUser != null
                && currentSession.equals(entity.getSessionId())
                && currentUser.equals(entity.getUserName());

            if (!sameGroup && !current.isEmpty()) {
                result.add(toSessionDto(current));
                current = new ArrayList<>();
            }

            currentSession = entity.getSessionId();
            currentUser = entity.getUserName();
            current.add(entity);
        }

        if (!current.isEmpty()) {
            result.add(toSessionDto(current));
        }

        return result;
    }

    private ApiSessionHistoryDto toSessionDto(List<ApiCallHistoryEntity> entities) {
        List<ApiCallHistoryEntity> sorted = entities.stream()
            .sorted(Comparator.comparing(ApiCallHistoryEntity::getCreatedAt).reversed())
            .toList();
        ApiCallHistoryEntity latest = sorted.get(0);
        List<ApiCallHistoryDto> actions = sorted.stream()
            .map(DtoMapper::toApiCallHistoryDto)
            .toList();
        return new ApiSessionHistoryDto(latest.getSessionId(), latest.getUserName(),
            latest.getCreatedAt(), actions);
    }

    private boolean isAction(ApiCallHistoryEntity entity) {
        return !"GET".equalsIgnoreCase(entity.getHttpMethod());
    }

    private String extractPath(HttpServletRequest request) {
        String contextPath = request.getContextPath();
        String uri = request.getRequestURI();
        if (contextPath != null && !contextPath.isBlank() && uri.startsWith(contextPath)) {
            return uri.substring(contextPath.length());
        }
        return uri;
    }
}
