# Edge Atlas

A static, repo-backed futures signal dashboard with three layers:

1. **Markets** — free daily futures and equity data, normalized relative-performance charts, price ratios, and rolling correlations.
2. **Research and institutional capital** — manually curated commitments from primary sources: grant programs, research infrastructure, verification initiatives, corporate reorganizations, acquisitions, standards, and public-private programs.
3. **Consumer and culture** — smaller product experiments and behavior changes with lower certainty but higher novelty.

## Data model

- `data/market.json` is refreshed automatically on weekdays by GitHub Actions.
- `data/signals.json` is an editorial signal ledger. Every item includes a primary source, date, entity, strength, novelty score, summary, and working thesis.
- The site is plain HTML/CSS/JavaScript and uses Chart.js from a CDN.

## Free data sources

Current:

- Yahoo Finance public chart endpoint via `scripts/update_market_data.py` — unofficial and best effort, no key required.

Planned:

- CFTC Commitments of Traders public files for positioning.
- FRED CSV endpoints for rates, credit, inventories, and macro series.
- SEC company facts and filings for capital-allocation changes.

## Local preview

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

The repository includes a Pages deployment workflow. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once. Subsequent pushes deploy automatically.

## Editorial rule

A signal belongs here when it shows commitment or behavior, not just commentary. Preferred evidence:

- money allocated;
- a team or institution created;
- a program launched;
- a standard or procurement rule changed;
- infrastructure built;
- an acquisition or operating-model change;
- a product experiment with measurable adoption or abandonment.
