package com.sber.isu.sprints_planning.dto.request;

import java.util.List;

public record TaskJiraLinksUpdateRequest(
    String storyUrl,
    List<TaskParticipantJiraLinkUpdateRequest> participantLinks
) {
}
