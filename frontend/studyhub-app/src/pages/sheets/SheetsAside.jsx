/* ═══════════════════════════════════════════════════════════════════════════
 * SheetsAside.jsx — Quick-view sidebar for the sheets page
 * ═══════════════════════════════════════════════════════════════════════════ */
import { Link } from 'react-router-dom'

export default function SheetsAside({ sheetsTotal, catalogCount, enrollmentCount }) {
  return (
    <aside className="feed-aside sheets-page__aside">
      <section className="sh-card">
        <h2 className="sh-card-title">Quick view</h2>
        <p className="sh-card-helper">Live index context</p>
        <div className="sheets-page__aside-stats">
          <div>{sheetsTotal} sheets found</div>
          <div>{catalogCount} schools available</div>
          <div>{enrollmentCount} courses in your profile</div>
        </div>
      </section>

      <section className="sh-card">
        <h2 className="sh-card-title">Workflow</h2>
        <p className="sheets-page__aside-copy">
          Use the filters to narrow the repo list, open a sheet row, then fork or star from the same view.
        </p>
        <Link to="/feed" className="sh-btn sh-btn--secondary sh-btn--sm">
          Back to feed
        </Link>
      </section>
    </aside>
  )
}
