// Types
export type {
  FolderRow,
  Id,
  JobConfig,
  JobRow,
  JobStatus,
  JobTaskLiteRow,
  JobTaskRow,
  JobWithTasks,
  JobWithTasksLite,
  ListPageArgs,
  SettingRow,
  SortOrder,
  TaskActionResult,
  TaskRow,
} from './types';

// Connection
export { getDb } from './connection';

// Folders
export {
  countFolders,
  createFolder,
  deleteFolderById,
  getFolderById,
  getFoldersByIds,
  listFoldersPage,
  reorderFolders,
  updateFolderById,
} from './folders';

// Tasks
export {
  countTasks,
  createTask,
  createTasks,
  deleteTaskById,
  getTaskById,
  getTasksByIds,
  listTasksPage,
  updateTaskById,
} from './tasks';

// Jobs
export {
  countJobs,
  createJob,
  deleteJobById,
  getJobById,
  getJobStatsByTaskIds,
  getJobTaskByIndex,
  getJobTasksByJobId,
  getJobWithTasks,
  getJobWithTasksLite,
  listJobsPage,
  syncJobStatusFromTasks,
  updateJobById,
  updateJobTaskByIndex,
} from './jobs';
export type { JobStats } from './jobs';

// Settings
export { getAgentConfig, getSetting, setAgentConfig, setSetting } from './settings';
