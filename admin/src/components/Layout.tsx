import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { get } from '../api';
import type { Status } from '../types';

export default function Layout() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => get<Status>('/status').then((s) => alive && setStatus(s)).catch(() => undefined);
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const awaiting = status?.runs?.awaiting_review ?? 0;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          Content Fabric
          <span>фабрика постов</span>
        </div>
        <NavLink to="/campaigns" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Кампании
        </NavLink>
        <NavLink to="/review" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          На модерации {awaiting > 0 && <span className="count">{awaiting}</span>}
        </NavLink>
        <NavLink to="/runs" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Запуски
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          Настройки и статус
        </NavLink>
        <div className="foot">
          {status ? (
            <>
              <div>TG: {status.telegram.botUsername ? `@${status.telegram.botUsername}` : 'не подключён'}</div>
              <div>Max: {status.max.configured ? 'включён' : 'выключен'}</div>
              <div>В работе: {status.queue.pending}, в очереди: {status.queue.waiting}</div>
            </>
          ) : (
            'загрузка статуса…'
          )}
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
