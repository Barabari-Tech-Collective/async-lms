import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import {
  Settings,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  FileText,
  Layout,
  Loader2,
  Edit2,
  ListChecks,
  Code,
  FolderOpen,
  XCircle,
  Eye,
  Trophy,
  PlayCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import apiClient from '@/services/api';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import type {
  Exercise,
  Quiz,
  LessonContent,
  Subject,
  Subtopic,
  Unit,
  Topic,
  CapstoneProject,
  Assignment,
} from '@/utils/types';
import TopicModal from '@/components/common/admin/TopicModal';
import UnitModal from '@/components/common/admin/UnitModal';
import SubtopicModal from '@/components/common/admin/SubTopicModal';
import QuizModal from '@/components/common/admin/QuizModal';
import ExerciseModal from '@/components/common/admin/ExerciseModal';
import AssignmentModal from '@/components/common/admin/AssignmentModal';
import CapstoneModal from '@/components/common/admin/CapstoneModal';
import { QuizQuestionsList } from '@/components/common/admin/QuizQuestions';
import ContentModal from '@/components/common/admin/ContentModal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { fetchSubjects } from '@/features/subjects/subjectSlice';
import {
  fetchCourseStructure,
  setActiveSubject,
  toggleTopicExpansion,
  toggleUnitExpansion,
  toggleSubtopicExpansion,
  setStructure,
} from '@/features/learningFlow/learningFlowSlice';
import AdminLessonPreviewModal from '@/components/common/admin/AdminLessonPreview';

const LearningFlow: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();

  // Redux State
  const { items: subjects, status: subjectsStatus } = useAppSelector(
    (state) => state.subjects,
  );
  const {
    structure,
    activeSubjectId,
    expandedTopics,
    expandedUnits,
    expandedSubtopics,
    status: structureStatus,
  } = useAppSelector((state) => state.learningFlow);

  const selectedSubject =
    subjects.find((s) => s.id === activeSubjectId) ||
    subjects.find((s) => s.slug === activeSubjectId) || // minimal Fallback
    null;

  const loading = subjectsStatus === 'loading' || structureStatus === 'loading';
  const fetchingStructure = structureStatus === 'loading';

  // Modal states
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [subtopicModalOpen, setSubtopicModalOpen] = useState(false);
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [capstoneModalOpen, setCapstoneModalOpen] = useState(false);
  const [editingCapstone, setEditingCapstone] =
    useState<CapstoneProject | null>(null);
  const [selectedTopicForCapstone, setSelectedTopicForCapstone] =
    useState<Topic | null>(null);

  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editingSubtopic, setEditingSubtopic] = useState<{
    subtopic: Subtopic;
    unitId: string;
  } | null>(null);
  const [selectedTopicForUnit, setSelectedTopicForUnit] =
    useState<Topic | null>(null);
  const [selectedUnitForSubtopic, setSelectedUnitForSubtopic] =
    useState<Unit | null>(null);
  const [selectedSubtopicForContent, setSelectedSubtopicForContent] =
    useState<Subtopic | null>(null);
  const [selectedUnitForQuiz, setSelectedUnitForQuiz] = useState<Unit | null>(
    null,
  );
  const [selectedSubtopicForExercise, setSelectedSubtopicForExercise] =
    useState<Subtopic | null>(null);
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [selectedUnitForAssignment, setSelectedUnitForAssignment] =
    useState<Unit | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(
    null,
  );
  const [editingContent, setEditingContent] = useState<LessonContent | null>(
    null,
  );
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const [selectedQuizForQuestions, setSelectedQuizForQuestions] =
    useState<Quiz | null>(null);
  const [selectedUnitTitleForQuestions, setSelectedUnitTitleForQuestions] =
    useState<string>('');
  const [showLessonPreview, setShowLessonPreview] = useState(false);
  const [lessonPreviewContent, setLessonPreviewContent] = useState('');
  const [lessonPreviewLoading, setLessonPreviewLoading] = useState(false);
  const [lessonPreviewError, setLessonPreviewError] = useState<string | null>(
    null,
  );
  const [lessonPreviewVideoUrl, setLessonPreviewVideoUrl] = useState<
    string | undefined
  >(undefined);
  const [modalLoading, setModalLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    kind:
      | 'unit'
      | 'topic'
      | 'subtopic'
      | 'content'
      | 'quiz'
      | 'exercise'
      | 'assignment'
      | 'capstone';
    id: string;
    label: string;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // 1. Initial Load: Get all subjects
  useEffect(() => {
    dispatch(fetchSubjects());
  }, [dispatch]);

  // 2. Load structure when subjects load or active subject changes.
  // Picks the subject from the `subject` URL query param if present (so a
  // reload keeps whatever course was being edited), falling back to the
  // first subject otherwise — and keeps the URL in sync either way.
  useEffect(() => {
    if (subjects.length === 0 || activeSubjectId) return;

    const subjectSlugFromUrl = searchParams.get('subject');
    const target =
      (subjectSlugFromUrl &&
        subjects.find((s) => s.slug === subjectSlugFromUrl)) ||
      subjects[0];

    dispatch(setActiveSubject(target.slug));
    dispatch(fetchCourseStructure(target.slug));

    if (subjectSlugFromUrl !== target.slug) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('subject', target.slug);
          return next;
        },
        { replace: true },
      );
    }
  }, [subjects, activeSubjectId, searchParams, setSearchParams, dispatch]);

  // Toggle topic expansion
  const toggleTopic = (topicId: string) => {
    dispatch(toggleTopicExpansion(topicId));
  };

  // Toggle unit expansion
  const toggleUnit = (unitId: string) => {
    dispatch(toggleUnitExpansion(unitId));
  };

  // Toggle subtopic expansion
  const toggleSubtopic = (subtopicId: string) => {
    dispatch(toggleSubtopicExpansion(subtopicId));
  };

  const refreshStructure = async () => {
    if (selectedSubject) {
      await dispatch(fetchCourseStructure(selectedSubject.slug));
    }
  };

  const handleSubjectChange = (slug: string) => {
    const subject = subjects.find((s) => s.slug === slug);
    if (subject) {
      dispatch(setActiveSubject(subject.slug));
      dispatch(fetchCourseStructure(subject.slug));
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('subject', subject.slug);
          return next;
        },
        { replace: true },
      );
    }
  };

  // Create Topic
  const handleCreateTopic = async (data: {
    title: string;
    description: string;
  }) => {
    if (!selectedSubject) return;
    setModalLoading(true);

    try {
      const response = await apiClient.post('/admin/topics', {
        subject_id: selectedSubject.id,
        title: data.title,
        description: data.description,
        order_index: structure.length,
      });

      if (response.data.success) {
        toast.success('Topic created successfully');
        refreshStructure();
        setTopicModalOpen(false);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create topic'));
    } finally {
      setModalLoading(false);
    }
  };

  // Create Unit
  const handleCreateUnit = async (data: {
    title: string;
    description: string;
    slug: string;
  }) => {
    if (!selectedTopicForUnit) return;
    setModalLoading(true);

    try {
      const response = await apiClient.post('/admin/units', {
        topic_id: selectedTopicForUnit.id,
        title: data.title,
        description: data.description,
        slug: data.slug,
        order_index: selectedTopicForUnit.units?.length || 0,
      });

      if (response.data.success) {
        toast.success('Unit created successfully');
        refreshStructure();
        setUnitModalOpen(false);
        setSelectedTopicForUnit(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create unit'));
    } finally {
      setModalLoading(false);
    }
  };

  // Update Unit
  const handleUpdateUnit = async (data: {
    title: string;
    description: string;
    slug: string;
  }) => {
    if (!editingUnit) return;
    setModalLoading(true);

    try {
      const response = await apiClient.put(`/admin/units/${editingUnit.id}`, {
        title: data.title,
        description: data.description,
        slug: data.slug,
      });

      if (response.data.success) {
        toast.success('Unit updated successfully');
        refreshStructure();
        setUnitModalOpen(false);
        setEditingUnit(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update unit'));
    } finally {
      setModalLoading(false);
    }
  };

  // Delete Unit
  const requestDeleteUnit = (unitId: string, label: string) => {
    setConfirmDelete({ kind: 'unit', id: unitId, label });
  };

  const handleDeleteUnit = async (unitId: string) => {
    try {
      const response = await apiClient.delete(`/admin/units/${unitId}`);
      if (response.data.success) {
        toast.success('Unit deleted successfully');
        refreshStructure();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete unit'));
    }
  };

  // Update Topic
  const handleUpdateTopic = async (data: {
    title: string;
    description: string;
  }) => {
    if (!editingTopic) return;
    setModalLoading(true);

    try {
      const response = await apiClient.put(`/admin/topics/${editingTopic.id}`, {
        title: data.title,
        description: data.description,
      });

      if (response.data.success) {
        toast.success('Topic updated successfully');
        refreshStructure();
        setTopicModalOpen(false);
        setEditingTopic(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update topic'));
    } finally {
      setModalLoading(false);
    }
  };

  // Delete Topic
  const requestDeleteTopic = (topicId: string, label: string) => {
    setConfirmDelete({ kind: 'topic', id: topicId, label });
  };

  const handleDeleteTopic = async (topicId: string) => {
    try {
      const response = await apiClient.delete(`/admin/topics/${topicId}`);
      if (response.data.success) {
        toast.success('Topic deleted successfully');
        refreshStructure();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete topic'));
    }
  };

  // Create Subtopic
  const handleCreateSubtopic = async (data: {
    title: string;
    description: string;
    slug: string;
  }) => {
    if (!selectedUnitForSubtopic) return;
    setModalLoading(true);

    try {
      const response = await apiClient.post('/admin/subtopics', {
        unit_id: selectedUnitForSubtopic.id,
        title: data.title,
        description: data.description,
        slug: data.slug,
        order_index: selectedUnitForSubtopic.subtopics.length,
      });

      if (response.data.success) {
        toast.success('Subtopic created successfully');
        refreshStructure();
        setSubtopicModalOpen(false);
        setSelectedUnitForSubtopic(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create subtopic'));
    } finally {
      setModalLoading(false);
    }
  };

  // Update Subtopic
  const handleUpdateSubtopic = async (data: {
    title: string;
    description: string;
    slug: string;
  }) => {
    if (!editingSubtopic) return;
    setModalLoading(true);

    try {
      const response = await apiClient.put(
        `/admin/subtopics/${editingSubtopic.subtopic.id}`,
        {
          title: data.title,
          description: data.description,
          slug: data.slug,
        },
      );

      if (response.data.success) {
        toast.success('Subtopic updated successfully');
        refreshStructure();
        setSubtopicModalOpen(false);
        setEditingSubtopic(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update subtopic'));
    } finally {
      setModalLoading(false);
    }
  };

  // Delete Subtopic
  const requestDeleteSubtopic = (subtopicId: string, label: string) => {
    setConfirmDelete({ kind: 'subtopic', id: subtopicId, label });
  };

  const handleDeleteSubtopic = async (subtopicId: string) => {
    try {
      const response = await apiClient.delete(`/admin/subtopics/${subtopicId}`);
      if (response.data.success) {
        toast.success('Subtopic deleted successfully');
        refreshStructure();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete subtopic'));
    }
  };

  const uploadMarkdown = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiClient.post<{ success: boolean; url: string }>(
      '/admin/lesson-content/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    return res.data.url;
  };

  // Create Lesson Content
  const handleCreateContent = async (data: {
    content_type: 'markdown' | 'video' | 'external';
    markdown_path: string;
    estimated_read_time?: number;
    video_url?: string;
    file?: File | null;
  }) => {
    if (!selectedSubtopicForContent) return;
    setModalLoading(true);

    try {
      let markdownPath = data.markdown_path;
      if (data.file) {
        markdownPath = await uploadMarkdown(data.file);
      }

      const response = await apiClient.post('/admin/lesson-content', {
        subtopic_id: selectedSubtopicForContent.id,
        content_type: data.content_type,
        markdown_path: markdownPath,
        estimated_read_time: data.estimated_read_time,
        is_published: true,
        video_url: data.video_url,
      });

      if (response.data.success) {
        toast.success('Lesson content created successfully');
        await refreshStructure();
        setContentModalOpen(false);
        setSelectedSubtopicForContent(null);
        setEditingContent(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create lesson content'));
    } finally {
      setModalLoading(false);
    }
  };

  // Update Lesson Content
  const handleUpdateContent = async (data: {
    content_type: 'markdown' | 'video' | 'external';
    markdown_path: string;
    estimated_read_time?: number;
    video_url?: string;
    file?: File | null;
  }) => {
    if (!editingContent) return;
    setModalLoading(true);

    try {
      let markdownPath = data.markdown_path;
      if (!data.file) {
        markdownPath = editingContent.markdown_path ?? '';
      } else if (data.file) {
        markdownPath = await uploadMarkdown(data.file);
      }

      const response = await apiClient.put(
        `/admin/lesson-content/${editingContent.id}`,
        {
          content_type: data.content_type,
          markdown_path: markdownPath,
          estimated_read_time: data.estimated_read_time,
          video_url: data.video_url,
        },
      );

      if (response.data.success) {
        toast.success('Lesson content updated successfully');
        await refreshStructure();
        setContentModalOpen(false);
        setSelectedSubtopicForContent(null);
        setEditingContent(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update lesson content'));
    } finally {
      setModalLoading(false);
    }
  };

  const requestDeleteContent = (contentId: string, label: string) => {
    setConfirmDelete({ kind: 'content', id: contentId, label });
  };

  const handleDeleteContent = async (contentId: string) => {
    try {
      const response = await apiClient.delete(
        `/admin/lesson-content/${contentId}`,
      );
      if (response.data.success) {
        toast.success('Lesson content deleted successfully');
        await refreshStructure();
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete lesson content'));
    }
  };

  // Create quiz with admin-chosen scores, then open questions modal
  const handleCreateQuiz = async (data: {
    passing_score: number;
    max_score: number;
  }) => {
    if (!selectedUnitForQuiz) return;

    try {
      const response = await apiClient.post('/admin/quizzes', {
        unit_id: selectedUnitForQuiz.id,
        passing_score: data.passing_score,
        max_score: data.max_score,
      });
      if (response.data.success) {
        toast.success('Quiz created');
        await refreshStructure();
        setSelectedQuizForQuestions(response.data.data);
        setSelectedUnitTitleForQuestions(selectedUnitForQuiz.title);
        setQuizModalOpen(false);
        setSelectedUnitForQuiz(null);
        setQuestionsModalOpen(true);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create quiz'));
    }
  };

  // Create Exercise (subtopic-level only)
  const handleCreateExercise = async (data: {
    title: string;
    instructions: string;
    max_score: number;
    language: string;
    initial_files: { name: string; content: string }[];
    test_cases: import('@/utils/types').TestCase[];
    tasks: import('@/utils/types').ExerciseTask[];
    rubric?: any;
  }) => {
    if (!selectedSubtopicForExercise) return; 

    try {
      const response = await apiClient.post('/admin/exercises', {
        subtopic_id: selectedSubtopicForExercise.id,
        title: data.title,
        instructions: data.instructions,
        max_score: data.max_score,
        language: data.language,
        initial_files: data.initial_files,
        tasks: data.tasks,
        rubric: data.rubric, 
      });

      if (response.data.success) {
        toast.success('Exercise created successfully');
        await refreshStructure();
        setExerciseModalOpen(false);
        setSelectedSubtopicForExercise(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create exercise'));
    }
  };

  // Create Assignment (unit-level)
  const handleCreateAssignment = async (data: {
    title: string;
    instructions: string;
    max_score: number;
    evaluator_type?: string | null;
    test_cases?: string | null;
    rubric?: string | null;
  }) => {
    if (!selectedUnitForAssignment) return;

    try {
      const response = await apiClient.post('/admin/assignments', {
        unit_id: selectedUnitForAssignment.id,
        title: data.title,
        instructions: data.instructions,
        max_score: data.max_score,
        evaluator_type: data.evaluator_type,
        test_cases: data.test_cases,
      });

      if (response.data.success) {
        toast.success('Assignment created successfully');
        await refreshStructure();
        setAssignmentModalOpen(false);
        setSelectedUnitForAssignment(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create assignment'));
    }
  };

  const handleUpdateQuiz = async (data: {
    passing_score: number;
    max_score: number;
  }) => {
    if (!editingQuiz) return;

    try {
      await apiClient.put(`/admin/quizzes/${editingQuiz.id}`, data);
      toast.success('Quiz updated');
      refreshStructure();
      setEditingQuiz(null);
      setQuizModalOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update quiz'));
    }
  };

  const requestDeleteQuiz = (id: string, label: string) => {
    setConfirmDelete({ kind: 'quiz', id, label });
  };

  const handleDeleteQuiz = async (id: string) => {
    try {
      await apiClient.delete(`/admin/quizzes/${id}`);
      toast.success('Quiz deleted');
      refreshStructure();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete quiz'));
    }
  };

  const handleUpdateExercise = async (data: {
    title: string;
    instructions: string;
    max_score: number;
    language: string;
    initial_files: { name: string; content: string }[];
    test_cases: import('@/utils/types').TestCase[];
    tasks: import('@/utils/types').ExerciseTask[];
    rubric?: any;
  }) => {
    if (!editingExercise) return;

    try {
      await apiClient.put(`/admin/exercises/${editingExercise.id}`, {
        title: data.title,
        instructions: data.instructions,
        max_score: data.max_score,
        language: data.language,
        initial_files: data.initial_files,
        tasks: data.tasks,
        rubric: data.rubric,
      });
      toast.success('Exercise updated');
      refreshStructure();
      setEditingExercise(null);
      setExerciseModalOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update exercise'));
    }
  };

  const requestDeleteExercise = (id: string, label: string) => {
    setConfirmDelete({ kind: 'exercise', id, label });
  };

  const handleDeleteExercise = async (id: string) => {
    try {
      await apiClient.delete(`/admin/exercises/${id}`);
      toast.success('Exercise deleted');
      refreshStructure();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete exercise'));
    }
  };

  const handleUpdateAssignment = async (data: {
    title: string;
    instructions: string;
    max_score: number;
    evaluator_type?: string | null;
    test_cases?: string | null;
    rubric?: string | null;
  }) => {
    if (!editingAssignment) return;

    try {
      await apiClient.put(`/admin/assignments/${editingAssignment.id}`, data);
      toast.success('Assignment updated');
      refreshStructure();
      setEditingAssignment(null);
      setAssignmentModalOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update assignment'));
    }
  };

  const requestDeleteAssignment = (id: string, label: string) => {
    setConfirmDelete({ kind: 'assignment', id, label });
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await apiClient.delete(`/admin/assignments/${id}`);
      toast.success('Assignment deleted');
      refreshStructure();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete assignment'));
    }
  };

  // Capstone CRUD
  const handleCreateCapstone = async (data: {
    title: string;
    instructions: string;
  }) => {
    if (!selectedTopicForCapstone) return;
    setModalLoading(true);
    try {
      await apiClient.post('/admin/projects', {
        topic_id: selectedTopicForCapstone.id,
        title: data.title,
        instructions: data.instructions,
      });
      toast.success('Capstone project created');
      refreshStructure();
      setCapstoneModalOpen(false);
      setSelectedTopicForCapstone(null);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create capstone'));
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdateCapstone = async (data: {
    title: string;
    instructions: string;
  }) => {
    if (!editingCapstone) return;
    setModalLoading(true);
    try {
      await apiClient.put(`/admin/projects/${editingCapstone.id}`, {
        title: data.title,
        instructions: data.instructions,
      });
      toast.success('Capstone updated');
      refreshStructure();
      setEditingCapstone(null);
      setCapstoneModalOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update capstone'));
    } finally {
      setModalLoading(false);
    }
  };

  const requestDeleteCapstone = (id: string, label: string) => {
    setConfirmDelete({ kind: 'capstone', id, label });
  };

  const handleDeleteCapstone = async (id: string) => {
    try {
      await apiClient.delete(`/admin/projects/${id}`);
      toast.success('Capstone deleted');
      refreshStructure();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete capstone'));
    }
  };

  // Reorder Topics
  const handleMoveTopicUp = async (index: number) => {
    if (index === 0) return;

    const newStructure = [...structure];
    [newStructure[index - 1], newStructure[index]] = [
      newStructure[index],
      newStructure[index - 1],
    ];

    try {
      await Promise.all([
        apiClient.put(`/admin/topics/${newStructure[index - 1].id}`, {
          order_index: index - 1,
        }),
        apiClient.put(`/admin/topics/${newStructure[index].id}`, {
          order_index: index,
        }),
      ]);

      dispatch(setStructure(newStructure));
      toast.success('Topic order updated');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update order'));
    }
  };

  const handleMoveTopicDown = async (index: number) => {
    if (index === structure.length - 1) return;

    const newStructure = [...structure];
    [newStructure[index], newStructure[index + 1]] = [
      newStructure[index + 1],
      newStructure[index],
    ];

    try {
      await Promise.all([
        apiClient.put(`/admin/topics/${newStructure[index].id}`, {
          order_index: index,
        }),
        apiClient.put(`/admin/topics/${newStructure[index + 1].id}`, {
          order_index: index + 1,
        }),
      ]);

      dispatch(setStructure(newStructure));
      toast.success('Topic order updated');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update order'));
    }
  };

  // Reorder Units (Simplified: requires refreshing structure usually, or complex redux state update.
  // For now we will rely on refreshStructure after API call, or just simplistic update if possible.
  // Since Units are nested, we need to find the topic first.
  // To avoid complex deep-cloning and updating of Redux state manually for nested items,
  // we will just call API and refresh for now, which is safer.)
  const handleMoveUnitUp = async (unitIndex: number, units: Unit[]) => {
    if (unitIndex === 0) return;

    const currentUnit = units[unitIndex];
    const prevUnit = units[unitIndex - 1];

    try {
      await Promise.all([
        apiClient.put(`/admin/units/${prevUnit.id}`, {
          order_index: unitIndex,
        }),
        apiClient.put(`/admin/units/${currentUnit.id}`, {
          order_index: unitIndex - 1,
        }),
      ]);
      toast.success('Unit order updated');
      refreshStructure();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update order'));
    }
  };

  const handleMoveUnitDown = async (unitIndex: number, units: Unit[]) => {
    if (unitIndex === units.length - 1) return;

    const currentUnit = units[unitIndex];
    const nextUnit = units[unitIndex + 1];

    try {
      await Promise.all([
        apiClient.put(`/admin/units/${currentUnit.id}`, {
          order_index: unitIndex + 1,
        }),
        apiClient.put(`/admin/units/${nextUnit.id}`, {
          order_index: unitIndex,
        }),
      ]);
      toast.success('Unit order updated');
      refreshStructure();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update order'));
    }
  };

  const previewContent = async (
    content: LessonContent,
    forceType?: 'markdown' | 'video',
  ) => {
    setShowLessonPreview(true);
    setLessonPreviewVideoUrl(undefined);
    setLessonPreviewContent('');
    setLessonPreviewError(null);
    const type =
      forceType ??
      (content.video_url && !content.markdown_path ? 'video' : 'markdown');
    if (type === 'video' && content.video_url) {
      setLessonPreviewVideoUrl(content.video_url ?? undefined);
    } else if (content.markdown_path) {
      setLessonPreviewLoading(true);
      try {
        const res = await apiClient.post('/subjects/markdown-content', {
          markdownPathURL: content.markdown_path,
        });
        setLessonPreviewContent(res.data.data);
      } catch (error) {
        setLessonPreviewError(
          getErrorMessage(error, 'Failed to load lesson content'),
        );
      } finally {
        setLessonPreviewLoading(false);
      }
    } else {
      setLessonPreviewError(
        'No markdown content or video has been configured for this lesson yet. Click "Edit" to add content.',
      );
    }
  };

  const closeLessonPreview = () => {
    setShowLessonPreview(false);
    setLessonPreviewContent('');
    setLessonPreviewVideoUrl(undefined);
    setLessonPreviewError(null);
    setLessonPreviewLoading(false);
  };

  if (loading) {
    return (
      <div className='flex h-screen w-full items-center justify-center bg-slate-50'>
        <Loader2 className='h-10 w-10 animate-spin text-indigo-600' />
      </div>
    );
  }

  return (
    <>
      <div className='flex flex-col lg:flex-row gap-4 sm:gap-6 min-w-0 animate-in fade-in duration-300'>
        {/* Main Builder Content */}
        <div className='flex-1 space-y-4 sm:space-y-6 min-w-0'>
          {/* Top Banner: Learning Flow Builder */}
          <div className='rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-6 shadow-xs min-w-0'>
            <div className='flex items-center gap-3'>
              <div className='h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0'>
                <Layout className='h-5 w-5' />
              </div>
              <div className='min-w-0 flex-1'>
                <h1 className='text-base sm:text-lg font-bold text-indigo-600'>
                  Learning Flow Builder
                </h1>
                <p className='text-xs text-slate-500'>
                  Design and manage your curriculum structure
                </p>
              </div>
            </div>
          </div>

          {/* Active Course Card */}
          <div className='rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-6 shadow-xs min-w-0'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
              <div className='min-w-0 flex-1'>
                <h2 className='text-lg sm:text-xl font-bold text-slate-900 truncate'>
                  {selectedSubject?.name || 'Select Course'}
                </h2>
                <p className='text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mt-0.5 truncate'>
                  {selectedSubject?.slug?.replace(/_/g, ' ') || ''}
                </p>
              </div>

              <div className='flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto min-w-0'>
                {/* Mobile course selector */}
                <div className='lg:hidden w-full sm:w-auto min-w-0'>
                  <Select
                    value={selectedSubject?.slug || ''}
                    onValueChange={handleSubjectChange}
                  >
                    <SelectTrigger className='w-full sm:w-64 min-w-0 max-w-full bg-white border-slate-200 shadow-2xs h-9.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus-visible:ring-indigo-400'>
                      <SelectValue placeholder='Select Course' />
                    </SelectTrigger>
                    <SelectContent
                      position='popper'
                      align='start'
                      sideOffset={4}
                      className='w-(--radix-select-trigger-width) min-w-[240px] max-w-[calc(100vw-2.5rem)] rounded-xl shadow-lg border-slate-200 z-50 bg-white'
                    >
                      {subjects.map((s: Subject) => (
                        <SelectItem
                          key={s.id}
                          value={s.slug}
                          className='cursor-pointer py-2 text-xs sm:text-sm font-medium focus:bg-indigo-50 focus:text-indigo-600'
                        >
                          <span className='truncate block max-w-[220px] sm:max-w-none'>
                            {s.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={() => {
                    setEditingTopic(null);
                    setTopicModalOpen(true);
                  }}
                  className='bg-indigo-600 hover:bg-indigo-700 text-white min-h-[40px] px-4 sm:px-5 rounded-xl font-semibold shadow-xs shrink-0 flex items-center gap-1.5'
                >
                  <Plus className='h-4 w-4' /> Add New Topic
                </Button>
              </div>
            </div>
          </div>

          {fetchingStructure ? (
            <div className='flex h-64 items-center justify-center bg-white rounded-2xl border border-slate-200/80'>
              <Loader2 className='h-8 w-8 animate-spin text-indigo-500' />
            </div>
          ) : (
            selectedSubject && (
              <div className='rounded-2xl border border-slate-200/80 bg-white p-2 sm:p-5 md:p-6 shadow-xs min-w-0'>
                {/* Topics List */}
                <div className='space-y-3.5 sm:space-y-5 min-w-0'>
                  {structure.length === 0 ? (
                    <div className='rounded-xl border-2 border-dashed border-slate-200 py-16 text-center'>
                      <FolderOpen className='mx-auto h-12 w-12 text-slate-300' />
                      <p className='mt-4 text-sm font-medium text-slate-500'>
                        No topics yet in this course
                      </p>
                      <p className='mt-1 text-xs text-slate-400'>
                        Click "Add New Topic" to start building curriculum
                      </p>
                    </div>
                  ) : (
                    structure.map((topic: Topic, index: number) => (
                      <div
                        key={topic.id}
                        className='overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs'
                      >
                        <div className='flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-2.5 sm:p-4 gap-2'>
                          <div
                            onClick={() => toggleTopic(topic.id)}
                            className='flex items-center gap-2.5 sm:gap-3 hover:cursor-pointer flex-1 min-w-0'
                          >
                            <button className='text-slate-400 hover:text-slate-600 p-1 shrink-0'>
                              {expandedTopics.includes(topic.id) ? (
                                <ChevronDown className='h-4 w-4' />
                              ) : (
                                <ChevronRight className='h-4 w-4' />
                              )}
                            </button>
                            <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 font-bold text-xs border border-indigo-100'>
                              {index + 1}
                            </div>
                            <div className='flex flex-col min-w-0 flex-1'>
                              <p className='font-bold text-slate-900 text-xs sm:text-sm truncate'>
                                {topic.title}
                              </p>
                              {topic.description && (
                                <p
                                  className='text-[11px] text-slate-500 truncate'
                                  title={topic.description}
                                >
                                  {topic.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className='flex items-center gap-1 sm:gap-2 text-slate-400 shrink-0'>
                            <button
                              type='button'
                              onClick={() => {
                                setSelectedTopicForCapstone(topic);
                                setEditingCapstone(topic.capstone ?? null);
                                setCapstoneModalOpen(true);
                              }}
                              className='p-1.5 rounded-lg hover:bg-amber-50 transition-colors'
                              title={
                                topic.capstone
                                  ? 'Edit Capstone'
                                  : 'Add Capstone'
                              }
                            >
                              <Trophy
                                className={`h-4 w-4 ${topic.capstone ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
                              />
                            </button>
                            <div className='hidden sm:block mx-0.5 h-3.5 w-px bg-slate-200' />
                            <button
                              type='button'
                              onClick={() => {
                                setEditingTopic(topic);
                                setTopicModalOpen(true);
                              }}
                              className='p-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 transition-colors'
                              title='Edit Topic'
                            >
                              <Edit2 className='h-3.5 w-3.5' />
                            </button>
                            <div className='hidden sm:flex items-center gap-0.5'>
                              <button
                                type='button'
                                disabled={index === 0}
                                onClick={() => handleMoveTopicUp(index)}
                                className={`p-1 rounded-md hover:bg-slate-100 ${
                                  index === 0
                                    ? 'cursor-not-allowed opacity-30'
                                    : 'cursor-pointer hover:text-slate-600'
                                }`}
                                title='Move Up'
                              >
                                <ArrowUp className='h-3.5 w-3.5' />
                              </button>
                              <button
                                type='button'
                                disabled={index === structure.length - 1}
                                onClick={() => handleMoveTopicDown(index)}
                                className={`p-1 rounded-md hover:bg-slate-100 ${
                                  index === structure.length - 1
                                    ? 'cursor-not-allowed opacity-30'
                                    : 'cursor-pointer hover:text-slate-600'
                                }`}
                                title='Move Down'
                              >
                                <ArrowDown className='h-3.5 w-3.5' />
                              </button>
                            </div>
                            <div className='hidden sm:block mx-0.5 h-3.5 w-px bg-slate-200' />
                            <button
                              type='button'
                              onClick={() =>
                                requestDeleteTopic(topic.id, topic.title)
                              }
                              className='p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors'
                              title='Delete Topic'
                            >
                              <Trash2 className='h-3.5 w-3.5' />
                            </button>
                          </div>
                        </div>

                        {/* Units - only show when expanded */}
                        {expandedTopics.includes(topic.id) && (
                          <div className='space-y-3 p-2 sm:p-4'>
                            {topic.units?.length === 0 ? (
                              <div className='rounded-lg border-2 border-dashed border-slate-200 bg-white py-8 text-center'>
                                <FolderOpen className='mx-auto h-8 w-8 text-slate-300' />
                                <p className='mt-2 text-xs text-slate-400'>
                                  No units yet
                                </p>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() => {
                                    setSelectedTopicForUnit(topic);
                                    setUnitModalOpen(true);
                                  }}
                                  className='mt-2 text-indigo-600 hover:bg-indigo-50'
                                >
                                  <Plus className='mr-1 h-3 w-3' /> Add Unit
                                </Button>
                              </div>
                            ) : (
                              <>
                                {topic.units?.map(
                                  (unit: Unit, uIndex: number) => (
                                    <div
                                      key={unit.id}
                                      className='overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xs'
                                    >
                                      {/* Unit Header */}
                                      <div className='flex items-center justify-between bg-slate-50/40 px-2.5 sm:px-4 py-2 sm:py-3 border-b border-slate-100 gap-1.5 hover:bg-slate-50 transition-colors'>
                                        <div
                                          onClick={() => toggleUnit(unit.id)}
                                          className='flex cursor-pointer items-center gap-2.5 sm:gap-3 flex-1 min-w-0'
                                        >
                                          <button type='button' className='text-slate-400 hover:text-slate-600 p-0.5 shrink-0'>
                                            {expandedUnits.includes(unit.id) ? (
                                              <ChevronDown className='h-4 w-4 text-indigo-500' />
                                            ) : (
                                              <ChevronRight className='h-4 w-4' />
                                            )}
                                          </button>
                                          <div
                                            className={`flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${expandedUnits.includes(unit.id) ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}
                                          >
                                            {uIndex + 1}
                                          </div>
                                          <div className='flex flex-col min-w-0 flex-1'>
                                            <h3 className='font-semibold text-slate-800 text-xs sm:text-sm truncate'>
                                              {unit.title}
                                            </h3>
                                            {unit.description && (
                                              <p
                                                className='hidden text-xs text-slate-400 md:block truncate max-w-xs'
                                                title={unit.description}
                                              >
                                                {unit.description}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        <div className='flex items-center gap-1 shrink-0 ml-1'>
                                          {/* Reorder (Desktop) */}
                                          <div className='hidden md:flex items-center gap-0.5 text-slate-400 border border-slate-200/80 rounded-md px-1 py-0.5'>
                                            <button
                                              type='button'
                                              onClick={() =>
                                                handleMoveUnitUp(
                                                  uIndex,
                                                  topic.units,
                                                )
                                              }
                                              disabled={uIndex === 0}
                                              className={`p-0.5 hover:text-slate-700 ${uIndex === 0 ? 'cursor-not-allowed opacity-30' : ''}`}
                                              title='Move Up'
                                            >
                                              <ArrowUp className='h-3 w-3' />
                                            </button>
                                            <button
                                              type='button'
                                              onClick={() =>
                                                handleMoveUnitDown(
                                                  uIndex,
                                                  topic.units,
                                                )
                                              }
                                              disabled={uIndex === (topic.units?.length || 0) - 1}
                                              className={`p-0.5 hover:text-slate-700 ${uIndex === (topic.units?.length || 0) - 1 ? 'cursor-not-allowed opacity-30' : ''}`}
                                              title='Move Down'
                                            >
                                              <ArrowDown className='h-3 w-3' />
                                            </button>
                                          </div>
                                          {/* Add content buttons on desktop */}
                                          {!unit.assignments?.length && (
                                            <button
                                              onClick={() => {
                                                setSelectedUnitForAssignment(
                                                  unit,
                                                );
                                                setAssignmentModalOpen(true);
                                              }}
                                              className='hidden sm:flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-colors'
                                              title='Add Assignment'
                                            >
                                              <FileText className='h-3 w-3 text-blue-500' />
                                              <span>Assignment</span>
                                            </button>
                                          )}
                                          {!unit.quizzes?.length && (
                                            <button
                                              onClick={() => {
                                                setEditingQuiz(null);
                                                setSelectedUnitForQuiz(unit);
                                                setQuizModalOpen(true);
                                              }}
                                              className='hidden sm:flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-600 transition-colors'
                                              title='Add Quiz'
                                            >
                                              <ListChecks className='h-3 w-3 text-violet-500' />
                                              <span>Quiz</span>
                                            </button>
                                          )}
                                          <button
                                            onClick={() => {
                                              setEditingUnit(unit);
                                              setUnitModalOpen(true);
                                            }}
                                            className='p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors'
                                            title='Edit Unit'
                                          >
                                            <Edit2 className='h-3.5 w-3.5' />
                                          </button>
                                          <button
                                            onClick={() =>
                                              requestDeleteUnit(
                                                unit.id,
                                                unit.title,
                                              )
                                            }
                                            className='p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors'
                                            title='Delete Unit'
                                          >
                                            <Trash2 className='h-3.5 w-3.5' />
                                          </button>
                                        </div>
                                      </div>
                                       {/* Assignments & Quizzes pills */}
                                       {expandedUnits.includes(unit.id) &&
                                         ((unit.assignments &&
                                           unit.assignments.length > 0) ||
                                           (unit.quizzes &&
                                             unit.quizzes.length > 0)) && (
                                           <div className='flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/70 p-3 sm:px-4 sm:py-2.5'>
                                             {unit.assignments?.map(
                                               (a: Assignment) => (
                                                 <div
                                                   key={a.id}
                                                   className='group flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/90 pl-3 pr-2 py-1.5 text-xs font-semibold text-blue-700 shadow-2xs max-w-full'
                                                 >
                                                   <FileText className='h-3.5 w-3.5 shrink-0 text-blue-600' />
                                                   <span className='truncate'>{a.title}</span>
                                                   <div className='flex items-center gap-0.5 ml-auto shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'>
                                                     <button
                                                       type='button'
                                                       onClick={async () => {
                                                         setSelectedUnitForAssignment(
                                                           unit,
                                                         );
                                                         setAssignmentModalOpen(
                                                           true,
                                                         );
                                                         try {
                                                           const res =
                                                             await apiClient.get(
                                                               `/admin/assignments/${a.id}`,
                                                             );
                                                           setEditingAssignment({
                                                             ...a,
                                                             instructions:
                                                               res.data.data
                                                                 .instructions ??
                                                               '',
                                                           });
                                                         } catch {
                                                           setEditingAssignment(
                                                             a,
                                                           );
                                                         }
                                                       }}
                                                       className='rounded-md p-1 hover:bg-blue-100 text-blue-600'
                                                       title='Edit Assignment'
                                                     >
                                                       <Edit2 className='h-3 w-3' />
                                                     </button>
                                                     <button
                                                       type='button'
                                                       onClick={() =>
                                                         requestDeleteAssignment(
                                                           a.id,
                                                           a.title,
                                                         )
                                                       }
                                                       className='rounded-md p-1 hover:bg-red-100 text-red-500'
                                                       title='Delete Assignment'
                                                     >
                                                       <Trash2 className='h-3 w-3' />
                                                     </button>
                                                   </div>
                                                 </div>
                                               ),
                                             )}
                                             {unit.quizzes?.map(
                                               (quiz: Quiz) => (
                                                 <div
                                                   key={quiz.id}
                                                   className='group flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/90 pl-3 pr-2 py-1.5 text-xs font-semibold text-violet-700 shadow-2xs max-w-full'
                                                 >
                                                   <ListChecks className='h-3.5 w-3.5 shrink-0 text-violet-600' />
                                                   <span className='truncate'>{quiz.title || 'Quiz'}</span>
                                                   <div className='flex items-center gap-0.5 ml-auto shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'>
                                                     <button
                                                       type='button'
                                                       onClick={() => {
                                                         setSelectedQuizForQuestions(
                                                           quiz,
                                                         );
                                                         setSelectedUnitTitleForQuestions(
                                                           unit.title,
                                                         );
                                                         setQuestionsModalOpen(
                                                           true,
                                                         );
                                                       }}
                                                       className='rounded-md p-1 hover:bg-violet-100 text-violet-600'
                                                       title='Manage questions'
                                                     >
                                                       <Settings className='h-3 w-3' />
                                                     </button>
                                                     <button
                                                       type='button'
                                                       onClick={() => {
                                                         setEditingQuiz(quiz);
                                                         setSelectedUnitForQuiz(
                                                           unit,
                                                         );
                                                         setQuizModalOpen(true);
                                                       }}
                                                       className='rounded-md p-1 hover:bg-violet-100 text-violet-600'
                                                       title='Edit Quiz'
                                                     >
                                                       <Edit2 className='h-3 w-3' />
                                                     </button>
                                                     <button
                                                       type='button'
                                                       onClick={() =>
                                                         requestDeleteQuiz(
                                                           quiz.id,
                                                           `Quiz`,
                                                         )
                                                       }
                                                       className='rounded-md p-1 hover:bg-red-100 text-red-500'
                                                       title='Delete Quiz'
                                                     >
                                                       <Trash2 className='h-3 w-3' />
                                                     </button>
                                                   </div>
                                                 </div>
                                               ),
                                             )}
                                           </div>
                                         )}

                                       {/* Subtopics */}
                                       {expandedUnits.includes(unit.id) && (
                                         <div className='divide-y divide-slate-100'>
                                           {unit.subtopics?.length === 0 ? (
                                             <div className='px-4 py-6 text-center'>
                                               <p className='text-xs text-slate-400'>
                                                 No lessons yet
                                               </p>
                                               <Button
                                                 variant='ghost'
                                                 size='sm'
                                                 onClick={() => {
                                                   setSelectedUnitForSubtopic(
                                                     unit,
                                                   );
                                                   setSubtopicModalOpen(true);
                                                 }}
                                                 className='mt-2 h-8 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-lg'
                                               >
                                                 <Plus className='mr-1 h-3.5 w-3.5' />{' '}
                                                 Add Lesson
                                               </Button>
                                             </div>
                                           ) : (
                                             <>
                                               {unit.subtopics.map(
                                                 (sub: Subtopic) => (
                                                   <div
                                                     key={sub.id}
                                                     className='group'
                                                   >
                                                     <div className='flex items-start sm:items-center justify-between p-2.5 sm:px-4 sm:py-2.5 hover:bg-slate-50 transition-colors gap-2'>
                                                       <div
                                                         onClick={() =>
                                                           toggleSubtopic(
                                                             sub.id,
                                                           )
                                                         }
                                                         className='flex flex-1 items-start sm:items-center gap-2.5 min-w-0 cursor-pointer'
                                                       >
                                                         <button
                                                           type='button'
                                                           className='text-slate-400 hover:text-slate-600 p-0.5 mt-0.5 sm:mt-0 shrink-0'
                                                         >
                                                           {expandedSubtopics.includes(
                                                             sub.id,
                                                           ) ? (
                                                             <ChevronDown className='h-3.5 w-3.5 text-indigo-500' />
                                                           ) : (
                                                             <ChevronRight className='h-3.5 w-3.5' />
                                                           )}
                                                         </button>
                                                         <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 mt-0.5 sm:mt-0'>
                                                           <FileText className='h-3.5 w-3.5' />
                                                         </div>
                                                         <div className='flex-1 min-w-0'>
                                                           <div className='flex items-center gap-2 flex-wrap'>
                                                             <span className='text-xs sm:text-sm font-semibold text-slate-800 break-words'>
                                                               {sub.title}
                                                             </span>
                                                             {/* Badges in the flow */}
                                                             {((sub.lesson_content?.length ?? 0) > 0 || (sub.exercises?.length ?? 0) > 0) && (
                                                               <div className='flex items-center gap-1.5 flex-wrap'>
                                                                 {(sub.lesson_content?.length ?? 0) > 0 && (
                                                                   <span className='rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700'>
                                                                     {sub.lesson_content!.length} lesson{sub.lesson_content!.length > 1 ? 's' : ''}
                                                                   </span>
                                                                 )}
                                                                 {(sub.exercises?.length ?? 0) > 0 && (
                                                                   <span className='rounded-full bg-orange-50 border border-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700'>
                                                                     {sub.exercises!.length} exercise{sub.exercises!.length > 1 ? 's' : ''}
                                                                   </span>
                                                                 )}
                                                               </div>
                                                             )}
                                                           </div>
                                                           {sub.description && (
                                                             <p
                                                               className='text-[11px] text-slate-400 truncate max-w-sm mt-0.5'
                                                               title={sub.description}
                                                             >
                                                               {sub.description}
                                                             </p>
                                                           )}
                                                         </div>
                                                       </div>

                                                       <div className='flex items-center gap-0.5 shrink-0 ml-1'>
                                                         <button
                                                           type='button'
                                                           onClick={() => {
                                                             setEditingSubtopic({
                                                               subtopic: sub,
                                                               unitId: unit.id,
                                                             });
                                                             setSubtopicModalOpen(
                                                               true,
                                                             );
                                                           }}
                                                           className='p-1.5 rounded-lg text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors'
                                                           title='Edit Lesson Topic'
                                                         >
                                                           <Edit2 className='h-3.5 w-3.5' />
                                                         </button>
                                                         <button
                                                           type='button'
                                                           onClick={() =>
                                                             requestDeleteSubtopic(
                                                               sub.id,
                                                               sub.title,
                                                             )
                                                           }
                                                           className='p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors'
                                                           title='Delete Lesson Topic'
                                                         >
                                                           <Trash2 className='h-3.5 w-3.5' />
                                                         </button>
                                                       </div>
                                                     </div>

                                                     {/* Subtopic Content (Lessons, Exercises) */}
                                                     {expandedSubtopics.includes(
                                                       sub.id,
                                                     ) && (
                                                       <div className='m-1.5 sm:mx-4 sm:mb-3 space-y-2.5 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3'>
                                                         <div className='flex items-center gap-2 flex-wrap mb-2'>
                                                           {!sub.lesson_content
                                                             ?.length && (
                                                             <button
                                                               type='button'
                                                               onClick={() => {
                                                                 setEditingContent(
                                                                   null,
                                                                 );
                                                                 setSelectedSubtopicForContent(
                                                                   sub,
                                                                 );
                                                                 setContentModalOpen(
                                                                   true,
                                                                 );
                                                               }}
                                                               className='flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors shadow-2xs'
                                                             >
                                                               <Plus className='h-3.5 w-3.5' />
                                                               Add Content
                                                             </button>
                                                           )}
                                                           <button
                                                             type='button'
                                                             onClick={() => {
                                                               setSelectedSubtopicForExercise(
                                                                 sub,
                                                               );
                                                               setExerciseModalOpen(
                                                                 true,
                                                               );
                                                             }}
                                                             className='flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors shadow-2xs'
                                                           >
                                                             <Code className='h-3.5 w-3.5' />
                                                             + Exercise
                                                           </button>
                                                         </div>

                                                         {/* Lesson Content List */}
                                                         {sub.lesson_content?.map(
                                                           (content) => (
                                                             <div
                                                               key={content.id}
                                                               className='rounded-xl border border-slate-200 bg-white text-xs overflow-hidden shadow-2xs'
                                                             >
                                                               {/* Markdown row */}
                                                               {content.markdown_path && (
                                                                 <div className='flex items-center justify-between p-2.5 border-b border-slate-100 gap-2'>
                                                                   <div className='flex items-center gap-2.5 min-w-0'>
                                                                     <FileText className='h-4 w-4 text-indigo-500 shrink-0' />
                                                                     <div className='min-w-0'>
                                                                       <div className='font-semibold text-slate-800 text-xs truncate'>
                                                                         Markdown Content
                                                                       </div>
                                                                       <div className='text-[10px] text-slate-400 truncate max-w-xs'>
                                                                         {content.markdown_path
                                                                           .split(
                                                                             '/',
                                                                           )
                                                                           .pop()}
                                                                       </div>
                                                                     </div>
                                                                   </div>
                                                                   <button
                                                                     type='button'
                                                                     onClick={() =>
                                                                       previewContent(
                                                                         content,
                                                                         'markdown',
                                                                       )
                                                                     }
                                                                     className='flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 shrink-0'
                                                                   >
                                                                     <Eye className='h-3.5 w-3.5' />
                                                                     Preview
                                                                   </button>
                                                                 </div>
                                                               )}

                                                               {/* Video row */}
                                                               {content.video_url && (
                                                                 <div className='flex items-center justify-between p-2.5 border-b border-slate-100 gap-2'>
                                                                   <div className='flex items-center gap-2.5 min-w-0'>
                                                                     <PlayCircle className='h-4 w-4 text-blue-500 shrink-0' />
                                                                     <div className='min-w-0'>
                                                                       <div className='font-semibold text-slate-800 text-xs truncate'>
                                                                         Video Lesson
                                                                       </div>
                                                                       <div className='text-[10px] text-slate-400 truncate max-w-xs'>
                                                                         {
                                                                           content.video_url
                                                                         }
                                                                       </div>
                                                                     </div>
                                                                   </div>
                                                                   <button
                                                                     type='button'
                                                                     onClick={() =>
                                                                       previewContent(
                                                                         content,
                                                                         'video',
                                                                       )
                                                                     }
                                                                     className='flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 shrink-0'
                                                                   >
                                                                     <Eye className='h-3.5 w-3.5' />
                                                                     Preview
                                                                   </button>
                                                                 </div>
                                                               )}

                                                               {/* Shared actions */}
                                                               <div className='flex items-center justify-end gap-1 px-2.5 py-1.5 bg-slate-50/70'>
                                                                 <button
                                                                   type='button'
                                                                   onClick={() => {
                                                                     setEditingContent(
                                                                       content,
                                                                     );
                                                                     setSelectedSubtopicForContent(
                                                                       sub,
                                                                     );
                                                                     setContentModalOpen(
                                                                       true,
                                                                     );
                                                                   }}
                                                                   className='p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-white'
                                                                   title='Edit Content'
                                                                 >
                                                                   <Edit2 className='h-3.5 w-3.5' />
                                                                 </button>
                                                                 <button
                                                                   type='button'
                                                                   onClick={() =>
                                                                     requestDeleteContent(
                                                                       content.id,
                                                                       content.markdown_path
                                                                         ? (content.markdown_path
                                                                             .split(
                                                                               '/',
                                                                             )
                                                                             .pop() ??
                                                                             'this content')
                                                                         : 'this content',
                                                                     )
                                                                   }
                                                                   className='p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-white'
                                                                   title='Delete Content'
                                                                 >
                                                                   <Trash2 className='h-3.5 w-3.5' />
                                                                 </button>
                                                               </div>
                                                             </div>
                                                           ),
                                                         )}

                                                         {/* Exercises List */}
                                                         {sub.exercises?.map(
                                                           (exercise) => (
                                                             <div
                                                               key={exercise.id}
                                                               className='flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-2xs gap-2'
                                                             >
                                                               <div className='flex items-center gap-2 min-w-0'>
                                                                 <Code className='h-4 w-4 text-emerald-600 shrink-0' />
                                                                 <span className='font-semibold text-slate-800 truncate'>
                                                                   {
                                                                     exercise.title
                                                                   }
                                                                 </span>
                                                               </div>
                                                               <div className='flex items-center gap-1 shrink-0'>
                                                                 <button
                                                                   type='button'
                                                                   onClick={async () => {
                                                                     setSelectedSubtopicForExercise(
                                                                       sub,
                                                                     );
                                                                     setExerciseModalOpen(
                                                                       true,
                                                                     );
                                                                     try {
                                                                       const res =
                                                                         await apiClient.get(
                                                                           `/admin/exercises/${exercise.id}`,
                                                                         );
                                                                       setEditingExercise(
                                                                         {
                                                                           ...exercise,
                                                                           instructions:
                                                                             res
                                                                               .data
                                                                               .data
                                                                               .instructions ??
                                                                             '',
                                                                           initial_files:
                                                                             res
                                                                               .data
                                                                               .data
                                                                               .initial_files ??
                                                                             [],
                                                                           test_cases:
                                                                             res
                                                                               .data
                                                                               .data
                                                                               .test_cases ??
                                                                             [],
                                                                           tasks:
                                                                             res
                                                                               .data
                                                                               .data
                                                                               .tasks ??
                                                                             [],
                                                                         },
                                                                       );
                                                                     } catch {
                                                                       setEditingExercise(
                                                                         exercise,
                                                                       );
                                                                     }
                                                                   }}
                                                                   className='p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-50'
                                                                   title='Edit Exercise'
                                                                 >
                                                                   <Edit2 className='h-3.5 w-3.5' />
                                                                 </button>
                                                                 <button
                                                                   type='button'
                                                                   onClick={() =>
                                                                     requestDeleteExercise(
                                                                       exercise.id,
                                                                       exercise.title,
                                                                     )
                                                                   }
                                                                   className='p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-50'
                                                                   title='Delete Exercise'
                                                                 >
                                                                   <Trash2 className='h-3.5 w-3.5' />
                                                                 </button>
                                                               </div>
                                                             </div>
                                                           ),
                                                         )}
                                                       </div>
                                                     )}
                                                   </div>
                                                 ),
                                               )}
                                               <div className='p-2 sm:p-3'>
                                                 <Button
                                                   variant='ghost'
                                                   size='sm'
                                                   onClick={() => {
                                                     setSelectedUnitForSubtopic(
                                                       unit,
                                                     );
                                                     setSubtopicModalOpen(true);
                                                   }}
                                                   className='w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors'
                                                 >
                                                   <Plus className='h-3.5 w-3.5' />{' '}
                                                   Add Subtopic / Lesson
                                                 </Button>
                                               </div>
                                             </>
                                           )}
                                         </div>
                                       )}
                                    </div>
                                  ),
                                )}
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() => {
                                    setSelectedTopicForUnit(topic);
                                    setUnitModalOpen(true);
                                  }}
                                  className='w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 py-3.5 text-xs sm:text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors shadow-xs'
                                >
                                  <Plus className='h-4 w-4' /> Add Another Unit
                                </Button>
                              </>
                            )}

                            {/* Capstone Project Row */}
                            <div className='mt-3.5 sm:mt-4 border-t border-dashed border-amber-200/90 pt-3.5 sm:pt-4'>
                              {topic.capstone ? (
                                <div className='flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 shadow-xs'>
                                  <div className='flex items-center gap-2.5 min-w-0'>
                                    <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600'>
                                      <Trophy className='h-4 w-4 text-amber-600' />
                                    </div>
                                    <div className='min-w-0'>
                                      <span className='text-xs sm:text-sm font-bold text-slate-800 truncate block'>
                                        {topic.capstone.title}
                                      </span>
                                      <span className='text-[11px] font-semibold text-amber-700'>
                                        +{topic.capstone.max_score} XP • Capstone Project
                                      </span>
                                    </div>
                                  </div>
                                  <div className='flex items-center gap-1 text-slate-400 shrink-0 ml-2'>
                                    <button
                                      type='button'
                                      onClick={() => {
                                        setSelectedTopicForCapstone(topic);
                                        setEditingCapstone(topic.capstone!);
                                        setCapstoneModalOpen(true);
                                      }}
                                      className='p-1.5 rounded-lg hover:bg-amber-100 hover:text-amber-700 transition-colors'
                                      title='Edit Capstone'
                                    >
                                      <Edit2 className='h-3.5 w-3.5' />
                                    </button>
                                    <button
                                      type='button'
                                      onClick={() =>
                                        requestDeleteCapstone(
                                          topic.capstone!.id,
                                          topic.capstone!.title,
                                        )
                                      }
                                      className='p-1.5 rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors'
                                      title='Delete Capstone'
                                    >
                                      <Trash2 className='h-3.5 w-3.5' />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  onClick={() => {
                                    setSelectedTopicForCapstone(topic);
                                    setEditingCapstone(null);
                                    setCapstoneModalOpen(true);
                                  }}
                                  className='w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/40 py-3.5 text-xs sm:text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors shadow-xs'
                                >
                                  <Trophy className='h-4 w-4 text-amber-500' /> Add Capstone Project
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          )}
        </div>

        {/* Right Sidebar: Configuration (Desktop) */}
        <div className='hidden lg:block w-80 shrink-0'>
          <Card className='sticky top-6 border border-slate-200/80 rounded-2xl p-6 shadow-xs bg-white'>
            <div className='mb-6 flex items-center gap-2 text-slate-800'>
              <Settings className='h-4 w-4 text-indigo-600' />
              <h3 className='font-bold text-base'>Flow Configuration</h3>
            </div>

            <div className='space-y-6'>
              {/* Subject Dropdown */}
              <div>
                <label className='text-[10px] font-bold uppercase tracking-widest text-slate-400'>
                  Editing Course
                </label>
                <Select
                  value={selectedSubject?.slug || ''}
                  onValueChange={handleSubjectChange}
                >
                  <SelectTrigger className='mt-2 w-full bg-white border-slate-200 shadow-xs h-10 rounded-xl text-sm font-medium text-slate-800 focus-visible:ring-indigo-500'>
                    <SelectValue placeholder='Select Course' />
                  </SelectTrigger>
                  <SelectContent
                    position='popper'
                    align='start'
                    sideOffset={4}
                    className='w-(--radix-select-trigger-width) max-w-[300px] rounded-xl shadow-lg border-slate-200 z-50 bg-white'
                  >
                    {subjects.map((s: Subject) => (
                      <SelectItem
                        key={s.id}
                        value={s.slug}
                        className='cursor-pointer py-2 text-sm font-medium focus:bg-indigo-50 focus:text-indigo-600'
                      >
                        <span className='truncate block'>{s.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stats */}
              {selectedSubject && (
                <div className='space-y-3 rounded-lg bg-slate-50 p-4'>
                  <div className='flex items-center justify-between'>
                    <span className='text-xs text-slate-600'>Total Topics</span>
                    <span className='font-bold text-slate-900'>
                      {structure.length}
                    </span>
                  </div>
                  <div className='flex items-center justify-between'>
                    <span className='text-xs text-slate-600'>
                      Total Subtopics
                    </span>
                    <span className='font-bold text-slate-900'>
                      {structure.reduce(
                        (sum, topic) =>
                          sum +
                          (topic.units?.reduce(
                            (uSum, unit) =>
                              uSum + (unit.subtopics?.length || 0),
                            0,
                          ) || 0),
                        0,
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* Quick Info */}
              <div className='rounded-lg border border-slate-200 bg-white p-4'>
                <p className='text-xs font-bold uppercase tracking-widest text-slate-400'>
                  Quick Guide
                </p>
                <ul className='mt-3 space-y-2 text-xs text-slate-600'>
                  <li>• Click chevron to expand/collapse</li>
                  <li>• Hover over items to see actions</li>
                  <li>• Add quizzes & exercises to units</li>
                  <li>• Reorder topics with arrows</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <TopicModal
        isOpen={topicModalOpen}
        onClose={() => {
          setTopicModalOpen(false);
          setEditingTopic(null);
        }}
        onSave={editingTopic ? handleUpdateTopic : handleCreateTopic}
        editData={
          editingTopic
            ? {
                title: editingTopic.title,
                description: editingTopic.description || '',
              }
            : undefined
        }
        loading={modalLoading}
      />

      <UnitModal
        isOpen={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        onSave={(data) => {
          if (editingUnit) {
            handleUpdateUnit({ ...data, slug: data.slug || '' });
          } else {
            handleCreateUnit({ ...data, slug: data.slug || '' });
          }
        }}
        topicTitle={selectedTopicForUnit?.title || ''}
        loading={modalLoading}
        editData={
          editingUnit
            ? {
                title: editingUnit.title,
                description: editingUnit.description || '',
                slug: editingUnit.slug || '',
              }
            : undefined
        }
      />

      <SubtopicModal
        isOpen={subtopicModalOpen}
        onClose={() => setSubtopicModalOpen(false)}
        onSave={async (data) => {
          setModalLoading(true);
          try {
            if (editingSubtopic) {
              await handleUpdateSubtopic({ ...data, slug: data.slug || '' });
            } else {
              await handleCreateSubtopic({ ...data, slug: data.slug || '' });
            }
          } finally {
            setModalLoading(false);
          }
        }}
        topicTitle={
          editingSubtopic?.subtopic.title ||
          selectedUnitForSubtopic?.title ||
          ''
        }
        loading={modalLoading}
        editData={
          editingSubtopic
            ? {
                title: editingSubtopic.subtopic.title,
                description: editingSubtopic.subtopic.description || '',
                slug: editingSubtopic.subtopic.slug || '',
              }
            : undefined
        }
      />

      <ContentModal
        isOpen={contentModalOpen}
        onClose={() => {
          setContentModalOpen(false);
          setSelectedSubtopicForContent(null);
          setEditingContent(null);
        }}
        onSave={async (data) => {
          setModalLoading(true);
          try {
            if (editingContent) {
              await handleUpdateContent(data);
            } else {
              await handleCreateContent(data);
            }
          } finally {
            setModalLoading(false);
          }
        }}
        subtopicTitle={selectedSubtopicForContent?.title || ''}
        loading={modalLoading}
        editData={editingContent || undefined}
      />

      <QuizModal
        isOpen={quizModalOpen}
        onClose={() => {
          setQuizModalOpen(false);
          setEditingQuiz(null);
          setSelectedUnitForQuiz(null);
        }}
        onSave={async (data) => {
          setModalLoading(true);
          try {
            if (editingQuiz) {
              await handleUpdateQuiz(data);
            } else {
              await handleCreateQuiz(data);
            }
          } finally {
            setModalLoading(false);
          }
        }}
        editData={editingQuiz || undefined}
        unitTitle={selectedUnitForQuiz?.title || ''}
        loading={modalLoading}
      />

      <ExerciseModal
        isOpen={exerciseModalOpen}
        onClose={() => {
          setExerciseModalOpen(false);
          setEditingExercise(null);
          setSelectedSubtopicForExercise(null);
        }}
        onSave={async (data) => {
          setModalLoading(true);
          try {
            if (editingExercise) {
              await handleUpdateExercise(data);
            } else {
              await handleCreateExercise(data);
            }
          } finally {
            setModalLoading(false);
          }
        }}
        editData={
          editingExercise
            ? {
                title: editingExercise.title,
                instructions: editingExercise.instructions || '',
                max_score: editingExercise.max_score,
                language: editingExercise.language || 'javascript',
                initial_files: editingExercise.initial_files || [],
                test_cases: editingExercise.test_cases || [],
                tasks: editingExercise.tasks || [],
                rubric: editingExercise.rubric,
              }
            : undefined
        }
        subtopicTitle={selectedSubtopicForExercise?.title || ''}
        loading={modalLoading}
      />

      <AssignmentModal
        isOpen={assignmentModalOpen}
        onClose={() => {
          setAssignmentModalOpen(false);
          setEditingAssignment(null);
          setSelectedUnitForAssignment(null);
        }}
        onSave={async (data) => {
          setModalLoading(true);
          try {
            if (editingAssignment) {
              await handleUpdateAssignment(data);
            } else {
              await handleCreateAssignment(data);
            }
          } finally {
            setModalLoading(false);
          }
        }}
        editData={
          editingAssignment
            ? {
                title: editingAssignment.title,
                instructions: editingAssignment.instructions || '',
                max_score: editingAssignment.max_score,
                evaluator_type: (editingAssignment as any).evaluator_type,
                test_cases: (editingAssignment as any).test_cases,
                rubric: (editingAssignment as any).rubric,
              }
            : undefined
        }
        unitTitle={selectedUnitForAssignment?.title || ''}
        loading={modalLoading}
      />

      <CapstoneModal
        isOpen={capstoneModalOpen}
        onClose={() => {
          setCapstoneModalOpen(false);
          setEditingCapstone(null);
          setSelectedTopicForCapstone(null);
        }}
        onSave={async (data) => {
          setModalLoading(true);
          try {
            if (editingCapstone) {
              await handleUpdateCapstone(data);
            } else {
              await handleCreateCapstone(data);
            }
          } finally {
            setModalLoading(false);
          }
        }}
        editData={
          editingCapstone
            ? {
                title: editingCapstone.title,
                instructions: editingCapstone.instructions,
              }
            : undefined
        }
        topicTitle={selectedTopicForCapstone?.title || ''}
        loading={modalLoading}
      />

      <AdminLessonPreviewModal
        isOpen={showLessonPreview}
        onClose={closeLessonPreview}
        content={lessonPreviewContent}
        videoUrl={lessonPreviewVideoUrl}
        loading={lessonPreviewLoading}
        error={lessonPreviewError}
      />

      {questionsModalOpen && selectedQuizForQuestions && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs'>
          <div className='w-[94vw] sm:max-w-3xl rounded-2xl bg-white p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto'>
            <div className='mb-4 flex items-center justify-between'>
              <h3 className='text-lg font-bold text-slate-900'>
                Manage Quiz Questions
              </h3>
              <button
                onClick={() => {
                  setQuestionsModalOpen(false);
                  setSelectedQuizForQuestions(null);
                  setSelectedUnitTitleForQuestions('');
                }}
                className='text-slate-400 hover:text-slate-600'
                title='Close'
              >
                <XCircle className='h-5 w-5' />
              </button>
            </div>

            <QuizQuestionsList
              quizId={selectedQuizForQuestions.id}
              subtopicTitle={selectedUnitTitleForQuestions}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={
          confirmDelete
            ? `Delete ${confirmDelete.kind.charAt(0).toUpperCase() + confirmDelete.kind.slice(1)}`
            : 'Delete'
        }
        description={
          <>
            Are you sure you want to delete{' '}
            <span className='font-semibold'>
              {confirmDelete?.label || 'this item'}
            </span>
            ? This action cannot be undone.
          </>
        }
        confirmLabel='Delete'
        loading={deleteLoading}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setDeleteLoading(true);
          try {
            switch (confirmDelete.kind) {
              case 'unit':
                await handleDeleteUnit(confirmDelete.id);
                break;
              case 'topic':
                await handleDeleteTopic(confirmDelete.id);
                break;
              case 'subtopic':
                await handleDeleteSubtopic(confirmDelete.id);
                break;
              case 'content':
                await handleDeleteContent(confirmDelete.id);
                break;
              case 'quiz':
                await handleDeleteQuiz(confirmDelete.id);
                break;
              case 'exercise':
                await handleDeleteExercise(confirmDelete.id);
                break;
              case 'assignment':
                await handleDeleteAssignment(confirmDelete.id);
                break;
              case 'capstone':
                await handleDeleteCapstone(confirmDelete.id);
                break;
            }
          } finally {
            setDeleteLoading(false);
            setConfirmDelete(null);
          }
        }}
      />
    </>
  );
};

export default LearningFlow;
