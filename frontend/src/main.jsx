import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'
import { apiKeyManager } from './utils/apiKeyManager'

// Ha a /texa alútvonalon vagyunk (pl. matek.neumann-bp.edu.hu/texa)
if (window.location.pathname.startsWith('/texa')) {
  axios.defaults.baseURL = '/texa'
}

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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

