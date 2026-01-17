Crypto Aggregator

A complete pipeline to fetch order book depth from 12+ exchanges and visualize global liquidity.

1. Locally (with Go)

go run main.go --dir docs

# Open docs/index.html in your browser

2. With Docker

docker-compose up --build

# Data is saved to /docs automatically

3. Deploy to GitHub Pages

Push this repo to GitHub.

Go to Settings -> Pages.

Select Source: Deploy from a branch.

Branch: main, Folder: /docs.

The Action in .github/workflows will update the data every hour automatically.
