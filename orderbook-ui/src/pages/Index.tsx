import React from "react";
import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import DepthChart from "@/components/DepthChart";
import OrderBook from "@/components/OrderBook";
import { useOrderBook } from "@/hooks/useOrderBook";
import PineLogo from "@/pages/PineLogo";

const Index = () => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: orderBookData, isLoading, error } = useOrderBook("BTC");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <PineLogo className="w-8 h-8" />
            <span className="text-lg font-semibold text-foreground">Pine Coin</span>
          </div>
          {isConnected && (
            <div className="flex items-center gap-3">
              <p className="text-xs font-mono text-foreground bg-secondary rounded-md px-3 py-2">
                {address}
              </p>
              <Button variant="golden" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12 text-muted-foreground">Loading order book…</div>
        ) : error ? (
          <div className="text-destructive text-center py-8">Failed to load: {error.message}</div>
        ) : orderBookData ? (
          <>
            <DepthChart data={orderBookData} />
            <OrderBook data={orderBookData} />
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">No data available</div>
        )}
      </div>
    </div>
  );
};

export default Index;