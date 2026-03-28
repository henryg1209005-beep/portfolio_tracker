import json
import os
import sys
import threading
from tkinter import filedialog, messagebox

import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

import customtkinter as ctk

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.fetcher import (
    fetch_benchmark_data,
    fetch_current_prices,
    fetch_historical_data,
    fetch_gbp_usd_rate,
    fetch_gbp_eur_rate,
    fetch_risk_free_rate,
    validate_ticker,
    search_tickers,
    resolve_ticker,
)

CURRENCY = "£"
from data.revolut_parser import parse_revolut_csv
from metrics.calculator import calculate_all_metrics
from ai.summariser import stream_analysis

# ── Colour palette  (Apple-inspired dark mode) ────────────────────────────────
BG        = "#111111"          # near-black
PANEL     = "#1c1c1e"          # Apple grouped background
CARD      = "#2c2c2e"          # Apple secondary grouped background
BORDER    = "#3a3a3c"          # Apple separator
CYAN      = "#0a84ff"          # Apple blue
CYAN_DIM  = "#0055a5"          # dimmed blue
PURPLE    = "#bf5af2"          # Apple purple
GREEN     = "#30d158"          # Apple green
RED       = "#ff453a"          # Apple red
AMBER     = "#ff9f0a"          # Apple orange
WHITE     = "#ffffff"
GREY      = "#8e8e93"          # Apple secondary label
# ──────────────────────────────────────────────────────────────────────────────

FONT      = "Segoe UI"         # clean system sans-serif (Apple SF Pro equivalent on Windows)


def _holding_stats(h, gbpusd=1.0, gbpeur=1.0):
    """
    Compute (net_shares, avg_cost_gbp) from transactions.
    BUY  → adds shares at purchase price (converted to GBP if price_currency=USD/EUR)
    SELL → reduces shares; avg cost is unchanged (FIFO-style cost basis)
    gbpusd: current GBP/USD rate used to convert USD-denominated purchase prices.
    gbpeur: current GBP/EUR rate used to convert EUR-denominated purchase prices.
    """
    txs = h.get("transactions", [])
    if not txs:
        return h.get("shares", 0.0), h.get("avg_cost", 0.0)

    net_shares = 0.0
    total_cost = 0.0

    for t in txs:
        tx_type = t.get("type", "buy").lower()
        shares  = t["shares"]
        price   = t["price"]

        # Convert to GBP if the price was recorded in another currency
        cur = t.get("price_currency", "GBP").upper()
        if cur == "USD" and gbpusd > 0:
            price = price / gbpusd
        elif cur == "EUR" and gbpeur > 0:
            price = price / gbpeur

        if tx_type == "buy":
            total_cost += shares * price
            net_shares += shares
        elif tx_type == "sell":
            if net_shares > 0:
                avg = total_cost / net_shares
                total_cost -= shares * avg
            net_shares -= shares

    net_shares = max(net_shares, 0.0)
    total_cost = max(total_cost, 0.0)
    avg_cost   = total_cost / net_shares if net_shares > 0 else 0.0
    return net_shares, avg_cost


def _dividend_total(h, gbpusd=1.0):
    """Total dividends received for a holding, converted to GBP."""
    total = 0.0
    for d in h.get("dividends", []):
        amt = d.get("amount", 0.0)
        if d.get("currency", "GBP").upper() == "USD" and gbpusd > 0:
            amt = amt / gbpusd
        total += amt
    return total


def _neon_btn_style():
    return dict(
        fg_color=PANEL,
        hover_color=BORDER,
        border_color=CYAN_DIM,
        border_width=1,
        text_color=CYAN,
        corner_radius=6,
    )


