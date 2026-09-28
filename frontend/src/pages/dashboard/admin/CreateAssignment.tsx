import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeft, Upload, Plus, Trash2, Loader2, FileText, X, ChevronDown } from 'lucide-react';
import RichTextEditor from '@/components/common/RichTextEditor';
import MarkdownEditor from '@/components/common/MarkdownEditor';
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
  const [availableCourses, setAvailableCourses] = useState<{value: string, label: string, slug: string}[]>([]);
  const [availableTopics, setAvailableTopics] = useState<{value: string, label: string}[]>([]);

  // ── Colleges & Evaluators from API ──
  const [colleges, setColleges] = useState<College[]>([]);
  const [evaluators, setEvaluators] = useState<{id: string; name: string}[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ── Instruction Document Upload ──
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [instructionUrl, setInstructionUrl] = useState(editData.instruction_file_url || '');
  const [instructionName, setInstructionName] = useState(editData.instruction_file_name || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Evaluation Setup ──
  const [assignmentDescription, setAssignmentDescription] = useState(editData.assignmentDescription || '');
  const [aiEvaluationType, setAiEvaluationType] = useState(editData.aiEvaluationType || '');
  const [weightage, setWeightage] = useState(editData.weightage || '100');
  const [enablePlagiarism, setEnablePlagiarism] = useState(editData.enablePlagiarism || false);

  // ── Rubrics ──
  const [rubrics, setRubrics] = useState<RubricItem[]>(editData.rubricsList || []);

  // ── Editor Type ──
  const [editorType, setEditorType] = useState<'rich' | 'markdown'>(editData.editorType || 'rich');

  // ── Test Cases ──
  const [testCases, setTestCases] = useState<{ id: number; input: string; output: string; score: number }[]>(editData.testCasesList || []);

  // ── Submission Settings ──
  const [allowGithubLink, setAllowGithubLink] = useState(editData.allowGithubLink ?? true);

  // ── Rubrics helpers ──
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

  // ── Test Cases helpers ──
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

  // ── Validation & Submit ──
  const handleCreate = async () => {
    const missing: string[] = [];

    if (!title.trim()) missing.push('Assignment Title');
    if (!course) missing.push('Course');
    if (editId ? !college : selectedColleges.length === 0) missing.push('College');
    if (!topicId) missing.push('Subject');
    if (!deadline) missing.push('Deadline');

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
          test_cases: testCases.map((t) => ({ input: t.input, output: t.output, score: t.score })),
          rubric: rubrics.map((r) => ({ name: r.criteria, score: r.maxScore })),
          evaluator_type: aiEvaluationType || null,
          assignment_description: assignmentDescription.trim() || null,
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
          test_cases: testCases.map((t) => ({ input: t.input, output: t.output, score: t.score })),
          rubric: rubrics.map((r) => ({ name: r.criteria, score: r.maxScore })),
          evaluator_type: aiEvaluationType || null,
          assignment_description: assignmentDescription.trim() || null,
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
          allowGithubLink,
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
        {/* ── Page Header ── */}
        <div className='flex items-center gap-3'>
          <button
            className='p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition min-h-[38px] min-w-[38px] flex items-center justify-center'
            onClick={() => navigate(`${basePath}/assignment-management`)}
          >
            <ArrowLeft className='w-5 h-5' />
          </button>
          <div className='min-w-0'>
            <h1 className='text-lg sm:text-xl font-bold text-slate-900 truncate'>Create Assignment</h1>
            <p className='text-xs sm:text-sm text-slate-500 truncate'>Set up a new assignment for a branch</p>
          </div>
        </div>

        {/* ================================================================
            SECTION 1 — Basic Information
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
                    value={colleges.find((c) => String(c.id) === college)?.name || college || 'Loading...'}
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
            SECTION 2 — Evaluation Setup
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
            SECTION 3 — Evaluation Rubrics / Test Cases
        ================================================================ */}
        {isCodeEvaluator ? (
          <Card className='border-none shadow-sm'>
            <CardHeader className='pb-2 px-4 sm:px-6 pt-4 sm:pt-6'>
              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
                <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Test Cases Builder</CardTitle>
                <div className='flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto'>
                  <span className='text-xs sm:text-sm text-slate-500'>
                    Total: <span className='font-semibold text-blue-600'>{totalTestCaseScore}</span> Points
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-1 text-xs sm:text-sm text-blue-600 border-blue-200 hover:bg-blue-50'
                    onClick={addTestCase}
                  >
                    <Plus className='w-3.5 h-3.5' /> Add Test Case
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className='space-y-3 px-4 sm:px-6 pb-4 sm:pb-6'>
              {testCases.map((tc) => (
                <div
                  key={tc.id}
                  className='flex flex-col sm:grid sm:grid-cols-[1fr_1fr_80px_40px] gap-2.5 sm:gap-3 items-stretch sm:items-center p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none border border-slate-100 sm:border-0'
                >
                  <div className='space-y-1'>
                    <Label className='text-[11px] sm:text-xs text-slate-400'>Input (Arguments)</Label>
                    <Input
                      value={tc.input}
                      onChange={(e) => updateTestCase(tc.id, 'input', e.target.value)}
                      className='text-xs sm:text-sm font-mono h-9 sm:h-10'
                      placeholder='e.g. 5, 10'
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-[11px] sm:text-xs text-slate-400'>Expected Output</Label>
                    <Input
                      value={tc.output}
                      onChange={(e) => updateTestCase(tc.id, 'output', e.target.value)}
                      className='text-xs sm:text-sm font-mono h-9 sm:h-10'
                      placeholder='e.g. 15'
                    />
                  </div>
                  <div className='flex items-center justify-between sm:block gap-2'>
                    <div className='space-y-1 flex-1 sm:w-auto'>
                      <Label className='text-[11px] sm:text-xs text-slate-400'>Score</Label>
                      <Input
                        type='number'
                        value={tc.score}
                        onChange={(e) => updateTestCase(tc.id, 'score', Number(e.target.value))}
                        className='text-xs sm:text-sm h-9 sm:h-10'
                      />
                    </div>
                    <div className='pt-5 sm:pt-5 shrink-0'>
                      <button
                        className='p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition'
                        onClick={() => removeTestCase(tc.id)}
                      >
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card className='border-none shadow-sm'>
            <CardHeader className='pb-2 px-4 sm:px-6 pt-4 sm:pt-6'>
              <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-2.5'>
                <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Evaluation Rubrics</CardTitle>
                <div className='flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto'>
                  <span className='text-xs sm:text-sm text-slate-500'>
                    Total: <span className='font-semibold text-blue-600'>{totalScore}</span> Points
                  </span>
                  <Button
                    variant='outline'
                    size='sm'
                    className='gap-1 text-xs sm:text-sm text-blue-600 border-blue-200 hover:bg-blue-50'
                    onClick={addRubric}
                  >
                    <Plus className='w-3.5 h-3.5' /> Add Criteria
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className='space-y-3 px-4 sm:px-6 pb-4 sm:pb-6'>
              {rubrics.map((rubric) => (
                <div
                  key={rubric.id}
                  className='flex flex-col sm:grid sm:grid-cols-[1fr_2fr_80px_40px] gap-2.5 sm:gap-3 items-stretch sm:items-center p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-xl sm:rounded-none border border-slate-100 sm:border-0'
                >
                  <div className='space-y-1'>
                    <Label className='text-[11px] sm:text-xs text-slate-400'>Criteria</Label>
                    <Input
                      value={rubric.criteria}
                      onChange={(e) => updateRubric(rubric.id, 'criteria', e.target.value)}
                      className='text-xs sm:text-sm h-9 sm:h-10'
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label className='text-[11px] sm:text-xs text-slate-400'>Description</Label>
                    <Input
                      value={rubric.description}
                      onChange={(e) => updateRubric(rubric.id, 'description', e.target.value)}
                      className='text-xs sm:text-sm h-9 sm:h-10'
                    />
                  </div>
                  <div className='flex items-center justify-between sm:block gap-2'>
                    <div className='space-y-1 flex-1 sm:w-auto'>
                      <Label className='text-[11px] sm:text-xs text-slate-400'>Max Score</Label>
                      <Input
                        type='number'
                        value={rubric.maxScore}
                        onChange={(e) => updateRubric(rubric.id, 'maxScore', Number(e.target.value))}
                        className='text-xs sm:text-sm h-9 sm:h-10'
                      />
                    </div>
                    <div className='pt-5 sm:pt-5 shrink-0'>
                      <button
                        className='p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition'
                        onClick={() => removeRubric(rubric.id)}
                      >
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ================================================================
            SECTION 4 — Submission Settings
        ================================================================ */}
        <Card className='border-none shadow-sm'>
          <CardHeader className='pb-2 px-4 sm:px-6 pt-4 sm:pt-6'>
            <CardTitle className='text-sm sm:text-base font-semibold text-slate-900'>Submission Settings</CardTitle>
          </CardHeader>

          <CardContent className='space-y-1 px-4 sm:px-6 pb-4 sm:pb-6'>
            {/* Allow GitHub Link */}
            <div className='flex items-center justify-between py-2.5 sm:py-3 gap-3'>
              <div className='min-w-0 flex-1'>
                <p className='text-xs sm:text-sm font-medium text-slate-900'>Allow GitHub Link</p>
                <p className='text-[10px] sm:text-xs text-slate-500'>Students can submit a GitHub repository URL</p>
              </div>
              <Switch checked={allowGithubLink} onCheckedChange={setAllowGithubLink} />
            </div>
          </CardContent>
        </Card>

        {/* ── Footer Actions ── */}
        <div className='flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pb-8'>
          <Button
            variant='outline'
            className='w-full sm:w-auto px-6 min-h-[40px] text-xs sm:text-sm'
            onClick={() => navigate(`${basePath}/assignment-management`)}
          >
            Cancel
          </Button>
          <Button
            className='w-full sm:w-auto px-6 bg-blue-600 hover:bg-blue-700 min-h-[40px] text-xs sm:text-sm'
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting && <Loader2 className='w-4 h-4 mr-2 animate-spin' />}
            {submitting ? (editId ? 'Updating...' : 'Creating...') : (editId ? 'Update Assignment' : 'Create Assignment')}
          </Button>
        </div>
      </div>
    </div>
  );
}
