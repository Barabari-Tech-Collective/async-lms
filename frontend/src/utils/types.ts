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
}

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
  submission_link?: string | null;
  submission_file_url?: string | null;
  submission_file_name?: string | null;
  submitted_at?: string | null;
  test_cases?: AssignmentTestCase[];
  rubric?: { name: string; score: number }[];
  evaluator_type?: string | null;
  assignment_description?: string | null;
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
  type: 'CURRICULUM' | 'COLLEGE';
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
