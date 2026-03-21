import { useState } from "react";
import { useNavigate } from "react-router-dom";

const SignIn = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Both fields are required");
      return;
    }
    setError("");
    setLoading(true);
    // Simulate auth delay
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#fcd535]/[0.03] blur-[120px] pointer-events-none" />

      <div className="w-full max-w-[360px] px-6 relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 mb-4">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <defs>
                <linearGradient id="pine-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(220 17% 18%)" />
                  <stop offset="100%" stopColor="hsl(220 17% 8%)" />
                </linearGradient>
                <linearGradient id="pine-gl" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
              </defs>
              <path
                fill="url(#pine-bg)"
                stroke="#fcd535"
                strokeWidth="3.5"
                strokeLinejoin="round"
                d="M50 10 L70 30 L60 40 L75 55 L60 65 L70 80 L50 95 L30 80 L40 65 L25 55 L40 40 L30 30 Z"
              />
              <path
                fill="url(#pine-gl)"
                d="M50 10 L30 30 L40 40 L25 55 L40 65 L30 80 L50 95 Z"
              />
            </svg>
          </div>
          <span className="text-[15px] font-semibold text-foreground tracking-tight">
            Pine Coin
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            Sign in to access the dashboard
          </span>
        </div>

        {/* Form card */}
        <div className="rounded-lg border border-border bg-card/60 backdrop-blur-sm p-5 shadow-lg shadow-black/20">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-[11px] font-medium text-muted-foreground uppercase tracking-widest"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background/80 px-3 text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#fcd535]/40 focus:border-[#fcd535]/40 transition-colors"
                placeholder="Enter username"
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-[11px] font-medium text-muted-foreground uppercase tracking-widest"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 rounded-md border border-border bg-background/80 px-3 text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[#fcd535]/40 focus:border-[#fcd535]/40 transition-colors"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 rounded-md bg-[#fcd535] text-[#181a20] text-sm font-semibold transition-all hover:bg-[#fcd535]/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fcd535]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/60 font-mono uppercase tracking-widest">
          <span>JWT Auth</span>
          <span className="text-muted-foreground/30">·</span>
          <span>Rate Limited</span>
          <span className="text-muted-foreground/30">·</span>
          <span>Pine Coin</span>
        </div>
      </div>
    </div>
  );
};

export default SignIn;
