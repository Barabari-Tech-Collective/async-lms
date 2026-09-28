import { Button } from '@/components/ui/button';
import { Save, X, Wand2, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import RichTextEditor from '@/components/common/RichTextEditor';
import MarkdownEditor from '@/components/common/MarkdownEditor';
import toast from 'react-hot-toast';

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
  }) => void;
  editData?: {
    title: string;
    instructions?: string;
    max_score: number;
    evaluator_type?: string | null;
    test_cases?: any;
    rubric?: any;
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

  useEffect(() => {
    if (isOpen) {
      setTitle(editData?.title ?? '');
      setInstructions(editData?.instructions ?? '');
      setMaxScore(editData?.max_score ?? 100);
      setEvaluatorType(editData?.evaluator_type || '');
      setTestCases(editData?.test_cases ? getInitialTestCases(editData.test_cases) : '');
      setRubric(editData?.rubric ? (typeof editData.rubric === 'string' ? editData.rubric : JSON.stringify(editData.rubric, null, 2)) : '');
    }
  }, [isOpen, editData]);

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
    onSave({
      title: title.trim(),
      instructions: instructions.trim(),
      max_score: maxScore,
      evaluator_type: evaluatorType || null,
      test_cases: finalTestCases || null,
      rubric: rubric.trim() || null
    });
    setTitle('');
    setInstructions('');
    setMaxScore(100);
    setEvaluatorType('');
    setTestCases('');
    setRubric('');
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

        <div className='flex gap-3 border-t border-slate-100 p-6 pt-4'>
          <Button
            onClick={onClose}
            className='flex-1 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={loading}
            className='flex-1 bg-indigo-600 text-white hover:bg-indigo-700'
          >
            {!loading && <Save className='mr-2 h-4 w-4' />}
            {editData ? 'Update' : 'Create'} Assignment
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AssignmentModal;
