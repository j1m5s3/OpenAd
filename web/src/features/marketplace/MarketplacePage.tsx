import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { formatDuration, formatUsdc, shortAddress } from '../../lib/format';
import { useSlots } from './api';

const KIND_LABEL: Record<number, string> = {
  0: 'Web display',
  1: 'Newsletter',
  2: 'Physical',
  3: 'Other',
};

export function MarketplacePage() {
  const slots = useSlots();

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Marketplace</Typography>
        <Typography color="text.secondary">
          Slots with open terms. Prices are Dutch auctions per period; the first buyer wins.
        </Typography>
      </Stack>

      {slots.isError && (
        <Alert severity="error">
          Could not reach the API ({(slots.error as Error).message}). Is{' '}
          <code>uv run uvicorn openad.main:app</code> running?
        </Alert>
      )}

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Slot</TableCell>
              <TableCell>Domain</TableCell>
              <TableCell>Format</TableCell>
              <TableCell>Period</TableCell>
              <TableCell align="right">Start → floor</TableCell>
              <TableCell>Publisher</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slots.isPending &&
              [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  {[...Array<number>(6)].map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {slots.data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    No slots indexed yet. Deploy the contracts and run the indexer (docs/ROADMAP.md
                    Phase 1–2).
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {slots.data?.items.map((slot) => (
              <TableRow key={slot.slotId} hover>
                <TableCell>#{slot.slotId}</TableCell>
                <TableCell>{slot.domain}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={`${KIND_LABEL[slot.kind] ?? slot.kind} · ${slot.width}×${slot.height}`}
                  />
                </TableCell>
                <TableCell>
                  {slot.periodSeconds ? formatDuration(slot.periodSeconds) : '—'}
                </TableCell>
                <TableCell align="right">
                  {slot.terms
                    ? `${formatUsdc(BigInt(slot.terms.startPrice), { symbol: false })} → ${formatUsdc(BigInt(slot.terms.floorPrice))}`
                    : 'no terms'}
                </TableCell>
                <TableCell>{shortAddress(slot.owner)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
