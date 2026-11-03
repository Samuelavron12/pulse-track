import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { isNative } from './api/client.js';
import App from './App.jsx';
import { AuthProvider, ThemeProvider, ToastProvider, OnlineProvider } from './context/index.jsx';
import './styles/global.css';

// The Android app (and the GitHub Pages copy) use hash routes (#/pos); a normal server uses clean URLs.
const Router = (isNative() || import.meta.env.VITE_HASH_ROUTER === 'true') ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <ThemeProvider>
        <ToastProvider>
          <OnlineProvider>
            <AuthProvider>
              <App/>
            </AuthProvider>
          </OnlineProvider>
        </ToastProvider>
      </ThemeProvider>
    </Router>
  </React.StrictMode>
);
