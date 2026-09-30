export type PlaygroundFile = {
  path: string;
  content: string;
};

export interface College {
  id: string;
  name: string;
  short_code: string;
  city: string;
  state: string;
  is_verified: boolean;
  created_at: string;
}

export interface LessonContent {
  id: string;
  subtopic_id: string;
  content_type: 'markdown' | 'video' | 'external';
  markdown_path: string | null;
  estimated_read_time?: number;
  version: number;
  is_published: boolean;
  video_url?: string | null;
}

export interface QuizOption {
  id: string;
  option_text: string;
}

export interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer';
  points: number;
  options: QuizOption[];
  explanation?: string;
}

export interface QuizLastAttempt {
  score: number;
  is_passed: boolean;
  attempted_at: string;
}

export interface Quiz {
  id: string;
  title?: string;
  unit_id: string;
  passing_score: number;
  max_score: number;
  questions: QuizQuestion[];
  last_attempt?: QuizLastAttempt | null;
}

export interface TestCase {
  id: string;
  description: string;
  is_hidden: boolean;
  /** Code-mode only: author-written assertion code. */
  test_code?: string;
  /** Data-mode: arguments passed to the entry function. */
  args?: unknown[];
  /** Data-mode: the value the entry function must return. */
  expected?: unknown;
  /** Data-mode: shown as a sample and run by "Run tests"; hidden cases only run on Submit. */
  visible?: boolean;
  /** Editing-only scratch text, stripped before save. */
  _argsText?: string;
  _expectedText?: string;
}

export interface ExerciseTask {
  id: string;
  title: string;
  instructions?: string;
  initial_files: { name: string; content: string }[];
  test_cases?: TestCase[];
  /**
   * The author's worked answer, used only to verify the test cases at
   * authoring time. Stripped from every student-facing response.
   */
  reference_solution?: { name: string; content: string }[];
  /** 'data' = args/expected table (default for new exercises); 'code' = legacy authored test code. */
  test_kind?: 'data' | 'code';
  /** Data-mode: the function the test cases call, e.g. "updateSalary". */
  entry_function?: string;
}

export interface Exercise {
  id: string;
  subtopic_id: string;
  title: string;
  instructions?: string;
  max_score: number;
  language?: string;
  initial_files?: { name: string; content: string }[];
  test_cases?: TestCase[];
  tasks?: ExerciseTask[];
  rubric?: any;
  is_completed?: boolean;
}

export type SubmissionType = 'file' | 'github' | 'docs' | 'figma' | 'excel' | 'url';

export interface SubmissionTypeConfig {
  id: SubmissionType;
  label: string;
  shortLabel: string;
  iconName: string;
  emoji: string;
  placeholder: string;
  helperText: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  patternHelp?: string;
  requiresPermissionsWarning?: boolean;
}

export const ALL_SUBMISSION_TYPES: SubmissionType[] = ['file', 'github', 'docs', 'figma', 'excel', 'url'];

