import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const el = document.getElementById('root');
if (el) {
  el.textContent = ''; // drop the inline splash
  createRoot(el).render(<App />);
}
