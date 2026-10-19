import { Button } from '@/components/ui/button';
import { Save, X, Wand2, Loader2, Eye, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import RichTextEditor from '@/components/common/RichTextEditor';
import MarkdownEditor from '@/components/common/MarkdownEditor';
import toast from 'react-hot-toast';
import AdminAssignmentPreviewModal from '@/components/common/admin/AdminAssignmentPreviewModal';
import type { SubmissionType } from '@/utils/types';

interface AssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    instructions: string;
    max_score: number;
    evaluator_type?: string | null;
    test_cases?: string | null;
    rubric?: string | null;
    allowed_submission_types?: SubmissionType[];
  }) => void;
  editData?: {
    title: string;
    instructions?: string;
    max_score: number;
    evaluator_type?: string | null;
    test_cases?: any;
    rubric?: any;
    allowed_submission_types?: SubmissionType[];
  };
  unitTitle: string;
  loading?: boolean;
}

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

const AssignmentModal: React.FC<AssignmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editData,
  unitTitle,
  loading = false,
}) => {
  const [title, setTitle] = useState(editData?.title ?? '');
  const [instructions, setInstructions] = useState(editData?.instructions ?? '');
  const [maxScore, setMaxScore] = useState(editData?.max_score ?? 100);
  const [evaluatorType, setEvaluatorType] = useState<string>(editData?.evaluator_type || '');
  const [testCases, setTestCases] = useState<string>(
    editData?.test_cases ? getInitialTestCases(editData.test_cases) : ''
  );
  const [rubric, setRubric] = useState<string>(
    editData?.rubric ? (typeof editData.rubric === 'string' ? editData.rubric : JSON.stringify(editData.rubric, null, 2)) : ''
  );
  const [editorType, setEditorType] = useState<'rich' | 'markdown'>('rich');
  const [generating, setGenerating] = useState(false);
  const [generatingRubric, setGeneratingRubric] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [allowedSubmissionTypes, setAllowedSubmissionTypes] = useState<SubmissionType[]>(
    editData?.allowed_submission_types && editData.allowed_submission_types.length > 0
      ? editData.allowed_submission_types
      : ['file', 'github', 'docs', 'figma', 'excel', 'url']
  );

  useEffect(() => {
    if (isOpen) {
      setTitle(editData?.title ?? '');
      setInstructions(editData?.instructions ?? '');
      setMaxScore(editData?.max_score ?? 100);
      setEvaluatorType(editData?.evaluator_type || '');
      setTestCases(editData?.test_cases ? getInitialTestCases(editData.test_cases) : '');
      setRubric(editData?.rubric ? (typeof editData.rubric === 'string' ? editData.rubric : JSON.stringify(editData.rubric, null, 2)) : '');
      setAllowedSubmissionTypes(
        editData?.allowed_submission_types && editData.allowed_submission_types.length > 0
          ? editData.allowed_submission_types
          : ['file', 'github', 'docs', 'figma', 'excel', 'url']
      );
    }
  }, [isOpen, editData]);

  const toggleSubmissionType = (typeId: SubmissionType) => {
    if (allowedSubmissionTypes.includes(typeId)) {
      if (allowedSubmissionTypes.length <= 1) {
        toast.error('At least one submission method must remain enabled');
        return;
      }
      setAllowedSubmissionTypes(allowedSubmissionTypes.filter((t) => t !== typeId));
    } else {
      setAllowedSubmissionTypes([...allowedSubmissionTypes, typeId]);
    }
  };

  const selectAllSubmissionTypes = () => {
    setAllowedSubmissionTypes(['file', 'github', 'docs', 'figma', 'excel', 'url']);
  };

  const handleGenerateTestCases = async () => {
    if (!title.trim() || !instructions.trim()) {
      toast.error('Title and Instructions are required to generate test cases.');
      return;
    }
    setGenerating(true);
    try {
      // @ts-ignore
      const { default: apiClient } = await import('@/services/api');
      const res = await apiClient.post('/evaluations/generate-test-cases', {
        title,
        instructions,
        evaluatorType
      });
      if (res.data.success && res.data.testCases) {
        setTestCases(res.data.testCases);
        toast.success('Test cases generated successfully!');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to generate test cases');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateRubric = async () => {
    if (!title.trim() || !instructions.trim()) {
      toast.error('Title and Instructions are required to generate a rubric.');
      return;
    }
    setGeneratingRubric(true);
    try {
      // @ts-ignore
      const { default: apiClient } = await import('@/services/api');
      const res = await apiClient.post('/evaluations/generate-rubric', {
        title,
        instructions,
        evaluatorType
      });
      if (res.data.success && res.data.rubric) {
        setRubric(res.data.rubric);
        toast.success('Rubric generated successfully!');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to generate rubric');
    } finally {
      setGeneratingRubric(false);
    }
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Assignment title is required');
      return;
    }
    if (maxScore <= 0) {
      toast.error('Max score must be greater than 0');
      return;
    }

    let finalTestCases = testCases.trim();
    const upperType = (evaluatorType || '').toUpperCase();
    if (upperType === 'REACT' || upperType === 'AI' || upperType === 'FULLSTACK' || upperType === 'BACKEND') {
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
    if (allowedSubmissionTypes.length === 0) {
      toast.error('Please allow at least one submission method');
      return;
    }
    onSave({
      title: title.trim(),
      instructions: instructions.trim(),
      max_score: maxScore,
      evaluator_type: evaluatorType || null,
      test_cases: finalTestCases || null,
      rubric: rubric.trim() || null,
      allowed_submission_types: allowedSubmissionTypes,
    });
    setTitle('');
    setInstructions('');
    setMaxScore(100);
    setEvaluatorType('');
    setTestCases('');
    setRubric('');
    setAllowedSubmissionTypes(['file', 'github', 'docs', 'figma', 'excel', 'url']);
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-xs'>
      <div className='flex max-h-[90vh] w-[94vw] sm:max-w-2xl flex-col rounded-2xl bg-white shadow-xl overflow-hidden'>
        <div className='flex items-center justify-between p-4 sm:p-6 pb-3 sm:pb-4 border-b border-slate-100'>
          <div>
            <h3 className='text-lg font-bold text-slate-900'>
              {editData ? 'Edit Assignment' : 'Create Assignment'}
            </h3>
            <p className='text-sm text-slate-500'>Unit: {unitTitle}</p>
          </div>
          <button
            onClick={onClose}
            className='text-slate-400 hover:text-slate-600'
          >
            <X className='h-5 w-5' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto px-6'>
        <div className='space-y-4'>
          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Assignment Title
            </label>
            <input
              type='text'
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g., Build a REST API'
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
          </div>

          <div>
            <div className='mb-2 flex items-center justify-between'>
              <label className='text-sm font-medium text-slate-700'>Instructions</label>
              <div className='flex items-center gap-1 border border-slate-200 rounded-md p-0.5 bg-slate-50'>
                <button
                  type='button'
                  onClick={() => setEditorType('rich')}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${editorType === 'rich' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Rich Text
                </button>
                <button
                  type='button'
                  onClick={() => setEditorType('markdown')}
                  className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${editorType === 'markdown' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Markdown
                </button>
              </div>
            </div>
            {editorType === 'rich' ? (
              <RichTextEditor
                value={instructions}
                onChange={setInstructions}
                placeholder='Detailed instructions for the assignment...'
                minHeight='140px'
              />
            ) : (
              <MarkdownEditor
                value={instructions}
                onChange={setInstructions}
                placeholder='Detailed instructions for the assignment...'
                minHeight='140px'
              />
            )}
          </div>
          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Maximum Score
            </label>
            <input
              type='number'
              value={maxScore}
              onChange={(e) => setMaxScore(parseInt(e.target.value) || 0)}
              placeholder='100'
              min='1'
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
          </div>

          <div>
            <label className='mb-2 block text-sm font-medium text-slate-700'>
              Evaluator Type (Optional)
            </label>
            <select
              value={evaluatorType}
              onChange={(e) => setEvaluatorType(e.target.value)}
              className='w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 bg-white'
            >
              <option value=''>None (Manual Grading)</option>
              <option value='JS'>JS Evaluator</option>
              <option value='VISUAL'>Visual Evaluator</option>
              <option value='PYTHON'>Python Evaluator</option>
              <option value='REACT'>React Evaluator</option>
              <option value='FULLSTACK'>Full Stack Evaluator</option>
              <option value='AI'>Backend API Evaluator</option>
            </select>
          </div>

          {/* Allowed Submission Methods */}
          <div className='rounded-xl border border-slate-200/90 bg-slate-50/50 p-4 space-y-3'>
            <div className='flex items-center justify-between'>
              <div>
                <label className='block text-xs sm:text-sm font-semibold text-slate-800'>
                  Allowed Submission Methods
                </label>
                <p className='text-[11px] text-slate-500 mt-0.5'>
                  Choose which formats learners can submit for this assignment
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={selectAllSubmissionTypes}
                className='text-xs h-7 text-indigo-600 border-indigo-200 hover:bg-indigo-50'
              >
                Select All
              </Button>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1'>
              {[
                {
                  id: 'file' as SubmissionType,
                  title: 'Document / File Upload',
                  desc: 'Direct file upload: PDF, DOCX, XLSX, TXT, ZIP',
                  iconBg: 'bg-blue-50 text-blue-600 border-blue-100',
                  renderIcon: () => (
                    <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                      <path d='M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' />
                      <polyline points='14 2 14 8 20 8' />
                      <path d='M12 18v-6' />
                      <path d='M9 15l3-3 3 3' />
                    </svg>
                  ),
                },
                {
                  id: 'github' as SubmissionType,
                  title: 'GitHub / Git Repository',
                  desc: 'Public code repository: GitHub, GitLab, Bitbucket',
                  iconBg: 'bg-slate-900 text-white border-slate-800',
                  renderIcon: () => (
                    <svg className='w-4 h-4' viewBox='0 0 24 24' fill='currentColor'>
                      <path fillRule='evenodd' clipRule='evenodd' d='M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z' />
                    </svg>
                  ),
                },
                {
                  id: 'docs' as SubmissionType,
                  title: 'Google Docs / Office 365',
                  desc: 'Cloud document links with sharing permissions',
                  iconBg: 'bg-blue-50 border-blue-100',
                  renderIcon: () => (
                    <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none'>
                      <path d='M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z' fill='#4285F4' />
                      <path d='M14 2V8H20L14 2Z' fill='#A1C2FA' />
                      <path d='M8 12.5H16M8 16.5H13' stroke='white' strokeWidth='1.5' strokeLinecap='round' />
                    </svg>
                  ),
                },
                {
                  id: 'figma' as SubmissionType,
                  title: 'Figma Design / Prototype',
                  desc: 'Figma files, interactive prototypes, or boards',
                  iconBg: 'bg-purple-50 border-purple-100',
                  renderIcon: () => (
                    <svg className='w-4 h-4' viewBox='0 0 38 57' fill='none'>
                      <path d='M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z' fill='#1ABCFE' />
                      <path d='M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z' fill='#0ACF83' />
                      <path d='M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z' fill='#FF7262' />
                      <path d='M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z' fill='#F24E1E' />
                      <path d='M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z' fill='#A259FF' />
                    </svg>
                  ),
                },
                {
                  id: 'excel' as SubmissionType,
                  title: 'Google Sheets / Excel',
                  desc: 'Cloud spreadsheets for data and models',
                  iconBg: 'bg-emerald-50 border-emerald-100',
                  renderIcon: () => (
                    <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none'>
                      <path d='M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z' fill='#0F9D58' />
                      <path d='M14 2V8H20L14 2Z' fill='#87CEAC' />
                      <rect x='7.5' y='11.5' width='9' height='7' rx='0.5' stroke='white' strokeWidth='1.2' fill='none' />
                      <path d='M7.5 14H16.5M12 11.5V18.5' stroke='white' strokeWidth='1.2' />
                    </svg>
                  ),
                },
                {
                  id: 'url' as SubmissionType,
                  title: 'General URL / Live App',
                  desc: 'Deployed applications, portfolios, or external links',
                  iconBg: 'bg-amber-50 text-amber-600 border-amber-100',
                  renderIcon: () => (
                    <svg className='w-4 h-4' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                      <circle cx='12' cy='12' r='10' />
                      <line x1='2' y1='12' x2='22' y2='12' />
                      <path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' />
                    </svg>
                  ),
                },
              ].map((item) => {
                const isSelected = allowedSubmissionTypes.includes(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSubmissionType(item.id)}
                    className={`relative flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 opacity-60 hover:opacity-85'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border shadow-2xs ${item.iconBg}`}>
                      {item.renderIcon()}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center justify-between gap-1'>
                        <h4 className='text-xs font-semibold text-slate-900 truncate'>{item.title}</h4>
                        <div
                          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-indigo-600 text-white' : 'border border-slate-300'
                          }`}
                        >
                          {isSelected && <Check className='w-2 h-2 stroke-[3]' />}
                        </div>
                      </div>
                      <p className='text-[10px] text-slate-500 leading-tight mt-0.5'>{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className='mb-2 flex items-center justify-between'>
              <label className='text-sm font-medium text-slate-700'>Test Cases (JSON)</label>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleGenerateTestCases}
                disabled={generating || !evaluatorType}
                className='h-7 text-xs bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-700'
              >
                {generating ? (
                  <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Wand2 className='mr-1.5 h-3.5 w-3.5' />
                )}
                ✨ Auto-Generate Test Cases
              </Button>
            </div>
            <textarea
              value={testCases}
              onChange={(e) => setTestCases(e.target.value)}
              placeholder='{\n  "evaluationMode": "script",\n  "expectedLogs": []\n}'
              className='w-full min-h-[140px] rounded-lg border border-slate-300 p-3 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
          </div>

          <div>
            <div className='mb-2 flex items-center justify-between'>
              <label className='text-sm font-medium text-slate-700'>Rubric (JSON)</label>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={handleGenerateRubric}
                disabled={generatingRubric || !evaluatorType}
                className='h-7 text-xs bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 hover:text-indigo-700'
              >
                {generatingRubric ? (
                  <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Wand2 className='mr-1.5 h-3.5 w-3.5' />
                )}
                ✨ Auto-Generate Rubric
              </Button>
            </div>
            <textarea
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              placeholder='[\n  { "name": "Critera 1", "weight": 20, "description": "..." }\n]'
              className='w-full min-h-[140px] rounded-lg border border-slate-300 p-3 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200'
            />
          </div>
        </div>
        </div>

        <div className='flex items-center gap-3 border-t border-slate-100 p-6 pt-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => setPreviewOpen(true)}
            className='border-slate-300 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5'
          >
            <Eye className='h-4 w-4 text-indigo-600' />
            <span>Preview Student View</span>
          </Button>
          <div className='flex-1' />
          <Button
            onClick={onClose}
            className='border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={loading}
            className='bg-indigo-600 text-white hover:bg-indigo-700'
          >
            {!loading && <Save className='mr-2 h-4 w-4' />}
            {editData ? 'Update' : 'Create'} Assignment
          </Button>
        </div>
      </div>

      {previewOpen && (
        <AdminAssignmentPreviewModal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          assignmentData={{
            title: title.trim() || 'Untitled Assignment',
            instructions,
            max_score: maxScore,
            evaluator_type: evaluatorType || null,
            test_cases: testCases,
            rubric: rubric,
            allowed_submission_types: allowedSubmissionTypes,
            unit_title: unitTitle,
          }}
          unitTitle={unitTitle}
        />
      )}
    </div>
  );
};

export default AssignmentModal;