export const SUBMISSION_TYPE_CONFIGS: Record<SubmissionType, SubmissionTypeConfig> = {
  file: {
    id: 'file',
    label: 'Document / File Upload',
    shortLabel: 'File Upload',
    iconName: 'FileUp',
    emoji: '📁',
    placeholder: 'Select a file to upload (PDF, DOCX, XLSX, ZIP, etc.)',
    helperText: 'Upload PDF, DOCX, XLSX, PPTX, TXT, or ZIP archives (max 25MB)',
    badgeBg: 'bg-blue-500/10 dark:bg-blue-500/20',
    badgeText: 'text-blue-600 dark:text-blue-400',
    badgeBorder: 'border-blue-500/20',
  },
  github: {
    id: 'github',
    label: 'GitHub / Git Repository',
    shortLabel: 'GitHub Repo',
    iconName: 'Github',
    emoji: '🐙',
    placeholder: 'https://github.com/username/repository',
    helperText: 'Public or accessible repository on GitHub, GitLab, or Bitbucket',
    badgeBg: 'bg-zinc-500/10 dark:bg-zinc-500/20',
    badgeText: 'text-zinc-700 dark:text-zinc-300',
    badgeBorder: 'border-zinc-500/20',
    patternHelp: 'Must be a valid GitHub, GitLab, or Bitbucket repository URL',
  },
  docs: {
    id: 'docs',
    label: 'Google Docs / Office 365',
    shortLabel: 'Google Docs',
    iconName: 'FileText',
    emoji: '📄',
    placeholder: 'https://docs.google.com/document/d/...',
    helperText: 'Google Docs or Microsoft Word online shareable link',
    badgeBg: 'bg-sky-500/10 dark:bg-sky-500/20',
    badgeText: 'text-sky-600 dark:text-sky-400',
    badgeBorder: 'border-sky-500/20',
    patternHelp: 'Must be a Google Docs or Microsoft 365 document URL',
    requiresPermissionsWarning: true,
  },
  figma: {
    id: 'figma',
    label: 'Figma Design / Prototype',
    shortLabel: 'Figma Link',
    iconName: 'Figma',
    emoji: '🎨',
    placeholder: 'https://www.figma.com/design/... or https://www.figma.com/proto/...',
    helperText: 'Figma design file, prototype, or FigJam board share link',
    badgeBg: 'bg-purple-500/10 dark:bg-purple-500/20',
    badgeText: 'text-purple-600 dark:text-purple-400',
    badgeBorder: 'border-purple-500/20',
    patternHelp: 'Must be a valid Figma URL (design, file, proto, or board)',
    requiresPermissionsWarning: true,
  },
  excel: {
    id: 'excel',
    label: 'Google Sheets / Excel Online',
    shortLabel: 'Spreadsheet',
    iconName: 'Sheet',
    emoji: '📊',
    placeholder: 'https://docs.google.com/spreadsheets/d/...',
    helperText: 'Google Sheets or Excel Online workbook shareable link',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    badgeText: 'text-emerald-600 dark:text-emerald-400',
    badgeBorder: 'border-emerald-500/20',
    patternHelp: 'Must be a Google Sheets or Excel Online URL',
    requiresPermissionsWarning: true,
  },
  url: {
    id: 'url',
    label: 'General Web URL / Deployed App',
    shortLabel: 'Live URL',
    iconName: 'Globe',
    emoji: '🌐',
    placeholder: 'https://your-deployed-app.vercel.app',
    helperText: 'Any publicly accessible web URL, demo site, or documentation link',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-500/20',
    badgeText: 'text-amber-600 dark:text-amber-400',
    badgeBorder: 'border-amber-500/20',
    patternHelp: 'Must be a valid web URL starting with https:// or http://',
  },
};

export interface CollegeAssignment {
  id: string;
  title: string;
  description?: string;
  due_date?: string | null;
  created_at: string;
  created_by_name: string;
  course?: string | null;
  instruction_file_url?: string | null;
  instruction_file_name?: string | null;
  allowed_submission_types?: SubmissionType[];
  submission_type?: SubmissionType | null;
  submission_link?: string | null;
  submission_file_url?: string | null;
  submission_file_name?: string | null;
  submitted_at?: string | null;
  updated_at?: string | null;
  test_cases?: AssignmentTestCase[];
  rubric?: any;
  evaluator_type?: string | null;
  assignment_description?: string | null;
  status?: string;
  score?: number | null;
  feedback?: string | null;
}

export interface AssignmentTestCase {
  input: string;
  output: string;
  score: number;
}

export interface Assignment {
  id: string;
  title: string;
  instructions?: string;
  max_score: number;
  allowed_submission_types?: SubmissionType[];
  submission_type?: SubmissionType | null;
  submission_link?: string | null;
  submission_file_url?: string | null;
  submission_file_name?: string | null;
  evaluator_type?: string | null;
  test_cases?: any;
  rubric?: any;
  // Enriched fields from student assignments API
  unit_id?: string;
  unit_title?: string;
  subject_title?: string;
  subject_slug?: string;
  status?: 'PENDING' | 'COMPLETED';
  score?: number;
}

export interface Subtopic {
  id: string;
  title: string;
  slug: string;
  description?: string;
  order_index: number;
  lesson_content?: LessonContent[];
  exercises?: Exercise[];
}

export interface Unit {
  id: string;
  title: string;
  slug: string;
  description?: string;
  order_index: number;
  subtopics: Subtopic[];
  assignments?: Assignment[];
  quizzes?: Quiz[];
}

