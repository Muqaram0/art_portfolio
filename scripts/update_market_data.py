#!/usr/bin/env python3
"""Refresh free daily market data for the static dashboard.

Uses Yahoo Finance's public chart endpoint without an API key. This endpoint is
unofficial and may change; failures preserve the last good file when possible.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "market.json"
SYMBOLS = {
    "ES=F": ("S&P 500 E-mini", "future"),
    "NQ=F": ("Nasdaq 100 E-mini", "future"),
    "CL=F": ("WTI crude oil", "future"),
    "NG=F": ("Natural gas", "future"),
    "GC=F": ("Gold", "future"),
    "HG=F": ("Copper", "future"),
    "ZC=F": ("Corn", "future"),
    "ZW=F": ("Wheat", "future"),
    "SPY": ("SPDR S&P 500 ETF", "fund"),
    "QQQ": ("Invesco QQQ", "fund"),
    "PG": ("Procter & Gamble", "equity"),
    "KR": ("Kroger", "equity"),
    "JPM": ("JPMorgan Chase", "equity"),
    "WMT": ("Walmart", "equity"),
}


def fetch_symbol(symbol: str) -> list[dict[str, float | str]]:
    encoded = urllib.parse.quote(symbol, safe="")
    urls = [
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?range=2y&interval=1d&events=history",
        f"https://query2.finance.yahoo.com/v8/finance/chart/{encoded}?range=2y&interval=1d&events=history",
    ]
    last_error: Exception | None = None
    for url in urls:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 EdgeAtlas/1.0"})
            with urllib.request.urlopen(request, timeout=25) as response:
                payload = json.load(response)
            result = payload["chart"]["result"][0]
            timestamps = result.get("timestamp") or []
            quote = result["indicators"]["quote"][0]
            adjusted = (result["indicators"].get("adjclose") or [{}])[0].get("adjclose")
            closes = adjusted or quote.get("close") or []
            points = []
            for timestamp, close in zip(timestamps, closes):
                if close is None:
                    continue
                points.append({
                    "date": datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat(),
                    "close": round(float(close), 6),
                })
            if len(points) < 30:
                raise ValueError(f"Too few data points for {symbol}: {len(points)}")
            return points
        except (urllib.error.URLError, urllib.error.HTTPError, KeyError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc
    raise RuntimeError(f"Unable to fetch {symbol}: {last_error}")


def load_existing() -> dict:
    try:
        return json.loads(OUTPUT.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"series": {}}


def main() -> None:
    existing = load_existing()
    series: dict[str, dict] = {}
    failures: list[str] = []
    for symbol, (name, asset_type) in SYMBOLS.items():
        try:
            points = fetch_symbol(symbol)
            series[symbol] = {"symbol": symbol, "name": name, "type": asset_type, "points": points}
            print(f"Fetched {symbol}: {len(points)} points")
        except RuntimeError as exc:
            prior = existing.get("series", {}).get(symbol)
            if prior:
                series[symbol] = prior
                print(f"Preserved prior data for {symbol}: {exc}")
            else:
                failures.append(str(exc))
                print(exc)
        time.sleep(0.35)

    if not series:
        raise SystemExit("No market series available; refusing to overwrite the dataset.")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Yahoo Finance public chart endpoint (unofficial, best effort)",
        "disclaimer": "Daily data may be delayed, adjusted, incomplete, or temporarily unavailable. Not investment advice.",
        "failures": failures,
        "series": series,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
