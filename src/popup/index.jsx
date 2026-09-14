import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './Popup.jsx';
import '../styles/styles.css';

ReactDOM.createRoot(document.getElementById('popup-root')).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);
