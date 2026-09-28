import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from '@reduxjs/toolkit';
import apiClient from '@/services/api';
import type { QuizAttemptResult, Quiz, Exercise } from '@/utils/types';
import type { RootState } from '@/app/store';
import { loadUser } from '@/features/auth/authThunks';

// Define types based on Lesson.tsx usage
interface LessonResponse {
  subtopic: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
  };
  lesson: {
    id: string;
    content_type: 'markdown' | 'video' | 'external' | 'exercise' | 'quiz' | null;
    markdown_content: string;
    read_time: number | null;
    video_url?: string | null;
  };
  lesson_completed?: boolean;
  quizzes: Quiz[];
  exercises: Exercise[];
}

interface LessonState {
  data: LessonResponse | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;

  // Quiz State
  quizAnswers: Record<string, string>;
  quizSubmitted: boolean;
  quizResults: QuizAttemptResult | null;
  submittingQuiz: boolean;

  // Exercise State
  exerciseCode: Record<string, string>;
  submittingExercise: Record<string, boolean>;

  // Progress
  lessonCompleted: boolean;
}

const initialState: LessonState = {
  data: null,
  status: 'idle',
  error: null,
  quizAnswers: {},
  quizSubmitted: false,
  quizResults: null,
  submittingQuiz: false,
  exerciseCode: {},
  submittingExercise: {},
  lessonCompleted: false,
};

// Async Thunks
export const fetchLesson = createAsyncThunk<
  LessonResponse,
  string,
  { rejectValue: string }
>('lesson/fetchLesson', async (subtopicSlug, { rejectWithValue }) => {
  try {
    const response = await apiClient.get<{ data: LessonResponse }>(
      `/subjects/content/${subtopicSlug}`,
    );

    // If lesson loads, we can also try to mark it as started (fire-and-forget)
    if (response.data.data?.subtopic?.id) {
      apiClient
        .post(
          `/students/progress/subtopic/${response.data.data.subtopic.id}/start`,
        )
        .catch((err) => console.log('Mark start failed', err));
    }

    return response.data.data;
  } catch (error: any) {
    return rejectWithValue(
      error.response?.data?.message || 'Failed to load lesson',
    );
  }
});

export const fetchExercise = createAsyncThunk<
  LessonResponse,
  string,
  { rejectValue: string }
>('lesson/fetchExercise', async (exerciseId, { rejectWithValue }) => {
  try {
    const response = await apiClient.get<{ data: LessonResponse }>(
      `/subjects/exercise/${exerciseId}`,
    );
    return response.data.data;
  } catch (error: any) {
    return rejectWithValue(
      error.response?.data?.message || 'Failed to load exercise',
    );
  }
});

export const fetchQuiz = createAsyncThunk<
  LessonResponse,
  string,
  { rejectValue: string }
>('lesson/fetchQuiz', async (quizId, { rejectWithValue }) => {
  try {
    const response = await apiClient.get<{ data: LessonResponse }>(
      `/subjects/quiz/${quizId}`,
    );
    return response.data.data;
  } catch (error: any) {
    return rejectWithValue(
      error.response?.data?.message || 'Failed to load quiz',
    );
  }
});

export const submitQuiz = createAsyncThunk<
  QuizAttemptResult,
  { quizId: string; answers: Record<string, string> },
  { rejectValue: string }
>('lesson/submitQuiz', async (payload, { rejectWithValue, dispatch }) => {
  try {
    const res = await apiClient.post<{ data: QuizAttemptResult }>(
      `/students/quiz/${payload.quizId}/submit`,
      { answers: payload.answers },
    );
    dispatch(loadUser());
    return res.data.data;
  } catch (error: any) {
    return rejectWithValue(
      error.response?.data?.message || 'Failed to submit quiz',
    );
  }
});

export const completeLesson = createAsyncThunk<
  boolean,
  string,
  { rejectValue: string }
>('lesson/completeLesson', async (lessonId, { rejectWithValue, dispatch }) => {
  try {
    await apiClient.post(`/students/progress/lesson/${lessonId}/complete`);
    dispatch(loadUser());
    return true;
  } catch (error: any) {
    return rejectWithValue(error.response?.data?.message || 'Failed');
  }
});

export const submitExercise = createAsyncThunk<
  { exerciseId: string; score: number | null; isPassed: boolean; testResults?: any },
  { exerciseId: string; files?: any[]; taskId?: string },
  { rejectValue: string }
>('lesson/submitExercise', async (payload, { rejectWithValue, dispatch }) => {
  try {
    const res = await apiClient.post<{ data: { score?: number; is_passed?: boolean; submission?: { score?: number; is_passed?: boolean }; test_results?: any; } }>(
      `/students/exercise/${payload.exerciseId}/submit`,
      { files: payload.files, taskId: payload.taskId }
    );
    dispatch(loadUser());
    return { 
      exerciseId: payload.exerciseId, 
      score: res.data.data?.submission?.score ?? res.data.data?.score ?? null,
      isPassed: res.data.data?.submission?.is_passed ?? res.data.data?.is_passed ?? false,
      testResults: res.data.data?.test_results,
    };
  } catch (error: any) {
    return rejectWithValue(
      error.response?.data?.message || 'Failed to submit exercise',
    );
  }
});

