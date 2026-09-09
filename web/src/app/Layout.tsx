import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet } from 'react-router';

import { ConnectButton } from '../components/ConnectButton';
import { routes } from './paths';

const nav = [
  { to: routes.marketplace, label: 'Marketplace', end: true },
  { to: routes.publisher, label: 'Publisher', end: false },
  { to: routes.advertiser, label: 'Advertiser', end: false },
];

export function Layout() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="static"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            variant="h6"
            component={NavLink}
            to={routes.marketplace}
            sx={{ color: 'inherit', textDecoration: 'none' }}
          >
            OpenAd
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexGrow: 1 }}>
            {nav.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end={item.end}
                color="inherit"
                sx={{ '&.active': { color: 'primary.main', fontWeight: 600 } }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          <ConnectButton />
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
