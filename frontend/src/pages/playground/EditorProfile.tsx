import React, { useEffect, useState } from 'react';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Code2,
  Terminal,
  Layers,
  ChevronRight,
  MonitorPlay,
  FolderOpen,
  Trash2,
  Plus,
  Loader2,
  Clock,
} from 'lucide-react';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Environment = {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  tags: string[];
  color: string;
};

type StudentProject = {
  id: string;
  name: string;
  profile: string;
  created_at: string;
  updated_at: string;
};

// ─── Environment Definitions ──────────────────────────────────────────────────

const ENVIRONMENTS: Environment[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    description: 'Node.js runtime with modern ES6+ support.',
    icon: <Code2 className='w-8 h-8 text-yellow-400' />,
    tags: ['Frontend', 'Backend'],
    color: 'border-t-yellow-400',
  },
  {
    id: 'python',
    name: 'Python',
    description: 'Data Science, Scripting, and Web Apps with pip.',
    icon: <Terminal className='w-8 h-8 text-blue-500' />,
    tags: ['AI', 'Scripting'],
    color: 'border-t-blue-500',
  },
  {
    id: 'mern',
    name: 'MERN Stack',
    description: 'Full-stack MongoDB, Express, React, and Node.',
    icon: <Layers className='w-8 h-8 text-green-500' />,
    tags: ['Fullstack', 'Web'],
    color: 'border-t-green-500',
  },
];

const ENV_MAP = Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, e]));

const RANDOM_ADJECTIVES = [
  'Awesome', 'Quick', 'Cool', 'Sharp', 'Bold', 'Smart', 'Fresh', 'Bright', 'Swift', 'Clever',
];

