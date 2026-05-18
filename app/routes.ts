import { type RouteConfig, route, index } from '@react-router/dev/routes';

export default [
  index('routes/_index.tsx'),
  route('admin', 'routes/admin._index.tsx'),
  route('admin/preview/:taskId', 'routes/admin.preview.$taskId.tsx'),

  // Admin REST API
  route('api/admin/folders', 'routes/api.admin.folders.tsx'),
  route('api/admin/folders/reorder', 'routes/api.admin.folders.reorder.tsx'),
  route('api/admin/folders/:id', 'routes/api.admin.folders.$id.tsx'),
  route('api/admin/tasks', 'routes/api.admin.tasks.tsx'),
  route('api/admin/tasks/stats', 'routes/api.admin.tasks.stats.tsx'),
  route('api/admin/tasks/:id', 'routes/api.admin.tasks.$id.tsx'),
  route('api/admin/jobs', 'routes/api.admin.jobs.tsx'),
  route('api/admin/jobs/:id', 'routes/api.admin.jobs.$id.tsx'),
  route('api/admin/jobs/:id/tasks/:taskIndex', 'routes/api.admin.jobs.$id.tasks.$taskIndex.tsx'),
  route('api/admin/settings', 'routes/api.admin.settings.tsx'),

  // External runner callbacks
  route('api/jobs/:id/callback/complete', 'routes/api.jobs.$id.callback.complete.tsx'),
  route('api/jobs/:id/callback/task', 'routes/api.jobs.$id.callback.task.tsx'),
] satisfies RouteConfig;
