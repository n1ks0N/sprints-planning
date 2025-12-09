import React from "react";
import { FormControl, InputLabel, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import type { TeamOption } from "../teams";

type Props = {
  teams: TeamOption[];
  value: string;
  onChange: (teamKey: string) => void;
};

export default function TeamSwitcher({ teams, value, onChange }: Props) {
  const handleChange = (event: SelectChangeEvent<string>) => {
    onChange(event.target.value);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 180 }}>
      <InputLabel id="team-switcher-label">Команда</InputLabel>
      <Select
        labelId="team-switcher-label"
        value={value}
        label="Команда"
        onChange={handleChange}
        renderValue={(selected) =>
          teams.find((team) => team.key === selected)?.label ?? selected
        }
      >
        {teams.map((team) => (
          <MenuItem key={team.key} value={team.key}>
            {team.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
