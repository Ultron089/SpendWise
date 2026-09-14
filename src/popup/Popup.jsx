import { mockDashboardData } from '../shared/mockData';
import { currencyFormatter } from '../shared/constants';

function Popup() {
  const { user, summary, categories } = mockDashboardData;

  const openDashboard = () => {
    if (chrome?.tabs) {
      chrome.tabs.create({
        url: chrome.runtime.getURL('src/dashboard/index.html'),
      });
      return;
    }

    window.open('/src/dashboard/index.html', '_blank');
  };

  return (
    <div className="app-shell popup-shell">
      <div className="popup-header">
        <div>
          <div className="eyebrow">SpendWise</div>
          <h1>Welcome back</h1>
        </div>
        <div className="avatar-pill">{user.name.split(' ')[0][0]}{user.name.split(' ')[1][0]}</div>
      </div>

      <div className="user-band">
        <div>
          <div className="muted-label">User</div>
          <strong>{user.name}</strong>
        </div>
        <span className="status-chip status-chip--active">Tracking active</span>
      </div>

      <div className="summary-box popup-summary">
        <div className="summary-meta">
          <span className="muted-label">Current month</span>
          <span className="summary-note">{summary.monthLabel}</span>
        </div>
        <div className="summary-total">{currencyFormatter.format(summary.totalSpending)}</div>
      </div>

      <div className="panel small-panel">
        <div className="panel-header">
          <span>Category breakdown</span>
          <span className="muted-label">{summary.purchases} purchases</span>
        </div>

        <div className="category-list compact-list">
          {categories.map((category) => (
            <div className="category-row" key={category.name}>
              <div className="category-meta">
                <span className="dot" style={{ background: category.name === 'Food' ? '#4f46e5' : category.name === 'Personal Care' ? '#14b8a6' : category.name === 'Electronics' ? '#f59e0b' : category.name === 'Healthcare' ? '#ef4444' : '#8b5cf6' }} />
                <span>{category.name}</span>
              </div>
              <strong>{currencyFormatter.format(category.amount)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="quick-grid">
        <div className="metric-box">
          <span className="muted-label">Purchases</span>
          <strong>{summary.purchases}</strong>
        </div>
        <div className="metric-box">
          <span className="muted-label">Top category</span>
          <strong>{summary.topCategory}</strong>
        </div>
      </div>

      <button className="primary-button" onClick={openDashboard} type="button">
        View Full Dashboard
      </button>

      <div className="status-bar">
        <span className="signal" />
        Automatic purchase tracking is active
      </div>
    </div>
  );
}

export default Popup;
