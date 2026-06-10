export const TAB_TITLE_SUFFIX = "Сервис планирования";

export const PAGE_TITLES = {
  backlog: "Бэклог",
  capacity: "Нагрузка",
  participantWork: "По сотрудникам",
  timeSetup: "Кварталы/Спринты",
  team: "Участники",
  releases: "Релизы",
  history: "История",
  planning: "Планирование",
  teams: "Команды",
} as const;

export const buildTabTitle = (pageTitle: string) =>
  `${pageTitle} | ${TAB_TITLE_SUFFIX}`;
