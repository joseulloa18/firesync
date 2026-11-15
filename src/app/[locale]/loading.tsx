import es from "../../../messages/es.json";
import en from "../../../messages/en.json";
export default function Loading() {
  return (
    <p role="status" className="empty-card">
      <span lang="es">{es.loading}</span> / <span lang="en">{en.loading}</span>
    </p>
  );
}