export interface CapstoneProject {
  id: string;
  title: string;
  instructions?: string | null;
  max_score: number;
  evaluator_type?: string | null;
  test_cases?: any;
  rubric?: any;
}

export interface Topic {
  id: string;
  title: string;
  description?: string;
  units: Unit[];
  order_index: number;
  capstone?: CapstoneProject | null;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_published: boolean;
  level?: string;
  total_lessons?: number;
  progress_percent?: number;
  units_count?: number;
  topics_count?: number;
}

export interface SubjectDetailResponse {
  success: boolean;
  name: string;
  description: string;
  data: Topic[];
}

export interface SubjectListResponse {
  success: boolean;
  data: Subject[];
}

export interface QuizAttemptResult {
  attempt: {
    score: number;
    is_passed: boolean;
  };
  points_awarded: number;
  question_results: Record<string, {
    is_correct: boolean;
    correct_option_id: string | null;
    correct_option_text: string | null;
    explanation?: string | null;
  }>;
  effective_passing_score?: number;
  actual_max_score?: number;
}

// Modal Components
export interface TopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string }) => void;
  editData?: { title: string; description: string };
  loading?: boolean;
}

export interface SubtopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; slug?: string }) => void;
  topicTitle: string;
  editData?: { title: string; description: string; slug: string };
  loading?: boolean;
}

export interface UnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; slug?: string }) => void;
  topicTitle: string;
  editData?: { title: string; description: string; slug: string };
  loading?: boolean;
}

export interface ContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    content_type: 'markdown' | 'video' | 'external';
    markdown_path: string;
    estimated_read_time?: number;
    video_url?: string;
    file?: File | null;
  }) => void;
  subtopicTitle: string;
  editData?: {
    content_type: 'markdown' | 'video' | 'external';
    markdown_path: string | null;
    estimated_read_time?: number;
    video_url?: string | null;
  };
  loading?: boolean;
}

export interface QuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { passing_score: number; max_score: number }) => void;
  editData?: { passing_score: number; max_score: number };
  unitTitle: string;
  loading?: boolean;
}

export interface ExerciseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    instructions: string;
    max_score: number;
    language: string;
    initial_files: { name: string; content: string }[];
    test_cases: TestCase[];
    tasks: ExerciseTask[];
    rubric?: any;
  }) => void;
  editData?: {
    title: string;
    instructions: string;
    max_score: number;
    language?: string;
    initial_files?: { name: string; content: string }[];
    test_cases?: TestCase[];
    tasks?: ExerciseTask[];
    rubric?: any;
  };
  subtopicTitle: string;
  loading?: boolean;
}

export interface RubricBreakdownItem {
  item?: string;
  criterion?: string;
  name?: string;
  awarded?: number;
  points_awarded?: number;
  score?: number;
  max?: number;
  max_points?: number;
  weight?: number;
  reason?: string;
  feedback?: string;
}

export interface EvaluationFeedback {
  summary?: string;
  feedback?: string;
  strengths?: string[];
  issues?: string[];
  breakdown?: RubricBreakdownItem[];
  rubric_breakdown?: RubricBreakdownItem[];
  [key: string]: any;
}

export type AssignmentLifecycleStatus = 'pending' | 'pending_evaluation' | 'evaluated';

export interface StudentAssignmentOverviewItem {
  id: string;
  title: string;
  type: 'CURRICULUM' | 'COLLEGE' | 'CAPSTONE' | 'PROJECT';
  course_name: string;
  subject_slug?: string | null;
  topic_title?: string | null;
  unit_title?: string | null;
  max_score: number;
  due_date?: string | null;
  created_at?: string;
  status: AssignmentLifecycleStatus;
  submitted_at?: string | null;
  submission_link?: string | null;
  submission_file_url?: string | null;
  marks?: number | null;
  feedback?: EvaluationFeedback | null;
  navigation_url: string;
}

export interface StudentAssignmentsOverviewResponse {
  success: boolean;
  data: StudentAssignmentOverviewItem[];
  counts: {
    total: number;
    pending: number;
    pending_evaluation: number;
    evaluated: number;
  };
}

export interface StudentProjectsOverviewResponse {
  success: boolean;
  data: StudentAssignmentOverviewItem[];
  counts: {
    total: number;
    pending: number;
    pending_evaluation: number;
    evaluated: number;
  };
}
