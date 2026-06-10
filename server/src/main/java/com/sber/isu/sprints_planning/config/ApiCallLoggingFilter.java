package com.sber.isu.sprints_planning.config;

import com.sber.isu.sprints_planning.service.ApiHistoryService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ApiCallLoggingFilter extends OncePerRequestFilter {

    private final ApiHistoryService apiHistoryService;

    public ApiCallLoggingFilter(ApiHistoryService apiHistoryService) {
        this.apiHistoryService = apiHistoryService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri.startsWith(request.getContextPath() + "/actuator");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
        FilterChain filterChain) throws ServletException, IOException {
        filterChain.doFilter(request, response);
        apiHistoryService.logAsync(
            request.getMethod(),
            request.getRequestURI(),
            request.getContextPath(),
            request.getHeader("X-Session-Id"),
            request.getHeader("X-User-Name"),
            response.getStatus()
        );
    }
}
