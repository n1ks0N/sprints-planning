
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#00A000' },
    secondary: { main: '#1F6FEB' },
    background: { default: '#f8fafb' },
  },
  shape: { borderRadius: 12 },
});

export default theme;
