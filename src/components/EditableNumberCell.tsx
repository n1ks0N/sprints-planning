import * as React from "react";
import { Box, InputBase, Typography } from "@mui/material";

export type EditableNumberCellProps = {
  value: number;
  onCommit?: (next: number) => void;
  title?: string;
};

const toInt = (value: number) =>
  Number.isFinite(value) ? Math.round(value) : 0;

export default function EditableNumberCell({
  value,
  onCommit,
  title,
}: EditableNumberCellProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<string>(
    Number.isFinite(value) ? String(value) : "0"
  );
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const prevEditingRef = React.useRef(editing);
  const inputId = React.useId();

  React.useEffect(() => {
    if (!editing) {
      setDraft(Number.isFinite(value) ? String(value) : "0");
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

  const commitDraft = React.useCallback(() => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? parsed : 0;
    if (next !== value) {
      onCommit?.(next);
    }
  }, [draft, onCommit, value]);

  const handleClose = React.useCallback(() => {
    if (!editing) return;
    setEditing(false);
    commitDraft();
  }, [commitDraft, editing]);

  const handleCancel = React.useCallback(() => {
    setDraft(Number.isFinite(value) ? String(value) : "0");
    setEditing(false);
  }, [value]);

  if (!editing) {
    return (
      <Box
        sx={{
          minWidth: 48,
          textAlign: "center",
          cursor: "pointer",
        }}
        title={title || "Клик для редактирования"}
        onClick={handleStart}
      >
        <Typography component="span">{toInt(value)}</Typography>
      </Box>
    );
  }

  return (
    <InputBase
      inputRef={inputRef}
      type="number"
      autoFocus
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={handleClose}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleClose();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          handleCancel();
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
      }}
      inputProps={{
        id: inputId,
        name: title || "allocation-value",
        "aria-label": title || "Значение нагрузки",
      }}
    />
  );
}
