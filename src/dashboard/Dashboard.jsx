import { useMemo, useState } from 'react';
import { mockDashboardData } from '../shared/mockData';
import { categoryColors, currencyFormatter } from '../shared/constants';

function SummaryCard({ label, value, helper, tone = 'default' }) {
  return (
    <div className={`summary-card summary-card--${tone}`}>
      <div className="muted-label">{label}</div>
      <h3>{value}</h3>
      <span className="card-helper">{helper}</span>
    </div>
  );
}

function MonthlySpendingChart({ data }) {
  const maxValue = Math.max(...data.map((item) => item.amount));

  return (
    <div className="chart-panel panel">
      <div className="panel-header">
        <span>Monthly spending</span>
        <span className="muted-label">This year</span>
      </div>

      <div className="bar-chart">
        {data.map((item) => (
          <div key={item.month} className="bar-group">
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ height: `${(item.amount / maxValue) * 100}%` }}
              />
            </div>
            <span>{item.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryBreakdown({ items }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Category breakdown</span>
        <span className="muted-label">Spend mix</span>
      </div>

      <div className="category-list">
        {items.map((item) => (
          <div className="category-row" key={item.name}>
            <div className="category-meta">
              <span className="dot" style={{ background: categoryColors[item.name] || '#64748b' }} />
              <span>{item.name}</span>
            </div>
            <strong>{currencyFormatter.format(item.amount)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlatformBreakdown({ items }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <span>Platform breakdown</span>
        <span className="muted-label">Top stores</span>
      </div>

      <div className="platform-list">
        {items.map((item) => (
          <div className="platform-row" key={item.name}>
            <div className="platform-name">{item.name}</div>
            <div className="platform-bar-wrap">
              <div
                className="platform-bar"
                style={{ width: `${(item.amount / items[0].amount) * 100}%` }}
              />
            </div>
            <strong>{currencyFormatter.format(item.amount)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterBar({ filters, onChange }) {
  return (
    <div className="filter-bar panel">
      <div className="panel-header">
        <span>Filters</span>
        <span className="muted-label">Quick view</span>
      </div>

      <div className="filter-row">
        <label>
          <span>Date / month</span>
          <select value={filters.month} onChange={(e) => onChange('month', e.target.value)}>
            <option value="All">All months</option>
            <option value="Sep">Sep 2026</option>
            <option value="Aug">Aug 2026</option>
            <option value="Jul">Jul 2026</option>
          </select>
        </label>

        <label>
          <span>Category</span>
          <select value={filters.category} onChange={(e) => onChange('category', e.target.value)}>
            <option value="All">All categories</option>
            <option value="Food">Food</option>
            <option value="Electronics">Electronics</option>
            <option value="Personal Care">Personal Care</option>
            <option value="Healthcare">Healthcare</option>
            <option value="Clothing">Clothing</option>
            <option value="Gifts">Gifts</option>
          </select>
        </label>

        <label>
          <span>Platform</span>
          <select value={filters.platform} onChange={(e) => onChange('platform', e.target.value)}>
            <option value="All">All platforms</option>
            <option value="Amazon">Amazon</option>
            <option value="Flipkart">Flipkart</option>
            <option value="Myntra">Myntra</option>
          </select>
        </label>
      </div>
    </div>
  );
}

function RecentPurchases({ purchases }) {
  return (
    <div className="panel table-panel">
      <div className="panel-header">
        <span>Recent purchases</span>
        <span className="muted-label">Latest activity</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Platform</th>
              <th>Product</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.id}>
                <td>{purchase.platform}</td>
                <td>{purchase.product}</td>
                <td>
                  <span className="tag" style={{ background: `${categoryColors[purchase.category] || '#64748b'}20`, color: categoryColors[purchase.category] || '#64748b' }}>
                    {purchase.category}
                  </span>
                </td>
                <td>{currencyFormatter.format(purchase.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user, summary, categories, monthlySpending, platforms, purchases } = mockDashboardData;
  const [filters, setFilters] = useState({
    month: 'All',
    category: 'All',
    platform: 'All',
  });

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      const monthMatch = filters.month === 'All' || purchase.date.includes(filters.month);
      const categoryMatch = filters.category === 'All' || purchase.category === filters.category;
      const platformMatch = filters.platform === 'All' || purchase.platform === filters.platform;
      return monthMatch && categoryMatch && platformMatch;
    });
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand-group">
          <div className="logo-badge">S</div>
          <div>
            <div className="eyebrow">SpendWise</div>
            <h2>Dashboard</h2>
          </div>
        </div>

        <div className="user-area">
          <div className="user-pill">{user.name}</div>
          <div className="avatar-mini">{user.name.split(' ')[0][0]}</div>
        </div>
      </header>

      <section className="summary-grid">
        <SummaryCard label="Total spending" value={currencyFormatter.format(summary.totalSpending)} helper="All-time spend" tone="primary" />
        <SummaryCard label="This month" value={currencyFormatter.format(summary.monthlySpending)} helper={summary.monthLabel} tone="secondary" />
        <SummaryCard label="Purchases" value={String(summary.purchases)} helper="Tracked items" />
        <SummaryCard label="Top category" value={summary.topCategory} helper="Highest spend" tone="accent" />
      </section>

      <section className="content-grid">
        <MonthlySpendingChart data={monthlySpending} />
        <CategoryBreakdown items={categories} />
      </section>

      <section className="content-grid bottom-grid">
        <PlatformBreakdown items={platforms} />
        <FilterBar filters={filters} onChange={handleFilterChange} />
      </section>

      <section className="table-section">
        <RecentPurchases purchases={filteredPurchases} />
      </section>
    </div>
  );
}

export default Dashboard;
