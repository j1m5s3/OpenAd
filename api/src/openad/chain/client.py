"""AsyncWeb3 factory. Indexer only."""

from __future__ import annotations

from web3 import AsyncHTTPProvider, AsyncWeb3


def make_web3(rpc_url: str, *, timeout: float = 30.0) -> AsyncWeb3[AsyncHTTPProvider]:
    return AsyncWeb3(AsyncHTTPProvider(rpc_url, request_kwargs={"timeout": timeout}))
