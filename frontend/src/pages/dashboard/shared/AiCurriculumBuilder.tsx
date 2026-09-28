import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Sparkles, Loader2, Plus, Trash2, GripVertical, Check } from 'lucide-react';
import { aiCurriculumApi } from '@/features/aiCurriculum/aiCurriculumApi';
import type { CourseFormData, TopicSuggestion } from '@/features/aiCurriculum/types';
import toast from 'react-hot-toast';
import { useAppSelector } from '@/app/hooks';
import { selectUser } from '@/features/auth/authSelectors';

// ─── Options ──────────────────────────────────────────────────────────────────

const DOMAINS = ['tech', 'business', 'creative', 'non-IT', 'data'];
const LEVELS = ['beginner', 'intermediate', 'advanced'];
const CONTENT_PREF_LABELS: Record<string, string> = {
  'practice-heavy': 'Practice Heavy',
  'theory-heavy': 'Theory Heavy',
  'interview-focused': 'Interview Focused',
  balanced: 'Balanced',
};
const DURATIONS = [2, 4, 6, 8, 10, 12, 16, 20, 24];
const DAILY_EFFORTS = [0.5, 1, 1.5, 2, 3, 4, 5, 6];

const EMPTY_FORM: CourseFormData = {
  title: '',
  domain: '',
  role_focus: 'student',
  jd_text: '',
  skills: [],
  audience: [],
  level: '',
  learning_goal: '',
  duration_weeks: '',
  daily_hours: '',
  content_preference: '',
  num_modules: '',
};

// ─── Shared field components ──────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className='block text-xs font-semibold text-slate-600 mb-1.5'>
      {children}
      {required && <span className='text-red-400 ml-0.5'>*</span>}
    </label>
  );
}

