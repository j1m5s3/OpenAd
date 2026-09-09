import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useAccount } from 'wagmi';

// ROADMAP 3.4: register media/NFT creatives (client-side keccak256 of the bytes), request
// approvals, browse and buy periods (quote via Marketplace.quote, buy via buy_with_permit),
// leases calendar, delivery report from serve_events.
export function AdvertiserPage() {
  const { isConnected } = useAccount();

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Advertiser</Typography>
      {!isConnected && (
        <Alert severity="info">Connect a wallet to register creatives and buy periods.</Alert>
      )}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">Coming in Phase 3</Typography>
        <Typography color="text.secondary">
          Register creatives, request publisher approval, buy periods in one transaction with a USDC
          permit, and see delivery reports.
        </Typography>
      </Paper>
    </Stack>
  );
}
