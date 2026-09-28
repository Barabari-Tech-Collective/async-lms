import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Editor, { loader } from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Play, Send, BookOpen, Files, Search, Code2, Trash2, Maximize, Minimize, CheckCircle2, Save, ExternalLink, Sun, Moon } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import FileTreeExplorer from '@/components/common/FileTree';
import type { FileNode } from '@/components/common/FileTree';
import type { Exercise } from '@/utils/types';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';

// Module level cache for Pyodide instance
let cachedPyodide: any = null;

const getLanguageFromPath = (p: string) => {
  const ext = p.split('.').pop() || '';
  if (ext === 'py') return 'python';
  if (ext === 'js') return 'javascript';
  if (ext === 'html') return 'html';
  if (ext === 'css') return 'css';
  return 'plaintext';
};

// Mock types
type Tab = { path: string; content: string; language: string };

interface EmbeddedIDEProps {
  exercise: Exercise;
  submitting: boolean;
  onSubmit: (exerciseId: string, files?: any[], taskId?: string) => any;
}

interface TaskWorkspaceCache {
  tree: FileNode[];
  tabs: Tab[];
  activeTab: string | null;
}

export default function EmbeddedIDE({ exercise, submitting, onSubmit }: EmbeddedIDEProps) {
  const [activeSidebar, setActiveSidebar] = useState<'instructions' | 'explorer' | 'search'>('instructions');
  const [tree, setTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Multi-task exercises: which task is currently open. In-memory edits for
  // tasks the student has already visited this session are cached in a ref
  // (not state) so switching tabs doesn't lose unsaved work or trigger refetches.
  const tasks = exercise.tasks && exercise.tasks.length > 0 ? exercise.tasks : null;
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const activeTask = tasks ? tasks[activeTaskIndex] : undefined;
  const taskWorkspaceCache = useRef<Record<string, TaskWorkspaceCache>>({});

  // Layout states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
  const [mobileTab, setMobileTab] = useState<'instructions' | 'files' | 'editor' | 'output'>('instructions');

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string>('Ready.');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<'terminal' | 'feedback'>('terminal');
  const [feedbackOutput, setFeedbackOutput] = useState<string>('No submissions yet. Click "Submit" to grade your work.');

  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<'vs-dark' | 'light'>(() => {
    return (localStorage.getItem('ide-theme') as 'vs-dark' | 'light') || 'vs-dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'vs-dark' ? 'light' : 'vs-dark';
    setTheme(nextTheme);
    localStorage.setItem('ide-theme', nextTheme);
  };

  // Synchronise live preview with external browser tab via BroadcastChannel
  useEffect(() => {
    const channelName = `preview-${exercise.id}`;
    const channel = new BroadcastChannel(channelName);
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'REQUEST_INITIAL') {
        const html = tabs.find(t => t.path === 'index.html')?.content || '';
        const css = tabs.find(t => t.path === 'style.css')?.content || '';
        const js = tabs.find(t => t.path === 'script.js')?.content || '';

        let combined = html;
        if (combined.includes('</head>')) {
          combined = combined.replace('</head>', `<style>${css}</style></head>`);
        } else {
          combined = `<style>${css}</style>` + combined;
        }

        if (combined.includes('</body>')) {
          combined = combined.replace('</body>', `<script>${js}</script></body>`);
        } else {
          combined = combined + `<script>${js}</script>`;
        }
        
        channel.postMessage({ type: 'UPDATE_CONTENT', html: combined });
      }
    };

    return () => {
      channel.close();
    };
  }, [tabs, exercise.id]);

  // Register HTML snippet completion provider with Monaco loader
  useEffect(() => {
    let disposable: any = null;
    loader.init().then((monaco) => {
      const htmlTags = [
        { label: 'div', insertText: '<div>$1</div>', doc: 'Division container element' },
        { label: 'span', insertText: '<span>$1</span>', doc: 'Inline span container element' },
        { label: 'p', insertText: '<p>$1</p>', doc: 'Paragraph element' },
        { label: 'button', insertText: '<button>$1</button>', doc: 'Clickable button element' },
        { label: 'a', insertText: '<a href="${1:#}">$2</a>', doc: 'Anchor hyperlink element' },
        { label: 'img', insertText: '<img src="$1" alt="$2" />', doc: 'Image element' },
        { label: 'input', insertText: '<input type="${1:text}" name="$2" placeholder="$3" />', doc: 'Input field element' },
        { label: 'h1', insertText: '<h1>$1</h1>', doc: 'Heading Level 1 element' },
        { label: 'h2', insertText: '<h2>$1</h2>', doc: 'Heading Level 2 element' },
        { label: 'h3', insertText: '<h3>$1</h3>', doc: 'Heading Level 3 element' },
        { label: 'h4', insertText: '<h4>$1</h4>', doc: 'Heading Level 4 element' },
        { label: 'h5', insertText: '<h5>$1</h5>', doc: 'Heading Level 5 element' },
        { label: 'h6', insertText: '<h6>$1</h6>', doc: 'Heading Level 6 element' },
        { label: 'ul', insertText: '<ul>\n\t<li>$1</li>\n</ul>', doc: 'Unordered list element' },
        { label: 'ol', insertText: '<ol>\n\t<li>$1</li>\n</ol>', doc: 'Ordered list element' },
        { label: 'li', insertText: '<li>$1</li>', doc: 'List item element' },
        { label: 'section', insertText: '<section>\n\t$1\n</section>', doc: 'Content section element' },
        { label: 'nav', insertText: '<nav>\n\t$1\n</nav>', doc: 'Navigation bar container' },
        { label: 'header', insertText: '<header>\n\t$1\n</header>', doc: 'Document or section header' },
        { label: 'footer', insertText: '<footer>\n\t$1\n</footer>', doc: 'Document or section footer' },
        { label: 'style', insertText: '<style>\n\t$1\n</style>', doc: 'Internal CSS style block' },
        { label: 'script', insertText: '<script>\n\t$1\n</script>', doc: 'Internal JS script block' },
        { label: 'label', insertText: '<label for="$1">$2</label>', doc: 'Form input label element' },
        { label: 'form', insertText: '<form action="$1" method="${2:post}">\n\t$3\n</form>', doc: 'Form element' },
        { label: 'textarea', insertText: '<textarea name="$1" rows="${2:4}" cols="${3:50}">$4</textarea>', doc: 'Multiline text area input' },
        { label: 'select', insertText: '<select name="$1">\n\t<option value="$2">$3</option>\n</select>', doc: 'Drop-down select list element' },
        { label: 'table', insertText: '<table>\n\t<thead>\n\t\t<tr>\n\t\t\t<th>$1</th>\n\t\t</tr>\n\t</thead>\n\t<tbody>\n\t\t<tr>\n\t\t\t<td>$2</td>\n\t\t</tr>\n\t</tbody>\n</table>', doc: 'Tabular data table' },
      ];

      disposable = monaco.languages.registerCompletionItemProvider('html', {
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = htmlTags.map(tag => ({
            label: tag.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: tag.doc,
            insertText: tag.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          }));

          return { suggestions };
        }
      });
    });

    return () => {
      if (disposable) {
        disposable.dispose();
      }
    };
  }, []);

  // Initialize from backend workspace if available, otherwise fallback to exercise initial_files.
  // Re-runs whenever the active task changes; a task already visited this session
  // is restored from the in-memory cache instead of re-fetching.
  useEffect(() => {
    let active = true;
    const taskKey = activeTask?.id ?? 'default';

    const cached = taskWorkspaceCache.current[taskKey];
    if (cached) {
      setTree(cached.tree);
      setTabs(cached.tabs);
      setActiveTab(cached.activeTab);
      return;
    }

    const initWorkspace = async () => {
      let filesToLoad = [];
      try {
        const res = await apiClient.post(`/students/exercise/${exercise.id}/workspace/init`, {
          taskId: activeTask?.id
        });
        if (res.data?.success && res.data.data?.files && res.data.data.files.length > 0) {
          // Map backend response 'name' to the expected tab shape
          filesToLoad = res.data.data.files.map((f: any) => ({ name: f.name, content: f.content }));
        }
        if (res.data?.success && res.data.data?.submission) {
          const sub = res.data.data.submission;
          const testRes = sub.testResults;
          if (testRes) {
            let outputText = `=== SUBMISSION EVALUATION ===\n`;
            outputText += `Status: ${sub.isPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`;

            if (testRes.feedback) {
              outputText += `\n--- Detailed Feedback ---\n${testRes.feedback}\n`;
            }
            
            const breakdown = testRes.rubric_breakdown;
            if (Array.isArray(breakdown)) {
              outputText += `\n--- Rubric Breakdown ---\n`;
              breakdown.forEach((item: any) => {
                outputText += `- ${item.criteria || item.name}: ${item.score || 0}/${item.max_score || 100} pts\n`;
                if (item.feedback) outputText += `  Feedback: ${item.feedback}\n`;
              });
            }
            setFeedbackOutput(outputText);
            setBottomTab('feedback');
          }
        }
      } catch (err) {
        console.error('Failed to init workspace from backend, falling back to initial_files', err);
      }
      
      if (!active) return;

      if (filesToLoad.length === 0) {
        filesToLoad = activeTask?.initial_files || [];
      }

      // Ensure Instructions.md is present
      const hasInstructions = filesToLoad.some((f: any) => f.name === 'Instructions.md');
      const initialFiles = hasInstructions
        ? filesToLoad
        : [
            {
              name: 'Instructions.md',
              content: activeTask?.instructions || exercise.instructions || '# Instructions\n\nNo instructions provided.'
            },
            ...filesToLoad
          ];

      const buildTree = (files: {name: string}[]): FileNode[] => {
        const root: FileNode[] = [];
        files.forEach(f => {
          const parts = f.name.split('/');
          let currentLevel = root;
          let currentPath = '';
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            let existing = currentLevel.find(n => n.name === part);
            if (!existing) {
              const isFile = i === parts.length - 1;
              existing = { name: part, path: currentPath, type: isFile ? 'file' : 'folder', children: isFile ? undefined : [] };
              currentLevel.push(existing);
            }
            if (!existing.children) existing.children = [];
            currentLevel = existing.children;
          }
        });
        return root;
      };
      const newTree = buildTree(initialFiles);
      setTree(newTree);

      const newTabs = initialFiles.map((f: any) => ({
        path: f.name,
        content: f.content,
        language: f.name === 'Instructions.md' ? 'markdown' : f.name.endsWith('.py') ? 'python' : f.name.endsWith('.js') ? 'javascript' : f.name.endsWith('.html') ? 'html' : f.name.endsWith('.css') ? 'css' : 'plaintext'
      }));
      setTabs(newTabs);
      const newActiveTab = newTabs.length > 0 ? newTabs[0].path : null;
      setActiveTab(newActiveTab);

      taskWorkspaceCache.current[taskKey] = { tree: newTree, tabs: newTabs, activeTab: newActiveTab };
    };

    initWorkspace();

    return () => {
      active = false;
    };
  }, [exercise, activeTaskIndex]);

  // Switch to a different task tab, caching the outgoing task's in-memory edits first.
  const handleTaskSwitch = (index: number) => {
    if (!tasks || index === activeTaskIndex) return;
    const outgoingKey = tasks[activeTaskIndex]?.id ?? 'default';
    taskWorkspaceCache.current[outgoingKey] = { tree, tabs, activeTab };
    setTerminalOutput('Ready.');
    setActiveTaskIndex(index);
  };

  // Single source of truth for the Instructions pane. For a multi-task exercise
  // the active task's instructions are what the student needs — the exercise
  // overview is kept above as context. Previously the pane read the exercise
  // overview first, so per-task instructions were never shown.
  const instructionsMarkdown = (() => {
    const overview = exercise.instructions?.trim();
    const taskText = activeTask?.instructions?.trim();
    if (tasks && tasks.length > 1 && taskText) {
      const heading = `## ${activeTask?.title ?? 'Task'}\n\n${taskText}`;
      return overview ? `${overview}\n\n---\n\n${heading}` : heading;
    }
    return taskText || overview || '*No instructions provided.*';
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      // Map tabs (path/content) to files shape expected by backend (name/content)
      const filesPayload = tabs.map(t => ({
        name: t.path,
        content: t.content
      }));

      await apiClient.post(`/students/exercise/${exercise.id}/workspace/save`, {
        files: filesPayload,
        taskId: activeTask?.id
      });
      toast.success('Progress saved successfully!');
    } catch (err) {
      console.error('Failed to save progress', err);
      toast.error('Failed to save progress. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const activeTabContent = tabs.find(t => t.path === activeTab)?.content ?? '';
  const activeTabLanguage = tabs.find(t => t.path === activeTab)?.language ?? 'plaintext';

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !activeTab) return;
    setTabs(prev => prev.map(t => t.path === activeTab ? { ...t, content: value } : t));
    
    // Auto-update preview for DOM exercises
    if (exercise.language === 'dom') {
      updatePreview();
    }
  };

  const handleCreate = (path: string, type: 'file' | 'folder') => {
    setTree(prevTree => {
      const insert = (nodes: FileNode[], parts: string[], currentPath: string): FileNode[] => {
        if (parts.length === 1) {
          if (nodes.find(n => n.name === parts[0])) return nodes;
          return [...nodes, { name: parts[0], path: currentPath, type, children: type === 'folder' ? [] : undefined }];
        }
        const [head, ...rest] = parts;
        return nodes.map(n => {
          if (n.name === head && n.type === 'folder') {
            return { ...n, children: insert(n.children || [], rest, currentPath) };
          }
          return n;
        });
      };
      return insert(prevTree, path.split('/'), path);
    });

    if (type === 'file') {
      const language = path.endsWith('.py') ? 'python' : path.endsWith('.js') ? 'javascript' : path.endsWith('.html') ? 'html' : path.endsWith('.css') ? 'css' : 'plaintext';
      setTabs(prev => [...prev, { path, content: '', language }]);
      setActiveTab(path);
    }
  };

  const handleDelete = (path: string) => {
    setTree(prevTree => {
      const remove = (nodes: FileNode[]): FileNode[] => {
        return nodes.filter(n => n.path !== path).map(n => ({
          ...n,
          children: n.children ? remove(n.children) : undefined
        }));
      };
      return remove(prevTree);
    });

    setTabs(prev => prev.filter(t => t.path !== path && !t.path.startsWith(path + '/')));
    if (activeTab === path || activeTab?.startsWith(path + '/')) {
      setActiveTab(null);
    }
  };

  const handleRename = (oldPath: string, newPath: string) => {
    const newName = newPath.split('/').pop() || '';
    
    setTree(prevTree => {
      const rename = (nodes: FileNode[]): FileNode[] => {
        return nodes.map(n => {
          if (n.path === oldPath) {
            return { ...n, name: newName, path: newPath };
          }
          if (n.path.startsWith(oldPath + '/')) {
            const updatedPath = n.path.replace(oldPath, newPath);
            return { ...n, path: updatedPath, children: n.children ? rename(n.children) : undefined };
          }
          if (n.children) {
            return { ...n, children: rename(n.children) };
          }
          return n;
        });
      };
      return rename(prevTree);
    });
    
    setTabs(prev => prev.map(t => {
      if (t.path === oldPath) return { ...t, path: newPath, language: getLanguageFromPath(newPath) };
      if (t.path.startsWith(oldPath + '/')) {
         return { ...t, path: t.path.replace(oldPath, newPath) };
      }
      return t;
    }));
    
    if (activeTab === oldPath) {
      setActiveTab(newPath);
    } else if (activeTab?.startsWith(oldPath + '/')) {
      setActiveTab(activeTab.replace(oldPath, newPath));
    }
  };

  const updatePreview = () => {
    const html = tabs.find(t => t.path === 'index.html')?.content || '';
    const css = tabs.find(t => t.path === 'style.css')?.content || '';
    const js = tabs.find(t => t.path === 'script.js')?.content || '';

    let combined = html;
    if (combined.includes('</head>')) {
      combined = combined.replace('</head>', `<style>${css}</style></head>`);
    } else {
      combined = `<style>${css}</style>` + combined;
    }

    if (combined.includes('</body>')) {
      combined = combined.replace('</body>', `<script>${js}</script></body>`);
    } else {
      combined = combined + `<script>${js}</script>`;
    }

    const blob = new Blob([combined], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);

    // Broadcast the changes to the external tab if it is open
    const channel = new BroadcastChannel(`preview-${exercise.id}`);
    channel.postMessage({ type: 'UPDATE_CONTENT', html: combined });
    channel.close();
  };

  const handleOpenNewTab = () => {
    const channelName = `preview-${exercise.id}`;
    const wrapperHtml = `
<!DOCTYPE html>
<html>
  <head>
    <title>CodeGuru Live Preview</title>
    <style>
      html, body, iframe { margin: 0; padding: 0; width: 100%; height: 100%; border: none; overflow: hidden; background: #fff; }
    </style>
  </head>
  <body>
    <iframe id="preview-frame"></iframe>
    <script>
      const channel = new BroadcastChannel('${channelName}');
      const frame = document.getElementById('preview-frame');
      
      const updateFrame = (html) => {
        const blob = new Blob([html], { type: 'text/html' });
        frame.src = URL.createObjectURL(blob);
      };

      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'UPDATE_CONTENT') {
          updateFrame(event.data.html);
        }
      };
      
      // Request current content from parent page
      channel.postMessage({ type: 'REQUEST_INITIAL' });
    </script>
  </body>
</html>
    `;
    const blob = new Blob([wrapperHtml], { type: 'text/html' });
    const wrapperUrl = URL.createObjectURL(blob);
    window.open(wrapperUrl, '_blank');
  };

  const handleRun = async () => {
    // Dispatch on the exercise's environment, not on whichever file happens to
    // be open. A JavaScript exercise always runs its JS entry file — the student
    // is never told to "select an HTML file".
    const lang = exercise.language;

    // DOM exercises are the only ones that render a preview. Whichever of the
    // html/css/js files is open, the preview is rebuilt from all three.
    if (lang === 'dom') {
      updatePreview();
      return;
    }

    setIsRunning(true);
    setTerminalOutput('Executing...\n');
    setBottomTab('terminal');

    // Backend runner for Java and SQL
    if (lang === 'java' || lang === 'sql') {
      try {
        setTerminalOutput('Executing on backend runner...\n----------------\n');
        // Save current progress first so runner sees the latest file modifications
        const filesPayload = tabs.map(t => ({
          name: t.path,
          content: t.content
        }));
        await apiClient.post(`/students/exercise/${exercise.id}/workspace/save`, {
          files: filesPayload,
          taskId: activeTask?.id
        });

        const res = await apiClient.post(`/students/exercise/${exercise.id}/run`, {
          taskId: activeTask?.id,
          activeFile: activeTab
        });

        if (res.data?.success && res.data.data) {
          const { output } = res.data.data;
          setTerminalOutput(output || '(no output)');
        }
      } catch (err: any) {
        setTerminalOutput('Error executing on backend: ' + (err.response?.data?.message || err.message));
      } finally {
        setIsRunning(false);
      }
      return;
    }
    
    // Python execution (cached Pyodide, in-browser for instant feedback)
    if (lang === 'python') {
      try {
        let pyodide = cachedPyodide;
        if (!pyodide) {
          setTerminalOutput('Loading Python environment...\n');
          if (!(window as any).loadPyodide) {
             await new Promise((resolve, reject) => {
               const script = document.createElement('script');
               script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
               script.onload = resolve;
               script.onerror = reject;
               document.head.appendChild(script);
             });
          }
          
          pyodide = await (window as any).loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
          });
          cachedPyodide = pyodide;
        }
        
        // Setup stdout/stderr redirection
        pyodide.setStdout({ batched: (text: string) => setTerminalOutput(prev => prev + text + '\n') });
        pyodide.setStderr({ batched: (text: string) => setTerminalOutput(prev => prev + text + '\n') });
        
        setTerminalOutput('Running...\n----------------\n');
        // Run the open .py file if there is one, else the entry file.
        const pythonCode = activeTab?.endsWith('.py')
          ? activeTabContent
          : (tabs.find(t => t.path === 'main.py')?.content
            ?? tabs.find(t => t.path.endsWith('.py'))?.content
            ?? '');
        await pyodide.runPythonAsync(pythonCode);
        setTerminalOutput(prev => prev + '\n[Execution completed successfully]');
      } catch (err: any) {
        setTerminalOutput(prev => prev + '\n[Error]: ' + err.message);
      } finally {
        setIsRunning(false);
      }
      return;
    }

    // JavaScript execution (isolated iframe to support async logs & prevent global pollution)
    if (lang === 'javascript') {
      try {
        setTerminalOutput('Running...\n----------------\n');
        // Run the open .js file if there is one, else the entry file.
        const jsCode = activeTab?.endsWith('.js')
          ? activeTabContent
          : (tabs.find(t => t.path === 'index.js')?.content
            ?? tabs.find(t => t.path.endsWith('.js'))?.content
            ?? '');

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.body.appendChild(iframe);

        if (iframe.contentWindow) {
          (iframe.contentWindow as any).console.log = (...args: any[]) => {
            setTerminalOutput(prev => prev + args.map(a => String(a)).join(' ') + '\n');
          };
          (iframe.contentWindow as any).console.error = (...args: any[]) => {
            setTerminalOutput(prev => prev + '[Error]: ' + args.map(a => String(a)).join(' ') + '\n');
          };

          try {
            const script = iframe.contentDocument?.createElement('script');
            if (script) {
              script.textContent = jsCode;
              iframe.contentDocument?.body.appendChild(script);
            }
          } catch (e: any) {
            setTerminalOutput(prev => prev + '[Error]: ' + e.message + '\n');
          }
        }

        // Keep the iframe alive for 2 seconds to allow async operations (like setTimeout) to complete
        setTimeout(() => {
          try {
            document.body.removeChild(iframe);
          } catch {}
          setTerminalOutput(prev => prev + '\n[Execution completed]');
          setIsRunning(false);
        }, 2000);

      } catch (err: any) {
        setTerminalOutput(prev => prev + '\n[Error]: ' + err.message);
        setIsRunning(false);
      }
      return;
    }

    // Unknown environment — don't leave the button spinning.
    setIsRunning(false);
    setTerminalOutput(`Running is not supported for the "${lang}" environment.`);
  };

  // Tests always execute on the backend Docker runner — the same code path that
  // grades a submission — so what the student sees here matches their grade
  // exactly, and test code never has to be shipped to the browser.
  const handleRunTests = async () => {
    const testCases = activeTask?.test_cases || [];
    if (testCases.length === 0) {
      toast.error('No test cases are defined for this exercise.');
      return;
    }

    setIsRunning(true);
    setTerminalOutput('Running tests on the grader...\n----------------\n');
    setBottomTab('terminal');

    try {
      // Save first so the runner sees the latest edits
      const filesPayload = tabs.map(t => ({ name: t.path, content: t.content }));
      await apiClient.post(`/students/exercise/${exercise.id}/workspace/save`, {
        files: filesPayload,
        taskId: activeTask?.id,
      });

      const res = await apiClient.post(`/students/exercise/${exercise.id}/run-tests`, {
        taskId: activeTask?.id,
      });

      const data = res.data?.data;
      if (!data || !Array.isArray(data.results)) {
        setTerminalOutput(data?.message || 'No test results were returned.');
        return;
      }

      let out = data.sample_only ? 'Sample tests:\n' : 'Test Results:\n';
      data.results.forEach((r: any) => {
        if (r.passed) {
          out += `✅ ${r.description}\n`;
          return;
        }
        out += `❌ ${r.description}\n`;
        // Data-driven cases know the input and both values — show all three
        // rather than a bare "expected X, got Y" with no context.
        if (r.input !== undefined) {
          out += `     input     ${r.input}\n`;
          out += `     expected  ${r.expected}\n`;
          out += `     actual    ${r.actual ?? '—'}\n`;
          if (r.actual === null && r.error) out += `     ${r.error}\n`;
        } else if (r.error) {
          out += `     ${r.error}\n`;
        }
      });
      out += `\nPassed ${data.passed} / ${data.total} tests.`;
      if (data.sample_only) {
        out += '\nSubmit to run the full set, including hidden tests.';
      }
      setTerminalOutput(out);
    } catch (err: any) {
      setTerminalOutput(
        'Could not run tests: ' + (err.response?.data?.message || err.message),
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const result = await onSubmit(exercise.id, tabs, activeTask?.id);
      
      const testRes = result?.testResults || result?.data?.test_results;
      const submissionPassed = result?.isPassed !== undefined ? result.isPassed : result?.data?.submission?.is_passed;
      const pointsAwarded = result?.data?.points_awarded || 0;

      if (testRes) {
        let outputText = `=== SUBMISSION EVALUATION ===\n`;
        outputText += `Status: ${submissionPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`;
        if (pointsAwarded > 0) {
          outputText += `XP Earned: +${pointsAwarded} XP ⚡\n`;
        }
        
        if (testRes.feedback) {
          outputText += `\n--- Detailed Feedback ---\n${testRes.feedback}\n`;
        }
        
        const breakdown = testRes.rubric_breakdown;
        if (Array.isArray(breakdown)) {
          outputText += `\n--- Rubric Breakdown ---\n`;
          breakdown.forEach((item: any) => {
            outputText += `- ${item.criteria || item.name}: ${item.score || 0}/${item.max_score || 100} pts\n`;
            if (item.feedback) outputText += `  Feedback: ${item.feedback}\n`;
          });
        }
        setFeedbackOutput(outputText);
        setBottomTab('feedback'); // Switch to feedback tab on successful submit
      }
    } catch (err) {}
  };

  const isDark = theme === 'vs-dark';

  return (
    <div className={`flex w-full ${isDark ? 'bg-[#0b0f19] text-slate-300 border-slate-800' : 'bg-slate-50 text-slate-700 border-slate-200'} shadow-2xl overflow-hidden transition-all duration-200 ${
      isFullscreen
        ? 'fixed inset-0 z-50 rounded-none'
        : 'h-[620px] sm:h-[720px] lg:h-[800px] border rounded-xl relative'
    } flex-col`}>

      {/* Task tabs (multi-task exercises only) */}
      {tasks && tasks.length > 1 && (
        <div className={`flex items-center overflow-x-auto shrink-0 [&::-webkit-scrollbar]:hidden ${isDark ? 'bg-[#0f172a] border-b border-slate-800' : 'bg-slate-100 border-b border-slate-200'}`}>
          {tasks.map((task, idx) => (
            <button
              key={task.id}
              onClick={() => handleTaskSwitch(idx)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-r ${isDark ? 'border-slate-800' : 'border-slate-200'} ${
                activeTaskIndex === idx
                  ? (isDark ? 'bg-indigo-600/20 text-white' : 'bg-indigo-50 text-indigo-700')
                  : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-550 hover:text-slate-800')
              }`}
            >
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                activeTaskIndex === idx ? 'bg-indigo-500 text-white' : (isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-300 text-slate-700')
              }`}>
                {idx + 1}
              </span>
              {task.title}
            </button>
          ))}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MOBILE VIEW (< 1024px): Dedicated Tabbed Workspace
      ───────────────────────────────────────────────────────────── */}
      {isMobile ? (
        <div className='flex flex-col flex-1 min-h-0 w-full'>
          {/* Mobile Top Header Toolbar */}
          <div className={`flex items-center justify-between px-3 py-2 ${isDark ? 'bg-[#0f172a] border-b border-slate-800' : 'bg-slate-100 border-b border-slate-200'} shrink-0 gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden`}>
            <div className='flex items-center gap-1.5 shrink-0'>
              <Code2 className='w-4 h-4 text-indigo-400' />
              <span className={`text-xs font-semibold max-w-[140px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {exercise.title}
              </span>
            </div>

            <div className='flex items-center gap-1.5 shrink-0'>
              <button
                onClick={toggleTheme}
                className={`p-1.5 rounded transition-all ${isDark ? 'text-slate-400 hover:text-white bg-slate-800/60' : 'text-slate-500 hover:text-slate-900 bg-slate-200/60'}`}
                title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {isDark ? <Sun className='w-3.5 h-3.5 text-amber-400' /> : <Moon className='w-3.5 h-3.5 text-indigo-600' />}
              </button>

              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-white bg-slate-800/60' : 'text-slate-500 hover:text-slate-900 bg-slate-200/60'}`}
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? <Minimize className='w-3.5 h-3.5' /> : <Maximize className='w-3.5 h-3.5' />}
              </button>

              <Button
                size='sm'
                variant={exercise.language === 'dom' ? 'outline' : 'secondary'}
                className={`h-7 text-xs px-2.5 ${exercise.language === 'dom' ? (isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300') : 'bg-emerald-600 hover:bg-emerald-500 text-white border-none'}`}
                onClick={() => {
                  handleRun();
                  setMobileTab('output');
                }}
                disabled={isRunning}
              >
                <Play className={`w-3 h-3 mr-1 ${exercise.language === 'dom' ? 'text-emerald-400' : ''}`} /> Run
              </Button>

              {activeTask?.test_cases && activeTask.test_cases.length > 0 && exercise.language !== 'dom' && exercise.language !== 'sql' && (
                <Button
                  size='sm'
                  variant='secondary'
                  className='h-7 text-xs px-2 bg-amber-600 hover:bg-amber-500 text-white border-none'
                  onClick={() => {
                    handleRunTests();
                    setMobileTab('output');
                  }}
                  disabled={isRunning}
                >
                  <CheckCircle2 className='w-3 h-3 mr-1' /> {isRunning ? 'Testing...' : 'Test'}
                </Button>
              )}

              <Button
                size='sm'
                variant='outline'
                className={`h-7 text-xs px-2 ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'}`}
                onClick={handleSave}
                disabled={saving}
              >
                <Save className='w-3 h-3 mr-1 text-blue-400' /> {saving ? '...' : 'Save'}
              </Button>

              <Button
                size='sm'
                className='h-7 text-xs px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white border-none'
                disabled={submitting}
                onClick={() => {
                  handleSubmit();
                  setMobileTab('output');
                }}
              >
                <Send className='w-3 h-3 mr-1' /> {submitting ? '...' : 'Submit'}
              </Button>
            </div>
          </div>

          {/* Mobile Segmented View Tabs */}
          <div className={`grid grid-cols-4 border-b text-xs font-semibold ${isDark ? 'bg-[#0b0f19] border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'} shrink-0`}>
            <button
              onClick={() => setMobileTab('instructions')}
              className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                mobileTab === 'instructions'
                  ? (isDark ? 'border-indigo-500 text-indigo-400 bg-indigo-950/20' : 'border-indigo-600 text-indigo-600 bg-indigo-50/50')
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BookOpen className='w-3.5 h-3.5' />
              <span>Guide</span>
            </button>

            <button
              onClick={() => setMobileTab('files')}
              className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                mobileTab === 'files'
                  ? (isDark ? 'border-indigo-500 text-indigo-400 bg-indigo-950/20' : 'border-indigo-600 text-indigo-600 bg-indigo-50/50')
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Files className='w-3.5 h-3.5' />
              <span>Files</span>
            </button>

            <button
              onClick={() => setMobileTab('editor')}
              className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                mobileTab === 'editor'
                  ? (isDark ? 'border-indigo-500 text-indigo-400 bg-indigo-950/20' : 'border-indigo-600 text-indigo-600 bg-indigo-50/50')
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Code2 className='w-3.5 h-3.5' />
              <span>Editor</span>
            </button>

            <button
              onClick={() => setMobileTab('output')}
              className={`py-2.5 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                mobileTab === 'output'
                  ? (isDark ? 'border-indigo-500 text-indigo-400 bg-indigo-950/20' : 'border-indigo-600 text-indigo-600 bg-indigo-50/50')
                  : 'border-transparent hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Play className='w-3.5 h-3.5' />
              <span>Output</span>
            </button>
          </div>

          {/* Mobile Active Tab Content */}
          <div className='flex-1 min-h-0 relative overflow-hidden'>
            {mobileTab === 'instructions' && (
              <div className='absolute inset-0 p-4 sm:p-6 overflow-y-auto'>
                <div className={`prose ${isDark ? 'prose-invert prose-slate' : 'prose-slate'} max-w-full text-xs sm:text-sm`}>
                  <ReactMarkdown>{instructionsMarkdown}</ReactMarkdown>
                </div>
              </div>
            )}

            {mobileTab === 'files' && (
              <div className={`h-full flex flex-col ${isDark ? 'bg-[#0b0f19]' : 'bg-slate-50'}`}>
                <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-500 border-b border-slate-800' : 'text-slate-600 border-b border-slate-200'}`}>
                  File Explorer (Tap to Open)
                </div>
                <div className='flex-1 overflow-y-auto p-2'>
                  <FileTreeExplorer
                    nodes={tree}
                    activePath={activeTab}
                    onSelect={(path) => {
                      setActiveTab(path);
                      setMobileTab('editor');
                    }}
                    onCreate={handleCreate}
                    onDelete={handleDelete}
                    onRename={handleRename}
                    onRefresh={() => {}}
                    isDark={isDark}
                  />
                </div>
              </div>
            )}

            {mobileTab === 'editor' && (
              <div className={`h-full flex flex-col ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
                {/* File Tabs */}
                <div className={`flex border-b overflow-x-auto shrink-0 [&::-webkit-scrollbar]:hidden select-none ${isDark ? 'bg-[#0f172a]/60 border-slate-800' : 'bg-slate-100/50 border-slate-200'}`}>
                  {tabs.map((t) => (
                    <button
                      key={t.path}
                      onClick={() => setActiveTab(t.path)}
                      className={`px-3 py-1.5 text-xs font-mono border-r transition-all shrink-0 ${
                        activeTab === t.path
                          ? (isDark ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500' : 'bg-white text-slate-900 border-t-2 border-t-indigo-600')
                          : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800')
                      }`}
                    >
                      {t.path}
                    </button>
                  ))}
                </div>

                {/* Monaco Editor */}
                <div className='flex-1 relative'>
                  {activeTab ? (
                    <Editor
                      height='100%'
                      language={activeTabLanguage}
                      theme={theme}
                      value={activeTabContent}
                      onChange={handleEditorChange}
                      path={activeTab || undefined}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbersMinChars: 2,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        padding: { top: 12 },
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        glyphMargin: false,
                        folding: false,
                        bracketPairColorization: { enabled: true },
                        autoClosingBrackets: 'always',
                        autoClosingQuotes: 'always',
                      }}
                    />
                  ) : (
                    <div className={`flex items-center justify-center h-full text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                      Select a file from the Files tab
                    </div>
                  )}
                </div>
              </div>
            )}

            {mobileTab === 'output' && (
              <div className={`h-full flex flex-col ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
                {exercise.language === 'dom' && (
                  <div className={`h-1/2 flex flex-col border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <div className={`flex items-center justify-between px-3 py-1.5 ${isDark ? 'bg-[#0f172a]' : 'bg-slate-100'} border-b shrink-0`}>
                      <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
                        Live Preview
                      </span>
                      {previewUrl && (
                        <button
                          className='flex items-center gap-1 text-xs text-indigo-500 font-medium'
                          onClick={handleOpenNewTab}
                        >
                          <ExternalLink className='w-3 h-3' />
                          <span>New Tab</span>
                        </button>
                      )}
                    </div>
                    <div className='flex-1 bg-white relative'>
                      {previewUrl ? (
                        <iframe src={previewUrl} className='w-full h-full border-none bg-white' sandbox='allow-scripts' title='Preview' />
                      ) : (
                        <div className='flex items-center justify-center h-full text-xs italic text-slate-400'>
                          Tap "Run" to update the preview
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className='flex-1 flex flex-col min-h-0'>
                  <div className={`flex items-center justify-between px-3 py-1.5 ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-slate-100 border-slate-200'} border-b shrink-0`}>
                    <div className='flex gap-3'>
                      <button
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          bottomTab === 'terminal'
                            ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-500 pb-0.5' : 'text-indigo-600 border-b-2 border-indigo-600 pb-0.5')
                            : 'text-slate-500'
                        }`}
                        onClick={() => setBottomTab('terminal')}
                      >
                        Terminal
                      </button>
                      <button
                        className={`text-xs font-semibold uppercase tracking-wider ${
                          bottomTab === 'feedback'
                            ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-500 pb-0.5' : 'text-indigo-600 border-b-2 border-indigo-600 pb-0.5')
                            : 'text-slate-500'
                        }`}
                        onClick={() => setBottomTab('feedback')}
                      >
                        Feedback
                      </button>
                    </div>
                    {bottomTab === 'terminal' && (
                      <button
                        className='p-1 text-slate-400 hover:text-red-500'
                        onClick={() => setTerminalOutput('')}
                        title='Clear console'
                      >
                        <Trash2 className='w-3.5 h-3.5' />
                      </button>
                    )}
                  </div>

                  <div className={`flex-1 overflow-y-auto p-3 font-mono text-xs ${isDark ? 'bg-[#1e1e1e] text-slate-300' : 'bg-white text-slate-800'}`}>
                    {bottomTab === 'feedback' ? feedbackOutput : terminalOutput}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─────────────────────────────────────────────────────────────
            DESKTOP VIEW (>= 1024px): 3-Column Resizable Panels
        ───────────────────────────────────────────────────────────── */
        <div className='flex flex-1 min-h-0 w-full'>
          {/* Activity Bar */}
          <div className={`w-12 flex flex-col items-center py-4 ${isDark ? 'bg-[#0f172a] border-r border-slate-800' : 'bg-slate-100 border-r border-slate-200'} shrink-0 gap-4`}>
            <button
              onClick={() => {
                if (!tabs.find(t => t.path === 'Instructions.md')) {
                  setTabs(prev => [{ path: 'Instructions.md', content: instructionsMarkdown, language: 'markdown' }, ...prev]);
                }
                setActiveTab('Instructions.md');
              }}
              className={`p-2 rounded-lg transition-all duration-150 hover:scale-105 ${activeTab === 'Instructions.md' ? (isDark ? 'text-white bg-indigo-600/20' : 'text-indigo-600 bg-indigo-50') : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-550 hover:text-slate-800')}`}
              title='Instructions'
            >
              <BookOpen className='w-6 h-6' />
            </button>
            <button
              onClick={() => setActiveSidebar('explorer')}
              className={`p-2 rounded-lg transition-all duration-150 hover:scale-105 ${activeSidebar === 'explorer' ? (isDark ? 'text-white bg-indigo-600/20' : 'text-indigo-600 bg-indigo-50') : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-550 hover:text-slate-800')}`}
              title='Explorer'
            >
              <Files className='w-6 h-6' />
            </button>
            <button
              onClick={() => setActiveSidebar('search')}
              className={`p-2 rounded-lg transition-all duration-150 hover:scale-105 ${activeSidebar === 'search' ? (isDark ? 'text-white bg-indigo-600/20' : 'text-indigo-600 bg-indigo-50') : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-550 hover:text-slate-800')}`}
              title='Search'
            >
              <Search className='w-6 h-6' />
            </button>
          </div>

          <PanelGroup direction='horizontal' className='flex-1 w-full overflow-hidden'>
            {/* Sidebar Panel */}
            <Panel defaultSize={18} minSize={15} maxSize={30} className={`flex flex-col h-full overflow-hidden ${isDark ? 'bg-[#0b0f19] border-r border-slate-800' : 'bg-slate-50 border-r border-slate-200'}`}>
              {activeSidebar === 'explorer' && (
                <div className='h-full flex flex-col'>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-500 border-b border-slate-800 bg-[#0f172a]/40' : 'text-slate-600 border-b border-slate-200 bg-slate-100/50'}`}>
                    Explorer
                  </div>
                  <div className='flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden'>
                    <FileTreeExplorer
                      nodes={tree}
                      activePath={activeTab}
                      onSelect={(path) => setActiveTab(path)}
                      onCreate={handleCreate}
                      onDelete={handleDelete}
                      onRename={handleRename}
                      onRefresh={() => {}}
                      isDark={isDark}
                    />
                  </div>
                </div>
              )}
              {activeSidebar === 'search' && (
                <div className='p-4 h-full text-sm text-slate-550'>
                  Search panel coming soon...
                </div>
              )}
            </Panel>

            <PanelResizeHandle className={`w-1 transition-colors cursor-col-resize z-10 ${isDark ? 'bg-slate-800 hover:bg-indigo-500 active:bg-indigo-600' : 'bg-slate-200 hover:bg-indigo-500 active:bg-indigo-600'}`} />

            {/* Editor Panel (Middle) */}
            <Panel defaultSize={50} minSize={30} className={`flex flex-col min-w-0 overflow-hidden border-r ${isDark ? 'bg-[#1e1e1e] border-slate-800' : 'bg-white border-slate-200'}`}>
              {/* Header Bar: Title and Buttons */}
              <div className={`flex items-center justify-between px-4 py-2 ${isDark ? 'bg-[#0f172a] border-b border-slate-800' : 'bg-slate-100 border-b border-slate-200'} shrink-0 select-none`}>
                <div className='flex items-center gap-2'>
                  <Code2 className='w-4 h-4 text-indigo-400' />
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{exercise.title}</span>
                </div>

                <div className='flex items-center gap-1.5 shrink-0'>
                  <button
                    onClick={toggleTheme}
                    className={`p-1.5 rounded transition-all hover:scale-105 ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'}`}
                    title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                  >
                    {isDark ? <Sun className='w-4 h-4 text-amber-400' /> : <Moon className='w-4 h-4 text-indigo-600' />}
                  </button>

                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className={`p-1.5 rounded transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'} mr-1`}
                    title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  >
                    {isFullscreen ? <Minimize className='w-4 h-4' /> : <Maximize className='w-4 h-4' />}
                  </button>

                  <Button
                    size='sm'
                    variant={exercise.language === 'dom' ? 'outline' : 'secondary'}
                    className={`h-7 text-xs ${exercise.language === 'dom' ? (isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300') : 'bg-emerald-600 hover:bg-emerald-500 text-white border-none'}`}
                    onClick={handleRun}
                    disabled={isRunning}
                  >
                    <Play className={`w-3.5 h-3.5 mr-1 ${exercise.language === 'dom' ? 'text-emerald-400' : ''}`} /> Run
                  </Button>

                  {activeTask?.test_cases && activeTask.test_cases.length > 0 && exercise.language !== 'dom' && exercise.language !== 'sql' && (
                    <Button
                      size='sm'
                      variant='secondary'
                      className='h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white border-none'
                      onClick={handleRunTests}
                      disabled={isRunning}
                    >
                      <CheckCircle2 className='w-3.5 h-3.5 mr-1' /> {isRunning ? 'Testing...' : 'Run Tests'}
                    </Button>
                  )}

                  <Button
                    size='sm'
                    variant='outline'
                    className={`h-7 text-xs ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'}`}
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <Save className='w-3.5 h-3.5 mr-1 text-blue-400' /> {saving ? 'Saving...' : 'Save'}
                  </Button>

                  <Button
                    size='sm'
                    className='h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white border-none'
                    disabled={submitting}
                    onClick={handleSubmit}
                  >
                    <Send className='w-3.5 h-3.5 mr-1' /> {submitting ? 'Submitting...' : 'Submit'}
                  </Button>
                </div>
              </div>

              {/* File Tabs Bar */}
              <div className={`flex border-b overflow-x-auto shrink-0 [&::-webkit-scrollbar]:hidden select-none ${isDark ? 'bg-[#0f172a]/60 border-slate-850' : 'bg-slate-100/50 border-slate-200'}`}>
                {tabs.map((t) => (
                  <button
                    key={t.path}
                    onClick={() => setActiveTab(t.path)}
                    className={`px-4 py-2 text-xs font-mono border-r transition-all ${
                      activeTab === t.path
                        ? (isDark ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500 border-r-slate-800' : 'bg-white text-slate-900 border-t-2 border-t-indigo-600 border-r-slate-200')
                        : (isDark ? 'text-slate-400 hover:bg-[#181824] hover:text-slate-200 border-r-slate-800' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-800 border-r-slate-200')
                    }`}
                  >
                    {t.path}
                  </button>
                ))}
              </div>

              {/* Editor Content Area */}
              <div className={`flex-1 relative ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
                {activeTab ? (
                  activeTab === 'Instructions.md' ? (
                    <div className='absolute inset-0 p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden'>
                      <div className={`
                        prose ${isDark ? 'prose-invert prose-slate' : 'prose-slate'} max-w-3xl mx-auto
                        prose-headings:${isDark ? 'text-white' : 'text-slate-955'} prose-headings:font-bold
                        prose-h1:text-2xl prose-h1:border-b ${isDark ? 'prose-h1:border-slate-800' : 'prose-h1:border-slate-200'} prose-h1:pb-3
                        prose-h2:text-xl ${isDark ? 'prose-h2:text-indigo-300' : 'prose-h2:text-indigo-650'}
                        prose-h3:text-base ${isDark ? 'prose-h3:text-slate-200' : 'prose-h3:text-slate-700'}
                        prose-p:${isDark ? 'text-slate-300' : 'text-slate-600'} prose-p:leading-relaxed
                        prose-code:${isDark ? 'bg-slate-800 text-emerald-400' : 'bg-slate-100 text-emerald-700'} prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
                        prose-pre:${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'} prose-pre:border prose-pre:rounded-lg
                        prose-strong:${isDark ? 'text-white' : 'text-slate-900'}
                        prose-li:${isDark ? 'text-slate-300' : 'text-slate-600'}
                        prose-hr:${isDark ? 'border-slate-800' : 'border-slate-200'}
                      `}>
                        <ReactMarkdown>{instructionsMarkdown}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <Editor
                      height='100%'
                      language={activeTabLanguage}
                      theme={theme}
                      value={activeTabContent}
                      onChange={handleEditorChange}
                      path={activeTab || undefined}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        lineNumbersMinChars: 3,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        padding: { top: 16 },
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        renderLineHighlight: 'all',
                        bracketPairColorization: { enabled: true },
                        autoClosingBrackets: 'always',
                        autoClosingQuotes: 'always',
                      }}
                    />
                  )
                ) : (
                  <div className={`flex items-center justify-center h-full ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    Select a file to edit
                  </div>
                )}
              </div>
            </Panel>

            <PanelResizeHandle className={`w-1 transition-colors cursor-col-resize z-10 ${isDark ? 'bg-slate-800 hover:bg-indigo-500 active:bg-indigo-600' : 'bg-slate-200 hover:bg-indigo-500 active:bg-indigo-600'}`} />

            {/* Output Panel (Right) */}
            <Panel defaultSize={32} minSize={20} className={`flex flex-col min-w-0 overflow-hidden ${isDark ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
              {exercise.language === 'dom' ? (
                <PanelGroup direction='vertical' className='h-full w-full'>
                  {/* Live Preview Panel (Top Half) */}
                  <Panel defaultSize={50} minSize={20} className={`flex flex-col border-b overflow-hidden ${isDark ? 'bg-[#1e1e1e] border-slate-800' : 'bg-white border-slate-200'}`}>
                    <div className={`flex items-center justify-between px-4 py-2 ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-slate-100 border-slate-200'} border-b shrink-0 select-none`}>
                      <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        Live Preview
                      </span>
                      {previewUrl && (
                        <button
                          className={`flex items-center gap-1 text-xs transition-colors font-semibold ${isDark ? 'text-slate-500 hover:text-indigo-400' : 'text-slate-600 hover:text-indigo-600'}`}
                          onClick={handleOpenNewTab}
                          title='Open in new tab'
                        >
                          <ExternalLink className='w-3.5 h-3.5' />
                          <span>Open in new tab</span>
                        </button>
                      )}
                    </div>
                    <div className='flex-1 bg-white relative'>
                      {previewUrl ? (
                        <iframe src={previewUrl} className='w-full h-full border-none bg-white' sandbox='allow-scripts' title='Preview' />
                      ) : (
                        <div className={`flex items-center justify-center h-full text-xs italic ${isDark ? 'bg-[#1e1e1e] text-slate-400' : 'bg-white text-slate-500'}`}>
                          Click "Run" to update the preview
                        </div>
                      )}
                    </div>
                  </Panel>

                  <PanelResizeHandle className={`h-1 transition-colors cursor-row-resize z-10 ${isDark ? 'bg-slate-800 hover:bg-indigo-500 active:bg-indigo-600' : 'bg-slate-200 hover:bg-indigo-500 active:bg-indigo-600'}`} />

                  {/* Terminal & Feedback Panel (Bottom Half) */}
                  <Panel defaultSize={50} minSize={20} className='flex flex-col overflow-hidden'>
                    <div className={`flex items-center justify-between px-4 py-1.5 ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-slate-100 border-slate-200'} border-b shrink-0 select-none`}>
                      <div className='flex gap-4'>
                        <button
                          className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
                            bottomTab === 'terminal'
                              ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-500 pb-0.5' : 'text-indigo-600 border-b-2 border-indigo-650 pb-0.5')
                              : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800')
                          }`}
                          onClick={() => setBottomTab('terminal')}
                        >
                          Terminal
                        </button>
                        <button
                          className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
                            bottomTab === 'feedback'
                              ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-500 pb-0.5' : 'text-indigo-600 border-b-2 border-indigo-650 pb-0.5')
                              : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800')
                          }`}
                          onClick={() => setBottomTab('feedback')}
                        >
                          Feedback
                        </button>
                      </div>
                      <div className='flex items-center gap-2'>
                        {bottomTab === 'terminal' && (
                          <button
                            className={`transition-colors p-1 rounded ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-slate-800' : 'text-slate-500 hover:text-red-500 hover:bg-slate-200'}`}
                            onClick={() => setTerminalOutput('')}
                            title='Clear console'
                          >
                            <Trash2 className='w-3.5 h-3.5' />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className={`flex-1 overflow-y-auto font-mono text-sm [&::-webkit-scrollbar]:hidden ${isDark ? 'bg-[#1e1e1e] text-slate-300' : 'bg-white text-slate-800'}`}>
                      {bottomTab === 'feedback' ? (
                        <div className='p-4 whitespace-pre-wrap font-mono leading-relaxed text-xs'>
                          {feedbackOutput}
                        </div>
                      ) : (
                        <div className='p-3 whitespace-pre-wrap text-xs'>
                          {terminalOutput}
                        </div>
                      )}
                    </div>
                  </Panel>
                </PanelGroup>
              ) : (
                /* Non-DOM Exercises - Full Height Output Console */
                <div className='flex flex-col h-full overflow-hidden'>
                  <div className={`flex items-center justify-between px-4 py-1.5 ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-slate-100 border-slate-200'} border-b shrink-0 select-none`}>
                    <div className='flex gap-4'>
                      <button
                        className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
                          bottomTab === 'terminal'
                            ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-500 pb-0.5' : 'text-indigo-600 border-b-2 border-indigo-650 pb-0.5')
                            : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800')
                        }`}
                        onClick={() => setBottomTab('terminal')}
                      >
                        Terminal
                      </button>
                      <button
                        className={`text-xs font-semibold uppercase tracking-wider transition-colors ${
                          bottomTab === 'feedback'
                            ? (isDark ? 'text-indigo-400 border-b-2 border-indigo-500 pb-0.5' : 'text-indigo-600 border-b-2 border-indigo-650 pb-0.5')
                            : (isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-800')
                        }`}
                        onClick={() => setBottomTab('feedback')}
                      >
                        Feedback
                      </button>
                    </div>
                    <div className='flex items-center gap-2'>
                      {bottomTab === 'terminal' && (
                        <button
                          className={`transition-colors p-1 rounded ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-slate-800' : 'text-slate-500 hover:text-red-500 hover:bg-slate-200'}`}
                          onClick={() => setTerminalOutput('')}
                          title='Clear console'
                        >
                          <Trash2 className='w-3.5 h-3.5' />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={`flex-1 overflow-y-auto font-mono text-sm [&::-webkit-scrollbar]:hidden ${isDark ? 'bg-[#1e1e1e] text-slate-300' : 'bg-white text-slate-800'}`}>
                    {bottomTab === 'feedback' ? (
                      <div className='p-4 whitespace-pre-wrap font-mono leading-relaxed text-xs'>
                        {feedbackOutput}
                      </div>
                    ) : (
                      <div className='p-3 whitespace-pre-wrap text-xs'>
                        {terminalOutput}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </PanelGroup>
        </div>
      )}
    </div>
  );
}