class PortfolioApp:
    def __init__(self):
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.root = ctk.CTk()
        self.root.title("PORTFOLIO  //  TRACKER")
        self.root.geometry("1380x880")
        self.root.minsize(1080, 700)
        self.root.configure(fg_color=BG)

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.portfolio_file = os.path.join(base_dir, "portfolio.json")
        self.config_file    = os.path.join(base_dir, "config.json")
        self.portfolio = self._load_portfolio()
        self.prices: dict = {}
        self.metrics: dict | None = None
        self._hist_data = None
        self._gbpusd: float = 1.34
        self._gbpeur: float = 1.17

        self._build_ui()
        self.refresh_data()

    # ── Persistence ────────────────────────────────────────────────────────────

    def _load_portfolio(self):
        if os.path.exists(self.portfolio_file):
            with open(self.portfolio_file, "r") as f:
                data = json.load(f)
            for h in data.get("holdings", []):
                # Migrate legacy shares/avg_cost format
                if "transactions" not in h:
                    h["transactions"] = [{
                        "date":  "imported",
                        "shares": h.pop("shares", 0.0),
                        "price":  h.pop("avg_cost", 0.0),
                    }]
                    h.pop("shares", None)
                    h.pop("avg_cost", None)
                # Ensure dividends list exists
                h.setdefault("dividends", [])
                # All prices from Revolut are already in GBP (Revolut converts at trade time)
                for t in h.get("transactions", []):
                    t.setdefault("price_currency", "GBP")
            return data
        return {"holdings": []}

    def _save_portfolio(self):
        with open(self.portfolio_file, "w") as f:
            json.dump(self.portfolio, f, indent=2)

    def _load_config(self) -> dict:
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {}

    def _save_config(self, key: str, value: str):
        cfg = self._load_config()
        cfg[key] = value
        with open(self.config_file, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)

    # ── Layout ─────────────────────────────────────────────────────────────────

    def _build_ui(self):
        self.root.grid_columnconfigure(1, weight=1)
        self.root.grid_rowconfigure(0, weight=1)
        self._build_sidebar()

        main = ctk.CTkFrame(self.root, corner_radius=0, fg_color="transparent")
        main.grid(row=0, column=1, sticky="nsew", padx=14, pady=14)
        main.grid_columnconfigure(0, weight=1)
        main.grid_rowconfigure(1, weight=1)
        self.main = main

        self._build_header()
        self._build_tabs()

    # ── Sidebar ────────────────────────────────────────────────────────────────

    def _build_sidebar(self):
        sb = ctk.CTkFrame(self.root, width=200, corner_radius=0, fg_color=PANEL,
                          border_color=BORDER, border_width=1)
        sb.grid(row=0, column=0, sticky="nsew")
        sb.grid_rowconfigure(10, weight=1)

        # Logo
        ctk.CTkLabel(
            sb,
            text="Portfolio",
            font=ctk.CTkFont(family=FONT, size=18, weight="bold"),
            text_color=WHITE,
        ).grid(row=0, column=0, padx=20, pady=(28, 2), sticky="w")

        ctk.CTkLabel(
            sb,
            text="Tracker",
            font=ctk.CTkFont(family=FONT, size=13),
            text_color=GREY,
        ).grid(row=1, column=0, padx=20, pady=(0, 20), sticky="w")

        # Divider
        ctk.CTkFrame(sb, height=1, fg_color=BORDER).grid(
            row=2, column=0, sticky="ew", padx=14, pady=(0, 10)
        )

        ctk.CTkLabel(
            sb,
            text="Actions",
            font=ctk.CTkFont(family=FONT, size=11),
            text_color=GREY,
        ).grid(row=3, column=0, padx=20, pady=(4, 6), sticky="w")

        actions = [
            ("↻   Refresh Data",      self.refresh_data),
            ("+   Add Holding",       self._dlg_add),
            ("↑   Import Statement",  self._import_csv),
            ("×   Remove Holding",    self._dlg_remove),
        ]
        for i, (label, cmd) in enumerate(actions):
            ctk.CTkButton(
                sb, text=label, command=cmd, width=168, anchor="w",
                **_neon_btn_style(),
            ).grid(row=i + 4, column=0, padx=16, pady=4)

        # Divider
        ctk.CTkFrame(sb, height=1, fg_color=BORDER).grid(
            row=9, column=0, sticky="ew", padx=14, pady=10
        )

        self._status = ctk.CTkLabel(
            sb,
            text="Ready",
            font=ctk.CTkFont(family=FONT, size=11),
            text_color=GREY,
            wraplength=168,
        )
        self._status.grid(row=11, column=0, padx=16, pady=14, sticky="sw")

    # ── Header ─────────────────────────────────────────────────────────────────

    def _build_header(self):
        hdr = ctk.CTkFrame(self.main, height=110, fg_color=CARD,
                           border_color=BORDER, border_width=1, corner_radius=12)
        hdr.grid(row=0, column=0, sticky="ew")
        hdr.grid_columnconfigure((0, 1, 2, 3, 4), weight=1)

        def stat_card(title, col):
            f = ctk.CTkFrame(hdr, fg_color="transparent")
            f.grid(row=0, column=col, padx=24, pady=20, sticky="w")
            ctk.CTkLabel(
                f, text=title,
                font=ctk.CTkFont(family=FONT, size=11),
                text_color=GREY,
            ).pack(anchor="w")
            val = ctk.CTkLabel(
                f, text="--",
                font=ctk.CTkFont(family=FONT, size=22, weight="bold"),
                text_color=WHITE,
            )
            val.pack(anchor="w")
            return val

        self._lbl_value  = stat_card("TOTAL VALUE",      0)
        self._lbl_pnl    = stat_card("UNREALISED P&L",   1)
        self._lbl_divs   = stat_card("DIVIDENDS REC'D",  2)
        self._lbl_count  = stat_card("HOLDINGS",         3)
        self._lbl_fxrate = stat_card("GBP/USD RATE",     4)

    # ── Tabs ───────────────────────────────────────────────────────────────────

    def _build_tabs(self):
        tv = ctk.CTkTabview(self.main, fg_color=CARD,
                            segmented_button_fg_color=PANEL,
                            segmented_button_selected_color=CYAN,
                            segmented_button_selected_hover_color=CYAN_DIM,
                            segmented_button_unselected_color=PANEL,
                            segmented_button_unselected_hover_color=BORDER,
                            border_color=BORDER, border_width=1)
        tv.grid(row=1, column=0, sticky="nsew", pady=(12, 0))
        self.tabview = tv

        self._tab_overview     = tv.add("  OVERVIEW  ")
        self._tab_metrics      = tv.add("  METRICS   ")
        self._tab_charts       = tv.add("  CHARTS    ")
        self._tab_correlation  = tv.add("  CORRELATION  ")
        self._tab_ai           = tv.add("  AI INSIGHTS  ")

        self._build_overview()
        self._build_metrics()
        self._build_charts()
        self._build_correlation()
        self._build_ai_insights()

    # ── Overview ───────────────────────────────────────────────────────────────

    def _build_overview(self):
        tab = self._tab_overview
        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(0, weight=1)

        sf = ctk.CTkScrollableFrame(tab, fg_color=PANEL, label_text="",
                                    scrollbar_button_color=BORDER,
                                    scrollbar_button_hover_color=CYAN_DIM)
        sf.grid(row=0, column=0, sticky="nsew", padx=4, pady=4)
        self._holdings_frame = sf

        headers = [
            "TICKER", "TYPE", "SHARES", "AVG COST",
            "PRICE", "MKT VALUE", "P&L", "P&L %", "DIVS", "WEIGHT", "TX",
        ]
        for j, h in enumerate(headers):
            ctk.CTkLabel(
                sf, text=h,
                font=ctk.CTkFont(family=FONT, size=10, weight="bold"),
                text_color=CYAN, anchor="center", width=110 if h != "TX" else 50,
            ).grid(row=0, column=j, padx=4, pady=8)

        # Header underline
        ctk.CTkFrame(sf, height=1, fg_color=CYAN_DIM).grid(
            row=1, column=0, columnspan=len(headers), sticky="ew", padx=4
        )

        self._holding_rows: list = []

    # ── Metrics ────────────────────────────────────────────────────────────────

    def _make_tooltip(self, parent, tip_text: str):
        """Attach a hover tooltip to a widget. Returns the trigger label."""
        tip_lbl = ctk.CTkLabel(
            parent, text=tip_text,
            font=ctk.CTkFont(family=FONT, size=10),
            text_color=WHITE, fg_color=BORDER,
            corner_radius=6, padx=8, pady=4,
            wraplength=280,
        )
        trigger = ctk.CTkLabel(
            parent, text=" ⓘ",
            font=ctk.CTkFont(family=FONT, size=11),
            text_color=GREY, cursor="hand2",
        )
        def _show(e):
            tip_lbl.lift()
            tip_lbl.place(in_=trigger, x=20, y=-30)
        def _hide(e):
            tip_lbl.place_forget()
        trigger.bind("<Enter>", _show)
        trigger.bind("<Leave>", _hide)
        return trigger

    def _section_header(self, parent, row, col, colspan, label, color):
        """Render a coloured section heading spanning the given columns."""
        f = ctk.CTkFrame(parent, fg_color="transparent")
        f.grid(row=row, column=col, columnspan=colspan,
               padx=10, pady=(14, 2), sticky="ew")
        ctk.CTkFrame(f, width=4, height=18, fg_color=color,
                     corner_radius=2).pack(side="left", padx=(0, 8))
        ctk.CTkLabel(
            f, text=label,
            font=ctk.CTkFont(family=FONT, size=11, weight="bold"),
            text_color=color,
        ).pack(side="left")

    def _metric_card(self, parent, row, col, colspan,
                     title, key, fmt, tooltip,
                     val_size=22, title_size=10,
                     border=BORDER, title_color=GREY,
                     pad_v=12, wrap=320,
                     extra_lbl=False):
        """
        Build one metric card and register it in self._metric_labels.
        extra_lbl=True adds a secondary dynamic label (used for severity / meaning).
        """
        card = ctk.CTkFrame(parent, fg_color=PANEL,
                            border_color=border, border_width=1,
                            corner_radius=10)
        card.grid(row=row, column=col, columnspan=colspan,
                  padx=10, pady=5, sticky="nsew")
        card.grid_columnconfigure(0, weight=1)

        # Title row with tooltip
        title_row = ctk.CTkFrame(card, fg_color="transparent")
        title_row.grid(row=0, column=0, padx=14, pady=(pad_v, 2), sticky="w")
        ctk.CTkLabel(
            title_row, text=title,
            font=ctk.CTkFont(family=FONT, size=title_size, weight="bold"),
            text_color=title_color,
        ).pack(side="left")
        self._make_tooltip(title_row, tooltip).pack(side="left")

        # Value
        val_lbl = ctk.CTkLabel(
            card, text="--",
            font=ctk.CTkFont(family=FONT, size=val_size, weight="bold"),
            text_color=CYAN,
        )
        val_lbl.grid(row=1, column=0, padx=14, pady=(0, 2), sticky="w")

        # Optional extra label (severity / meaning)
        extra = None
        if extra_lbl:
            extra = ctk.CTkLabel(
                card, text="",
                font=ctk.CTkFont(family=FONT, size=10),
                text_color=AMBER,
            )
            extra.grid(row=2, column=0, padx=14, pady=(0, pad_v), sticky="w")
        else:
            ctk.CTkFrame(card, height=pad_v, fg_color="transparent").grid(row=2, column=0)

        self._metric_labels[key] = (val_lbl, fmt)
        if extra_lbl:
            self._metric_extras[key] = extra
        return card

    def _build_metrics(self):
        tab = self._tab_metrics
        tab.grid_columnconfigure((0, 1), weight=1)
        tab.grid_rowconfigure(0, weight=0)

        self._metric_labels: dict  = {}
        self._metric_extras: dict  = {}

        # ── Hero: Sharpe ──────────────────────────────────────────────────────
        hero = ctk.CTkFrame(tab, fg_color=PANEL, border_color=CYAN,
                            border_width=2, corner_radius=12)
        hero.grid(row=0, column=0, columnspan=2, padx=10, pady=(10, 4), sticky="ew")
        hero.grid_columnconfigure(1, weight=1)

        left = ctk.CTkFrame(hero, fg_color="transparent")
        left.grid(row=0, column=0, padx=20, pady=18, sticky="w")
        ctk.CTkLabel(left, text="Primary Indicator",
                     font=ctk.CTkFont(family=FONT, size=10),
                     text_color=CYAN_DIM).pack(anchor="w")

        title_row = ctk.CTkFrame(left, fg_color="transparent")
        title_row.pack(anchor="w")
        ctk.CTkLabel(title_row, text="Sharpe Ratio",
                     font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
                     text_color=WHITE).pack(side="left")
        self._make_tooltip(title_row,
            "Return earned per unit of risk taken. "
            ">1.0 is good, >2.0 is exceptional, <0 means losing value on a risk-adjusted basis."
        ).pack(side="left")

        sharpe_val = ctk.CTkLabel(left, text="--",
                                  font=ctk.CTkFont(family=FONT, size=42, weight="bold"),
                                  text_color=CYAN)
        sharpe_val.pack(anchor="w", pady=(4, 0))
        self._metric_labels["sharpe_ratio"] = (sharpe_val, "{:.3f}")

        ctk.CTkLabel(hero,
                     text="Return earned per unit of risk  ·  >1.0 good  ·  >2.0 exceptional",
                     font=ctk.CTkFont(family=FONT, size=10),
                     text_color=GREY).grid(row=0, column=1, padx=20, sticky="w")

        # ── Section: RETURN ───────────────────────────────────────────────────
        self._section_header(tab, 1, 0, 1, "RETURN", GREEN)
        self._metric_card(tab, 2, 0, 1,
            "Actual Return (Ann.)", "actual_return", "{:.2%}",
            "Annualised portfolio return over the past 12 months.",
            val_size=28, title_size=11, border=CYAN_DIM, title_color=WHITE, pad_v=14)
        self._metric_card(tab, 3, 0, 1,
            "CAPM Expected Return", "capm_expected_return", "{:.2%}",
            "The return theory says your portfolio should earn given its level of market risk. "
            "Comparing this to actual return reveals whether you're over- or under-performing expectations.",
            val_size=20, title_size=10, border=BORDER, title_color=GREY, pad_v=10,
            extra_lbl=True)
        self._metric_card(tab, 4, 0, 1,
            "Jensen's Alpha", "alpha", "{:.2%}",
            "Return above what CAPM predicts. Positive = outperforming on a risk-adjusted basis. "
            "Negative = underperforming expectations.",
            val_size=20, title_size=10, border=BORDER, title_color=GREY, pad_v=10)

        # ── Section: RISK ─────────────────────────────────────────────────────
        self._section_header(tab, 1, 1, 1, "RISK", RED)
        self._metric_card(tab, 2, 1, 1,
            "Volatility (Ann.)", "volatility", "{:.2%}",
            "How much the portfolio's value fluctuates day-to-day, annualised. "
            "S&P 500 typically runs 15–18%. Higher means bigger swings — up and down.",
            val_size=28, title_size=11, border=CYAN_DIM, title_color=WHITE, pad_v=14)
        self._metric_card(tab, 3, 1, 1,
            "Max Drawdown", "max_drawdown", "{:.2%}",
            "The largest peak-to-trough loss over the period — the worst you would have experienced "
            "if you bought at the peak. A key gauge of downside resilience.",
            val_size=20, title_size=10, border=BORDER, title_color=GREY, pad_v=10,
            extra_lbl=True)
        self._metric_card(tab, 4, 1, 1,
            "VaR 95%  (Daily)", "var_95", "{:.2%}",
            "Value at Risk: on a typical bad day, there is a 5% chance of losing more than this "
            "percentage of the portfolio's value.",
            val_size=20, title_size=10, border=BORDER, title_color=GREY, pad_v=10,
            extra_lbl=True)

        # ── Section: EFFICIENCY ───────────────────────────────────────────────
        self._section_header(tab, 5, 0, 2, "EFFICIENCY", AMBER)
        self._metric_card(tab, 6, 0, 2,
            "Beta  (vs S&P 500)", "beta", "{:.3f}",
            "Sensitivity to market movements. 1.0 = moves with the market. "
            "<0.8 = more defensive. >1.2 = more aggressive — amplifies both gains and losses.",
            val_size=26, title_size=11, border=BORDER, title_color=GREY, pad_v=12,
            extra_lbl=True)

        # ── Relationship insights panel ────────────────────────────────────────
        rel_frame = ctk.CTkFrame(tab, fg_color=CARD, border_color=BORDER,
                                 border_width=1, corner_radius=10)
        rel_frame.grid(row=7, column=0, columnspan=2, padx=10, pady=(8, 10), sticky="ew")
        rel_frame.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(rel_frame, text="Metric Relationships",
                     font=ctk.CTkFont(family=FONT, size=11, weight="bold"),
                     text_color=AMBER).grid(row=0, column=0, padx=16, pady=(10, 4), sticky="w")
        self._rel_lbl = ctk.CTkLabel(
            rel_frame, text="Refresh data to see metric relationships.",
            font=ctk.CTkFont(family=FONT, size=11),
            text_color=GREY, wraplength=900, justify="left",
        )
        self._rel_lbl.grid(row=1, column=0, padx=16, pady=(0, 10), sticky="w")

    # ── Charts ─────────────────────────────────────────────────────────────────

    def _build_charts(self):
        tab = self._tab_charts
        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(0, weight=1)

        frame = ctk.CTkFrame(tab, fg_color=PANEL,
                             border_color=BORDER, border_width=1, corner_radius=8)
        frame.grid(row=0, column=0, sticky="nsew", padx=4, pady=4)
        frame.grid_columnconfigure(0, weight=1)
        frame.grid_rowconfigure(0, weight=1)

        self._fig, self._axes = plt.subplots(1, 2, figsize=(13, 5))
        self._fig.patch.set_facecolor(PANEL)

        self._canvas = FigureCanvasTkAgg(self._fig, master=frame)
        self._canvas.get_tk_widget().grid(row=0, column=0, sticky="nsew")

    # ── Correlation ────────────────────────────────────────────────────────────

    def _build_correlation(self):
        tab = self._tab_correlation
        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(1, weight=1)

        # Info bar
        info = ctk.CTkFrame(tab, fg_color=CARD, border_color=BORDER,
                            border_width=1, corner_radius=8)
        info.grid(row=0, column=0, sticky="ew", padx=4, pady=(4, 6))
        info.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            info,
            text="HOW TO READ THIS  //  Values range from -1.0 to +1.0",
            font=ctk.CTkFont(family=FONT, size=11, weight="bold"),
            text_color=CYAN,
        ).grid(row=0, column=0, padx=16, pady=(10, 2), sticky="w")

        legend_text = (
            "+1.0  =  Perfect positive correlation  (move together always)   |   "
            " 0.0  =  No relationship   |   "
            "-1.0  =  Perfect negative correlation  (move in opposite directions)"
        )
        ctk.CTkLabel(
            info, text=legend_text,
            font=ctk.CTkFont(family=FONT, size=10),
            text_color=GREY, wraplength=1100,
        ).grid(row=1, column=0, padx=16, pady=(0, 6), sticky="w")

        # Colour legend
        legend_frame = ctk.CTkFrame(info, fg_color="transparent")
        legend_frame.grid(row=2, column=0, padx=16, pady=(0, 10), sticky="w")
        for color, label in [
            (RED,   "Strong positive (risky — move together)"),
            (GREY,  "Neutral"),
            (CYAN,  "Strong negative (good — diversified)"),
        ]:
            dot = ctk.CTkLabel(legend_frame, text="●", text_color=color,
                               font=ctk.CTkFont(size=14))
            dot.pack(side="left", padx=(0, 4))
            ctk.CTkLabel(legend_frame, text=label,
                         font=ctk.CTkFont(family=FONT, size=10),
                         text_color=WHITE).pack(side="left", padx=(0, 20))

        # Heatmap canvas
        hmap_frame = ctk.CTkFrame(tab, fg_color=PANEL,
                                  border_color=BORDER, border_width=1, corner_radius=8)
        hmap_frame.grid(row=1, column=0, sticky="nsew", padx=4, pady=(0, 4))
        hmap_frame.grid_columnconfigure(0, weight=1)
        hmap_frame.grid_rowconfigure(0, weight=1)

        self._corr_fig, self._corr_ax = plt.subplots(figsize=(8, 6))
        self._corr_fig.patch.set_facecolor(PANEL)

        self._corr_canvas = FigureCanvasTkAgg(self._corr_fig, master=hmap_frame)
        self._corr_canvas.get_tk_widget().grid(row=0, column=0, sticky="nsew")

        # Hover tooltip label
        self._corr_tooltip = ctk.CTkLabel(
            tab, text="",
            font=ctk.CTkFont(family=FONT, size=11),
            text_color=CYAN, fg_color=CARD,
            corner_radius=6, padx=10, pady=4,
        )

        self._corr_canvas.mpl_connect("motion_notify_event", self._on_corr_hover)
        self._hist_data = None

    def _on_corr_hover(self, event):
        if event.inaxes != self._corr_ax or self._hist_data is None:
            self._corr_tooltip.place_forget()
            return

        try:
            corr = self._hist_data.pct_change().dropna().corr()
            tickers = list(corr.columns)
            n = len(tickers)
            if n < 2:
                return

            col = int(round(event.xdata))
            row = int(round(event.ydata))
            if 0 <= col < n and 0 <= row < n:
                t1, t2 = tickers[col], tickers[row]
                val = corr.iloc[row, col]

                if t1 == t2:
                    msg = f"{t1}  //  same asset  =  1.000"
                else:
                    if abs(val) >= 0.7:
                        strength = "STRONG"
                    elif abs(val) >= 0.4:
                        strength = "MODERATE"
                    else:
                        strength = "WEAK"
                    direction = "POSITIVE" if val >= 0 else "NEGATIVE"
                    msg = f"{t1} ↔ {t2}  //  {val:+.3f}  {strength} {direction}"

                self._corr_tooltip.configure(text=msg)
                self._corr_tooltip.place(x=10, y=10)
            else:
                self._corr_tooltip.place_forget()
        except Exception:
            self._corr_tooltip.place_forget()

    def _update_correlation(self):
        self._corr_ax.clear()
        self._corr_ax.set_facecolor(CARD)

        holdings = self.portfolio.get("holdings", [])
        if self._hist_data is None or len(holdings) < 2:
            self._corr_ax.text(
                0.5, 0.5,
                "Add at least 2 holdings\nto see correlation",
                ha="center", va="center", color=GREY,
                fontsize=13, fontfamily="sans-serif",
                transform=self._corr_ax.transAxes,
            )
            self._corr_fig.tight_layout()
            self._corr_canvas.draw()
            return

        corr = self._hist_data.pct_change().dropna().corr()
        tickers = list(corr.columns)
        n = len(tickers)

        import numpy as np
        from matplotlib.colors import LinearSegmentedColormap

        # Custom cyan → dark → red colourmap
        cmap = LinearSegmentedColormap.from_list(
            "scifi", ["#00d4ff", "#0f0f2a", "#ff3b6b"]
        )

        im = self._corr_ax.imshow(corr.values, cmap=cmap, vmin=-1, vmax=1,
                                  aspect="auto")

        # Gridlines
        self._corr_ax.set_xticks(range(n))
        self._corr_ax.set_yticks(range(n))
        self._corr_ax.set_xticklabels(tickers, rotation=35, ha="right",
                                       color=WHITE, fontsize=10, fontfamily="sans-serif")
        self._corr_ax.set_yticklabels(tickers, color=WHITE, fontsize=10,
                                       fontfamily="sans-serif")
        self._corr_ax.tick_params(colors=GREY, length=0)

        for spine in self._corr_ax.spines.values():
            spine.set_color(BORDER)

        # Annotate each cell
        for i in range(n):
            for j in range(n):
                val = corr.iloc[i, j]
                txt_color = WHITE if abs(val) < 0.6 else BG
                self._corr_ax.text(
                    j, i, f"{val:+.2f}",
                    ha="center", va="center",
                    fontsize=9 if n <= 6 else 7,
                    fontfamily="sans-serif",
                    color=txt_color, fontweight="bold",
                )

        # Colourbar
        cbar = self._corr_fig.colorbar(im, ax=self._corr_ax, fraction=0.03, pad=0.02)
        cbar.ax.yaxis.set_tick_params(color=WHITE, labelsize=8)
        cbar.outline.set_edgecolor(BORDER)
        plt.setp(cbar.ax.yaxis.get_ticklabels(), color=WHITE, fontfamily="sans-serif")

        self._corr_ax.set_title(
            "ASSET CORRELATION MATRIX  //  1Y DAILY RETURNS",
            color=CYAN, fontsize=12, fontfamily="sans-serif", pad=14,
        )

        self._corr_fig.patch.set_facecolor(PANEL)
        self._corr_fig.tight_layout()
        self._corr_canvas.draw()

    # ── Data refresh ───────────────────────────────────────────────────────────

    def refresh_data(self):
        self._set_status("Fetching prices…")
        threading.Thread(target=self._refresh_worker, daemon=True).start()

    def _refresh_worker(self):
        try:
            holdings = self.portfolio.get("holdings", [])
            tickers = [h["ticker"] for h in holdings]

            if not tickers:
                self.root.after(0, lambda: self._set_status("No holdings"))
                return

            gbpusd = fetch_gbp_usd_rate()
            gbpeur = fetch_gbp_eur_rate()
            self._gbpusd = gbpusd
            self._gbpeur = gbpeur
            self.prices = fetch_current_prices(tickers, gbpusd=gbpusd)
            hist  = fetch_historical_data(tickers)
            bench = fetch_benchmark_data()
            rf    = fetch_risk_free_rate()

            mv = {
                h["ticker"]: _holding_stats(h)[0] * (self.prices.get(h["ticker"]) or 0)
                for h in holdings
            }
            total_mv = sum(mv.values())
            weights = {t: v / total_mv for t, v in mv.items()} if total_mv > 0 else {}

            self._hist_data = hist if not hist.empty else None

            if weights and not hist.empty and not bench.empty:
                self.metrics = calculate_all_metrics(hist, weights, bench, rf)

            self.root.after(0, self._update_ui)
            self.root.after(0, lambda: self._set_status("Live"))

        except Exception as exc:
            self.root.after(0, lambda: self._set_status(f"Error: {str(exc)[:50]}"))

    # ── UI updates ─────────────────────────────────────────────────────────────

    def _update_ui(self):
        self._update_header()
        self._update_holdings_table()
        self._update_metrics()
        self._update_charts()
        self._update_correlation()

    def _update_header(self):
        holdings   = self.portfolio.get("holdings", [])
        total_val  = 0.0
        total_cost = 0.0
        total_divs = 0.0

        for h in holdings:
            p = self.prices.get(h["ticker"])
            if p:
                shares, avg_cost = _holding_stats(h, self._gbpusd, self._gbpeur)
                total_val  += shares * p
                total_cost += shares * avg_cost
            total_divs += _dividend_total(h, self._gbpusd)

        pnl     = total_val - total_cost
        pnl_pct = pnl / total_cost if total_cost > 0 else 0.0
        color   = GREEN if pnl >= 0 else RED

        self._lbl_value.configure(text=f"{CURRENCY}{total_val:,.2f}", text_color=CYAN)
        self._lbl_pnl.configure(text=f"{CURRENCY}{pnl:+,.2f}  ({pnl_pct:+.2%})", text_color=color)
        self._lbl_divs.configure(
            text=f"{CURRENCY}{total_divs:,.2f}" if total_divs > 0 else "--",
            text_color=GREEN if total_divs > 0 else GREY,
        )
        self._lbl_count.configure(text=str(len(holdings)), text_color=CYAN)
        self._lbl_fxrate.configure(text=f"{self._gbpusd:.4f}", text_color=AMBER)

    def _update_holdings_table(self):
        for row_widgets in self._holding_rows:
            for w in row_widgets:
                w.destroy()
        self._holding_rows.clear()

        holdings = self.portfolio.get("holdings", [])
        total_mv = sum(
            _holding_stats(h)[0] * (self.prices.get(h["ticker"]) or 0) for h in holdings
        )

        for i, h in enumerate(holdings):
            ticker           = h["ticker"]
            shares, avg_cost = _holding_stats(h, self._gbpusd, self._gbpeur)
            price            = self.prices.get(ticker)
            divs             = _dividend_total(h, self._gbpusd)

            mv      = shares * price if price else None
            cost    = shares * avg_cost
            pnl     = (mv - cost) if mv is not None else None
            pnl_pct = pnl / cost if (pnl is not None and cost > 0) else None
            weight  = mv / total_mv if (mv and total_mv > 0) else None

            def f(v, fmt, fb="--"):
                return fmt.format(v) if v is not None else fb

            pnl_col = GREEN if (pnl or 0) >= 0 else RED
            row_bg  = CARD if i % 2 == 0 else PANEL

            row_data = [
                (ticker, CYAN),
                (h.get("type", "stock").upper(), PURPLE),
                (f"{shares:.6f}".rstrip("0").rstrip("."), WHITE),
                (f"{CURRENCY}{avg_cost:.2f}", WHITE),
                (f(price, f"{CURRENCY}{{:.2f}}"), WHITE),
                (f(mv, f"{CURRENCY}{{:,.2f}}"), WHITE),
                (f(pnl, f"{CURRENCY}{{:+,.2f}}"), pnl_col),
                (f(pnl_pct, "{:+.2%}"), pnl_col),
                (f"{CURRENCY}{divs:.2f}" if divs > 0 else "--", GREEN if divs > 0 else GREY),
                (f(weight, "{:.1%}"), AMBER),
            ]

            widgets = []
            for j, (text, color) in enumerate(row_data):
                lbl = ctk.CTkLabel(
                    self._holdings_frame,
                    text=text,
                    text_color=color,
                    font=ctk.CTkFont(family=FONT, size=11),
                    anchor="center",
                    width=110,
                    fg_color=row_bg,
                    corner_radius=4,
                )
                lbl.grid(row=i + 2, column=j, padx=2, pady=2)
                widgets.append(lbl)

            # "＋" transaction button
            tx_btn = ctk.CTkButton(
                self._holdings_frame, text="＋", width=40, height=26,
                font=ctk.CTkFont(family=FONT, size=12, weight="bold"),
                fg_color=PANEL, hover_color=BORDER,
                border_color=CYAN_DIM, border_width=1,
                text_color=CYAN, corner_radius=4,
                command=lambda t=ticker: self._dlg_transactions(t),
            )
            tx_btn.grid(row=i + 2, column=len(row_data), padx=4, pady=2)
            widgets.append(tx_btn)
            self._holding_rows.append(widgets)

    def _update_metrics(self):
        if not self.metrics:
            return

        positive_good        = {"alpha", "actual_return", "capm_expected_return"}
        negative_always_red  = {"var_95", "max_drawdown"}

        for key, (lbl, fmt) in self._metric_labels.items():
            val = self.metrics.get(key)
            if val is None:
                lbl.configure(text="--", text_color=GREY)
                continue
            try:
                text = fmt.format(val)
                if key in negative_always_red:
                    color = RED
                elif key in positive_good:
                    color = GREEN if val >= 0 else RED
                elif key == "sharpe_ratio":
                    color = GREEN if val >= 1 else (AMBER if val >= 0 else RED)
                else:
                    color = CYAN
                lbl.configure(text=text, text_color=color)
            except Exception:
                lbl.configure(text="--", text_color=GREY)

    def _update_charts(self):
        for ax in self._axes:
            ax.clear()
            ax.set_facecolor(CARD)

        holdings = self.portfolio.get("holdings", [])

        # ── Pie: allocation ──
        ax1 = self._axes[0]
        labels, values = [], []
        for h in holdings:
            p = self.prices.get(h["ticker"])
            if p:
                shares, _ = _holding_stats(h)
                labels.append(h["ticker"])
                values.append(shares * p)

        if values:
            neon_colors = [
                "#00d4ff", "#7b2fff", "#00ff88", "#ffb700",
                "#ff3b6b", "#00aaff", "#bb00ff", "#00ffcc",
            ]
            wedges, texts, autotexts = ax1.pie(
                values,
                labels=labels,
                autopct="%1.1f%%",
                startangle=90,
                colors=neon_colors[:len(values)],
                textprops={"color": WHITE, "fontsize": 9, "fontfamily": "monospace"},
                wedgeprops={"linewidth": 1.5, "edgecolor": PANEL},
            )
            for at in autotexts:
                at.set_fontsize(8)
                at.set_color(BG)

        ax1.set_title("ALLOCATION", color=CYAN, fontsize=12,
                      fontfamily="sans-serif", pad=12)
        ax1.set_facecolor(CARD)

        # ── Line: cumulative returns ──
        ax2 = self._axes[1]
        if self.metrics:
            pc = self.metrics.get("portfolio_cumulative")
            bc = self.metrics.get("benchmark_cumulative")

            if pc is not None and not pc.empty:
                ax2.plot(pc.index, pc.values * 100,
                         label="PORTFOLIO", color=CYAN, lw=2)
                ax2.fill_between(pc.index, pc.values * 100, alpha=0.08, color=CYAN)

            if bc is not None and not bc.empty:
                ax2.plot(bc.index, bc.values * 100,
                         label="S&P 500", color=AMBER, lw=1.5, ls="--", alpha=0.8)

            ax2.axhline(0, color=BORDER, lw=1)
            ax2.set_title("CUMULATIVE RETURNS  //  1Y", color=CYAN,
                          fontsize=12, fontfamily="sans-serif", pad=12)
            ax2.set_ylabel("RETURN (%)", color=GREY, fontsize=9, fontfamily="sans-serif")
            ax2.tick_params(colors=GREY, labelsize=8)
            for spine in ax2.spines.values():
                spine.set_color(BORDER)
            ax2.legend(facecolor=PANEL, labelcolor=WHITE,
                       fontsize=9, edgecolor=BORDER)
            ax2.set_facecolor(CARD)

        self._fig.patch.set_facecolor(PANEL)
        self._fig.tight_layout(pad=2.5)
        self._canvas.draw()

    # ── Dialogs ────────────────────────────────────────────────────────────────

    def _dlg_add(self):
        dlg = ctk.CTkToplevel(self.root)
        dlg.title("ADD HOLDING")
        dlg.geometry("420x520")
        dlg.configure(fg_color=BG)
        dlg.grab_set()
        dlg.lift()
        dlg.focus_force()

        ctk.CTkLabel(
            dlg, text="◈  ADD HOLDING",
            font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
            text_color=CYAN,
        ).pack(padx=22, pady=(18, 10), anchor="w")

        # ── Ticker search ──
        ctk.CTkLabel(dlg, text="SEARCH TICKER  (name or symbol)",
                     font=ctk.CTkFont(family=FONT, size=10),
                     text_color=GREY).pack(padx=22, pady=(8, 2), anchor="w")

        search_var = ctk.StringVar()
        search_entry = ctk.CTkEntry(
            dlg, width=374, textvariable=search_var,
            fg_color=PANEL, border_color=CYAN_DIM,
            text_color=WHITE, placeholder_text="e.g. Apple, AAPL, Bitcoin…",
            font=ctk.CTkFont(family=FONT, size=12),
        )
        search_entry.pack(padx=22)

        # Results listbox
        results_frame = ctk.CTkScrollableFrame(
            dlg, width=374, height=120, fg_color=CARD,
            scrollbar_button_color=BORDER,
        )
        results_frame.pack(padx=22, pady=(4, 0))
        results_frame.grid_columnconfigure(0, weight=1)

        selected_ticker = ctk.StringVar(value="")
        selected_type   = ctk.StringVar(value="stock")
        result_btns: list = []
        _search_job = [None]

        def _clear_results():
            for b in result_btns:
                b.destroy()
            result_btns.clear()

        def _on_select(symbol, qtype):
            selected_ticker.set(symbol)
            raw_type = qtype.lower()
            if "crypto" in raw_type:
                selected_type.set("crypto")
            elif "etf" in raw_type:
                selected_type.set("etf")
            else:
                selected_type.set("stock")
            search_var.set(symbol)
            _clear_results()

        def _do_search(query):
            results = search_tickers(query)
            dlg.after(0, lambda: _show_results(results))

        def _show_results(results):
            _clear_results()
            for r in results:
                label = f"{r['symbol']:<10}  {r['name'][:32]}"
                btn = ctk.CTkButton(
                    results_frame, text=label, anchor="w",
                    font=ctk.CTkFont(family=FONT, size=10),
                    fg_color="transparent", hover_color=BORDER,
                    text_color=WHITE, height=26,
                    command=lambda s=r["symbol"], t=r["type"]: _on_select(s, t),
                )
                btn.pack(fill="x", pady=1)
                result_btns.append(btn)

        def _on_keyrelease(event):
            if _search_job[0]:
                dlg.after_cancel(_search_job[0])
            query = search_var.get().strip()
            if len(query) >= 1:
                _search_job[0] = dlg.after(
                    400, lambda: threading.Thread(
                        target=_do_search, args=(query,), daemon=True
                    ).start()
                )
            else:
                _clear_results()
                selected_ticker.set("")

        search_entry.bind("<KeyRelease>", _on_keyrelease)

        # ── Transaction entry ──
        tx_outer = ctk.CTkFrame(dlg, fg_color=CARD, corner_radius=8,
                                border_color=BORDER, border_width=1)
        tx_outer.pack(padx=22, pady=(10, 0), fill="x")

        ctk.CTkLabel(tx_outer, text="BUY TRANSACTIONS",
                     font=ctk.CTkFont(family=FONT, size=10, weight="bold"),
                     text_color=CYAN).grid(row=0, column=0, columnspan=4,
                                           padx=12, pady=(8, 4), sticky="w")

        from datetime import date as _date
        for col, (lbl, w) in enumerate([("DATE", 86), ("SHARES", 86), ("PRICE / SHARE", 100), ("CCY", 70), ("TYPE", 70)]):
            ctk.CTkLabel(tx_outer, text=lbl,
                         font=ctk.CTkFont(family=FONT, size=9),
                         text_color=GREY, width=w).grid(row=1, column=col, padx=4, pady=2)

        e_date   = ctk.CTkEntry(tx_outer, width=86, fg_color=PANEL, border_color=BORDER,
                                text_color=WHITE, font=ctk.CTkFont(family=FONT, size=11))
        e_shares = ctk.CTkEntry(tx_outer, width=86, fg_color=PANEL, border_color=BORDER,
                                text_color=WHITE, font=ctk.CTkFont(family=FONT, size=11))
        e_price  = ctk.CTkEntry(tx_outer, width=100, fg_color=PANEL, border_color=BORDER,
                                text_color=WHITE, font=ctk.CTkFont(family=FONT, size=11))

        price_ccy_var = ctk.StringVar(value="GBP")
        price_ccy_menu = ctk.CTkOptionMenu(
            tx_outer, values=["GBP", "USD", "EUR"], variable=price_ccy_var, width=70,
            fg_color=PANEL, button_color=BORDER, button_hover_color=CYAN_DIM,
            text_color=CYAN, font=ctk.CTkFont(family=FONT, size=11),
        )
        tx_type_var = ctk.StringVar(value="buy")
        tx_type_menu = ctk.CTkOptionMenu(
            tx_outer, values=["buy", "sell"], variable=tx_type_var, width=70,
            fg_color=PANEL, button_color=BORDER, button_hover_color=CYAN_DIM,
            text_color=CYAN, font=ctk.CTkFont(family=FONT, size=11),
        )
        e_date.insert(0, str(_date.today()))
        e_date.grid(row=2, column=0, padx=4, pady=4)
        e_shares.grid(row=2, column=1, padx=4, pady=4)
        e_price.grid(row=2, column=2, padx=4, pady=4)
        price_ccy_menu.grid(row=2, column=3, padx=4, pady=4)
        tx_type_menu.grid(row=2, column=4, padx=4, pady=4)

        # Live GBP conversion preview
        gbp_preview = ctk.CTkLabel(
            tx_outer, text="",
            font=ctk.CTkFont(family=FONT, size=10),
            text_color=AMBER,
        )
        gbp_preview.grid(row=3, column=0, columnspan=5, padx=12, pady=(0, 2), sticky="w")

        def _update_preview(*_):
            ccy = price_ccy_var.get()
            if ccy == "GBP":
                gbp_preview.configure(text="")
                return
            try:
                p = float(e_price.get().replace(",", "").replace("$", "").replace("£", "").replace("€", ""))
                if ccy == "USD":
                    gbp_val = p / self._gbpusd
                    gbp_preview.configure(text=f"≈ £{gbp_val:.2f} at current rate (1 GBP = {self._gbpusd:.4f} USD)")
                elif ccy == "EUR":
                    gbp_val = p / self._gbpeur
                    gbp_preview.configure(text=f"≈ £{gbp_val:.2f} at current rate (1 GBP = {self._gbpeur:.4f} EUR)")
            except ValueError:
                gbp_preview.configure(text="")

        e_price.bind("<KeyRelease>", _update_preview)
        price_ccy_var.trace_add("write", _update_preview)

        pending_txs: list = []
        summary_lbl = ctk.CTkLabel(tx_outer, text="No transactions added yet",
                                   font=ctk.CTkFont(family=FONT, size=10),
                                   text_color=GREY)
        summary_lbl.grid(row=5, column=0, columnspan=6, padx=12, pady=(2, 8), sticky="w")

        tx_list_frame = ctk.CTkScrollableFrame(tx_outer, height=70, fg_color=PANEL,
                                               scrollbar_button_color=BORDER)
        tx_list_frame.grid(row=4, column=0, columnspan=6, padx=8, pady=4, sticky="ew")
        tx_widgets: list = []

        def _refresh_summary():
            if not pending_txs:
                summary_lbl.configure(text="No transactions added yet", text_color=GREY)
                return
            tmp = {"transactions": pending_txs}
            net_s, avg = _holding_stats(tmp, self._gbpusd, self._gbpeur)
            summary_lbl.configure(
                text=f"NET  {net_s:.4f} shares  //  AVG COST  {CURRENCY}{avg:.2f}",
                text_color=GREEN if net_s >= 0 else RED,
            )

        def _add_tx():
            try:
                d   = e_date.get().strip() or str(_date.today())
                s   = float(e_shares.get().replace(",", ""))
                p   = float(e_price.get().replace(",", "").replace("$", "").replace("£", "").replace("€", ""))
                tt  = tx_type_var.get()
                ccy = price_ccy_var.get()
                if s <= 0 or p <= 0:
                    raise ValueError
            except ValueError:
                messagebox.showerror("INPUT ERROR",
                                     "Enter valid shares and price per share.", parent=dlg)
                return

            pending_txs.append({"date": d, "shares": s, "price": p,
                                 "price_currency": ccy, "type": tt})
            e_shares.delete(0, "end")
            e_price.delete(0, "end")
            gbp_preview.configure(text="")

            color    = CYAN if tt == "buy" else RED
            tag      = "BUY " if tt == "buy" else "SELL"
            ccy_sym  = {"GBP": "£", "USD": "$", "EUR": "€"}.get(ccy, ccy)
            lbl = ctk.CTkLabel(tx_list_frame,
                               text=f"{tag}  {d}   {s:.4f} shares @ {ccy_sym}{p:.2f}  [{ccy}]",
                               font=ctk.CTkFont(family=FONT, size=10),
                               text_color=color, anchor="w")
            lbl.pack(fill="x", padx=8, pady=1)
            tx_widgets.append(lbl)
            _refresh_summary()

        ctk.CTkButton(tx_outer, text="ADD", command=_add_tx, width=50,
                      fg_color=PANEL, hover_color=BORDER, border_color=CYAN_DIM,
                      border_width=1, text_color=CYAN, corner_radius=4,
                      font=ctk.CTkFont(family=FONT, size=11),
                      ).grid(row=2, column=5, padx=8, pady=4)

        def _submit():
            ticker = selected_ticker.get().strip().upper() or search_var.get().strip().upper()
            if not ticker:
                messagebox.showerror("INPUT ERROR",
                                     "Select a ticker from the search results.", parent=dlg)
                return
            if not pending_txs:
                messagebox.showerror("INPUT ERROR",
                                     "Add at least one buy transaction.", parent=dlg)
                return

            self._set_status("Validating ticker…")
            dlg.destroy()

            def _validate_and_save():
                if not validate_ticker(ticker):
                    self.root.after(0, lambda: messagebox.showerror(
                        "INVALID TICKER",
                        f'"{ticker}" was not found.\nCheck the spelling and try again.'
                    ))
                    self.root.after(0, lambda: self._set_status("Invalid ticker"))
                    return

                asset_type = selected_type.get()
                for h in self.portfolio["holdings"]:
                    if h["ticker"] == ticker:
                        h["transactions"].extend(pending_txs)
                        break
                else:
                    self.portfolio["holdings"].append({
                        "ticker":       ticker,
                        "type":         asset_type,
                        "transactions": pending_txs,
                        "dividends":    [],
                    })

                self._save_portfolio()
                self.root.after(0, self.refresh_data)

            threading.Thread(target=_validate_and_save, daemon=True).start()

        dlg.bind("<Return>", lambda e: _add_tx())
        ctk.CTkButton(dlg, text="CONFIRM & SAVE", command=_submit, width=374,
                      **_neon_btn_style()).pack(padx=22, pady=14)

    def _dlg_transactions(self, ticker):
        """View history and add new buy transactions for an existing holding."""
        holding = next((h for h in self.portfolio["holdings"] if h["ticker"] == ticker), None)
        if not holding:
            return

        dlg = ctk.CTkToplevel(self.root)
        dlg.title(f"TRANSACTIONS  //  {ticker}")
        dlg.geometry("480x540")
        dlg.configure(fg_color=BG)
        dlg.grab_set()
        dlg.lift()
        dlg.focus_force()

        ctk.CTkLabel(dlg, text=f"◈  {ticker}  TRANSACTION LOG",
                     font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
                     text_color=CYAN).pack(padx=22, pady=(18, 6), anchor="w")

        # Existing transactions
        ctk.CTkLabel(dlg, text="HISTORY",
                     font=ctk.CTkFont(family=FONT, size=10),
                     text_color=GREY).pack(padx=22, pady=(4, 2), anchor="w")

        hist_frame = ctk.CTkScrollableFrame(dlg, height=140, fg_color=CARD,
                                            scrollbar_button_color=BORDER)
        hist_frame.pack(padx=22, fill="x")

        txs = holding.get("transactions", [])
        if not txs:
            ctk.CTkLabel(hist_frame, text="No transactions recorded.",
                         font=ctk.CTkFont(family=FONT, size=10),
                         text_color=GREY).pack(padx=8, pady=6, anchor="w")
        for t in txs:
            tt    = t.get("type", "buy").upper()
            color = CYAN if tt == "BUY" else RED
            ccy   = t.get("price_currency", "GBP")
            ccy_sym = "£" if ccy == "GBP" else "$"
            ctk.CTkLabel(hist_frame,
                         text=f"{tt:<4}  {t['date']:<14}  {t['shares']:.6f} @ {ccy_sym}{t['price']:.2f}  [{ccy}]",
                         font=ctk.CTkFont(family=FONT, size=10),
                         text_color=color, anchor="w").pack(fill="x", padx=8, pady=2)

        shares_now, avg_now = _holding_stats(holding, self._gbpusd)
        ctk.CTkLabel(dlg,
                     text=f"CURRENT  //  {shares_now:.6f} shares  //  AVG COST  {CURRENCY}{avg_now:.2f}",
                     font=ctk.CTkFont(family=FONT, size=11, weight="bold"),
                     text_color=GREEN).pack(padx=22, pady=(8, 4), anchor="w")

        # Dividends section
        divs = holding.get("dividends", [])
        if divs:
            ctk.CTkFrame(dlg, height=1, fg_color=BORDER).pack(padx=22, fill="x", pady=(4, 0))
            ctk.CTkLabel(dlg, text="DIVIDENDS RECEIVED",
                         font=ctk.CTkFont(family=FONT, size=10),
                         text_color=GREY).pack(padx=22, pady=(4, 2), anchor="w")
            div_frame = ctk.CTkScrollableFrame(dlg, height=70, fg_color=CARD,
                                               scrollbar_button_color=BORDER)
            div_frame.pack(padx=22, fill="x")
            total_div = _dividend_total(holding, self._gbpusd)
            for d in divs:
                ccy = d.get("currency", "GBP")
                ccy_sym = "£" if ccy == "GBP" else "$"
                ctk.CTkLabel(div_frame,
                             text=f"DIV   {d['date']:<14}  {ccy_sym}{d['amount']:.2f}  [{ccy}]",
                             font=ctk.CTkFont(family=FONT, size=10),
                             text_color=GREEN, anchor="w").pack(fill="x", padx=8, pady=2)
            ctk.CTkLabel(dlg,
                         text=f"TOTAL DIVIDENDS  //  {CURRENCY}{total_div:.2f}",
                         font=ctk.CTkFont(family=FONT, size=10, weight="bold"),
                         text_color=GREEN).pack(padx=22, pady=(2, 0), anchor="w")

        # Add new transaction
        ctk.CTkFrame(dlg, height=1, fg_color=BORDER).pack(padx=22, fill="x", pady=6)
        ctk.CTkLabel(dlg, text="ADD NEW BUY",
                     font=ctk.CTkFont(family=FONT, size=10, weight="bold"),
                     text_color=CYAN).pack(padx=22, pady=(0, 6), anchor="w")

        from datetime import date as _date
        row_f = ctk.CTkFrame(dlg, fg_color="transparent")
        row_f.pack(padx=22, fill="x")

        for col, lbl in enumerate(["DATE", "SHARES", "PRICE / SHARE", "CCY", "TYPE"]):
            ctk.CTkLabel(row_f, text=lbl,
                         font=ctk.CTkFont(family=FONT, size=9),
                         text_color=GREY).grid(row=0, column=col, padx=4, pady=2, sticky="w")

        e_date   = ctk.CTkEntry(row_f, width=96, fg_color=PANEL, border_color=BORDER,
                                text_color=WHITE, font=ctk.CTkFont(family=FONT, size=11))
        e_shares = ctk.CTkEntry(row_f, width=96, fg_color=PANEL, border_color=BORDER,
                                text_color=WHITE, font=ctk.CTkFont(family=FONT, size=11))
        e_price  = ctk.CTkEntry(row_f, width=100, fg_color=PANEL, border_color=BORDER,
                                text_color=WHITE, font=ctk.CTkFont(family=FONT, size=11))

        price_ccy_var2 = ctk.StringVar(value="GBP")
        price_ccy_menu2 = ctk.CTkOptionMenu(
            row_f, values=["GBP", "USD", "EUR"], variable=price_ccy_var2, width=70,
            fg_color=PANEL, button_color=BORDER, button_hover_color=CYAN_DIM,
            text_color=CYAN, font=ctk.CTkFont(family=FONT, size=11),
        )
        tx_type_var2 = ctk.StringVar(value="buy")
        tx_type_menu2 = ctk.CTkOptionMenu(
            row_f, values=["buy", "sell"], variable=tx_type_var2, width=70,
            fg_color=PANEL, button_color=BORDER, button_hover_color=CYAN_DIM,
            text_color=CYAN, font=ctk.CTkFont(family=FONT, size=11),
        )
        e_date.insert(0, str(_date.today()))
        e_date.grid(row=1, column=0, padx=4, pady=4)
        e_shares.grid(row=1, column=1, padx=4, pady=4)
        e_price.grid(row=1, column=2, padx=4, pady=4)
        price_ccy_menu2.grid(row=1, column=3, padx=4, pady=4)
        tx_type_menu2.grid(row=1, column=4, padx=4, pady=4)

        # Live GBP conversion preview
        gbp_preview2 = ctk.CTkLabel(
            row_f, text="",
            font=ctk.CTkFont(family=FONT, size=10),
            text_color=AMBER,
        )
        gbp_preview2.grid(row=2, column=0, columnspan=5, padx=4, pady=(0, 2), sticky="w")

        def _update_preview2(*_):
            ccy = price_ccy_var2.get()
            if ccy == "GBP":
                gbp_preview2.configure(text="")
                return
            try:
                p = float(e_price.get().replace(",", "").replace("$", "").replace("£", "").replace("€", ""))
                if ccy == "USD":
                    gbp_val = p / self._gbpusd
                    gbp_preview2.configure(text=f"≈ £{gbp_val:.2f} at current rate (1 GBP = {self._gbpusd:.4f} USD)")
                elif ccy == "EUR":
                    gbp_preview2.configure(text="EUR entered — will be stored as EUR and converted at refresh")
            except ValueError:
                gbp_preview2.configure(text="")

        e_price.bind("<KeyRelease>", _update_preview2)
        price_ccy_var2.trace_add("write", _update_preview2)

        feedback = ctk.CTkLabel(dlg, text="",
                                font=ctk.CTkFont(family=FONT, size=11),
                                text_color=GREEN)
        feedback.pack(padx=22, anchor="w")

        def _add():
            try:
                d   = e_date.get().strip() or str(_date.today())
                s   = float(e_shares.get().replace(",", ""))
                p   = float(e_price.get().replace(",", "").replace("$", "").replace("£", "").replace("€", ""))
                tt  = tx_type_var2.get()
                ccy = price_ccy_var2.get()
                if s <= 0 or p <= 0:
                    raise ValueError
            except ValueError:
                feedback.configure(text="Enter valid shares and price.", text_color=RED)
                return

            holding["transactions"].append({"date": d, "shares": s, "price": p,
                                            "price_currency": ccy, "type": tt})
            self._save_portfolio()

            new_s, new_avg = _holding_stats(holding, self._gbpusd)
            tag     = "BUY" if tt == "buy" else "SELL"
            ccy_sym = {"GBP": "£", "USD": "$", "EUR": "€"}.get(ccy, ccy)
            feedback.configure(
                text=f"✓  {tag}  {s:.4f} @ {ccy_sym}{p:.2f} [{ccy}]  //  Net: {new_s:.4f} shares  Avg: {CURRENCY}{new_avg:.2f}",
                text_color=GREEN if tt == "buy" else AMBER,
            )
            e_shares.delete(0, "end")
            e_price.delete(0, "end")
            gbp_preview2.configure(text="")

            # Refresh history list
            for w in hist_frame.winfo_children():
                w.destroy()
            for t in holding["transactions"]:
                ttype  = t.get("type", "buy").upper()
                tcolor = CYAN if ttype == "BUY" else RED
                tccy   = t.get("price_currency", "GBP")
                tccy_sym = "£" if tccy == "GBP" else "$"
                ctk.CTkLabel(hist_frame,
                             text=f"{ttype:<4}  {t['date']:<14}  {t['shares']:.6f} @ {tccy_sym}{t['price']:.2f}  [{tccy}]",
                             font=ctk.CTkFont(family=FONT, size=10),
                             text_color=tcolor, anchor="w").pack(fill="x", padx=8, pady=2)

            self.root.after(0, self.refresh_data)

        ctk.CTkButton(dlg, text="ADD BUY", command=_add, width=434,
                      **_neon_btn_style()).pack(padx=22, pady=10)

        ctk.CTkButton(dlg, text="CLOSE", command=dlg.destroy, width=434,
                      fg_color=PANEL, hover_color=BORDER, border_color=BORDER,
                      border_width=1, text_color=GREY, corner_radius=6,
                      font=ctk.CTkFont(family=FONT, size=12)).pack(padx=22, pady=(0, 14))

    def _dlg_remove(self):
        holdings = self.portfolio.get("holdings", [])
        if not holdings:
            messagebox.showinfo("INFO", "No holdings to remove.")
            return

        dlg = ctk.CTkToplevel(self.root)
        dlg.title("REMOVE HOLDING")
        dlg.geometry("320x200")
        dlg.configure(fg_color=BG)
        dlg.grab_set()

        ctk.CTkLabel(dlg, text="◈  REMOVE HOLDING",
                     font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
                     text_color=RED).pack(padx=22, pady=(18, 10), anchor="w")

        ctk.CTkLabel(dlg, text="SELECT TICKER",
                     font=ctk.CTkFont(family=FONT, size=10),
                     text_color=GREY).pack(padx=22, pady=(4, 2), anchor="w")

        tickers = [h["ticker"] for h in holdings]
        t_var = ctk.StringVar(value=tickers[0])
        ctk.CTkOptionMenu(dlg, values=tickers, variable=t_var, width=274,
                          fg_color=PANEL, button_color=BORDER,
                          button_hover_color=CYAN_DIM, text_color=WHITE,
                          font=ctk.CTkFont(family=FONT, size=11)).pack(padx=22)

        def _remove():
            t = t_var.get()
            self.portfolio["holdings"] = [h for h in holdings if h["ticker"] != t]
            self._save_portfolio()
            dlg.destroy()
            self.refresh_data()

        ctk.CTkButton(dlg, text="CONFIRM REMOVE", command=_remove, width=274,
                      fg_color=PANEL, hover_color="#3a0010",
                      border_color=RED, border_width=1,
                      text_color=RED,
                      font=ctk.CTkFont(family=FONT, size=12),
                      corner_radius=6).pack(padx=22, pady=18)

    def _import_csv(self):
        path = filedialog.askopenfilename(
            title="Select Revolut Statement Export",
            filetypes=[
                ("Spreadsheet files", "*.csv *.xlsx *.xls"),
                ("CSV files", "*.csv"),
                ("Excel files", "*.xlsx *.xls"),
                ("All files", "*.*"),
            ],
        )
        if not path:
            return

        try:
            imported = parse_revolut_csv(path)
        except ValueError as exc:
            messagebox.showerror("IMPORT ERROR", str(exc))
            return

        if not imported:
            messagebox.showwarning("WARNING", "No holdings found in the file.")
            return

        existing = {h["ticker"]: h for h in self.portfolio["holdings"]}
        for h in imported:
            if h["ticker"] in existing:
                # Merge transactions into existing holding
                existing[h["ticker"]]["transactions"].extend(h["transactions"])
            else:
                existing[h["ticker"]] = h
        self.portfolio["holdings"] = list(existing.values())
        self._save_portfolio()

        # Build a cross-check summary so the user can verify against Revolut
        total_buy_cost = sum(
            t["shares"] * t["price"]
            for h in imported
            for t in h.get("transactions", [])
            if t.get("type", "buy") == "buy"
        )
        ticker_list = ", ".join(h["ticker"] for h in imported)
        messagebox.showinfo(
            "IMPORT COMPLETE",
            f"Imported {len(imported)} holding(s): {ticker_list}\n\n"
            f"Implied cost basis from transactions: {CURRENCY}{total_buy_cost:,.2f}\n\n"
            "Cross-check this figure against the total invested\n"
            "shown on your Revolut statement. If they match,\n"
            "the import is accurate.",
        )
        self.refresh_data()

    # ── AI Insights ────────────────────────────────────────────────────────────

    def _build_ai_insights(self):
        tab = self._tab_ai
        tab.grid_columnconfigure(0, weight=1)
        tab.grid_rowconfigure(2, weight=1)

        # ── Top bar ──
        top = ctk.CTkFrame(tab, fg_color=CARD, border_color=BORDER,
                           border_width=1, corner_radius=8)
        top.grid(row=0, column=0, sticky="ew", padx=4, pady=(4, 0))
        top.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            top,
            text="◈  AI PORTFOLIO ANALYSIS  //  Powered by Claude Haiku 4.5",
            font=ctk.CTkFont(family=FONT, size=11, weight="bold"),
            text_color=CYAN,
        ).grid(row=0, column=0, padx=16, pady=(10, 4), sticky="w")

        ctk.CTkLabel(
            top,
            text="Quantitative portfolio review: risk profile, performance attribution, diversification & key signals.",
            font=ctk.CTkFont(family=FONT, size=10),
            text_color=GREY,
        ).grid(row=1, column=0, padx=16, pady=(0, 10), sticky="w")

        btn_col = ctk.CTkFrame(top, fg_color="transparent")
        btn_col.grid(row=0, column=1, rowspan=2, padx=16, pady=10, sticky="e")

        self._ai_btn = ctk.CTkButton(
            btn_col, text="⟳  GENERATE ANALYSIS",
            command=self._run_ai_analysis,
            width=200,
            **_neon_btn_style(),
        )
        self._ai_btn.pack()

        self._ai_cache_lbl = ctk.CTkLabel(
            btn_col, text="",
            font=ctk.CTkFont(family=FONT, size=9),
            text_color=AMBER,
        )
        self._ai_cache_lbl.pack(pady=(4, 0))

        # ── API key row ──
        import os as _os
        key_row = ctk.CTkFrame(tab, fg_color=PANEL, border_color=BORDER,
                               border_width=1, corner_radius=8)
        key_row.grid(row=1, column=0, sticky="ew", padx=4, pady=(6, 6))
        key_row.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(
            key_row, text="ANTHROPIC API KEY",
            font=ctk.CTkFont(family=FONT, size=10),
            text_color=GREY,
        ).grid(row=0, column=0, padx=14, pady=10, sticky="w")

        self._ai_key_entry = ctk.CTkEntry(
            key_row,
            placeholder_text="sk-ant-…  (paste your key here)",
            show="*",
            fg_color=CARD, border_color=CYAN_DIM,
            text_color=WHITE,
            font=ctk.CTkFont(family=FONT, size=11),
        )
        # Pre-fill from saved config, then fall back to environment variable
        saved_key = self._load_config().get("anthropic_api_key", "")
        prefill = saved_key or _os.environ.get("ANTHROPIC_API_KEY", "")
        if prefill:
            self._ai_key_entry.insert(0, prefill)
        self._ai_key_entry.grid(row=0, column=1, padx=8, pady=10, sticky="ew")

        ctk.CTkButton(
            key_row, text="SHOW / HIDE",
            command=self._toggle_key_visibility,
            width=100, **_neon_btn_style(),
        ).grid(row=0, column=2, padx=14, pady=10)

        self._key_shown = False

        # ── Output textbox ──
        out_frame = ctk.CTkFrame(tab, fg_color=PANEL, border_color=BORDER,
                                 border_width=1, corner_radius=8)
        out_frame.grid(row=2, column=0, sticky="nsew", padx=4, pady=(0, 4))
        out_frame.grid_columnconfigure(0, weight=1)
        out_frame.grid_rowconfigure(0, weight=1)

        self._ai_textbox = ctk.CTkTextbox(
            out_frame,
            fg_color=PANEL,
            text_color=WHITE,
            font=ctk.CTkFont(family=FONT, size=12),
            wrap="word",
            border_width=0,
            activate_scrollbars=True,
        )
        self._ai_textbox.grid(row=0, column=0, sticky="nsew", padx=8, pady=8)
        self._ai_textbox.insert("end",
            "Paste your Anthropic API key above, then click  ⟳ GENERATE ANALYSIS.\n\n"
            "Get a key at: console.anthropic.com"
        )
        self._ai_textbox.configure(state="disabled")

    def _toggle_key_visibility(self):
        self._key_shown = not self._key_shown
        self._ai_key_entry.configure(show="" if self._key_shown else "*")

    def _compute_scores(self, holdings, weights, metrics) -> dict:
        """
        Compute portfolio scores from hard rules — no AI involvement.
        Each dimension is 0-25; total is 0-100.
        """
        # ── 1. Diversification (holdings count + asset type variety) ──────────
        n = len(holdings)
        if   n >= 10: d_score = 23
        elif n >= 7:  d_score = 20
        elif n >= 5:  d_score = 16
        elif n >= 3:  d_score = 11
        elif n == 2:  d_score = 6
        else:         d_score = 3
        types = {h.get("type", "stock").lower() for h in holdings}
        if len(types) > 1:          # mixed asset classes
            d_score = min(25, d_score + 2)

        # ── 2. Risk-Adjusted Return (Sharpe) ──────────────────────────────────
        sharpe = (metrics or {}).get("sharpe_ratio")
        if   sharpe is None:   r_score = 10
        elif sharpe >= 2.0:    r_score = 25
        elif sharpe >= 1.5:    r_score = 22
        elif sharpe >= 1.0:    r_score = 18
        elif sharpe >= 0.8:    r_score = 15
        elif sharpe >= 0.5:    r_score = 12
        elif sharpe >= 0.3:    r_score = 8
        elif sharpe >= 0.0:    r_score = 5
        else:                  r_score = 2

        # ── 3. Concentration Risk (largest single weight) ─────────────────────
        max_w = max(weights.values()) if weights else 1.0
        if   max_w > 0.50: c_score = 4
        elif max_w > 0.40: c_score = 8
        elif max_w > 0.30: c_score = 12
        elif max_w > 0.20: c_score = 17
        elif max_w > 0.15: c_score = 21
        else:              c_score = 25

        # ── 4. Performance vs Market (Jensen's Alpha) ─────────────────────────
        alpha = (metrics or {}).get("alpha")
        if   alpha is None:    p_score = 10
        elif alpha >= 0.10:    p_score = 25
        elif alpha >= 0.05:    p_score = 21
        elif alpha >= 0.02:    p_score = 17
        elif alpha >= 0.0:     p_score = 13
        elif alpha >= -0.05:   p_score = 9
        elif alpha >= -0.10:   p_score = 5
        else:                  p_score = 2

        def badge(s):
            return "✅" if s >= 18 else ("⚠️" if s >= 10 else "❌")

        return {
            "diversification":   (d_score, badge(d_score)),
            "risk_adjusted":     (r_score, badge(r_score)),
            "concentration":     (c_score, badge(c_score)),
            "performance":       (p_score, badge(p_score)),
            "total":             d_score + r_score + c_score + p_score,
        }

    def _build_ai_context(self) -> str:
        """Assemble current portfolio data into a structured string for the AI."""
        holdings  = self.portfolio.get("holdings", [])
        gbpusd    = self._gbpusd
        lines     = []

        lines.append(f"GBP/USD exchange rate: {gbpusd:.4f}")
        lines.append(f"GBP/EUR exchange rate: {self._gbpeur:.4f}")
        lines.append("")

        total_val  = 0.0
        total_cost = 0.0
        total_divs = 0.0
        holding_lines = []
        mv_map = {}

        for h in holdings:
            ticker           = h["ticker"]
            shares, avg_cost = _holding_stats(h, gbpusd, self._gbpeur)
            price            = self.prices.get(ticker)
            divs             = _dividend_total(h, gbpusd)

            mv      = shares * price if price else None
            cost    = shares * avg_cost
            pnl     = (mv - cost) if mv is not None else None
            pnl_pct = pnl / cost if (pnl is not None and cost > 0) else None

            if mv:
                total_val  += mv
                total_cost += cost
                mv_map[ticker] = mv
            total_divs += divs

            line = (
                f"  {ticker} ({h.get('type','stock').upper()}): "
                f"{shares:.4f} shares, avg cost £{avg_cost:.2f}, "
                f"current price £{price:.2f}" if price else
                f"  {ticker} ({h.get('type','stock').upper()}): "
                f"{shares:.4f} shares, avg cost £{avg_cost:.2f}, price unavailable"
            )
            if pnl is not None:
                line += f", P&L £{pnl:+.2f} ({pnl_pct:+.2%})"
            if divs > 0:
                line += f", dividends received £{divs:.2f}"
            holding_lines.append(line)

        total_pnl     = total_val - total_cost
        total_pnl_pct = total_pnl / total_cost if total_cost > 0 else 0.0
        weights       = {t: v / total_val for t, v in mv_map.items()} if total_val > 0 else {}

        lines.append("PORTFOLIO SUMMARY")
        lines.append(f"  Total market value:    £{total_val:,.2f}")
        lines.append(f"  Total cost basis:      £{total_cost:,.2f}")
        lines.append(f"  Unrealised P&L:        £{total_pnl:+,.2f}  ({total_pnl_pct:+.2%})")
        lines.append(f"  Total dividends recv:  £{total_divs:,.2f}")
        lines.append(f"  Number of holdings:    {len(holdings)}")
        lines.append("")
        lines.append("HOLDINGS")
        lines.extend(holding_lines)

        if weights:
            lines.append("")
            lines.append("PORTFOLIO WEIGHTS")
            for t, w in sorted(weights.items(), key=lambda x: -x[1]):
                lines.append(f"  {t}: {w:.1%}")

        if self.metrics:
            lines.append("")
            lines.append("RISK & PERFORMANCE METRICS  (1-year, annualised)")
            metric_labels = [
                ("sharpe_ratio",         "Sharpe Ratio",           "{:.3f}"),
                ("actual_return",        "Actual Return (Ann.)",   "{:.2%}"),
                ("volatility",           "Volatility (Ann.)",      "{:.2%}"),
                ("max_drawdown",         "Max Drawdown",           "{:.2%}"),
                ("var_95",               "VaR 95% (Daily)",        "{:.2%}"),
                ("beta",                 "Beta vs S&P 500",        "{:.3f}"),
                ("capm_expected_return", "CAPM Expected Return",   "{:.2%}"),
                ("alpha",                "Jensen's Alpha",         "{:.2%}"),
            ]
            for key, label, fmt in metric_labels:
                val = self.metrics.get(key)
                if val is not None:
                    lines.append(f"  {label}: {fmt.format(val)}")

        # ── Pre-computed scores (AI must use these exactly) ───────────────────
        scores = self._compute_scores(holdings, weights, self.metrics)
        lines.append("")
        lines.append("PRE-COMPUTED PORTFOLIO SCORES  (use these exact numbers — do not recalculate)")
        lines.append(f"  Overall Score:         {scores['total']} / 100")
        lines.append(f"  Diversification:       {scores['diversification'][0]} / 25  {scores['diversification'][1]}")
        lines.append(f"  Risk-Adjusted Return:  {scores['risk_adjusted'][0]} / 25  {scores['risk_adjusted'][1]}")
        lines.append(f"  Concentration Risk:    {scores['concentration'][0]} / 25  {scores['concentration'][1]}")
        lines.append(f"  Performance vs Market: {scores['performance'][0]} / 25  {scores['performance'][1]}")

        return "\n".join(lines)

    def _run_ai_analysis(self):
        holdings = self.portfolio.get("holdings", [])
        if not holdings:
            messagebox.showwarning("AI INSIGHTS", "Add holdings before running analysis.")
            return

        api_key = self._ai_key_entry.get().strip()
        if not api_key:
            messagebox.showerror(
                "API KEY MISSING",
                "Paste your Anthropic API key into the field above.\n\n"
                "Get one at: console.anthropic.com",
            )
            return

        self._save_config("anthropic_api_key", api_key)

        self._ai_btn.configure(state="disabled", text="[ ANALYSING… ]")
        self._ai_cache_lbl.configure(text="")
        self._ai_textbox.configure(state="normal")
        self._ai_textbox.delete("1.0", "end")
        self._ai_textbox.configure(state="disabled")

        context = self._build_ai_context()

        def _on_token(text: str):
            self.root.after(0, lambda t=text: _append(t))

        def _append(t: str):
            self._ai_textbox.configure(state="normal")
            self._ai_textbox.insert("end", t)
            self._ai_textbox.see("end")
            self._ai_textbox.configure(state="disabled")

        def _on_done(from_cache: bool = False):
            def _update():
                self._ai_btn.configure(state="normal", text="⟳  GENERATE ANALYSIS")
                if from_cache:
                    self._ai_cache_lbl.configure(
                        text="◈ CACHED  —  portfolio unchanged since last run"
                    )
                else:
                    self._ai_cache_lbl.configure(text="◈ FRESH  —  generated now")
            self.root.after(0, _update)

        def _on_error(msg: str):
            self.root.after(0, lambda: _append(f"\n[ ERROR ]\n{msg}"))
            self.root.after(0, lambda: self._ai_btn.configure(
                state="normal", text="⟳  GENERATE ANALYSIS"
            ))
            self.root.after(0, lambda: self._ai_cache_lbl.configure(text=""))

        threading.Thread(
            target=stream_analysis,
            args=(context, _on_token, _on_done, _on_error),
            kwargs={"api_key": api_key},
            daemon=True,
        ).start()

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _set_status(self, text: str):
        self._status.configure(text=text)

    def run(self):
        self.root.mainloop()
