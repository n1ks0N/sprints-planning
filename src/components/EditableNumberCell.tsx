import * as React from "react";
import { Box, InputBase, Typography } from "@mui/material";

export type EditableNumberCellProps = {
  value: number;
  onChange: (next: number) => void;
  onCommit?: (next: number) => void;
  title?: string;
  dataTestId?: string;
};

const toInt = (value: number) =>
  Number.isFinite(value) ? Math.round(value) : 0;

export default function EditableNumberCell({
  value,
  onChange,
  onCommit,
  title,
  dataTestId,
}: EditableNumberCellProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? 0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const prevEditingRef = React.useRef(editing);
  const inputId = React.useId();

  React.useEffect(() => {
    if (!editing) {
      setDraft(value ?? 0);
    }
  }, [editing, value]);

  React.useEffect(() => {
    if (editing && !prevEditingRef.current && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
    prevEditingRef.current = editing;
  }, [editing]);

  const handleStart = React.useCallback(() => {
    setEditing(true);
  }, []);

  const handleClose = React.useCallback(() => {
    if (!editing) return;
    setEditing(false);
    const next = Number.isFinite(draft) ? draft : 0;
    if (next !== value) {
      onChange(next);
      onCommit?.(next);
    }
  }, [draft, editing, onChange, onCommit, value]);

  if (!editing) {
    return (
      <Box
        sx={{
          minWidth: 48,
          maxWidth: 72,
          width: "100%",
          mx: "auto",
          textAlign: "center",
          cursor: "pointer",
        }}
        title={title || "Клик для редактирования"}
        onClick={handleStart}
        data-testid={dataTestId}
      >
        <Typography component="span">{toInt(value)}</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minWidth: 48,
        maxWidth: 72,
        width: "100%",
        mx: "auto",
      }}
    >
      <InputBase
        inputRef={inputRef}
        type="number"
        autoFocus
        value={Number.isFinite(draft) ? draft : 0}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDraft(Number.isFinite(v) ? v : 0);
        }}
        onBlur={handleClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        sx={{
          textAlign: "center",
          px: 0.5,
          borderRadius: 1,
          bgcolor: "background.paper",
          outline: "1px solid",
          outlineColor: "divider",
          width: "100%",
          "& input": {
            minWidth: 0,
            width: "100%",
            textAlign: "center",
            px: 0,
          },
        }}
        inputProps={{
          id: inputId,
          name: title || "allocation-value",
          "aria-label": title || "Значение нагрузки",
          "data-testid": dataTestId,
        }}
      />
    </Box>
  );
}
