import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  ArrowLeft,
  Upload,
  Loader2,
  FileText,
  X,
  ChevronDown,
  Wand2,
  Eye,
  Terminal,
  ListChecks,
} from 'lucide-react';
import RichTextEditor from '@/components/common/RichTextEditor';
import MarkdownEditor from '@/components/common/MarkdownEditor';
import AdminAssignmentPreviewModal from '@/components/common/admin/AdminAssignmentPreviewModal';
import toast from 'react-hot-toast';
import apiClient from '@/services/api';
import { getErrorMessage } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
   Encoding & JSON Helpers
====================== */

const utf8_to_b64 = (str: string) => {
  return window.btoa(unescape(encodeURIComponent(str)));
};

const b64_to_utf8 = (str: string) => {
  return decodeURIComponent(escape(window.atob(str)));
};

const getInitialTestCases = (testCasesData: any) => {
  if (!testCasesData) return '';
  let obj = testCasesData;
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return obj;
    }
  }
  if (obj && obj.specFile) {
    try {
      return b64_to_utf8(obj.specFile);
    } catch {
      return JSON.stringify(obj, null, 2);
    }
  }
  return typeof obj === 'object' ? JSON.stringify(obj, null, 2) : obj;
};

const getInitialRubric = (rubricData: any) => {
  if (!rubricData) return '';
  if (typeof rubricData === 'string') {
    try {
      const parsed = JSON.parse(rubricData);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return rubricData;
    }
  }
  return typeof rubricData === 'object' ? JSON.stringify(rubricData, null, 2) : rubricData;
};

/* ======================
   Types
====================== */

interface College {
  id: string;
  name: string;
}

const DEFAULT_EVALUATORS = [
  { id: 'JS', name: 'JS Evaluator' },
  { id: 'VISUAL', name: 'Visual / DOM Evaluator' },
  { id: 'PYTHON', name: 'Python Evaluator' },
  { id: 'REACT', name: 'React Evaluator' },
  { id: 'FULLSTACK', name: 'Full Stack Evaluator' },
  { id: 'AI', name: 'Backend API Evaluator' },
];

/* ======================
   Component
====================== */

