import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { shortAddress } from '../lib/format';
import { targetChainId } from '../lib/wagmi';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

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
    <>
      <Button variant="contained" disabled={isPending} onClick={(e) => setAnchor(e.currentTarget)}>
        Connect wallet
      </Button>
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {connectors.map((connector) => (
          <MenuItem
            key={connector.uid}
            onClick={() => {
              setAnchor(null);
              connect({ connector });
            }}
          >
            {connector.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
