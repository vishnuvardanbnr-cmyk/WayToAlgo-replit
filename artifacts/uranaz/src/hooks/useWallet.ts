import { useState, useCallback } from "react";

export interface WalletState {
  address: string | null;
  connecting: boolean;
  error: string | null;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    connecting: false,
    error: null,
  });

  const connect = useCallback(async (): Promise<string | null> => {
    if (!window.ethereum) {
      setState(s => ({ ...s, error: "No wallet detected. Please install MetaMask or a compatible wallet." }));
      return null;
    }
    setState(s => ({ ...s, connecting: true, error: null }));
    try {
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      const address = accounts[0]?.toLowerCase() ?? null;
      if (!address) throw new Error("No account returned from wallet.");
      setState({ address, connecting: false, error: null });
      return address;
    } catch (err: any) {
      const msg = err?.code === 4001
        ? "Connection rejected. Please approve the wallet request."
        : err?.message || "Failed to connect wallet.";
      setState({ address: null, connecting: false, error: msg });
      return null;
    }
  }, []);

  const signMessage = useCallback(async (address: string, message: string): Promise<string | null> => {
    if (!window.ethereum) return null;
    try {
      const sig: string = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });
      return sig;
    } catch (err: any) {
      const msg = err?.code === 4001
        ? "Signing rejected. Please approve the signature request."
        : err?.message || "Failed to sign message.";
      setState(s => ({ ...s, error: msg }));
      return null;
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ address: null, connecting: false, error: null });
  }, []);

  return { ...state, connect, signMessage, disconnect };
}
