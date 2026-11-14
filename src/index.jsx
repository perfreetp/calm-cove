import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import App from './App.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProjectView from './pages/ProjectView.jsx';
import DrawingWorkbench from './pages/DrawingWorkbench.jsx';
import './styles.css';

const root = document.getElementById('root');

render(
  () => (
    <Router root={App}>
      <Route path="/" component={Dashboard} />
      <Route path="/projects/:id" component={ProjectView} />
      <Route path="/projects/:id/draw" component={DrawingWorkbench} />
      <Route path="*" component={() => <div class="empty">页面不存在</div>} />
    </Router>
  ),
  root,
);
