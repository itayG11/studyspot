import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="panel narrow">
      <h1>הדף לא נמצא</h1>
      <Link to="/">למפת הקמפוס</Link>
    </section>
  )
}
