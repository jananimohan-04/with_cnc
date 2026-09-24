import React from 'react';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useNavigate as useRouterNavigate,
  useParams as useRouterParams,
  useLocation as useRouterLocation,
  Outlet as RouterOutlet,
} from 'react-router-dom';

const VAULT_BASE = '/engineering/cnc-vault';

export function normalizeVaultPath(to: string): string {
  if (!to || typeof to !== 'string') return VAULT_BASE;
  if (to.startsWith(VAULT_BASE)) return to;
  if (to === '/' || to === '') return VAULT_BASE;
  return `${VAULT_BASE}${to.startsWith('/') ? to : '/' + to}`;
}

export function useNavigate() {
  const routerNav = useRouterNavigate();
  return React.useCallback(
    (target: string | { to?: string; replace?: boolean }, options?: { replace?: boolean }) => {
      if (typeof target === 'string') {
        routerNav(normalizeVaultPath(target), options);
      } else if (target && typeof target === 'object') {
        const path = target.to ? normalizeVaultPath(target.to) : VAULT_BASE;
        routerNav(path, { replace: target.replace || options?.replace });
      }
    },
    [routerNav]
  );
}

export function useParams(): Record<string, string | undefined> {
  return useRouterParams();
}

export function useLocation() {
  return useRouterLocation();
}

export const Outlet = RouterOutlet;

export function Link({
  to,
  children,
  className,
  onClick,
  ...rest
}: any) {
  const targetPath = typeof to === 'string' ? normalizeVaultPath(to) : (to?.to ? normalizeVaultPath(to.to) : VAULT_BASE);
  const location = useRouterLocation();
  const isActive = location.pathname === targetPath || (targetPath !== VAULT_BASE && location.pathname.startsWith(targetPath));

  const resolvedClassName = typeof className === 'function'
    ? className({ isActive })
    : (isActive ? `${className || ''} active` : className);

  return (
    <RouterLink
      to={targetPath}
      className={resolvedClassName}
      onClick={onClick}
      {...rest}
    >
      {typeof children === 'function' ? children({ isActive }) : children}
    </RouterLink>
  );
}

export function createFileRoute(path: string) {
  return function (config?: { component: React.ComponentType<any> }) {
    const Comp = config?.component || (() => null);
    const RouteObj: any = Comp;
    RouteObj.useParams = () => useRouterParams();
    return RouteObj;
  };
}
