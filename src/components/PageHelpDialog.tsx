import React from "react";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Tooltip,
} from "@mui/material";

export type PageHelpContent = {
  title: string;
  description: string;
  bullets: string[];
};

type PageHelpDialogProps = {
  content: PageHelpContent;
};

export default function PageHelpDialog({ content }: PageHelpDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Tooltip title="Справка">
        <IconButton
          color="primary"
          aria-label="Открыть справку по странице"
          onClick={() => setOpen(true)}
        >
          <HelpOutlineIcon />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {content.title}
          <IconButton
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            edge="end"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            {content.description}
          </DialogContentText>
          <List dense>
            {content.bullets.map((item) => (
              <ListItem key={item} sx={{ py: 0.5 }}>
                <ListItemText primary={item} />
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </>
  );
}