function TextInput({
  placeholder, value, onChange, className = '',
}: { placeholder: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      type='text'
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${className}`}
    />
  );
}

function SelectField({
  value, onChange, placeholder, options,
}: { value: string | number; onChange: (v: string) => void; placeholder: string; options: { label: string; value: string | number }[] }) {
  return (
    <div className='relative'>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white appearance-none pr-8'
      >
        <option value=''>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400'>▾</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs min-w-0'>
      <h2 className='text-xs sm:text-sm font-bold text-slate-800 mb-3.5 sm:mb-4'>{title}</h2>
      {children}
    </div>
  );
}

// ─── Step 1: Course Metadata Form ─────────────────────────────────────────────

function StepOne({
  form,
  set,
  onNext,
  generating,
  onCancel,
}: {
  form: CourseFormData;
  set: (p: Partial<CourseFormData>) => void;
  onNext: () => void;
  generating: boolean;
  onCancel: () => void;
}) {
  const [extracting, setExtracting] = useState(false);
  const [newSkill, setNewSkill] = useState('');

  const isValid =
    form.title.trim() &&
    form.domain &&
    form.level &&
    form.content_preference &&
    form.learning_goal.trim();

  return (
    <div className='space-y-4'>
      {/* Section 1: Course Information */}
      <Section title='Course Information'>
        <div className='space-y-4'>
          <div>
            <Label required>Course Title</Label>
            <TextInput
              placeholder='e.g. Full-Stack Web Development'
              value={form.title}
              onChange={(v) => set({ title: v })}
            />
          </div>
          <div>
            <Label required>Domain</Label>
            <SelectField
              value={form.domain}
              onChange={(v) => set({ domain: v })}
              placeholder='Select Domain'
              options={DOMAINS.map((d) => ({ label: d.charAt(0).toUpperCase() + d.slice(1), value: d }))}
            />
          </div>
        </div>
      </Section>

      {/* Section 2: Job Description */}
      <Section title='Job Description (for AI Alignment)'>
        <div className='space-y-4'>
          <div>
            <Label>Paste or describe the target job description</Label>
            <textarea
              rows={5}
              placeholder='Paste the job description here or describe the role requirements...'
              value={form.jd_text}
              onChange={(e) => set({ jd_text: e.target.value })}
              className='w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white resize-none'
            />
            {form.jd_text.trim() && !form.skills.length && (
              <button
                type='button'
                disabled={extracting}
                onClick={async () => {
                  setExtracting(true);
                  try {
                    const res = await aiCurriculumApi.extractSkills(form.jd_text);
                    set({ skills: res.data.data });
                  } catch { /* silent */ } finally { setExtracting(false); }
                }}
                className='mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50'
              >
                {extracting ? <Loader2 className='w-3.5 h-3.5 animate-spin' /> : <Sparkles className='w-3.5 h-3.5' />}
                {extracting ? 'Extracting skills...' : 'Extract Skills from JD'}
              </button>
            )}
          </div>

          {form.skills.length > 0 && (
            <div>
              <Label>Extracted Skills <span className='font-normal text-slate-400'>(click × to remove)</span></Label>
              <div className='flex flex-wrap gap-2 mt-1'>
                {form.skills.map((s, i) => (
                  <span key={i} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border ${s.category === 'technical' ? 'bg-blue-50 text-blue-700 border-blue-200' : s.category === 'tools' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {s.name}
                    <button onClick={() => set({ skills: form.skills.filter((_, j) => j !== i) })} className='hover:text-red-500 transition-colors'>×</button>
                  </span>
                ))}
              </div>
              <div className='flex items-center gap-2 mt-2'>
                <input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSkill.trim()) {
                      set({ skills: [...form.skills, { name: newSkill.trim(), category: 'technical' }] });
                      setNewSkill('');
                    }
                  }}
                  placeholder='Add skill + Enter'
                  className='border border-slate-200 rounded-lg px-3 py-1.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
                />
              </div>
            </div>
          )}

          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
            <div>
              <Label required>Experience Level</Label>
              <SelectField
                value={form.level}
                onChange={(v) => set({ level: v })}
                placeholder='Select Level'
                options={LEVELS.map((l) => ({ label: l.charAt(0).toUpperCase() + l.slice(1), value: l }))}
              />
            </div>
            <div>
              <Label required>Content Style</Label>
              <SelectField
                value={form.content_preference}
                onChange={(v) => set({ content_preference: v })}
                placeholder='Select Preference'
                options={Object.entries(CONTENT_PREF_LABELS).map(([v, l]) => ({ label: l, value: v }))}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Section 3: Learning Parameters */}
      <Section title='Learning Parameters'>
        <div className='space-y-4'>
          <div>
            <Label required>Learning Goals</Label>
            <TextInput
              placeholder='What should students be able to do after completing this course?'
              value={form.learning_goal}
              onChange={(v) => set({ learning_goal: v })}
            />
          </div>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4'>
            <div>
              <Label>Course Duration</Label>
              <SelectField
                value={form.duration_weeks}
                onChange={(v) => set({ duration_weeks: v ? Number(v) : '' })}
                placeholder='Select Duration'
                options={DURATIONS.map((d) => ({ label: `${d} weeks`, value: d }))}
              />
            </div>
            <div>
              <Label>Daily Effort</Label>
              <SelectField
                value={form.daily_hours}
                onChange={(v) => set({ daily_hours: v ? Number(v) : '' })}
                placeholder='Select Effort'
                options={DAILY_EFFORTS.map((h) => ({ label: `${h} hr${h !== 1 ? 's' : ''}/day`, value: h }))}
              />
            </div>
          </div>
        </div>
      </Section>

      <div className='flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 sm:gap-3 mt-6'>
        <button
          onClick={onCancel}
          className='w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors text-center'
        >
          Cancel
        </button>
        <button
          onClick={onNext}
          disabled={!isValid || generating}
          className='w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold bg-[#1e2653] text-white rounded-xl hover:bg-[#16203f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs min-h-[40px]'
        >
          {generating ? <Loader2 className='w-4 h-4 animate-spin' /> : <Sparkles className='w-4 h-4' />}
          <span>{generating ? 'Generating Topics...' : 'Generate Topics'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Topic Selection ──────────────────────────────────────────────────

interface SelectableTopic extends TopicSuggestion {
  selected: boolean;
  _key: string;
}

function Step2TopicSelector({
  initialTopics,
  onBack,
  onCreateCourse,
  creating,
}: {
  initialTopics: TopicSuggestion[];
  onBack: () => void;
  onCreateCourse: (topics: TopicSuggestion[]) => void;
  creating: boolean;
}) {
  const [topics, setTopics] = useState<SelectableTopic[]>(() =>
    initialTopics.map((t, i) => ({ ...t, selected: true, _key: `gen-${i}` })),
  );
  const [newTitle, setNewTitle] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const selected = topics.filter((t) => t.selected);

  const toggle = (key: string) =>
    setTopics((prev) => prev.map((t) => (t._key === key ? { ...t, selected: !t.selected } : t)));

  const rename = (key: string, title: string) =>
    setTopics((prev) => prev.map((t) => (t._key === key ? { ...t, title } : t)));

  const remove = (key: string) =>
    setTopics((prev) => prev.filter((t) => t._key !== key));

  const addCustom = () => {
    const title = newTitle.trim();
    if (!title) return;
    setTopics((prev) => [
      ...prev,
      { title, description: '', selected: true, _key: `custom-${Date.now()}` },
    ]);
    setNewTitle('');
  };

  const handleDrop = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    const updated = [...topics];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(to, 0, moved);
    setTopics(updated);
    setDragIdx(null);
    setDragOver(null);
  };

  return (
    <div className='space-y-4 min-w-0'>
      <div className='bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs min-w-0'>
        <div className='flex items-center justify-between mb-1'>
          <h2 className='text-xs sm:text-sm font-bold text-slate-800'>Select Topics</h2>
          <span className='text-xs text-slate-400 font-medium'>{selected.length} selected</span>
        </div>
        <p className='text-xs text-slate-500 mb-4'>
          Check the topics you want to include. Drag to reorder. Click any title to rename it.
        </p>

        <div className='space-y-2'>
          {topics.map((topic, i) => (
            <div
              key={topic._key}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => { setDragIdx(null); setDragOver(null); }}
              className={`flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl border transition-all ${
                topic.selected ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white opacity-60'
              } ${dragOver === i && dragIdx !== i ? 'outline outline-2 outline-indigo-400 outline-offset-1' : ''}`}
            >
              <GripVertical className='w-3.5 h-3.5 text-slate-300 cursor-grab shrink-0' />

              <button
                onClick={() => toggle(topic._key)}
                className={`shrink-0 w-4.5 h-4.5 rounded border-2 flex items-center justify-center transition-colors ${
                  topic.selected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                }`}
              >
                {topic.selected && <Check className='w-3 h-3 text-white' strokeWidth={3} />}
              </button>

              <div className='flex-1 min-w-0'>
                <input
                  value={topic.title}
                  onChange={(e) => rename(topic._key, e.target.value)}
                  className='w-full text-xs sm:text-[13px] font-semibold text-slate-800 bg-transparent border-none outline-none focus:ring-0 p-0'
                />
                {topic.description && (
                  <p className='text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5'>{topic.description}</p>
                )}
              </div>

              <button
                onClick={() => remove(topic._key)}
                className='p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0'
              >
                <Trash2 className='w-3.5 h-3.5' />
              </button>
            </div>
          ))}
        </div>

        {/* Add custom topic */}
        <div className='flex items-center gap-2 mt-3'>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
            placeholder='Add custom topic...'
            className='flex-1 border border-dashed border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white min-h-[38px]'
          />
          <button
            onClick={addCustom}
            disabled={!newTitle.trim()}
            className='p-2 text-slate-400 hover:text-indigo-600 disabled:opacity-30 transition-colors shrink-0 min-h-[38px]'
          >
            <Plus className='w-4 h-4' />
          </button>
        </div>
      </div>

      <div className='flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 mt-6'>
        <button
          onClick={onBack}
          className='w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors'
        >
          <ArrowLeft className='w-3.5 h-3.5' /> <span>Back</span>
        </button>
        <button
          onClick={() => onCreateCourse(selected.map(({ title, description }) => ({ title, description })))}
          disabled={selected.length === 0 || creating}
          className='w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold bg-[#1e2653] text-white rounded-xl hover:bg-[#16203f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs min-h-[40px]'
        >
          {creating ? <Loader2 className='w-4 h-4 animate-spin' /> : null}
          <span>{creating ? 'Creating Course...' : `Create Course with ${selected.length} Topic${selected.length !== 1 ? 's' : ''}`}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AiCurriculumBuilder() {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const isAdmin = user?.role === 'admin';
  const base = isAdmin
    ? '/dashboard/admin'
    : user?.role === 'curriculum_developer'
    ? '/dashboard/curriculum-developer'
    : '/dashboard/facilitator';

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<CourseFormData>(EMPTY_FORM);
  const [generatingTopics, setGeneratingTopics] = useState(false);
  const [creating, setCreating] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<TopicSuggestion[]>([]);

  useEffect(() => {
    if (user?.role === 'curriculum_developer' || user?.domain || user?.role_focus) {
      setForm((prev) => ({
        ...prev,
        domain: prev.domain || (user?.domain ? user.domain.toLowerCase() : ''),
        role_focus: (prev.role_focus === 'student' || !prev.role_focus) && user?.role_focus ? user.role_focus : prev.role_focus,
      }));
    }
  }, [user]);

  const set = (partial: Partial<CourseFormData>) => setForm((f) => ({ ...f, ...partial }));

  const handleGenerateTopics = async () => {
    setGeneratingTopics(true);
    try {
      // Extract skills from JD if needed
      let skills = form.skills;
      if (form.jd_text.trim() && !skills.length) {
        try {
          const res = await aiCurriculumApi.extractSkills(form.jd_text);
          skills = res.data.data;
          set({ skills });
        } catch { /* proceed without */ }
      }

      const res = await aiCurriculumApi.generateTopicSuggestions({
        title: form.title,
        domain: form.domain,
        role_focus: form.role_focus,
        level: form.level,
        learning_goal: form.learning_goal,
      });
      setTopicSuggestions(res.data.data);
      setStep(2);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to generate topics');
    } finally {
      setGeneratingTopics(false);
    }
  };

  const handleCreateCourse = async (selectedTopics: TopicSuggestion[]) => {
    setCreating(true);
    try {
      // Save course with empty modules (topics will be generated per-topic in the editor)
      const saveRes = await aiCurriculumApi.save({
        ...form,
        modules: selectedTopics.map((t, i) => ({
          title: t.title,
          description: t.description,
          practice_tasks: [],
          case_studies: [],
          order_index: i,
          topics: [],
        })),
        capstone_project: undefined,
      });
      toast.success('Course created! Now add units to each topic.');
      navigate(`${base}/ai-curriculum/${saveRes.data.data.id}/edit`);
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to create course');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className='max-w-2xl mx-auto px-4 py-6'>
      {/* Breadcrumb */}
      <div className='flex items-center gap-1.5 text-xs text-slate-400 mb-5'>
        <span className='hover:text-slate-600 cursor-pointer' onClick={() => navigate(`${base}`)}>Dashboard</span>
        <span>/</span>
        <span className='hover:text-slate-600 cursor-pointer' onClick={() => navigate(`${base}/ai-curriculum`)}>Courses</span>
        <span>/</span>
        <span className='text-slate-600 font-medium'>Create Course</span>
      </div>

      {/* Page header */}
      <div className='flex items-center gap-3 mb-6'>
        <button
          onClick={() => step === 2 ? setStep(1) : navigate(`${base}/ai-curriculum`)}
          className='p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors'
        >
          <ArrowLeft className='w-4 h-4' />
        </button>
        <div>
          <h1 className='text-xl font-bold text-slate-800'>Create New Course</h1>
          <p className='text-xs text-slate-500 mt-0.5'>
            {step === 1
              ? 'Step 1 of 2 — Define course details'
              : `Step 2 of 2 — Pick topics for "${form.title}"`}
          </p>
        </div>

        {/* Step indicators */}
        <div className='ml-auto flex items-center gap-2'>
          {([1, 2] as const).map((s) => (
            <div key={s} className={`w-2 h-2 rounded-full transition-colors ${step === s ? 'bg-indigo-600' : step > s ? 'bg-indigo-300' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>

      {step === 1 ? (
        <StepOne
          form={form}
          set={set}
          onNext={handleGenerateTopics}
          generating={generatingTopics}
          onCancel={() => navigate(`${base}/ai-curriculum`)}
        />
      ) : (
        <Step2TopicSelector
          initialTopics={topicSuggestions}
          onBack={() => setStep(1)}
          onCreateCourse={handleCreateCourse}
          creating={creating}
        />
      )}
    </div>
  );
}
