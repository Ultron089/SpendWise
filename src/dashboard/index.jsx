import React from 'react';
import ReactDOM from 'react-dom/client';
import Dashboard from './Dashboard.jsx';
import '../styles/styles.css';

ReactDOM.createRoot(document.getElementById('dashboard-root')).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
);