function randomProjectName(envName: string) {
  const adj = RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
  return `${adj} ${envName} Project`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const EditorProfile = () => {
  // Projects list state
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Fetch existing projects on mount ────────────────────────────────────────

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await apiClient.get<{ success: boolean; data: StudentProject[] }>(
        '/students/projects',
      );
      setProjects(res.data.data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load projects'));
    } finally {
      setLoadingProjects(false);
    }
  };

  // ── Open the create-project modal ───────────────────────────────────────────

  const openCreateModal = (env: Environment) => {
    setSelectedEnv(env);
    setProjectName(randomProjectName(env.name));
    setModalOpen(true);
  };

  // ── Create project → navigate to editor ─────────────────────────────────────

  const handleCreate = async () => {
    if (!selectedEnv || !projectName.trim()) return;
    setCreating(true);
    try {
      const res = await apiClient.post<{ success: boolean; data: StudentProject }>(
        '/students/projects',
        { name: projectName.trim(), profile: selectedEnv.id },
      );
      const project = res.data.data;
      // Use full page navigation so CloudFront serves /code-editor with COOP/COEP headers
      window.location.href = `/code-editor?pid=${project.id}&cp=${project.profile}`;
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create project'));
      setCreating(false);
    }
  };

  // ── Open existing project in editor ─────────────────────────────────────────

  const openProject = (project: StudentProject) => {
    // Use full page navigation so CloudFront serves /code-editor with COOP/COEP headers
    window.location.href = `/code-editor?pid=${project.id}&cp=${project.profile}`;
  };

  // ── Delete project ───────────────────────────────────────────────────────────

  const deleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setDeletingId(projectId);
    try {
      await apiClient.delete(`/students/projects/${projectId}`);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      toast.success('Project deleted');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete project'));
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className='min-h-screen bg-slate-50 p-8 dark:bg-slate-950'>
      <div className='max-w-6xl mx-auto space-y-12'>

        {/* ── My Projects ── */}
        <section>
          <div className='flex items-center gap-3 mb-6'>
            <FolderOpen className='w-5 h-5 text-slate-500' />
            <h2 className='text-xl font-bold tracking-tight'>My Projects</h2>
          </div>

          {loadingProjects ? (
            <div className='flex items-center gap-2 text-slate-400 text-sm'>
              <Loader2 className='w-4 h-4 animate-spin' />
              Loading projects…
            </div>
          ) : projects.length === 0 ? (
            <p className='text-sm text-slate-400'>
              No projects yet. Start one below.
            </p>
          ) : (
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
              {projects.map((project) => {
                const env = ENV_MAP[project.profile];
                return (
                  <div
                    key={project.id}
                    onClick={() => openProject(project)}
                    className='group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm cursor-pointer transition-all hover:shadow-md hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 min-h-[130px]'
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <div className='flex items-center gap-3 min-w-0 flex-1'>
                        <div className='p-2 bg-slate-50 rounded-lg dark:bg-slate-800 shrink-0'>
                          {env?.icon ?? <Code2 className='w-6 h-6 text-slate-400' />}
                        </div>
                        <div className='min-w-0 flex-1'>
                          <p className='font-semibold text-sm leading-tight line-clamp-2 text-slate-900 dark:text-slate-100'>
                            {project.name}
                          </p>
                          <Badge variant='secondary' className='text-[10px] mt-1 uppercase font-medium'>
                            {env?.name ?? project.profile}
                          </Badge>
                        </div>
                      </div>

                      <button
                        onClick={(e) => deleteProject(e, project.id)}
                        disabled={deletingId === project.id}
                        className='opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-2 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center'
                        title='Delete project'
                        aria-label='Delete project'
                      >
                        {deletingId === project.id
                          ? <Loader2 className='w-4 h-4 animate-spin' />
                          : <Trash2 className='w-4 h-4' />
                        }
                      </button>
                    </div>

                    <div className='mt-4 flex items-center gap-1 text-xs text-slate-400'>
                      <Clock className='w-3 h-3' />
                      {timeAgo(project.updated_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── New Environment ── */}
        <section>
          <header className='mb-6'>
            <div className='flex items-center gap-3'>
              <Plus className='w-5 h-5 text-slate-500' />
              <h2 className='text-xl font-bold tracking-tight'>New Environment</h2>
            </div>
            <p className='text-slate-500 dark:text-slate-400 text-sm mt-1 ml-8'>
              Select a language or framework to start a new project.
            </p>
          </header>

          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {ENVIRONMENTS.map((env) => (
              <Card
                key={env.id}
                className={`relative overflow-hidden transition-all hover:shadow-lg border-t-4 ${env.color}`}
              >
                <CardHeader className='pb-4'>
                  <div className='flex justify-between items-start'>
                    <div className='p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm'>
                      {env.icon}
                    </div>
                    <div className='flex gap-1 flex-wrap justify-end'>
                      {env.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant='secondary'
                          className='text-[10px] font-medium uppercase'
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <CardTitle className='mt-4'>{env.name}</CardTitle>
                  <CardDescription className='min-h-10 leading-relaxed'>
                    {env.description}
                  </CardDescription>
                </CardHeader>

                <CardFooter className='pt-0'>
                  <Button
                    className='w-full group'
                    variant='outline'
                    onClick={() => openCreateModal(env)}
                  >
                    <MonitorPlay className='w-4 h-4 mr-2' />
                    Start Coding
                    <ChevronRight className='w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity' />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      </div>

      {/* ── Create Project Modal ── */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!creating) setModalOpen(open); }}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              {selectedEnv?.icon}
              New {selectedEnv?.name} Project
            </DialogTitle>
          </DialogHeader>

          <div className='py-2'>
            <label className='text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2'>
              Project name
            </label>
            <input
              type='text'
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !creating && handleCreate()}
              placeholder='My awesome project'
              autoFocus
              className='w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition'
            />
          </div>

          <DialogFooter className='gap-2'>
            <Button
              variant='outline'
              onClick={() => setModalOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !projectName.trim()}
              className='bg-indigo-600 hover:bg-indigo-700'
            >
              {creating
                ? <><Loader2 className='w-4 h-4 mr-2 animate-spin' /> Creating…</>
                : 'Start Coding'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EditorProfile;
