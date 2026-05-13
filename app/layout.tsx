import "../styles.css";

export const metadata = {
  title: "PCDL Platform",
  description: "Central Summer Word Fest accountability platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__PCDL_SUPABASE_URL__ = "${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}";
              window.__PCDL_SUPABASE_ANON_KEY__ = "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}";
            `
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
