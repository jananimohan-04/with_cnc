// Every route the Leads CRM pages call, in match order (first match wins: specific paths before :params).
import type { Route } from './core';
import { accountRoutes } from './account';
import { leadRoutes } from './leads';
import { followUpRoutes } from './followUps';
import { notificationRoutes } from './notifications';
import { analyticsRoutes } from './analytics';

export const routes: Route[] = [
  ...accountRoutes,
  ...leadRoutes,
  ...followUpRoutes,
  ...notificationRoutes,
  ...analyticsRoutes,
];
