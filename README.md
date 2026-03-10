# Crypto Order Book

This repository provides a CLI generator that fetches order books from multiple
exchanges and emits a static JSON snapshot. The snapshot can be committed and
served from GitHub Pages for a zero-backend dashboard.

## Usage

Generate a snapshot into `docs/data.json`:

```bash
go run . --dir docs --file data.json --symbol BTC-USDT --limit 100
```

CLI flags:

- `--dir` output directory (default: `docs`)
- `--file` output filename (default: `data.json`)
- `--symbol` trading pair (default: `BTC-USDT`)
- `--limit` depth limit per exchange (default: `100`)

## GitHub Pages

The `docs/index.html` file reads `docs/data.json` and renders a simple status
line. Commit `docs/data.json` after generating a snapshot to publish the latest
data.

## Automation

A GitHub Actions workflow (`.github/workflows/update-data.yml`) is included to
run the generator on a schedule and push updated snapshots back to the repo.
