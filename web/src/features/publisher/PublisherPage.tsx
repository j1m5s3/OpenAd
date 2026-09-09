import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useAccount } from 'wagmi';

import { hasProtocol } from '../../lib/deployments';
import { targetChainId } from '../../lib/wagmi';

// ROADMAP 3.3: mint slot · set calendar · set terms · approvals inbox · allowlist · house ad ·
// domain verification · earnings. Each becomes a component under ./components with wagmi
// writes against getContract(targetChainId, 'AdSlot' | 'Marketplace' | 'CreativeRegistry').
export function PublisherPage() {
  const { isConnected } = useAccount();
  const deployed = hasProtocol(targetChainId);

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Publisher</Typography>
      {!isConnected && <Alert severity="info">Connect the wallet that owns your slots.</Alert>}
      {!deployed && (
        <Alert severity="warning">
          Protocol contracts are not deployed on chain {targetChainId} (no deployments artifact).
          See docs/ROADMAP.md Phase 1.
        </Alert>
      )}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Coming in Phase 3</Typography>
        <Typography color="text.secondary">
          Mint a slot, set its calendar and terms, review approval requests, manage your allowlist,
          configure a house ad, verify your domain, and track earnings.
        </Typography>
      </Paper>
    </Stack>
  );
}
