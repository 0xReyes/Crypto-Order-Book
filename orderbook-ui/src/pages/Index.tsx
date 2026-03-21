import { useState } from "react";
import { useConnect, useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DepthChart } from "@/components/DepthChart";               // your depth chart component
import { OrderBook } from "@/components/OrderBook";                 // optional: classic order book table
import { useOrderBook } from "@/hooks/useOrderBook";               // 👈 import the data hook
import PineLogo from "@/pages/PineLogo";

const Index = () => {
  // --- username/password form state (mock) ---
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // --- wallet connection state ---
  const { connect, connectors, isPending } = useConnect();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // --- order book data ---
  const { data: orderBookData, isLoading: orderBookLoading, error: orderBookError } = useOrderBook("BTC");

  // --- handle username/password submit (mock) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setLoading(false);
    setError("Invalid credentials.");
  };

  const injectedConnector = connectors.find((c) => c.id === "injected");
  const wcConnector = connectors.find((c) => c.id === "walletConnect");

  // --- if wallet connected, show order book ---
  if (isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl space-y-6 animate-fade-in">
          {/* Header with wallet info and disconnect */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <PineLogo className="w-8 h-8" />
              <span className="text-lg font-semibold text-foreground">Pine Coin</span>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">Connected as</p>
              <p className="text-xs font-mono text-foreground bg-secondary rounded-md px-3 py-2 break-all">
                {address}
              </p>
              <Button variant="golden" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          </div>

          {/* Order book visualisation */}
          {orderBookLoading ? (
            <div className="flex justify-center py-12">
              <div className="text-muted-foreground">Loading order book…</div>
            </div>
          ) : orderBookError ? (
            <div className="text-destructive text-center py-8">
              Failed to load order book: {orderBookError.message}
            </div>
          ) : orderBookData ? (
            <>
              <DepthChart data={orderBookData} />
              {/* Optionally include the classic order book table */}
              <OrderBook data={orderBookData} />
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No order book data available</div>
          )}
        </div>
      </div>
    );
  }

  // --- not connected → show login form ---
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-4 animate-fade-in">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <PineLogo className="w-8 h-8" />
          <span className="text-lg font-semibold text-foreground">Pine Coin</span>
        </div>

        {/* Wallet sign-in */}
        <div className="space-y-2">
          {injectedConnector && (
            <Button
              variant="outline"
              className="w-full h-9 text-sm gap-2"
              disabled={isPending}
              onClick={() => connect({ connector: injectedConnector })}
            >
              <WalletIcon />
              MetaMask
            </Button>
          )}
          {wcConnector && (
            <Button
              variant="outline"
              className="w-full h-9 text-sm gap-2"
              disabled={isPending}
              onClick={() => connect({ connector: wcConnector })}
            >
              <ScanIcon />
              WalletConnect
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Username/password sign-in */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground h-9 text-sm"
            placeholder="Username"
            autoComplete="username"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground h-9 text-sm"
            placeholder="Password"
            autoComplete="current-password"
          />

          {error && <p className="text-xs text-destructive text-center">{error}</p>}

          <Button type="submit" variant="golden" className="w-full h-9 text-sm" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center pt-1">
          JWT Auth · Rate Limited
        </p>
      </div>
    </div>
  );
};

// --- icons (same as before) ---
const WalletIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
    <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
  </svg>
);

const ScanIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <rect width="7" height="5" x="7" y="7" rx="1" />
    <rect width="7" height="5" x="10" y="12" rx="1" />
  </svg>
);

export default Index;