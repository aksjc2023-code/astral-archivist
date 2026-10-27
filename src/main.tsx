import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { Notes } from './components/grimoire/Notes';
import './index.css';

const isGrimoireWindow = window.location.search.includes('window=grimoire');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isGrimoireWindow ? <Notes /> : <App />}
  </React.StrictMode>,
);
