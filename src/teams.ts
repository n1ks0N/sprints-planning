export type TeamOption = {
  key: string;
  label: string;
};

export const DEFAULT_TEAM_KEY = "customlab";

export const TEAM_OPTIONS: TeamOption[] = [
  { key: DEFAULT_TEAM_KEY, label: "CustomLab" },
];

export const findTeamByKey = (key: string | undefined | null): TeamOption => {
  if (!key) return TEAM_OPTIONS[0];
  const normalized = key.trim().toLowerCase();
  return TEAM_OPTIONS.find((team) => team.key === normalized) ?? TEAM_OPTIONS[0];
};
