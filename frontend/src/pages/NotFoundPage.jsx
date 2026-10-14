import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section className="simple-page">
      <p className="eyebrow">404 · PAGE NOT FOUND</p>
      <h1>This page is not available.</h1>
      <Link className="button button--primary" to="/">Return home</Link>
    </section>
  );
}