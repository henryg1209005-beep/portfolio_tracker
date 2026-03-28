"""
Core unit tests for portfolio_tracker.

Run from the portfolio_tracker directory:
    python -m tests.test_core
or:
    python tests/test_core.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.revolut_parser import _clean_price
from data.fetcher import _lse_price_to_gbp, _lse_currency_cache
from ui.app import _holding_stats


# ── _clean_price ───────────────────────────────────────────────────────────────

def test_clean_price_plain_float():
    assert _clean_price(149.49) == 149.49

def test_clean_price_gbp_prefix():
    assert _clean_price("GBP 149.49") == 149.49

def test_clean_price_usd_prefix():
    assert _clean_price("USD 12.34") == 12.34

def test_clean_price_pound_symbol():
    assert _clean_price("£98.52") == 98.52

def test_clean_price_dollar_symbol():
    assert _clean_price("$123.45") == 123.45

def test_clean_price_comma_thousands():
    assert _clean_price("1,234.56") == 1234.56

def test_clean_price_integer():
    assert _clean_price(100) == 100.0


# ── _holding_stats ─────────────────────────────────────────────────────────────

def test_holding_stats_single_buy():
    h = {"transactions": [
        {"date": "2025-01-01", "shares": 10.0, "price": 100.0, "type": "buy"},
    ]}
    shares, avg = _holding_stats(h)
    assert shares == 10.0
    assert avg == 100.0

def test_holding_stats_multiple_buys():
    h = {"transactions": [
        {"date": "2025-01-01", "shares": 10.0, "price": 100.0, "type": "buy"},
        {"date": "2025-02-01", "shares": 10.0, "price": 120.0, "type": "buy"},
    ]}
    shares, avg = _holding_stats(h)
    assert shares == 20.0
    assert avg == 110.0, f"Expected 110.0, got {avg}"

def test_holding_stats_partial_sell_preserves_avg_cost():
    """Selling shares should not change the average cost per share."""
    h = {"transactions": [
        {"date": "2025-01-01", "shares": 10.0, "price": 100.0, "type": "buy"},
        {"date": "2025-02-01", "shares": 4.0,  "price": 130.0, "type": "sell"},
    ]}
    shares, avg = _holding_stats(h)
    assert shares == 6.0, f"Expected 6.0, got {shares}"
    assert avg == 100.0, f"Expected avg cost unchanged at 100.0, got {avg}"

def test_holding_stats_full_sell_returns_zero():
    h = {"transactions": [
        {"date": "2025-01-01", "shares": 10.0, "price": 100.0, "type": "buy"},
        {"date": "2025-02-01", "shares": 10.0, "price": 150.0, "type": "sell"},
    ]}
    shares, avg = _holding_stats(h)
    assert shares == 0.0, f"Expected 0.0, got {shares}"

def test_holding_stats_buy_sell_buy():
    """Buy more after a partial sell — avg cost should update."""
    h = {"transactions": [
        {"date": "2025-01-01", "shares": 10.0, "price": 100.0, "type": "buy"},
        {"date": "2025-02-01", "shares": 5.0,  "price": 120.0, "type": "sell"},
        {"date": "2025-03-01", "shares": 10.0, "price": 80.0,  "type": "buy"},
    ]}
    shares, avg = _holding_stats(h)
    # After sell: 5 shares @ £100 avg. After second buy: (5*100 + 10*80) / 15
    expected_avg = (5 * 100 + 10 * 80) / 15
    assert shares == 15.0, f"Expected 15.0, got {shares}"
    assert abs(avg - expected_avg) < 0.01, f"Expected {expected_avg:.2f}, got {avg:.2f}"

def test_holding_stats_legacy_format():
    """Holdings migrated from the old shares/avg_cost format should still work."""
    h = {"transactions": [
        {"date": "imported", "shares": 16.1, "price": 57.64},  # no "type" key
    ]}
    shares, avg = _holding_stats(h)
    assert abs(shares - 16.1) < 0.001
    assert abs(avg - 57.64) < 0.001


# ── _lse_price_to_gbp ──────────────────────────────────────────────────────────

def test_lse_pence_ticker_divides_by_100():
    """When yfinance returns GBp (pence), price must be divided by 100."""
    _lse_currency_cache["VUSA.L"] = "GBp"
    result = _lse_price_to_gbp("VUSA.L", 9352.0)
    assert abs(result - 93.52) < 0.001, f"Expected 93.52, got {result}"

def test_lse_gbp_ticker_no_division():
    """When yfinance returns GBP (pounds), price must NOT be divided."""
    _lse_currency_cache["__TEST_GBP.L"] = "GBP"
    result = _lse_price_to_gbp("__TEST_GBP.L", 93.52)
    assert abs(result - 93.52) < 0.001, f"Expected 93.52 unchanged, got {result}"

def test_lse_pence_conversion_accuracy():
    """Cross-check: VFEM at ~5764p should give £57.64."""
    _lse_currency_cache["VFEM.L"] = "GBp"
    result = _lse_price_to_gbp("VFEM.L", 5764.0)
    assert abs(result - 57.64) < 0.001


# ── Runner ─────────────────────────────────────────────────────────────────────

def _run_all():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = failed = 0
    for fn in tests:
        try:
            fn()
            print(f"  PASS  {fn.__name__}")
            passed += 1
        except Exception as exc:
            print(f"  FAIL  {fn.__name__}  →  {exc}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed.")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    print("Running portfolio_tracker core tests...\n")
    _run_all()