export default function CreateAssignment() {
  const navigate = useNavigate();
  const location = useLocation();
  const editData = (location.state as any) || {};

  const dashboardType = location.pathname.includes('/dashboard/admin') ? 'admin' : 'facilitator';
  const basePath = `/dashboard/${dashboardType}`;

  // ── Basic Information ──
  const editId = editData.editId || null;
  const [title, setTitle] = useState(editData.title || '');
  const [description, setDescription] = useState(editData.description || '');
  const [course, setCourse] = useState(editData.course || '');
  const [college] = useState(editData.collegeId || '');
  const [selectedColleges, setSelectedColleges] = useState<string[]>(
    editData.collegeId ? [editData.collegeId] : []
  );
  const [topicId, setTopicId] = useState(editData.topicId || editData.domain || '');
  const [deadline, setDeadline] = useState(editData.deadline || '');

  // Dynamic subjects (courses) and topics
  const [availableCourses, setAvailableCourses] = useState<{ value: string; label: string; slug: string }[]>([]);
  const [availableTopics, setAvailableTopics] = useState<{ value: string; label: string }[]>([]);

  // ── Colleges & Evaluators from API ──
  const [colleges, setColleges] = useState<College[]>([]);
  const [evaluatorsList, setEvaluatorsList] = useState<{ id: string; name: string }[]>(DEFAULT_EVALUATORS);
  const [submitting, setSubmitting] = useState(false);

  // ── Instruction Document Upload ──
  const [instructionUrl, setInstructionUrl] = useState(editData.instruction_file_url || '');
  const [instructionName, setInstructionName] = useState(editData.instruction_file_name || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Evaluation Setup ──
  const [assignmentDescription, setAssignmentDescription] = useState(
    editData.assignmentDescription || editData.assignment_description || ''
  );
  const [aiEvaluationType, setAiEvaluationType] = useState(
    editData.aiEvaluationType || editData.evaluator_type || ''
  );
  const [weightage, setWeightage] = useState(editData.weightage || '100');
  const [enablePlagiarism, setEnablePlagiarism] = useState(editData.enablePlagiarism || false);

  // ── Editor Type ──
  const [editorType, setEditorType] = useState<'rich' | 'markdown'>(editData.editorType || 'rich');

  // ── Test Cases & Rubrics (JSON / Spec Text) ──
  const [testCases, setTestCases] = useState<string>(
    getInitialTestCases(editData.test_cases || editData.testCasesList)
  );
  const [rubric, setRubric] = useState<string>(
    getInitialRubric(editData.rubric || editData.rubricsList)
  );
  const [generatingTestCases, setGeneratingTestCases] = useState(false);
  const [generatingRubric, setGeneratingRubric] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // ── Submission Settings ──
  const [allowGithubLink, setAllowGithubLink] = useState(editData.allowGithubLink ?? true);

  // Upload handler
  const handleFileUpload = async (file: File) => {
    const allowed = ['.pdf', '.docx', '.txt', '.doc'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowed.includes(ext)) {
      toast.error('Only PDF, DOCX, and TXT files are supported');
      return;
    }

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
    } finally {
      setUploading(false);
    }
  };

  // Initial Data Fetching
  useEffect(() => {
    apiClient
      .get<{ data: College[] }>('/facilitator/colleges')
      .then((res) => setColleges(res.data.data || (res.data as any) || []))
      .catch((error) => toast.error(getErrorMessage(error, 'Failed to load colleges')));

    apiClient
      .get<{ data: { id: string; name: string }[] }>('/evaluations/evaluators')
      .then((res) => {
        const fetched = res.data.data || (res.data as any) || [];
        if (Array.isArray(fetched) && fetched.length > 0) {
          const map = new Map<string, string>();
          DEFAULT_EVALUATORS.forEach((ev) => map.set(ev.id, ev.name));
          fetched.forEach((ev: any) => map.set(ev.id, ev.name || ev.id));
          setEvaluatorsList(Array.from(map.entries()).map(([id, name]) => ({ id, name })));
        }
      })
      .catch((error) => console.warn('Could not load evaluators:', error));

    apiClient
      .get<{ data: any[] }>('/college-assignments/courses')
      .then((res) => setAvailableCourses(res.data.data || []))
      .catch((error) => console.error('Failed to load courses', error));
  }, []);

  // Fetch Topics on Course Change
  useEffect(() => {
    if (!course) {
      setAvailableTopics([]);
      return;
    }
    apiClient
      .get<{ data: any[] }>(`/college-assignments/courses/${course}/topics`)
      .then((res) => setAvailableTopics(res.data.data || []))
      .catch((error) => console.error('Failed to load topics', error));
  }, [course]);

  // If editId is provided and details are missing, fetch complete assignment
  useEffect(() => {
    if (!editId) return;
    apiClient
      .get<{ success: boolean; data: any }>(`/college-assignments/${editId}`)
      .then((res) => {
        const d = res.data?.data;
        if (!d) return;
        if (d.title && !title) setTitle(d.title);
        if (d.description && !description) setDescription(d.description);
        if (d.assignment_description && !assignmentDescription) {
          setAssignmentDescription(d.assignment_description);
        }
        if (d.course && !course) setCourse(d.course);
        if (d.due_date && !deadline) {
          setDeadline(d.due_date ? d.due_date.substring(0, 16) : '');
        }
        if (d.instruction_file_url && !instructionUrl) {
          setInstructionUrl(d.instruction_file_url);
          setInstructionName(d.instruction_file_name || 'Instruction Document');
        }
        if (d.evaluator_type && !aiEvaluationType) {
          setAiEvaluationType(d.evaluator_type);
        }
        if (d.test_cases && !testCases) {
          setTestCases(getInitialTestCases(d.test_cases));
        }
        if (d.rubric && !rubric) {
          setRubric(getInitialRubric(d.rubric));
        }
      })
      .catch((err) => {
        console.warn('Could not load full assignment details:', err);
      });
  }, [editId]);

  // ── Auto-Generate Test Cases ──
  const handleGenerateTestCases = async () => {
    const rawInstructions = assignmentDescription.trim() || description.trim();
    if (!title.trim() || !rawInstructions) {
      toast.error('Assignment Title and Instructions are required to generate test cases.');
      return;
    }
    setGeneratingTestCases(true);
    try {
      let parsedRubric = null;
      if (rubric.trim()) {
        try {
          parsedRubric = JSON.parse(rubric);
        } catch {
          // ignore parsing error for prompt rubric
        }
      }

      const res = await apiClient.post<{ success: boolean; testCases: string }>(
        '/evaluations/generate-test-cases',
        {
          title: title.trim(),
          instructions: rawInstructions,
          evaluatorType: aiEvaluationType === 'none' ? '' : aiEvaluationType,
          rubric: parsedRubric,
        }
      );
      if (res.data?.success && res.data.testCases) {
        setTestCases(res.data.testCases);
        toast.success('Test cases generated successfully!');
      } else {
        toast.error('No test cases returned from generator.');
      }
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Failed to generate test cases'));
    } finally {
      setGeneratingTestCases(false);
    }
  };

  // ── Auto-Generate Rubric ──
  const handleGenerateRubric = async () => {
    const rawInstructions = assignmentDescription.trim() || description.trim();
    if (!title.trim() || !rawInstructions) {
      toast.error('Assignment Title and Instructions are required to generate a rubric.');
      return;
    }
    setGeneratingRubric(true);
    try {
      const res = await apiClient.post<{ success: boolean; rubric: string }>(
        '/evaluations/generate-rubric',
        {
          title: title.trim(),
          instructions: rawInstructions,
          evaluatorType: aiEvaluationType === 'none' ? '' : aiEvaluationType,
        }
      );
      if (res.data?.success && res.data.rubric) {
        setRubric(res.data.rubric);
        toast.success('Rubric generated successfully!');
      } else {
        toast.error('No rubric returned from generator.');
      }
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'Failed to generate rubric'));
    } finally {
      setGeneratingRubric(false);
    }
  };

  // ── Validation & Submit ──
  const handleCreate = async () => {
    const missing: string[] = [];

    if (!title.trim()) missing.push('Assignment Title');
    if (!course) missing.push('Course');
    if (editId ? !college : selectedColleges.length === 0) missing.push('College');
    if (!topicId) missing.push('Subject');
    if (!deadline) missing.push('Deadline');

    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.join(', ')}`, {
        duration: 4000,
        style: { maxWidth: 480 },
      });
      return;
    }

    // Format & validate test cases
    let finalTestCases = testCases.trim();
    const upperType = (aiEvaluationType || '').toUpperCase();
    if (
      upperType === 'REACT' ||
      upperType === 'AI' ||
      upperType === 'FULLSTACK' ||
      upperType === 'BACKEND'
    ) {
      const isJs = !finalTestCases.startsWith('{') && !finalTestCases.startsWith('[');
      if (isJs && finalTestCases) {
        try {
          const specFileB64 = utf8_to_b64(finalTestCases);
          finalTestCases = JSON.stringify({ specFile: specFileB64, testCases: [] }, null, 2);
        } catch (e) {
          toast.error('Failed to encode test spec file');
          return;
        }
      }
    }

    if (finalTestCases) {
      try {
        JSON.parse(finalTestCases);
      } catch (e) {
        toast.error('Test Cases must be valid JSON or JavaScript Spec');
        return;
      }
    }

    if (rubric.trim()) {
      try {
        JSON.parse(rubric);
      } catch (e) {
        toast.error('Rubric must be valid JSON');
        return;
      }
    }

    setSubmitting(true);
    try {
      let resId = editId;
      const effectiveEvaluator =
        !aiEvaluationType || aiEvaluationType === 'none' ? null : aiEvaluationType;

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        due_date: deadline || null,
        course: course || null,
        topic_id: topicId || null,
        instruction_file_url: instructionUrl || null,
        instruction_file_name: instructionName || null,
        test_cases: finalTestCases || null,
        rubric: rubric.trim() || null,
        evaluator_type: effectiveEvaluator,
        assignment_description: assignmentDescription.trim() || null,
      };

      if (editId) {
        await apiClient.put(`/college-assignments/${editId}`, payload);
        toast.success('Assignment updated successfully!');
      } else {
        const res = await apiClient.post('/college-assignments', {
          ...payload,
          college_ids: selectedColleges,
        });
        resId = res.data.data.id;
        toast.success('Assignment created successfully!');
      }

      // Calculate total marks for success page
      let parsedRubricsArray: any[] = [];
      try {
        if (rubric.trim()) parsedRubricsArray = JSON.parse(rubric);
      } catch {}

      const totalCalculatedMarks = Array.isArray(parsedRubricsArray)
        ? parsedRubricsArray.reduce(
            (sum, r) => sum + (Number(r.weight) || Number(r.score) || Number(r.maxScore) || 0),
            0
          )
        : Number(weightage) || 100;

      navigate(`${basePath}/assignment-success`, {
        state: {
          editId: resId,
          title,
          description,
          course: availableCourses.find((c) => c.value === course)?.label || course,
          college: editId
            ? colleges.find((c) => String(c.id) === college)?.name || college
            : selectedColleges.length === colleges.length
              ? 'All Colleges'
              : selectedColleges
                  .map((id) => colleges.find((c) => String(c.id) === id)?.name)
                  .filter(Boolean)
                  .join(', '),
          collegeId: editId ? college : selectedColleges[0],
          topicId: availableTopics.find((t) => t.value === topicId)?.label || topicId,
          deadline,
          assignmentDescription,
          aiEvaluationType: effectiveEvaluator,
          weightage,
          enablePlagiarism,
          allowGithubLink,
          totalMarks: totalCalculatedMarks || Number(weightage) || 100,
          rubrics: Array.isArray(parsedRubricsArray)
            ? parsedRubricsArray.map((r) => ({
                name: r.name || r.criteria,
                score: r.weight || r.score || r.maxScore || 0,
              }))
            : [],
          test_cases: finalTestCases,
          rubric: rubric.trim(),
        },
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create assignment'));
    } finally {
      setSubmitting(false);
    }
  };

  // Parse preview data
  let previewTestCasesObj = null;
  if (testCases.trim()) {
    try {
      previewTestCasesObj = JSON.parse(testCases.trim());
    } catch {
      previewTestCasesObj = testCases.trim();
    }
  }

  let previewRubricObj = null;
  if (rubric.trim()) {
    try {
      previewRubricObj = JSON.parse(rubric.trim());
    } catch {
      previewRubricObj = null;
    }
  }

  /* ======================
     Render
  ====================== */

  return (
    <div className='min-h-screen bg-slate-50/60'>
      <div className='max-w-3xl mx-auto px-3.5 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6 animate-in fade-in duration-500 min-w-0'>
        {/* ── Page Header ── */}
        <div className='flex items-center gap-3'>
          <button
            className='p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition min-h-[38px] min-w-[38px] flex items-center justify-center'
            onClick={() => navigate(`${basePath}/assignment-management`)}
          >
            <ArrowLeft className='w-5 h-5' />
          </button>
          <div className='min-w-0'>
            <h1 className='text-lg sm:text-xl font-bold text-slate-900 truncate'>
              {editId ? 'Edit Assignment' : 'Create Assignment'}
            </h1>
            <p className='text-xs sm:text-sm text-slate-500 truncate'>
              Set up automated evaluations, test cases, and rubrics for college students
            </p>
          </div>
        </div>

        {/* ================================================================
            SECTION 1 — Basic Information
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-3 px-4 sm:px-6 pt-4 sm:pt-6'>
            <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3.5 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6'>
            {/* Assignment Title */}
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm text-slate-600'>
                Assignment Title <span className='text-red-500'>*</span>
              </Label>
              <Input
                placeholder='e.g., Array Manipulation with Methods'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className='text-xs sm:text-sm h-10'
              />
            </div>

            {/* Course & College Row */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
              {/* Course (Subject) */}
              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>
                  Course <span className='text-red-500'>*</span>
                </Label>
                <Select value={course} onValueChange={setCourse}>
                  <SelectTrigger className='w-full text-xs sm:text-sm h-10'>
                    <SelectValue placeholder='Select Course' />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCourses?.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* College Dropdown (Multi-select) */}
              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>
                  Target Colleges <span className='text-red-500'>*</span>
                </Label>
                {editId ? (
                  <Input
                    disabled
                    value={colleges.find((c) => String(c.id) === college)?.name || college || 'Assigned College'}
                    className='text-xs sm:text-sm h-10 bg-slate-50'
                  />
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type='button'
                        className='w-full flex items-center justify-between text-xs sm:text-sm h-10 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition outline-none'
                      >
                        <span className='truncate'>
                          {selectedColleges.length === 0
                            ? 'Select Colleges'
                            : selectedColleges.length === colleges.length
                              ? 'All Colleges'
                              : `${selectedColleges.length} Colleges selected`}
                        </span>
                        <ChevronDown className='w-4 h-4 text-slate-400 shrink-0' />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className='w-72 max-h-60 overflow-y-auto p-1'>
                      <DropdownMenuItem
                        className='flex items-center gap-2 cursor-pointer text-xs font-semibold'
                        onSelect={(e) => {
                          e.preventDefault();
                          if (selectedColleges.length === colleges.length) {
                            setSelectedColleges([]);
                          } else {
                            setSelectedColleges(colleges.map((c) => String(c.id)));
                          }
                        }}
                      >
                        <Checkbox
                          checked={colleges.length > 0 && selectedColleges.length === colleges.length}
                          className='pointer-events-none'
                        />
                        Select All
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {colleges.map((col) => {
                        const colId = String(col.id);
                        const isChecked = selectedColleges.includes(colId);
                        return (
                          <DropdownMenuItem
                            key={colId}
                            className='flex items-center gap-2 cursor-pointer text-xs'
                            onSelect={(e) => {
                              e.preventDefault();
                              if (isChecked) {
                                setSelectedColleges(selectedColleges.filter((id) => id !== colId));
                              } else {
                                setSelectedColleges([...selectedColleges, colId]);
                              }
                            }}
                          >
                            <Checkbox checked={isChecked} className='pointer-events-none' />
                            <span className='truncate'>{col.name}</span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Subject (Topic) & Deadline Row */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>
                  Subject (Topic) <span className='text-red-500'>*</span>
                </Label>
                <Select value={topicId} onValueChange={setTopicId} disabled={!course}>
                  <SelectTrigger className='w-full text-xs sm:text-sm h-10'>
                    <SelectValue placeholder={course ? 'Select Topic' : 'Select a course first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTopics?.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>
                  Deadline <span className='text-red-500'>*</span>
                </Label>
                <Input
                  type='datetime-local'
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className='text-xs sm:text-sm h-10'
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ================================================================
            SECTION 2 — Evaluation & Instructions Setup
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-3 px-4 sm:px-6 pt-4 sm:pt-6'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>
                Instructions & Evaluator Configuration
              </CardTitle>
              {/* Editor Switcher */}
              <div className='flex items-center gap-1 border border-slate-200 rounded-md p-0.5 bg-slate-50'>
                <button
                  type='button'
                  onClick={() => setEditorType('rich')}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    editorType === 'rich'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Rich Text
                </button>
                <button
                  type='button'
                  onClick={() => setEditorType('markdown')}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                    editorType === 'markdown'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Markdown
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4 px-4 sm:px-6 pb-4 sm:pb-6'>
            {/* Instruction Document Upload */}
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm text-slate-600'>
                Instruction Document (Optional)
              </Label>
              <input
                ref={fileInputRef}
                type='file'
                accept='.pdf,.docx,.txt,.doc'
                className='hidden'
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                }}
              />

              {instructionUrl ? (
                <div className='flex items-center justify-between p-3 bg-blue-50/60 rounded-xl border border-blue-200'>
                  <div className='flex items-center gap-2.5 min-w-0'>
                    <FileText className='w-5 h-5 text-blue-600 shrink-0' />
                    <div className='min-w-0'>
                      <p className='text-xs sm:text-sm font-medium text-slate-800 truncate'>
                        {instructionName || 'Instruction Document'}
                      </p>
                      <a
                        href={instructionUrl}
                        target='_blank'
                        rel='noreferrer'
                        className='text-[11px] text-blue-600 hover:underline'
                      >
                        View uploaded file
                      </a>
                    </div>
                  </div>
                  <button
                    className='p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-white transition shrink-0'
                    onClick={() => {
                      setInstructionUrl('');
                      setInstructionName('');
                    }}
                  >
                    <X className='w-4 h-4' />
                  </button>
                </div>
              ) : uploading ? (
                <div className='border-2 border-dashed border-slate-200 rounded-xl p-5 text-center'>
                  <Loader2 className='w-6 h-6 text-blue-600 mx-auto animate-spin mb-1' />
                  <p className='text-xs text-slate-500'>Uploading document...</p>
                </div>
              ) : (
                <div
                  className='border-2 border-dashed border-slate-200 rounded-xl p-5 sm:p-6 text-center hover:border-blue-400 transition cursor-pointer bg-slate-50/40'
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                >
                  <Upload className='w-6 h-6 text-slate-400 mx-auto mb-1.5' />
                  <p className='text-xs sm:text-sm text-slate-600 font-medium'>
                    Drag & drop instruction document or click to browse
                  </p>
                  <p className='text-[10px] sm:text-xs text-slate-400 mt-0.5'>Supports PDF, DOCX, TXT</p>
                </div>
              )}
            </div>

            {/* Assignment Description / Instructions */}
            <div className='space-y-1.5'>
              <Label className='text-xs sm:text-sm text-slate-600'>
                Assignment Description & Instructions <span className='text-red-500'>*</span>
              </Label>
              {editorType === 'rich' ? (
                <RichTextEditor
                  minHeight='120px'
                  placeholder='Detailed instructions, expected behavior, requirements, and examples for students...'
                  value={assignmentDescription}
                  onChange={setAssignmentDescription}
                />
              ) : (
                <MarkdownEditor
                  minHeight='120px'
                  placeholder='Detailed instructions, expected behavior, requirements, and examples for students...'
                  value={assignmentDescription}
                  onChange={setAssignmentDescription}
                />
              )}
            </div>

            {/* Evaluator Type & Weightage */}
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>
                  Evaluator Type (Auto-Grading)
                </Label>
                <Select
                  value={aiEvaluationType || 'none'}
                  onValueChange={(val) => setAiEvaluationType(val === 'none' ? '' : val)}
                >
                  <SelectTrigger className='w-full text-xs sm:text-sm h-10 bg-white'>
                    <SelectValue placeholder='Select Evaluator' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='none'>None (Manual Grading)</SelectItem>
                    {evaluatorsList.map((ev) => (
                      <SelectItem key={ev.id} value={ev.id}>
                        {ev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label className='text-xs sm:text-sm text-slate-600'>Weightage / Maximum Score</Label>
                <Input
                  type='number'
                  placeholder='100'
                  value={weightage}
                  onChange={(e) => setWeightage(e.target.value)}
                  className='text-xs sm:text-sm h-10'
                  min='1'
                />
              </div>
            </div>

            {/* Plagiarism Check Toggle */}
            <div className='flex items-center justify-between py-2 gap-3 border-t border-slate-100 pt-3'>
              <div className='min-w-0 flex-1'>
                <p className='text-xs sm:text-sm font-medium text-slate-900'>Enable Plagiarism Check</p>
                <p className='text-[10px] sm:text-xs text-slate-500'>
                  AI will cross-check submissions for code and text similarity
                </p>
              </div>
              <Switch checked={enablePlagiarism} onCheckedChange={setEnablePlagiarism} />
            </div>
          </CardContent>
        </Card>

        {/* ================================================================
            SECTION 3 — Test Cases Configuration (JSON / Spec)
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-3 px-4 sm:px-6 pt-4 sm:pt-6'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
              <div className='flex items-center gap-2'>
                <div className='w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600'>
                  <Terminal className='w-4 h-4' />
                </div>
                <div>
                  <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>
                    Test Cases (JSON / Spec)
                  </CardTitle>
                  <CardDescription className='text-xs text-slate-500'>
                    Automated testing rules matching your selected evaluator
                  </CardDescription>
                </div>
              </div>

              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleGenerateTestCases}
                disabled={generatingTestCases || !aiEvaluationType || aiEvaluationType === 'none'}
                className='h-8 text-xs font-semibold bg-indigo-50/80 text-indigo-600 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-700 shadow-xs'
              >
                {generatingTestCases ? (
                  <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Wand2 className='mr-1.5 h-3.5 w-3.5 text-indigo-500' />
                )}
                ✨ Auto-Generate Test Cases
              </Button>
            </div>
          </CardHeader>

          <CardContent className='space-y-2 px-4 sm:px-6 pb-4 sm:pb-6'>
            <textarea
              value={testCases}
              onChange={(e) => setTestCases(e.target.value)}
              placeholder={`{\n  "evaluationMode": "script",\n  "expectedLogs": ["Hello World"]\n}`}
              rows={7}
              className='w-full rounded-xl border border-slate-200 p-3.5 font-mono text-xs sm:text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition'
            />
            <p className='text-[11px] text-slate-400'>
              Note: For React, Fullstack, or Backend assignments, you can also paste JavaScript test
              spec files directly. It will be packaged automatically upon save.
            </p>
          </CardContent>
        </Card>

        {/* ================================================================
            SECTION 4 — Evaluation Rubrics Configuration (JSON)
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-3 px-4 sm:px-6 pt-4 sm:pt-6'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
              <div className='flex items-center gap-2'>
                <div className='w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600'>
                  <ListChecks className='w-4 h-4' />
                </div>
                <div>
                  <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>
                    Evaluation Rubrics (JSON)
                  </CardTitle>
                  <CardDescription className='text-xs text-slate-500'>
                    Weighted grading criteria for AI or manual grading
                  </CardDescription>
                </div>
              </div>

              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleGenerateRubric}
                disabled={generatingRubric || !aiEvaluationType || aiEvaluationType === 'none'}
                className='h-8 text-xs font-semibold bg-emerald-50/80 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-800 shadow-xs'
              >
                {generatingRubric ? (
                  <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Wand2 className='mr-1.5 h-3.5 w-3.5 text-emerald-600' />
                )}
                ✨ Auto-Generate Rubric
              </Button>
            </div>
          </CardHeader>

          <CardContent className='space-y-2 px-4 sm:px-6 pb-4 sm:pb-6'>
            <textarea
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              placeholder={`[\n  {\n    "name": "Code Correctness",\n    "description": "Fulfills primary requirements and handles edge cases.",\n    "weight": 50\n  }\n]`}
              rows={7}
              className='w-full rounded-xl border border-slate-200 p-3.5 font-mono text-xs sm:text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition'
            />
            <p className='text-[11px] text-slate-400'>
              The sum of criteria weights should equal 100 for percentage-based grading.
            </p>
          </CardContent>
        </Card>

        {/* ================================================================
            SECTION 5 — Submission Settings
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-2 px-4 sm:px-6 pt-4 sm:pt-6'>
            <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>
              Submission Settings
            </CardTitle>
          </CardHeader>

          <CardContent className='space-y-1 px-4 sm:px-6 pb-4 sm:pb-6'>
            <div className='flex items-center justify-between py-2.5 sm:py-3 gap-3'>
              <div className='min-w-0 flex-1'>
                <p className='text-xs sm:text-sm font-medium text-slate-900'>Allow GitHub Link</p>
                <p className='text-[10px] sm:text-xs text-slate-500'>
                  Students can submit a GitHub repository URL or commit
                </p>
              </div>
              <Switch checked={allowGithubLink} onCheckedChange={setAllowGithubLink} />
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
              type='button'
              variant='outline'
              className='flex-1 sm:flex-none px-6 h-10 text-xs sm:text-sm'
              onClick={() => navigate(`${basePath}/assignment-management`)}
            >
              Cancel
            </Button>
            <Button
              type='button'
              className='flex-1 sm:flex-none px-6 bg-blue-600 hover:bg-blue-700 h-10 text-xs sm:text-sm shadow-xs font-semibold'
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting && <Loader2 className='w-4 h-4 mr-2 animate-spin' />}
              {submitting
                ? editId
                  ? 'Updating...'
                  : 'Creating...'
                : editId
                  ? 'Update Assignment'
                  : 'Create Assignment'}
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
          test_cases: previewTestCasesObj,
          rubric: previewRubricObj,
          subject_title: availableCourses.find((c) => c.value === course)?.label || course,
        }}
      />
    </div>
  );
}
