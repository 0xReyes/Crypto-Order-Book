import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <h1 className="font-display text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="text-primary hover:underline text-sm font-mono">
        &larr; Back to orderbook
      </Link>
    </div>
  );
}
