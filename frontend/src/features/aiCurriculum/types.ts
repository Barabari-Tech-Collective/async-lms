export type CourseStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'published';
export type CourseAction = 'approved' | 'changes_requested' | 'rejected';

export interface Skill {
  name: string;
  category: 'technical' | 'tools' | 'soft';
}

export interface AiQuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface AiExercise {
  title: string;
  description: string;
  tasks: string[];
  starter_code: string;
  resource_links?: string[];
  reference_files?: string[];
}

export interface AiLesson {
  id: string;
  topic_id: string;
  title: string;
  explanation: string;
  example: string;
  activity: string;
  interview_questions: string[];
  lesson_type: 'video' | 'exercise' | 'quiz' | 'reading';
  duration_mins: number;
  order_index: number;
  video_url: string | null;
  quiz_questions: AiQuizQuestion[];
  exercise_data: AiExercise | null;
  resource_links?: string[];
  is_new?: boolean;
  is_modified?: boolean;
}

export interface AiAssignment {
  title: string;
  instructions: string;
  max_score: number;
  resources?: string[];
}

export interface AiCapstoneProject {
  title: string;
  description: string;
  instructions: string;
}

export interface AiTopic {
  id: string;
  module_id: string;
  title: string;
  description: string;
  order_index: number;
  quiz_questions: AiQuizQuestion[];
  assignment: AiAssignment | null;
  lessons: AiLesson[];
  is_new?: boolean;
  is_modified?: boolean;
}

export interface AiModule {
  id: string;
  course_id: string;
  title: string;
  description: string;
  order_index: number;
  practice_tasks: string[];
  case_studies: string[];
  capstone_project: AiCapstoneProject | null;
  topics: AiTopic[];
  is_new?: boolean;
  is_modified?: boolean;
}

export interface CourseReview {
  id: string;
  reviewer_id: string;
  reviewer_name: string;
  action: CourseAction;
  feedback: ReviewFeedback;
  created_at: string;
}

export interface ReviewFeedback {
  missing_skills?: string;
  incorrect_content?: string;
  difficulty_issues?: string;
  suggestions?: string;
  inline_comments?: string;
}

export interface AiCourse {
  id: string;
  title: string;
  domain: string;
  role_focus: string;
  jd_text: string | null;
  skills: Skill[];
  audience: string[];
  level: string;
  capstone_project: AiCapstoneProject | null;
  learning_goal: string;
  duration_weeks: number | null;
  daily_hours: number | null;
  content_preference: string | null;
  status: CourseStatus;
  created_by: string;
  creator_name: string;
  reviewed_by: string | null;
  reviewer_name: string | null;
  subject_id: string | null;
  has_unpublished_changes?: boolean;
  last_published_at?: string | null;
  pending_changes_summary?: {
    new_modules: number;
    new_topics: number;
    new_lessons: number;
    total: number;
  };
  created_at: string;
  updated_at: string;
  modules_count?: number;
  topics_count?: number;
  modules: AiModule[];
  reviews: CourseReview[];
}

export interface CourseFormData {
  title: string;
  domain: string;
  role_focus: string;
  jd_text: string;
  skills: Skill[];
  audience: string[];
  level: string;
  learning_goal: string;
  duration_weeks: number | '';
  daily_hours: number | '';
  content_preference: string;
  num_modules: number | '';
}

// Incremental generation suggestion shapes
export interface TopicSuggestion {
  title: string;
  description: string;
}

export interface UnitSuggestion {
  title: string;
  description: string;
}

export interface SubtopicSuggestion {
  title: string;
  duration_mins: number;
}

// Shape returned by AI generate endpoint (before saving)
export interface GeneratedCurriculum {
  capstone_project?: AiCapstoneProject;
  modules: Array<{
    title: string;
    description: string;
    practice_tasks: string[];
    case_studies: string[];
    topics: Array<{
      title: string;
      description: string;
      assignment?: AiAssignment;
      lessons: Array<{
        title: string;
        explanation: string;
        example: string;
        activity: string;
        interview_questions: string[];
        lesson_type?: string;
        duration_mins?: number;
        video_url?: string;
        quiz_questions?: AiQuizQuestion[];
        exercise?: AiExercise;
      }>;
    }>;
  }>;
}
