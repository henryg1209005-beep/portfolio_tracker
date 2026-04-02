import { CurrencyProvider } from "@/lib/currencyContext";
import { DemoModeProvider } from "@/lib/demoModeContext";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <CurrencyProvider>
      <DemoModeProvider>
        {children}
      </DemoModeProvider>
    </CurrencyProvider>
  );
}
