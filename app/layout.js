// app/layout.jsx
import { AuthProvider } from "@/app/context/AuthContext";
import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body suppressHydrationWarning={true} className="min-h-full bg-slate-50">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}