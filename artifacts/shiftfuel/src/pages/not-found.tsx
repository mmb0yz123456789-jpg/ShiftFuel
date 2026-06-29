import { Link } from "wouter";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F7F7F5",
      fontFamily: "Inter, 'Segoe UI', Arial, sans-serif",
    }}>
      <div style={{
        textAlign: "center",
        padding: "48px 32px",
        maxWidth: 480,
      }}>
        <div style={{
          fontSize: "80px",
          lineHeight: 1,
          marginBottom: "24px",
          color: "#0D3B3B",
          fontWeight: 700,
        }}>
          404
        </div>
        <h1 style={{
          fontSize: "24px",
          fontWeight: 700,
          color: "#0D3B3B",
          marginBottom: "12px",
          letterSpacing: "-0.02em",
        }}>
          Page Not Found
        </h1>
        <p style={{
          fontSize: "16px",
          color: "#5F6F6D",
          marginBottom: "32px",
          lineHeight: 1.6,
        }}>
          We couldn&rsquo;t find the page you&rsquo;re looking for.
          It may have been moved or the link might be wrong.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "#0D3B3B",
            color: "#FFFFFF",
            padding: "14px 28px",
            borderRadius: "999px",
            fontWeight: 600,
            fontSize: "15px",
            textDecoration: "none",
          }}
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
