import React, { useMemo } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from './store';
import { ROLE_LABEL, STATUS_META } from './types';
import {
  IconChart,
  IconCube,
  IconGrid,
  IconStore,
  IconUsers,
  IconBox,
  IconShield,
  IconLayers,
  IconEar,
} from './components/Icons';
import Orders from './pages/Orders';
import Studio from './pages/Studio';
import Review from './pages/Review';
import ReviewDetail from './pages/ReviewDetail';
import Stores from './pages/Stores';
import Users from './pages/Users';
import Materials from './pages/Materials';
import Analytics from './pages/Analytics';
import Overview from './pages/Overview';

function useNav() {
  const { db, currentUser, setCurrentUserId } = useApp();
  return { db, currentUser, setCurrentUserId };
}

export default function App() {
  const { db, currentUser, setCurrentUserId } = useNav();
  const loc = useLocation();
  const nav = useNavigate();
  const role = currentUser.role;

  const pendingReview = db.orders.filter((o) => o.status === 'pending_review').length;
  const returned = db.orders.filter((o) => o.status === 'returned').length;
  const lowStock = db.materials.filter((m) => m.stock < m.minStock).length;

  const crumb = useMemo(() => {
    const p = loc.pathname;
    if (p.startsWith('/studio/')) {
      const o = db.orders.find((x) => x.id === p.split('/')[2]);
      return (
        <>
          <span className="crumb">订单管理</span>
          <span className="crumb-sep">/</span>
          <span className="crumb">建模工作室</span>
          <span className="crumb-sep">/</span>
          <b>{o?.code ?? '—'}</b>
        </>
      );
    }
    if (p.startsWith('/review/')) {
      const o = db.orders.find((x) => x.id === p.split('/')[2]);
      return (
        <>
          <span className="crumb">审核中心</span>
          <span className="crumb-sep">/</span>
          <b>{o?.patient ?? '—'}</b>
        </>
      );
    }
    const map: Record<string, string> = {
      '/orders': '订单管理',
      '/review': '审核中心',
      '/stores': '门店管理',
      '/users': '账号管理',
      '/materials': '材料与交期',
      '/analytics': '运营统计',
      '/': role === 'fitter' ? '工作台' : '经营概览',
    };
    return <b>{map[p] ?? '工作台'}</b>;
  }, [loc.pathname, db.orders, role]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-name">AURIS</div>
            <div className="brand-sub">耳模定制云平台</div>
          </div>
        </div>
        <div className="topbar-mid">
          <div className="crumb" style={{ display: 'flex', alignItems: 'center' }}>{crumb}</div>
          <div className="spacer" />
          <div className="env-pill">
            <i />
            WebGL2 引擎在线
          </div>
        </div>
        <div className="topbar-right">
          <div className="row" style={{ gap: 6 }}>
            <span className="tiny dim">身份</span>
            <select
              className="select"
              style={{ width: 168, padding: '5px 26px 5px 8px', fontSize: 11 }}
              value={currentUser.id}
              onChange={(e) => setCurrentUserId(e.target.value)}
            >
              {db.users.filter((u) => u.active).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ROLE_LABEL[u.role]}
                  {u.role === 'fitter' ? ` · ${db.stores.find((s) => s.id === u.storeId)?.code ?? ''}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <nav className="rail">
        {role === 'fitter' && (
          <div className="nav-group">
            <div className="nav-title">验配</div>
            <NavItem to="/" icon={<IconGrid />} label="工作台" end />
            <NavItem
              to="/orders"
              icon={<IconCube />}
              label="订单建模"
              badge={db.orders.filter((o) => o.fitterId === currentUser.id && (o.status === 'pending_model' || o.status === 'returned')).length || undefined}
            />
          </div>
        )}
        {role === 'reviewer' && (
          <div className="nav-group">
            <div className="nav-title">审核</div>
            <NavItem to="/" icon={<IconGrid />} label="审核工作台" end />
            <NavItem to="/review" icon={<IconShield />} label="审核队列" badge={pendingReview || undefined} />
            <NavItem to="/orders" icon={<IconCube />} label="全部订单" />
          </div>
        )}
        {role === 'admin' && (
          <>
            <div className="nav-group">
              <div className="nav-title">概览</div>
              <NavItem to="/" icon={<IconGrid />} label="经营概览" end />
              <NavItem to="/orders" icon={<IconCube />} label="订单建模" />
              <NavItem to="/review" icon={<IconShield />} label="审核中心" badge={pendingReview || undefined} />
            </div>
            <div className="nav-group">
              <div className="nav-title">运营</div>
              <NavItem to="/stores" icon={<IconStore />} label="门店管理" />
              <NavItem to="/users" icon={<IconUsers />} label="账号与角色" />
              <NavItem to="/materials" icon={<IconBox />} label="材料规格" badge={lowStock || undefined} />
            </div>
            <div className="nav-group">
              <div className="nav-title">分析</div>
              <NavItem to="/analytics" icon={<IconChart />} label="统计与导出" />
            </div>
          </>
        )}
        {role !== 'admin' && (
          <div className="nav-group">
            <div className="nav-title">数据</div>
            <NavItem to="/analytics" icon={<IconChart />} label="统计与导出" />
            {role === 'reviewer' && <NavItem to="/materials" icon={<IconBox />} label="材料规格" badge={lowStock || undefined} />}
          </div>
        )}
        <div className="rail-foot">
          <div className="rail-user">
            <div className="avatar">{currentUser.name.slice(0, 1)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="nm">{currentUser.name}</div>
              <div className="rl">
                {ROLE_LABEL[currentUser.role]} · {db.stores.find((s) => s.id === currentUser.storeId)?.code ?? '总部'}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/studio/:orderId" element={<Studio />} />
          <Route path="/review" element={<Review />} />
          <Route path="/review/:orderId" element={<ReviewDetail />} />
          <Route path="/stores" element={<Stores />} />
          <Route path="/users" element={<Users />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  end,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  end?: boolean;
  badge?: number;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      {icon}
      <span>{label}</span>
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </NavLink>
  );
}

export { IconLayers, IconEar };
