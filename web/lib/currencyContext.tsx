"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type Currency = "GBP" | "EUR" | "USD";
export const CURRENCIES: Currency[] = ["GBP", "EUR", "USD"];
export const CURRENCY_SYMBOL: Record<Currency, string> = { GBP: "£", EUR: "€", USD: "$" };
const STORAGE_KEY = "portivex_currency";

type CurrencyCtx = { currency: Currency; setCurrency: (c: Currency) => void };
const Ctx = createContext<CurrencyCtx>({ currency: "GBP", setCurrency: () => {} });

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("GBP");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Currency | null;
    if (saved && CURRENCIES.includes(saved)) setCurrencyState(saved);
  }, []);

  function setCurrency(c: Currency) {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }

  return <Ctx.Provider value={{ currency, setCurrency }}>{children}</Ctx.Provider>;
}

export function useCurrency() {
  return useContext(Ctx);
}
