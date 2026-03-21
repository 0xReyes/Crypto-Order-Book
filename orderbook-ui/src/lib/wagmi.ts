import { http, createConfig } from "wagmi";
import { mainnet, polygon, arbitrum, optimism, bsc } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

// Get a free project ID at https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID = "YOUR_PROJECT_ID";

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, arbitrum, optimism, bsc],
  connectors: [
    injected(),
    walletConnect({ projectId: WALLETCONNECT_PROJECT_ID }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [bsc.id]: http(),
  },
});
