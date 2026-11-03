import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'
import { apiKeyManager } from './utils/apiKeyManager'

// Automatikus Axios kérés-fejléc interceptor egyéni Gemini API kulcshoz
axios.interceptors.request.use((config) => {
  const customKey = apiKeyManager.getKey()
  if (customKey) {
    config.headers = config.headers || {}
    config.headers['x-gemini-api-key'] = customKey
  }
  return config
}, (error) => Promise.reject(error))

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered!', reg))
      .catch(err => console.log('Service Worker registration failed!', err));
  });
}

