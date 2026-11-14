import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { useStore } from './store'
import { ROLES } from './constants'
import ArchiveList from './pages/ArchiveList.jsx'
import Layout3D from './pages/Layout3D.jsx'
import Overview from './pages/Overview.jsx'
import Review from './pages/Review.jsx'
import ArchiveSearch from './pages/ArchiveSearch.jsx'

const NAV = [
  { to: '/', label: '档案列表', end: true },
  { to: '/layout', label: '三维布置' },
  { to: '/overview', label: '俯视统计' },
  { to: '/review', label: '审核' },
  { to: '/archive', label: '归档检索' }
]

export default function App() {
  const role = useStore((s) => s.role)
  const setRole = useStore((s) => s.setRole)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">牧</span>
          <div>
            <div className="brand-title">牧区围栏三维布点与档案加工系统</div>
            <div className="brand-sub">三维布点 · 自动统计 · 版本审核 · 归档检索</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="role-box">
          <label>当前角色</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<ArchiveList />} />
          <Route path="/layout/:id?" element={<Layout3D />} />
          <Route path="/overview/:id?" element={<Overview />} />
          <Route path="/review/:id?" element={<Review />} />
          <Route path="/archive" element={<ArchiveSearch />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
