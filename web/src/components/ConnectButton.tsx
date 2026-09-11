import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import type { Connector } from 'wagmi';
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { shortAddress } from '../lib/format';
import { targetChainId } from '../lib/wagmi';

function visibleConnectors(connectors: readonly Connector[]): Connector[] {
  const hasNamedInjected = connectors.some(
    (c) => c.type === 'injected' && c.id !== 'injected',
  );
  return connectors.filter((c) => !(hasNamedInjected && c.id === 'injected'));
}

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connectAsync, isPending, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const options = visibleConnectors(connectors);

  async function onPick(connector: Connector) {
    setMessage(null);
    reset();
    try {
      // Must run in this click turn so the wallet can open its prompt. Do not
      // unmount the menu first — that drops the user-gesture on some browsers.
      await connectAsync({ connector });
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Wallet connection failed.';
      setMessage(
        /provider|not found|no injected/i.test(text)
          ? 'No browser wallet found. Install MetaMask (or another injected wallet) and refresh.'
          : text,
      );
    } finally {
      setAnchor(null);
    }
  }

  if (isConnected && address) {
    const wrongChain = chainId !== targetChainId;
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        {wrongChain ? (
          <Chip
            color="warning"
            size="small"
            label={`Switch to chain ${targetChainId}`}
            onClick={() => switchChain({ chainId: targetChainId })}
          />
        ) : (
          <Chip size="small" variant="outlined" label={`chain ${chainId}`} />
        )}
        <Button variant="outlined" onClick={() => disconnect()}>
          {shortAddress(address)}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button variant="contained" disabled={isPending} onClick={(e) => setAnchor(e.currentTarget)}>
        Connect wallet
      </Button>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {options.length === 0 && (
          <MenuItem disabled>No wallet connectors available</MenuItem>
        )}
        {options.map((connector) => (
          <MenuItem
            key={connector.uid}
            disabled={isPending}
            onClick={() => {
              void onPick(connector);
            }}
          >
            {connector.name}
          </MenuItem>
        ))}
      </Menu>
      {message && (
        <Alert severity="error" onClose={() => setMessage(null)} sx={{ py: 0 }}>
          {message}
        </Alert>
      )}
    </Stack>
  );
}
