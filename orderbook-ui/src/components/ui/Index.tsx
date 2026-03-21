import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PineLogo from "@/components/PineLogo";

const Index = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4 animate-fade-in">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <PineLogo className="w-8 h-8" />
          <span className="text-lg font-semibold text-foreground">Pine Coin</span>
        </div>

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

        <p className="text-[11px] text-muted-foreground text-center pt-1">
          JWT Auth · Rate Limited
        </p>
      </form>
    </div>
  );
};

export default Index;
