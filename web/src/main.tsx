import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import App from './App'
import './styles/global.css'
import { registerSW } from 'virtual:pwa-register'

// Registra el service worker generado por vite-plugin-pwa.
// autoUpdate: recarga silenciosamente cuando hay una nueva versión.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
