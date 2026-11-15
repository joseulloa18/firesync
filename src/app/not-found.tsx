import Link from "next/link";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
export default function NotFound() {
  return (
    <html lang="es">
      <body>
        <main className="empty-card">
          <h1>{es.notFound}</h1>
          <p lang="en">{en.notFound}</p>
          <Link href="/es">{es.nav.home}</Link>
        </main>
      </body>
    </html>
  );
}
