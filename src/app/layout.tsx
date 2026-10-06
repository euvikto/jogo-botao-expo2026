import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Botão Copa 2026 — futebol de botão 3D",
  description: "Futebol de botão em 3D: escolha uma das 48 seleções da Copa de 2026 e jogue contra a CPU.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-slate-950 text-white antialiased">{children}</body>
    </html>
  );
}