const QUIZ_STORAGE_KEY = 'lesson_quiz_answers';
const EXERCISE_STORAGE_KEY = 'lesson_exercise_code';

function loadFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const lessonSlice = createSlice({
  name: 'lesson',
  initialState: {
    ...initialState,
    quizAnswers: loadFromStorage<Record<string, string>>(QUIZ_STORAGE_KEY) ?? {},
    exerciseCode: loadFromStorage<Record<string, string>>(EXERCISE_STORAGE_KEY) ?? {},
  },
  reducers: {
    setQuizAnswer(
      state,
      action: PayloadAction<{ questionId: string; value: string }>,
    ) {
      state.quizAnswers[action.payload.questionId] = action.payload.value;
      saveToStorage(QUIZ_STORAGE_KEY, state.quizAnswers);
    },
    resetQuiz(state) {
      state.quizAnswers = {};
      state.quizSubmitted = false;
      state.quizResults = null;
      localStorage.removeItem(QUIZ_STORAGE_KEY);
    },
    setExerciseCode(
      state,
      action: PayloadAction<{ exerciseId: string; code: string }>,
    ) {
      state.exerciseCode[action.payload.exerciseId] = action.payload.code;
      saveToStorage(EXERCISE_STORAGE_KEY, state.exerciseCode);
    },
    setSubmittingExercise(
      state,
      action: PayloadAction<{ exerciseId: string; isSubmitting: boolean }>,
    ) {
      state.submittingExercise[action.payload.exerciseId] =
        action.payload.isSubmitting;
    },
    setLessonCompletedLocally(state, action: PayloadAction<boolean>) {
      state.lessonCompleted = action.payload;
    },
    resetLessonState() {
      localStorage.removeItem(QUIZ_STORAGE_KEY);
      localStorage.removeItem(EXERCISE_STORAGE_KEY);
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Lesson
      .addCase(fetchLesson.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.quizAnswers = {};
        state.quizSubmitted = false;
        state.quizResults = null;
        state.exerciseCode = {};
        state.lessonCompleted = false;
        localStorage.removeItem(QUIZ_STORAGE_KEY);
        localStorage.removeItem(EXERCISE_STORAGE_KEY);
      })
      .addCase(fetchLesson.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
        state.lessonCompleted = action.payload.lesson_completed ?? false;
      })
      .addCase(fetchLesson.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Fetch Exercise
      .addCase(fetchExercise.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.quizAnswers = {};
        state.quizSubmitted = false;
        state.quizResults = null;
        state.exerciseCode = {};
        state.lessonCompleted = false;
      })
      .addCase(fetchExercise.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
        state.lessonCompleted = false; // Exercises are not subtopic lessons
      })
      .addCase(fetchExercise.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Fetch Quiz
      .addCase(fetchQuiz.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.quizAnswers = {};
        state.quizSubmitted = false;
        state.quizResults = null;
        state.exerciseCode = {};
        state.lessonCompleted = false;
      })
      .addCase(fetchQuiz.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload;
        state.lessonCompleted = false;
      })
      .addCase(fetchQuiz.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })

      // Submit Quiz
      .addCase(submitQuiz.pending, (state) => {
        state.submittingQuiz = true;
      })
      .addCase(submitQuiz.fulfilled, (state, action) => {
        state.submittingQuiz = false;
        state.quizSubmitted = true;
        state.quizResults = action.payload;
      })
      .addCase(submitQuiz.rejected, (state) => {
        state.submittingQuiz = false;
      })

      // Complete Lesson
      .addCase(completeLesson.fulfilled, (state) => {
        state.lessonCompleted = true;
      })

      // Submit Exercise
      .addCase(submitExercise.pending, (state, action) => {
        state.submittingExercise[action.meta.arg.exerciseId] = true;
      })
      .addCase(submitExercise.fulfilled, (state, action) => {
        state.submittingExercise[action.payload.exerciseId] = false;
        if (action.payload.isPassed) {
          state.lessonCompleted = true;
        }
      })
      .addCase(submitExercise.rejected, (state, action) => {
        const exerciseId = action.meta.arg.exerciseId;
        if (exerciseId) {
          state.submittingExercise[exerciseId] = false;
        }
      });
  },
});

export const {
  setQuizAnswer,
  resetQuiz,
  setExerciseCode,
  setSubmittingExercise,
  setLessonCompletedLocally,
  resetLessonState,
} = lessonSlice.actions;

export const selectLessonData = (state: RootState) => state.lesson.data;

export default lessonSlice.reducer;
