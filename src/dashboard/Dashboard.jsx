
import { useEffect, useMemo, useState } from 'react';
import {
  API_BASE_URL,
  AUTH_STORAGE_KEY,
  categoryColors,
  currencyFormatter,
} from '../shared/constants';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getMonthKey(date) {
  if (!date || Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key) {
  if (key === 'unknown') return 'Unknown date';
  const [year, month] = key.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function normalizePurchase(item) {
  const parsedDate = item.purchaseDate ? new Date(item.purchaseDate) : null;
  const validDate =
    parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;

  return {
    id: String(item._id || item.id || `${item.platform}-${item.productName}-${item.purchaseDate}`),
    platform: String(item.platform || 'Other'),
    product: String(item.productName || item.product || 'Unnamed purchase'),
    category: String(item.category || 'Uncategorized'),
    amount: Number(item.amount) || 0,
    date: validDate,
    monthKey: getMonthKey(validDate),
  };
}

async function getStoredAuth() {
  // The extension stores authentication in Chrome storage.
  if (typeof chrome !== 'undefined' && chrome.storage) {
    for (const area of [chrome.storage.session, chrome.storage.local]) {
      if (!area) continue;

      try {
        const stored = await area.get(AUTH_STORAGE_KEY);
        if (stored?.[AUTH_STORAGE_KEY]) {
          return stored[AUTH_STORAGE_KEY];
        }
      } catch {
        // Try the next available storage area.
      }
    }
  }

  // Fallback for development outside the extension.
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Authentication will be reported as missing below.
  }

  return null;
}

function getToken(auth) {
  if (typeof auth === 'string') return auth;
  return auth?.token || auth?.accessToken || auth?.jwt || null;
}

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
  const maxValue = Math.max(1, ...data.map((item) => item.amount));

  return (
    <div className="chart-panel panel">
      <div className="panel-header">
        <span>Monthly spending</span>
        <span className="muted-label">{new Date().getFullYear()}</span>
      </div>

      <div className="bar-chart">
        {data.map((item) => (
          <div key={item.month} className="bar-group">
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ height: `${(item.amount / maxValue) * 100}%` }}
                title={currencyFormatter.format(item.amount)}
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

      {items.length === 0 ? (
        <p className="muted-label">No purchases to categorize yet.</p>
      ) : (
        <div className="category-list">
          {items.map((item) => (
            <div className="category-row" key={item.name}>
              <div className="category-meta">
                <span
                  className="dot"
                  style={{
                    background: categoryColors[item.name] || '#64748b',
                  }}
                />
                <span>{item.name}</span>
              </div>
              <strong>{currencyFormatter.format(item.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformBreakdown({ items }) {
  const maxValue = Math.max(1, ...items.map((item) => item.amount));

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Platform breakdown</span>
        <span className="muted-label">Top stores</span>
      </div>

      {items.length === 0 ? (
        <p className="muted-label">No platform data available yet.</p>
      ) : (
        <div className="platform-list">
          {items.map((item) => (
            <div className="platform-row" key={item.name}>
              <div className="platform-name">{item.name}</div>
              <div className="platform-bar-wrap">
                <div
                  className="platform-bar"
                  style={{ width: `${(item.amount / maxValue) * 100}%` }}
                />
              </div>
              <strong>{currencyFormatter.format(item.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBar({ filters, onChange, months, categories, platforms }) {
  return (
    <div className="filter-bar panel">
      <div className="panel-header">
        <span>Filters</span>
        <span className="muted-label">Quick view</span>
      </div>

      <div className="filter-row">
        <label>
          <span>Date / month</span>
          <select
            value={filters.month}
            onChange={(e) => onChange('month', e.target.value)}
          >
            <option value="All">All months</option>
            {months.map((month) => (
              <option key={month.key} value={month.key}>
                {month.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(e) => onChange('category', e.target.value)}
          >
            <option value="All">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Platform</span>
          <select
            value={filters.platform}
            onChange={(e) => onChange('platform', e.target.value)}
          >
            <option value="All">All platforms</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
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
            {purchases.length === 0 ? (
              <tr>
                <td colSpan="4">No purchases found for these filters.</td>
              </tr>
            ) : (
              purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{purchase.platform}</td>
                  <td>{purchase.product}</td>
                  <td>
                    <span
                      className="tag"
                      style={{
                        background: `${categoryColors[purchase.category] || '#64748b'}20`,
                        color: categoryColors[purchase.category] || '#64748b',
                      }}
                    >
                      {purchase.category}
                    </span>
                  </td>
                  <td>{currencyFormatter.format(purchase.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard() {
  const [purchases, setPurchases] = useState([]);
  const [userName, setUserName] = useState('My account');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState({
    month: 'All',
    category: 'All',
    platform: 'All',
  });

  useEffect(() => {
    let cancelled = false;

    async function loadPurchases() {
      setLoading(true);
      setError('');

      try {
        const auth = await getStoredAuth();
        const token = getToken(auth);

        if (!token) {
          throw new Error(
            'You are not signed in. Please sign in and reopen the dashboard.',
          );
        }

        const response = await fetch(`${API_BASE_URL}/api/purchases`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.message || `Unable to load purchases (${response.status}).`,
          );
        }

        if (!Array.isArray(result.purchases)) {
          throw new Error('The purchases API returned an unexpected response.');
        }

        if (cancelled) return;

        setPurchases(result.purchases.map(normalizePurchase));

        const name = auth?.user?.name || auth?.name;
        if (name) setUserName(name);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Something went wrong while loading purchases.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPurchases();

    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const currentMonth = getMonthKey(now);

  const months = useMemo(() => {
    const keys = [...new Set(purchases.map((p) => p.monthKey))]
      .filter((key) => key !== 'unknown')
      .sort()
      .reverse();

    return keys.map((key) => ({ key, label: getMonthLabel(key) }));
  }, [purchases]);

  const categories = useMemo(
    () => [...new Set(purchases.map((p) => p.category))].sort(),
    [purchases],
  );

  const platforms = useMemo(
    () => [...new Set(purchases.map((p) => p.platform))].sort(),
    [purchases],
  );

  const summary = useMemo(() => {
    const totalSpending = purchases.reduce((sum, p) => sum + p.amount, 0);

    const monthlySpending = purchases
      .filter((p) => p.monthKey === currentMonth)
      .reduce((sum, p) => sum + p.amount, 0);

    const categoryTotals = {};
    purchases.forEach((p) => {
      categoryTotals[p.category] = (categoryTotals[p.category] || 0) + p.amount;
    });

    const topCategory =
      Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      'None yet';

    return {
      totalSpending,
      monthlySpending,
      purchases: purchases.length,
      topCategory,
    };
  }, [purchases, currentMonth]);

  const monthlySpending = useMemo(() => {
    const year = now.getFullYear();

    return MONTHS.map((month, index) => ({
      month,
      amount: purchases
        .filter(
          (p) =>
            p.date &&
            p.date.getFullYear() === year &&
            p.date.getMonth() === index,
        )
        .reduce((sum, p) => sum + p.amount, 0),
    }));
  }, [purchases]);

  const categoryBreakdown = useMemo(() => {
    const totals = {};

    purchases.forEach((p) => {
      totals[p.category] = (totals[p.category] || 0) + p.amount;
    });

    return Object.entries(totals)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [purchases]);

  const platformBreakdown = useMemo(() => {
    const totals = {};

    purchases.forEach((p) => {
      totals[p.platform] = (totals[p.platform] || 0) + p.amount;
    });

    return Object.entries(totals)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [purchases]);

  const filteredPurchases = useMemo(
    () =>
      purchases
        .filter((p) => {
          const monthMatch =
            filters.month === 'All' || p.monthKey === filters.month;
          const categoryMatch =
            filters.category === 'All' || p.category === filters.category;
          const platformMatch =
            filters.platform === 'All' || p.platform === filters.platform;

          return monthMatch && categoryMatch && platformMatch;
        })
        .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0)),
    [purchases, filters],
  );

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
          <div className="user-pill">{userName}</div>
          <div className="avatar-mini">{userName.charAt(0).toUpperCase()}</div>
        </div>
      </header>

      {loading ? (
        <div className="panel">Loading your purchases...</div>
      ) : error ? (
        <div className="panel" role="alert">
          <h3>Could not load your purchases</h3>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Try again</button>
        </div>
      ) : (
        <>
          <section className="summary-grid">
            <SummaryCard
              label="Total spending"
              value={currencyFormatter.format(summary.totalSpending)}
              helper="All-time spend"
              tone="primary"
            />
            <SummaryCard
              label="This month"
              value={currencyFormatter.format(summary.monthlySpending)}
              helper={getMonthLabel(currentMonth)}
              tone="secondary"
            />
            <SummaryCard
              label="Purchases"
              value={String(summary.purchases)}
              helper="Tracked records"
            />
            <SummaryCard
              label="Top category"
              value={summary.topCategory}
              helper="Highest spend"
              tone="accent"
            />
          </section>

          {purchases.length === 0 && (
            <div className="panel">
              No purchases have been saved to your account yet. Import your
              order history or detect a purchase to get started.
            </div>
          )}

          <section className="content-grid">
            <MonthlySpendingChart data={monthlySpending} />
            <CategoryBreakdown items={categoryBreakdown} />
          </section>

          <section className="content-grid bottom-grid">
            <PlatformBreakdown items={platformBreakdown} />
            <FilterBar
              filters={filters}
              onChange={handleFilterChange}
              months={months}
              categories={categories}
              platforms={platforms}
            />
          </section>

          <section className="table-section">
            <RecentPurchases purchases={filteredPurchases} />
          </section>
        </>
      )}
    </div>
  );
}

export default Dashboard;
