import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// 🔥 Importamos nuestro nuevo proveedor de autenticación global (Modularidad Estricta)
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 🔥 Configuración del color de la barra superior para celulares
export const viewport: Viewport = {
  themeColor: "#020617", 
};

// 🔥 Títulos de tu app y conexión con el manifest.json
export const metadata: Metadata = {
  title: "Club de Pronósticos",
  description: "Demuestra que eres el que más sabe de fútbol y gana la bolsa",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pronósticos",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative bg-[#020617] text-slate-200">
        {/* 🔥 Envolvemos la app para que cualquier componente pueda usar la sesión sin tocar el disco */}
        <AuthProvider>
          
          {/* Contenido principal de la aplicación */}
          {children}
          
        </AuthProvider>
      </body>
    </html>
  );
}