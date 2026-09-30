import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Upload, Plus, Trash2, Loader2, FileText, X, ChevronDown, Check, Sparkles, Eye } from 'lucide-react';
import RichTextEditor from '@/components/common/RichTextEditor';
import MarkdownEditor from '@/components/common/MarkdownEditor';
import AdminAssignmentPreviewModal from '@/components/common/admin/AdminAssignmentPreviewModal';
import toast from 'react-hot-toast';
import apiClient from '@/services/api';
import { getErrorMessage } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';

/* ======================
   Editor Toggle
====================== */

function EditorToggle({
  value,
  onChange,
}: {
  value: 'rich' | 'markdown';
  onChange: (v: 'rich' | 'markdown') => void;
}) {
  return (
    <div className='flex items-center gap-1 border border-slate-200 rounded-md p-0.5 bg-slate-50'>
      <button
        type='button'
        onClick={() => onChange('rich')}
        className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${value === 'rich' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
      >
        Rich Text
      </button>
      <button
        type='button'
        onClick={() => onChange('markdown')}
        className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${value === 'markdown' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
      >
        Markdown
      </button>
    </div>
  );
}

/* ======================
   Types
====================== */

interface RubricItem {
  id: number;
  criteria: string;
  description: string;
  maxScore: number;
}

/* ======================
   Component
====================== */

interface College {
  id: string;
  name: string;
}

export default function CreateAssignment() {
  const navigate = useNavigate();
  const location = useLocation();
  const editData = (location.state as any) || {};

  const dashboardType = location.pathname.includes('/dashboard/admin') ? 'admin' : 'facilitator';
  const basePath = `/dashboard/${dashboardType}`;

  // ΓöÇΓöÇ Basic Information ΓöÇΓöÇ
  const queryParams = new URLSearchParams(location.search);
  const editId = editData.editId || queryParams.get('editId') || null;
  const [loadingAssignment, setLoadingAssignment] = useState<boolean>(!!editId);

  const [title, setTitle] = useState(editData.title || '');
  const [description, setDescription] = useState(editData.description || '');
  const [course, setCourse] = useState(editData.course || '');
  const [college, setCollege] = useState(editData.collegeId || '');
  const [selectedColleges, setSelectedColleges] = useState<string[]>(
    editData.collegeId ? [editData.collegeId] : []
  );
  const [topicId, setTopicId] = useState(editData.topicId || editData.domain || '');
  const [deadline, setDeadline] = useState(editData.deadline || '');

  // Dynamic subjects (courses) and topics
  const [availableCourses, setAvailableCourses] = useState<{value: string, label: string, slug: string}[]>([]);
  const [availableTopics, setAvailableTopics] = useState<{value: string, label: string}[]>([]);

  // ΓöÇΓöÇ Colleges & Evaluators from API ΓöÇΓöÇ
  const [colleges, setColleges] = useState<College[]>([]);
  const [evaluators, setEvaluators] = useState<{id: string; name: string}[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ΓöÇΓöÇ Instruction Document Upload ΓöÇΓöÇ
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [instructionUrl, setInstructionUrl] = useState(editData.instruction_file_url || '');
  const [instructionName, setInstructionName] = useState(editData.instruction_file_name || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ΓöÇΓöÇ Evaluation Setup ΓöÇΓöÇ
  const [assignmentDescription, setAssignmentDescription] = useState(editData.assignmentDescription || '');
  const [aiEvaluationType, setAiEvaluationType] = useState(editData.aiEvaluationType || '');
  const [weightage, setWeightage] = useState(editData.weightage || '100');
  const [enablePlagiarism, setEnablePlagiarism] = useState(editData.enablePlagiarism || false);

  // ΓöÇΓöÇ Rubrics & Test Cases State ΓöÇΓöÇ
  const [rubrics, setRubrics] = useState<RubricItem[]>(editData.rubricsList || []);
  const [rubricJson, setRubricJson] = useState<string>(
    editData.rubric
      ? typeof editData.rubric === 'string'
        ? editData.rubric
        : JSON.stringify(editData.rubric, null, 2)
      : JSON.stringify(
          [
            {
              name: 'Code Correctness',
              description: 'Fulfills primary requirements and handles edge cases.',
              weight: 50,
            },
            {
              name: 'Structure & Quality',
              description: 'Clean formatting, modular architecture, and standards.',
              weight: 50,
            },
          ],
          null,
          2
        )
  );
  const [rubricViewMode, setRubricViewMode] = useState<'json' | 'builder'>(editData.rubricsList?.length ? 'builder' : 'json');
  const [generatingRubric, setGeneratingRubric] = useState(false);

  // ΓöÇΓöÇ Editor Type ΓöÇΓöÇ
  const [editorType, setEditorType] = useState<'rich' | 'markdown'>(editData.editorType || 'rich');

  // ΓöÇΓöÇ Test Cases ΓöÇΓöÇ
  const [testCases, setTestCases] = useState<{ id: number; input: string; output: string; score: number }[]>(editData.testCasesList || []);
  const [testCasesJson, setTestCasesJson] = useState<string>(
    editData.test_cases
      ? typeof editData.test_cases === 'string'
        ? editData.test_cases
        : JSON.stringify(editData.test_cases, null, 2)
      : JSON.stringify(
          {
            evaluationMode: 'script',
            expectedLogs: ['Hello World'],
          },
          null,
          2
        )
  );
  const [testCaseViewMode, setTestCaseViewMode] = useState<'json' | 'builder'>(editData.testCasesList?.length ? 'builder' : 'json');
  const [generatingTestCases, setGeneratingTestCases] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleFileUpload = async (file: File) => {
    const allowed = ['.pdf', '.docx', '.txt', '.doc'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      toast.error('Only PDF, DOCX, and TXT files are supported');
      return;
    }

    setInstructionFile(file);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post<{ success: boolean; url: string }>(
        '/college-assignments/upload-instruction',
        formData
      );
      setInstructionUrl(res.data.url);
      setInstructionName(file.name);
      toast.success('Instruction document uploaded!');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to upload document'));
      setInstructionFile(null);
    } finally {
      setUploading(false);
    }
  };

  // ΓöÇΓöÇ Load Reference Data on Mount ΓöÇΓöÇ
  useEffect(() => {
    apiClient
      .get<{ data: College[] }>('/facilitator/colleges')
      .then((res) => setColleges(res.data.data || (res.data as any) || []))
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load colleges')));

    apiClient
      .get<{ data: { id: string; name: string }[] }>('/evaluations/evaluators')
      .then((res) => setEvaluators(res.data.data || (res.data as any) || []))
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load evaluators')));

    apiClient
      .get<{ data: any[] }>('/college-assignments/courses')
      .then((res) => setAvailableCourses(res.data.data || []))
      .catch((error) => console.error('Failed to load courses', error));
  }, []);

  // ΓöÇΓöÇ Load Assignment Details on Edit ΓöÇΓöÇ
  useEffect(() => {
    if (!editId) return;

    setLoadingAssignment(true);
    apiClient
      .get<{ success: boolean; data: any }>(`/college-assignments/${editId}`)
      .then((res) => {
        const d = res.data.data;
        if (!d) return;

        if (d.title) setTitle(d.title);
        if (d.description) setDescription(d.description);
        if (d.assignment_description) setAssignmentDescription(d.assignment_description);
        if (d.course) setCourse(d.course);
        if (d.college_id) {
          setCollege(String(d.college_id));
          setSelectedColleges([String(d.college_id)]);
        }
        if (d.topic_id) setTopicId(String(d.topic_id));
        if (d.due_date) {
          setDeadline(d.due_date.split('T')[0]);
        }
        if (d.evaluator_type) setAiEvaluationType(d.evaluator_type);
        if (d.instruction_file_url) setInstructionUrl(d.instruction_file_url);
        if (d.instruction_file_name) setInstructionName(d.instruction_file_name);
        if (d.allowed_submission_types && Array.isArray(d.allowed_submission_types)) {
          setAllowedSubmissionTypes(d.allowed_submission_types);
        }

        // Test Cases
        if (d.test_cases) {
          let parsedTc: any = d.test_cases;
          if (typeof parsedTc === 'string') {
            try { parsedTc = JSON.parse(parsedTc); } catch {}
          }
          if (Array.isArray(parsedTc) && parsedTc.length > 0) {
            setTestCases(parsedTc.map((tc: any, i: number) => ({
              id: Date.now() + i,
              input: tc.input ?? '',
              output: tc.output ?? '',
              score: Number(tc.score) || 10,
            })));
            setTestCasesJson(JSON.stringify(parsedTc, null, 2));
            setTestCaseViewMode('builder');
          } else if (typeof parsedTc === 'object' && parsedTc !== null) {
            setTestCasesJson(JSON.stringify(parsedTc, null, 2));
            setTestCaseViewMode('json');
          }
        }

        // Rubrics
        if (d.rubric) {
          let parsedRubric: any = d.rubric;
          if (typeof parsedRubric === 'string') {
            try { parsedRubric = JSON.parse(parsedRubric); } catch {}
          }
          if (Array.isArray(parsedRubric) && parsedRubric.length > 0) {
            setRubrics(parsedRubric.map((r: any, i: number) => ({
              id: Date.now() + i,
              criteria: r.name || r.criteria || '',
              description: r.description || '',
              maxScore: Number(r.score || r.weight || r.maxScore) || 10,
            })));
            setRubricJson(JSON.stringify(parsedRubric, null, 2));
            setRubricViewMode('builder');
          } else if (typeof parsedRubric === 'object' && parsedRubric !== null) {
            setRubricJson(JSON.stringify(parsedRubric, null, 2));
            setRubricViewMode('json');
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load assignment details for editing', err);
      })
      .finally(() => {
        setLoadingAssignment(false);
      });
  }, [editId]);

  // Normalize course value to UUID when availableCourses loads
  useEffect(() => {
    if (!course || availableCourses.length === 0) return;
    const match = availableCourses.find(
      (c) => c.value === course || c.label.toLowerCase() === course.toLowerCase() || c.slug === course
    );
    if (match && match.value !== course) {
      setCourse(match.value);
    }
  }, [availableCourses, course]);

  // Fetch topics when course changes
  useEffect(() => {
    if (!course) {
      setAvailableTopics([]);
      return;
    }
    apiClient
      .get<{ data: any[] }>(`/college-assignments/courses/${course}/topics`)
      .then((res) => {
        const topics = res.data.data || [];
        setAvailableTopics(topics);
      })
      .catch((error) => console.error('Failed to load topics', error));
  }, [course]);

  // Normalize topicId when availableTopics loads
  useEffect(() => {
    if (!topicId || availableTopics.length === 0) return;
    const match = availableTopics.find(
      (t) => t.value === topicId || t.label.toLowerCase() === topicId.toLowerCase()
    );
    if (match && match.value !== topicId) {
      setTopicId(match.value);
    }
  }, [availableTopics, topicId]);

  // ΓöÇΓöÇ AI Auto-Generate Handlers ΓöÇΓöÇ
  const handleGenerateTestCases = async () => {
    const instructionsText = assignmentDescription.trim() || description.trim();
    if (!title.trim() || !instructionsText) {
      toast.error('Please provide an Assignment Title and Description / Instructions first');
      return;
    }

    setGeneratingTestCases(true);
    try {
      let rubricPayload: any = null;
      try {
        rubricPayload = JSON.parse(rubricJson);
      } catch {
        rubricPayload = rubrics.map((r) => ({ name: r.criteria, description: r.description, weight: r.maxScore }));
      }

      const res = await apiClient.post<{ success: boolean; testCases: string }>('/evaluations/generate-test-cases', {
        title: title.trim(),
        instructions: instructionsText,
        evaluatorType: aiEvaluationType || 'JS',
        rubric: rubricPayload,
      });

      if (res.data.success && res.data.testCases) {
        setTestCasesJson(res.data.testCases);
        try {
          const parsed = JSON.parse(res.data.testCases);
          if (Array.isArray(parsed)) {
            setTestCases(
              parsed.map((item: any, idx: number) => ({
                id: Date.now() + idx,
                input: typeof item.input === 'object' ? JSON.stringify(item.input) : String(item.input || ''),
                output: typeof item.output === 'object' ? JSON.stringify(item.output) : String(item.output || item.expected || ''),
                score: Number(item.score || item.points || 10),
              }))
            );
          } else if (parsed.testCases && Array.isArray(parsed.testCases)) {
            setTestCases(
              parsed.testCases.map((item: any, idx: number) => ({
                id: Date.now() + idx,
                input: typeof item.input === 'object' ? JSON.stringify(item.input) : String(item.input || ''),
                output: typeof item.expected === 'object' ? JSON.stringify(item.expected) : String(item.expected || item.output || ''),
                score: Number(item.score || 10),
              }))
            );
          }
        } catch {}
        toast.success('Test cases generated successfully!');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to generate test cases');
    } finally {
      setGeneratingTestCases(false);
    }
  };

  const handleGenerateRubric = async () => {
    const instructionsText = assignmentDescription.trim() || description.trim();
    if (!title.trim() || !instructionsText) {
      toast.error('Please provide an Assignment Title and Description / Instructions first');
      return;
    }

    setGeneratingRubric(true);
    try {
      const res = await apiClient.post<{ success: boolean; rubric: string }>('/evaluations/generate-rubric', {
        title: title.trim(),
        instructions: instructionsText,
        evaluatorType: aiEvaluationType || 'JS',
      });

      if (res.data.success && res.data.rubric) {
        setRubricJson(res.data.rubric);
        try {
          const parsed = JSON.parse(res.data.rubric);
          if (Array.isArray(parsed)) {
            setRubrics(
              parsed.map((item: any, idx: number) => ({
                id: Date.now() + idx,
                criteria: item.name || item.criteria || `Criterion ${idx + 1}`,
                description: item.description || '',
                maxScore: Number(item.weight || item.score || item.maxScore || 10),
              }))
            );
          }
        } catch {}
        toast.success('Rubric generated successfully!');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to generate rubric');
    } finally {
      setGeneratingRubric(false);
    }
  };

  // ΓöÇΓöÇ Submission Settings ΓöÇΓöÇ
  const [allowedSubmissionTypes, setAllowedSubmissionTypes] = useState<string[]>(
    editData.allowed_submission_types || editData.allowedSubmissionTypes || [
      'file',
      'github',
      'docs',
      'figma',
      'excel',
      'url',
    ]
  );

  const toggleSubmissionType = (typeId: string) => {
    setAllowedSubmissionTypes((prev) => {
      if (prev.includes(typeId)) {
        if (prev.length <= 1) {
          toast.error('At least one submission method must be enabled');
          return prev;
        }
        return prev.filter((t) => t !== typeId);
      } else {
        return [...prev, typeId];
      }
    });
  };

  const selectAllSubmissionTypes = () => {
    setAllowedSubmissionTypes(['file', 'github', 'docs', 'figma', 'excel', 'url']);
  };

  // ΓöÇΓöÇ Rubrics helpers ΓöÇΓöÇ
  const totalScore = rubrics.reduce((sum, r) => sum + r.maxScore, 0);

  const addRubric = () => {
    setRubrics((prev) => [
      ...prev,
      { id: Date.now(), criteria: '', description: '', maxScore: 10 },
    ]);
  };

  const removeRubric = (id: number) => {
    setRubrics((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRubric = (id: number, field: keyof RubricItem, value: string | number) => {
    setRubrics((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // ΓöÇΓöÇ Test Cases helpers ΓöÇΓöÇ
  const totalTestCaseScore = testCases.reduce((sum, tc) => sum + tc.score, 0);

  const addTestCase = () => {
    setTestCases((prev) => [
      ...prev,
      { id: Date.now(), input: '', output: '', score: 10 },
    ]);
  };

  const removeTestCase = (id: number) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
  };

  const updateTestCase = (id: number, field: keyof typeof testCases[0], value: string | number) => {
    setTestCases((prev) =>
      prev.map((tc) => (tc.id === id ? { ...tc, [field]: value } : tc))
    );
  };

  const isCodeEvaluator = ['JS', 'PYTHON', 'JAVA'].includes(aiEvaluationType);

  // ΓöÇΓöÇ Validation & Submit ΓöÇΓöÇ
  const handleCreate = async () => {
    const missing: string[] = [];

    if (!title.trim()) missing.push('Assignment Title');
    if (!course) missing.push('Course');
    if (editId ? !college : selectedColleges.length === 0) missing.push('College');
    if (!topicId) missing.push('Subject');
    if (!deadline) missing.push('Deadline');
    if (allowedSubmissionTypes.length === 0) missing.push('At least one Submission Method');

    if (missing.length > 0) {
      toast.error(
        `Please fill in: ${missing.join(', ')}`,
        {
          duration: 4000,
          style: {
            maxWidth: 480,
          },
        },
      );
      return;
    }

    setSubmitting(true);
    try {
      let finalTestCases: any = null;
      if (testCaseViewMode === 'json' && testCasesJson.trim()) {
        try {
          finalTestCases = JSON.parse(testCasesJson);
        } catch {
          finalTestCases = testCasesJson.trim();
        }
      } else {
        finalTestCases = testCases.map((t) => ({ input: t.input, output: t.output, score: t.score }));
      }

      let finalRubric: any = null;
      if (rubricViewMode === 'json' && rubricJson.trim()) {
        try {
          finalRubric = JSON.parse(rubricJson);
        } catch {
          finalRubric = rubrics.map((r) => ({ name: r.criteria, score: r.maxScore, description: r.description }));
        }
      } else {
        finalRubric = rubrics.map((r) => ({ name: r.criteria, score: r.maxScore, description: r.description }));
      }

      let resId = editId;
      if (editId) {
        await apiClient.put(`/college-assignments/${editId}`, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: deadline || null,
          course: course || null,
          topic_id: topicId || null,
          instruction_file_url: instructionUrl || null,
          instruction_file_name: instructionName || null,
          test_cases: finalTestCases,
          rubric: finalRubric,
          evaluator_type: aiEvaluationType || null,
          assignment_description: assignmentDescription.trim() || null,
          allowed_submission_types: allowedSubmissionTypes,
        });
        toast.success('Assignment updated successfully!');
      } else {
        const res = await apiClient.post('/college-assignments', {
          college_ids: selectedColleges,
          title: title.trim(),
          description: description.trim() || null,
          due_date: deadline || null,
          course: course || null,
          topic_id: topicId || null,
          instruction_file_url: instructionUrl || null,
          instruction_file_name: instructionName || null,
          test_cases: finalTestCases,
          rubric: finalRubric,
          evaluator_type: aiEvaluationType || null,
          assignment_description: assignmentDescription.trim() || null,
          allowed_submission_types: allowedSubmissionTypes,
        });
        resId = res.data.data.id;
        toast.success('Assignment created successfully!');
      }

      navigate(`${basePath}/assignment-success`, {
        state: {
          editId: resId,
          title,
          description,
          course: availableCourses.find(c => c.value === course)?.label || course,
          college: editId
            ? (colleges.find((c) => String(c.id) === college)?.name || college)
            : (selectedColleges.length === colleges.length
              ? 'All Colleges'
              : selectedColleges
                  .map((id) => colleges.find((c) => String(c.id) === id)?.name)
                  .filter(Boolean)
                  .join(', ')),
          collegeId: editId ? college : selectedColleges[0],
          topicId: availableTopics.find(t => t.value === topicId)?.label || topicId,
          deadline,
          assignmentDescription,
          aiEvaluationType,
          weightage,
          enablePlagiarism,
          allowed_submission_types: allowedSubmissionTypes,
          totalMarks: isCodeEvaluator ? totalTestCaseScore : totalScore,
          rubricsList: rubrics,
          testCasesList: testCases,
          rubrics: rubrics.map((r) => ({
            name: r.criteria,
            score: r.maxScore,
          })),
        },
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create assignment'));
    } finally {
      setSubmitting(false);
    }
  };

  /* ======================
     Render
  ====================== */

  return (
    <div className='min-h-screen bg-slate-50/60'>
      <div className='max-w-3xl mx-auto px-3.5 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6 animate-in fade-in duration-500 min-w-0'>
        {/* ΓöÇΓöÇ Page Header ΓöÇΓöÇ */}
        <div className='flex items-center gap-3'>
          <button
            className='p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition min-h-[38px] min-w-[38px] flex items-center justify-center'
            onClick={() => navigate(`${basePath}/assignment-management`)}
          >
            <ArrowLeft className='w-5 h-5' />
          </button>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <h1 className='text-lg sm:text-xl font-bold text-slate-900 truncate'>
                {editId ? 'Edit Assignment' : 'Create Assignment'}
              </h1>
              {loadingAssignment && (
                <div className='flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium'>
                  <Loader2 className='w-3 h-3 animate-spin' />
                  <span>Loading details...</span>
                </div>
              )}
            </div>
            <p className='text-xs sm:text-sm text-slate-500 truncate'>
              {editId ? 'Update details, evaluation rules, and submissions' : 'Set up a new assignment for a branch'}
            </p>
          </div>
        </div>

        {/* ================================================================
            SECTION 1 ΓÇö Basic Information
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-2 px-4 sm:px-6 pt-4 sm:pt-6'>
            <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Basic Information</CardTitle>
          </CardHeader>

          <CardContent className='space-y-3.5 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6'>
            {/* Assignment Title */}
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm text-slate-600'>Assignment Title</Label>
              <Input
                placeholder='e.g. React Hooks Unit Test 3'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className='text-xs sm:text-sm h-10'
              />
            </div>

            {/* Description */}
            <div className='space-y-1.5'>
              <div className='flex items-center justify-between flex-wrap gap-2'>
                <Label className='text-xs sm:text-sm text-slate-600'>Description</Label>
                <EditorToggle value={editorType} onChange={setEditorType} />
              </div>
              {editorType === 'rich' ? (
                <RichTextEditor
                  minHeight='80px'
                  placeholder='Describe the assignment objectives...'
                  value={description}
                  onChange={setDescription}
                />
              ) : (
                <MarkdownEditor
                  minHeight='80px'
                  placeholder='Describe the assignment objectives...'
                  value={description}
                  onChange={setDescription}
                />
              )}
            </div>

            {/* Course & College */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>Course</Label>
                <Select value={course} onValueChange={(val) => { setCourse(val); setTopicId(''); }}>
                  <SelectTrigger className='w-full text-xs sm:text-sm h-10'>
                    <SelectValue placeholder='Select Course' />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCourses.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>College</Label>
                {editId ? (
                  <Input
                    value={colleges.find((c) => String(c.id) === (selectedColleges[0] || college))?.name || (editData.college || college || 'Loading...')}
                    disabled
                    className="bg-slate-100/80 border-slate-200 text-slate-500 font-medium text-xs sm:text-sm h-10"
                  />
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full flex items-center justify-between px-3 py-2 text-xs sm:text-sm font-normal bg-white border border-slate-200 rounded-md shadow-xs hover:bg-slate-50 focus:outline-none text-left text-slate-700 h-10"
                      >
                        <span className="truncate">
                          {selectedColleges.length === 0
                            ? 'Select Colleges'
                            : selectedColleges.length === colleges.length
                              ? 'All Colleges'
                              : selectedColleges.length <= 2
                                ? selectedColleges
                                    .map((id) => colleges.find((c) => String(c.id) === id)?.name)
                                    .filter(Boolean)
                                    .join(', ')
                                : `${selectedColleges.length} Colleges Selected`}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[300px] sm:w-[340px] max-h-[300px] overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg p-1 z-50">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault(); // Keep dropdown open
                          if (selectedColleges.length === colleges.length) {
                            setSelectedColleges([]);
                          } else {
                            setSelectedColleges(colleges.map((c) => String(c.id)));
                          }
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs sm:text-sm cursor-pointer rounded-sm hover:bg-slate-50 focus:bg-slate-100"
                      >
                        <Checkbox
                          checked={selectedColleges.length === colleges.length && colleges.length > 0}
                          className="pointer-events-none"
                        />
                        <span className="font-medium text-slate-700">All Colleges</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-slate-100 my-1 h-px" />
                      {colleges?.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onSelect={(e) => {
                            e.preventDefault(); // Keep dropdown open
                            setSelectedColleges((prev) =>
                              prev.includes(String(c.id))
                                ? prev.filter((item) => item !== String(c.id))
                                : [...prev, String(c.id)]
                            );
                          }}
                          className="flex items-center gap-2.5 px-2.5 py-1.5 text-xs sm:text-sm cursor-pointer rounded-sm hover:bg-slate-50 focus:bg-slate-100"
                        >
                          <Checkbox
                            checked={selectedColleges.includes(String(c.id))}
                            className="pointer-events-none"
                          />
                          <span className="text-slate-700">{c.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Subject, Deadline */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>Subject</Label>
                <Select value={topicId} onValueChange={setTopicId} disabled={!course}>
                  <SelectTrigger className='w-full text-xs sm:text-sm h-10'>
                    <SelectValue placeholder={course ? 'Select Subject' : 'Select a course first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTopics.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>Deadline</Label>
                <Input
                  type='date'
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className='text-xs sm:text-sm h-10'
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ================================================================
            SECTION 2 ΓÇö Evaluation Setup
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-2 px-4 sm:px-6 pt-4 sm:pt-6'>
            <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Evaluation Setup</CardTitle>
          </CardHeader>

          <CardContent className='space-y-3.5 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6'>
            {/* Instruction Document */}
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm text-slate-600'>Instruction Document</Label>
              <input
                ref={fileInputRef}
                type='file'
                accept='.pdf,.docx,.doc,.txt'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />
              {instructionFile ? (
                <div className='flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4'>
                  <FileText className='w-7 h-7 sm:w-8 sm:h-8 text-blue-500 shrink-0' />
                  <div className='flex-1 min-w-0'>
                    <p className='text-xs sm:text-sm font-medium text-slate-700 truncate'>{instructionFile.name}</p>
                    <p className='text-[10px] sm:text-xs text-slate-400'>
                      {uploading ? 'Uploading...' : 'Uploaded successfully'}
                    </p>
                  </div>
                  {uploading ? (
                    <Loader2 className='w-5 h-5 text-blue-500 animate-spin shrink-0' />
                  ) : (
                    <button
                      className='text-slate-400 hover:text-red-500 transition shrink-0 p-1.5'
                      onClick={() => {
                        setInstructionFile(null);
                        setInstructionUrl('');
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                    >
                      <X className='w-4 h-4' />
                    </button>
                  )}
                </div>
              ) : (
                <div
                  className='border-2 border-dashed border-slate-200 rounded-xl p-5 sm:p-8 text-center hover:border-blue-400 transition cursor-pointer'
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                >
                  <Upload className='w-6 h-6 sm:w-8 sm:h-8 text-slate-300 mx-auto mb-2' />
                  <p className='text-xs sm:text-sm text-slate-500'>Drag & drop instruction file or click to browse</p>
                  <p className='text-[10px] sm:text-xs text-slate-400 mt-1'>Supports PDF, DOCX, TXT</p>
                </div>
              )}
            </div>

            {/* Assignment Description */}
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm text-slate-600'>Assignment Description</Label>
              {editorType === 'rich' ? (
                <RichTextEditor
                  minHeight='100px'
                  placeholder='Describe the assignment objectives, requirements, and expectations...'
                  value={assignmentDescription}
                  onChange={setAssignmentDescription}
                />
              ) : (
                <MarkdownEditor
                  minHeight='100px'
                  placeholder='Describe the assignment objectives, requirements, and expectations...'
                  value={assignmentDescription}
                  onChange={setAssignmentDescription}
                />
              )}
            </div>

            {/* AI Evaluation Type & Weightage */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>Evaluator</Label>
                <Select value={aiEvaluationType} onValueChange={setAiEvaluationType}>
                  <SelectTrigger className='w-full text-xs sm:text-sm h-10'>
                    <SelectValue placeholder='Select' />
                  </SelectTrigger>
                  <SelectContent>
                    {evaluators?.map((ev) => (
                      <SelectItem key={ev.id} value={String(ev.id)}>
                        {ev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>Weightage (%)</Label>
                <Input
                  type='number'
                  placeholder='100'
                  value={weightage}
                  onChange={(e) => setWeightage(e.target.value)}
                  className='text-xs sm:text-sm h-10'
                />
              </div>
            </div>

            {/* Plagiarism Check Toggle */}
            <div className='flex items-center justify-between py-2 gap-3'>
              <div className='min-w-0 flex-1'>
                <p className='text-xs sm:text-sm font-medium text-slate-900'>Enable Plagiarism Check</p>
                <p className='text-[10px] sm:text-xs text-slate-500'>AI will cross-check submissions for similarity</p>
              </div>
              <Switch checked={enablePlagiarism} onCheckedChange={setEnablePlagiarism} />
            </div>
          </CardContent>
        </Card>

        {/* ================================================================
            SECTION 3 ΓÇö Test Cases & Evaluation Rubrics
        ================================================================ */}

        {/* ΓöÇΓöÇ Test Cases Card ΓöÇΓöÇ */}
        <Card className='border-none shadow-sm overflow-hidden bg-white'>
          <CardHeader className='pb-3 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-100/80'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
              <div>
                <div className='flex items-center gap-2'>
                  <div className='w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono text-xs font-bold'>
                    &gt;_
                  </div>
                  <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Test Cases</CardTitle>
                </div>
                <p className='text-xs text-slate-500 mt-0.5'>Automated testing rules matching your selected evaluator</p>
              </div>

              <div className='flex items-center gap-2 flex-wrap sm:flex-nowrap'>
                <div className='flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 bg-slate-50'>
                  <button
                    type='button'
                    onClick={() => setTestCaseViewMode('json')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      testCaseViewMode === 'json' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    JSON / Spec
                  </button>
                  <button
                    type='button'
                    onClick={() => setTestCaseViewMode('builder')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      testCaseViewMode === 'builder' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Builder
                  </button>
                </div>

                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleGenerateTestCases}
                  disabled={generatingTestCases}
                  className='h-8 text-xs bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-800 font-semibold gap-1.5 shadow-2xs'
                >
                  {generatingTestCases ? (
                    <Loader2 className='w-3.5 h-3.5 animate-spin' />
                  ) : (
                    <Sparkles className='w-3.5 h-3.5 text-indigo-600' />
                  )}
                  Auto-Generate Test Cases
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className='p-4 sm:p-6 space-y-3'>
            {testCaseViewMode === 'json' ? (
              <div className='space-y-2'>
                <div className='relative rounded-xl overflow-hidden border border-slate-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all'>
                  <textarea
                    value={testCasesJson}
                    onChange={(e) => setTestCasesJson(e.target.value)}
                    rows={8}
                    placeholder={`{\n  "evaluationMode": "script",\n  "expectedLogs": ["Hello World"]\n}`}
                    className='w-full p-4 font-mono text-xs sm:text-sm text-slate-800 bg-slate-50/60 focus:bg-white outline-none transition-colors resize-y leading-relaxed'
                  />
                </div>
                <p className='text-[11px] text-slate-400'>
                  Note: For React, Fullstack, or Backend assignments, you can also paste JavaScript test spec files directly. It will be packaged automatically upon save.
                </p>
              </div>
            ) : (
              <div className='space-y-3'>
                <div className='flex items-center justify-between pb-1'>
                  <div className='inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold'>
                    <span>Total:</span>
                    <span className='text-indigo-600'>{totalTestCaseScore} Points</span>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-1.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 h-8 font-semibold'
                    onClick={addTestCase}
                  >
                    <Plus className='w-3.5 h-3.5' /> Add Test Case
                  </Button>
                </div>

                {testCases.length === 0 ? (
                  <div className='py-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2'>
                    <p className='text-xs text-slate-500'>No test cases added yet.</p>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleGenerateTestCases}
                      className='text-xs bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-medium'
                    >
                      <Sparkles className='w-3.5 h-3.5 mr-1 text-indigo-500' /> Auto-Generate with AI
                    </Button>
                  </div>
                ) : (
                  <div className='space-y-2.5'>
                    {/* Desktop Column Headers */}
                    <div className='hidden sm:grid sm:grid-cols-[1fr_1fr_90px_36px] gap-2.5 px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider'>
                      <span>Input (Arguments)</span>
                      <span>Expected Output</span>
                      <span className='text-center'>Score</span>
                      <span></span>
                    </div>

                    {testCases.map((tc, idx) => (
                      <div
                        key={tc.id}
                        className='p-3 sm:p-2 bg-slate-50/60 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-all shadow-2xs'
                      >
                        {/* Mobile Header */}
                        <div className='flex sm:hidden items-center justify-between pb-2 mb-2 border-b border-slate-200/60'>
                          <span className='text-xs font-semibold text-slate-700'>Test Case #{idx + 1}</span>
                          <button
                            type='button'
                            className='p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors'
                            onClick={() => removeTestCase(tc.id)}
                            title='Delete test case'
                          >
                            <Trash2 className='w-4 h-4' />
                          </button>
                        </div>

                        {/* Row Layout */}
                        <div className='grid grid-cols-1 sm:grid-cols-[1fr_1fr_90px_36px] gap-2.5 items-center'>
                          <div className='space-y-1 sm:space-y-0'>
                            <span className='sm:hidden text-[10px] font-semibold text-slate-400 uppercase'>Input (Arguments)</span>
                            <Input
                              value={tc.input}
                              onChange={(e) => updateTestCase(tc.id, 'input', e.target.value)}
                              className='text-xs font-mono h-9 bg-white border-slate-200 focus-visible:ring-indigo-500'
                              placeholder='e.g. 5, 10'
                            />
                          </div>

                          <div className='space-y-1 sm:space-y-0'>
                            <span className='sm:hidden text-[10px] font-semibold text-slate-400 uppercase'>Expected Output</span>
                            <Input
                              value={tc.output}
                              onChange={(e) => updateTestCase(tc.id, 'output', e.target.value)}
                              className='text-xs font-mono h-9 bg-white border-slate-200 focus-visible:ring-indigo-500'
                              placeholder='e.g. 15'
                            />
                          </div>

                          <div className='space-y-1 sm:space-y-0'>
                            <span className='sm:hidden text-[10px] font-semibold text-slate-400 uppercase'>Score (pts)</span>
                            <Input
                              type='number'
                              value={tc.score}
                              onChange={(e) => updateTestCase(tc.id, 'score', Number(e.target.value))}
                              className='text-xs font-semibold text-center h-9 bg-white border-slate-200 focus-visible:ring-indigo-500'
                              min={0}
                            />
                          </div>

                          <div className='hidden sm:flex items-center justify-center'>
                            <button
                              type='button'
                              className='p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors'
                              onClick={() => removeTestCase(tc.id)}
                              title='Delete test case'
                            >
                              <Trash2 className='w-4 h-4' />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ΓöÇΓöÇ Evaluation Rubrics Card ΓöÇΓöÇ */}
        <Card className='border-none shadow-sm overflow-hidden bg-white'>
          <CardHeader className='pb-3 px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-100/80'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
              <div>
                <div className='flex items-center gap-2'>
                  <div className='w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-bold'>
                    ≡ƒôï
                  </div>
                  <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Evaluation Rubrics</CardTitle>
                </div>
                <p className='text-xs text-slate-500 mt-0.5'>Weighted grading criteria for AI or manual grading</p>
              </div>

              <div className='flex items-center gap-2 flex-wrap sm:flex-nowrap'>
                <div className='flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 bg-slate-50'>
                  <button
                    type='button'
                    onClick={() => setRubricViewMode('json')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      rubricViewMode === 'json' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    JSON
                  </button>
                  <button
                    type='button'
                    onClick={() => setRubricViewMode('builder')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      rubricViewMode === 'builder' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Builder
                  </button>
                </div>

                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleGenerateRubric}
                  disabled={generatingRubric}
                  className='h-8 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 font-semibold gap-1.5 shadow-2xs'
                >
                  {generatingRubric ? (
                    <Loader2 className='w-3.5 h-3.5 animate-spin' />
                  ) : (
                    <Sparkles className='w-3.5 h-3.5 text-emerald-600' />
                  )}
                  Auto-Generate Rubric
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className='p-4 sm:p-6 space-y-3'>
            {rubricViewMode === 'json' ? (
              <div className='space-y-2'>
                <div className='relative rounded-xl overflow-hidden border border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition-all'>
                  <textarea
                    value={rubricJson}
                    onChange={(e) => setRubricJson(e.target.value)}
                    rows={8}
                    placeholder={`[\n  {\n    "name": "Code Correctness",\n    "description": "Fulfills primary requirements and handles edge cases.",\n    "weight": 50\n  }\n]`}
                    className='w-full p-4 font-mono text-xs sm:text-sm text-slate-800 bg-slate-50/60 focus:bg-white outline-none transition-colors resize-y leading-relaxed'
                  />
                </div>
                <p className='text-[11px] text-slate-400'>
                  The sum of criteria weights should equal 100 for percentage-based grading.
                </p>
              </div>
            ) : (
              <div className='space-y-3'>
                <div className='flex items-center justify-between pb-1'>
                  <div className='inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold'>
                    <span>Total:</span>
                    <span className='text-emerald-600'>{totalScore} Points</span>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-1.5 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 h-8 font-semibold'
                    onClick={addRubric}
                  >
                    <Plus className='w-3.5 h-3.5' /> Add Criteria
                  </Button>
                </div>

                {rubrics.length === 0 ? (
                  <div className='py-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2'>
                    <p className='text-xs text-slate-500'>No rubric criteria added yet.</p>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleGenerateRubric}
                      className='text-xs bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-medium'
                    >
                      <Sparkles className='w-3.5 h-3.5 mr-1 text-emerald-600' /> Auto-Generate Rubric with AI
                    </Button>
                  </div>
                ) : (
                  <div className='space-y-2.5'>
                    {/* Desktop Column Headers */}
                    <div className='hidden sm:grid sm:grid-cols-[1.2fr_2fr_90px_36px] gap-2.5 px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider'>
                      <span>Criterion Name</span>
                      <span>Description</span>
                      <span className='text-center'>Max Score</span>
                      <span></span>
                    </div>

                    {rubrics.map((rubric, idx) => (
                      <div
                        key={rubric.id}
                        className='p-3 sm:p-2 bg-slate-50/60 hover:bg-slate-50 rounded-xl border border-slate-200/80 transition-all shadow-2xs'
                      >
                        {/* Mobile Header */}
                        <div className='flex sm:hidden items-center justify-between pb-2 mb-2 border-b border-slate-200/60'>
                          <span className='text-xs font-semibold text-slate-700'>Criterion #{idx + 1}</span>
                          <button
                            type='button'
                            className='p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors'
                            onClick={() => removeRubric(rubric.id)}
                            title='Delete criterion'
                          >
                            <Trash2 className='w-4 h-4' />
                          </button>
                        </div>

                        {/* Row Layout */}
                        <div className='grid grid-cols-1 sm:grid-cols-[1.2fr_2fr_90px_36px] gap-2.5 items-center'>
                          <div className='space-y-1 sm:space-y-0'>
                            <span className='sm:hidden text-[10px] font-semibold text-slate-400 uppercase'>Criterion</span>
                            <Input
                              value={rubric.criteria}
                              onChange={(e) => updateRubric(rubric.id, 'criteria', e.target.value)}
                              className='text-xs font-semibold h-9 bg-white border-slate-200 focus-visible:ring-emerald-500'
                              placeholder='e.g. Code Structure'
                            />
                          </div>

                          <div className='space-y-1 sm:space-y-0'>
                            <span className='sm:hidden text-[10px] font-semibold text-slate-400 uppercase'>Description</span>
                            <Input
                              value={rubric.description}
                              onChange={(e) => updateRubric(rubric.id, 'description', e.target.value)}
                              className='text-xs h-9 bg-white border-slate-200 focus-visible:ring-emerald-500'
                              placeholder='e.g. Fulfills primary requirements...'
                            />
                          </div>

                          <div className='space-y-1 sm:space-y-0'>
                            <span className='sm:hidden text-[10px] font-semibold text-slate-400 uppercase'>Max Score</span>
                            <Input
                              type='number'
                              value={rubric.maxScore}
                              onChange={(e) => updateRubric(rubric.id, 'maxScore', Number(e.target.value))}
                              className='text-xs font-semibold text-center h-9 bg-white border-slate-200 focus-visible:ring-emerald-500'
                              min={0}
                            />
                          </div>

                          <div className='hidden sm:flex items-center justify-center'>
                            <button
                              type='button'
                              className='p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors'
                              onClick={() => removeRubric(rubric.id)}
                              title='Delete criterion'
                            >
                              <Trash2 className='w-4 h-4' />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ================================================================
            SECTION 4 ΓÇö Submission Settings
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-2 px-4 sm:px-6 pt-4 sm:pt-6'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
              <div>
                <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Allowed Submission Methods</CardTitle>
                <p className='text-xs text-slate-500 mt-0.5'>Choose which formats learners can submit for this assignment</p>
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={selectAllSubmissionTypes}
                  className='text-xs h-8 text-blue-600 border-blue-200 hover:bg-blue-50'
                >
                  Select All
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className='px-4 sm:px-6 pb-4 sm:pb-6'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2'>
              {[
                {
                  id: 'file',
                  title: 'Document / File Upload',
                  desc: 'Direct file upload: PDF, DOCX, XLSX, TXT, ZIP',
                  emoji: '≡ƒôü',
                  color: 'blue',
                },
                {
                  id: 'github',
                  title: 'GitHub / Git Repository',
                  desc: 'Public code repository: GitHub, GitLab, Bitbucket',
                  emoji: '≡ƒÉÖ',
                  color: 'slate',
                },
                {
                  id: 'docs',
                  title: 'Google Docs / Office 365',
                  desc: 'Cloud document links with sharing permissions',
                  emoji: '≡ƒôä',
                  color: 'sky',
                },
                {
                  id: 'figma',
                  title: 'Figma Design / Prototype',
                  desc: 'Figma files, interactive prototypes, or FigJam boards',
                  emoji: '≡ƒÄ¿',
                  color: 'purple',
                },
                {
                  id: 'excel',
                  title: 'Google Sheets / Excel Online',
                  desc: 'Cloud spreadsheets for data and financial models',
                  emoji: '≡ƒôè',
                  color: 'emerald',
                },
                {
                  id: 'url',
                  title: 'General URL / Live App',
                  desc: 'Deployed web applications, portfolios, or external links',
                  emoji: '≡ƒîÉ',
                  color: 'amber',
                },
              ].map((item) => {
                const isSelected = allowedSubmissionTypes.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSubmissionType(item.id)}
                    className={`relative flex items-start gap-3 p-3.5 rounded-xl border-2 transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 opacity-60 hover:opacity-80'
                    }`}
                  >
                    <div className='text-2xl shrink-0 p-1.5 rounded-lg bg-white shadow-xs border border-slate-100'>
                      {item.emoji}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center justify-between gap-1'>
                        <h4 className='text-xs sm:text-sm font-semibold text-slate-900 truncate'>{item.title}</h4>
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-blue-600 text-white' : 'border border-slate-300'
                          }`}
                        >
                          {isSelected && <Check className='w-2.5 h-2.5 stroke-[3]' />}
                        </div>
                      </div>
                      <p className='text-[11px] text-slate-500 leading-tight mt-0.5'>{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Footer Actions ── */}
        <div className='flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-8 pt-2'>
          <Button
            type='button'
            variant='outline'
            onClick={() => setPreviewOpen(true)}
            className='h-10 px-4 text-xs sm:text-sm font-semibold border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5'
          >
            <Eye className='w-4 h-4 text-indigo-600' />
            <span>Preview Student View</span>
          </Button>

          <div className='flex items-center gap-2.5'>
            <Button
              variant='outline'
              className='w-full sm:w-auto px-6 min-h-[40px] text-xs sm:text-sm'
              onClick={() => navigate(`${basePath}/assignment-management`)}
            >
              Cancel
            </Button>
            <Button
              className='w-full sm:w-auto px-6 bg-blue-600 hover:bg-blue-700 min-h-[40px] text-xs sm:text-sm font-semibold'
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting && <Loader2 className='w-4 h-4 mr-2 animate-spin' />}
              {submitting ? (editId ? 'Updating...' : 'Creating...') : (editId ? 'Update Assignment' : 'Create Assignment')}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Student View Preview Modal ── */}
      <AdminAssignmentPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        assignmentData={{
          title: title.trim() || 'Untitled Assignment',
          instructions: assignmentDescription.trim() || description.trim(),
          max_score: Number(weightage) || 100,
          evaluator_type:
            !aiEvaluationType || aiEvaluationType === 'none' ? null : aiEvaluationType,
          test_cases:
            testCaseViewMode === 'json' && testCasesJson.trim()
              ? (() => {
                  try {
                    return JSON.parse(testCasesJson);
                  } catch {
                    return testCasesJson;
                  }
                })()
              : testCases,
          rubric:
            rubricViewMode === 'json' && rubricJson.trim()
              ? (() => {
                  try {
                    return JSON.parse(rubricJson);
                  } catch {
                    return rubricJson;
                  }
                })()
              : rubrics,
          subject_title: availableCourses.find((c) => c.value === course)?.label || course,
        }}
      />
    </div>
  );
}
