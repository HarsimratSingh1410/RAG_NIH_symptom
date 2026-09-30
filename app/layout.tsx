import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Symptom-Info Assistant | AI-Powered Medical FAQ",
  description:
    "Ask about symptoms, causes, treatments, and prevention — powered by NIH-curated medical sources and Groq-hosted Llama AI. Free, fast, and grounded in real medical literature.",
  keywords: [
    "symptoms",
    "medical FAQ",
    "health assistant",
    "NIH",
    "RAG",
    "AI health",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}