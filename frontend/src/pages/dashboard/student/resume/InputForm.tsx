import { useFormik, FieldArray, FormikProvider } from 'formik';
import * as Yup from 'yup';
import { Loader2, Wand2, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkExperience } from './types';

const inputCls =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#333d7c]/20';
const errorCls = 'text-xs text-red-500 mt-0.5';

const experienceShape = Yup.object({
  title: Yup.string().required('Job title is required'),
  company: Yup.string().required('Company is required'),
  duration: Yup.string().required('Duration is required'),
  points: Yup.array(Yup.string().required('Cannot be empty')).min(1),
});

const validationSchema = Yup.object({
  jobTitle: Yup.string().required('Job title / role is required'),
  phone: Yup.string()
    .matches(/^[+\d\s\-().]{7,15}$/, 'Enter a valid phone number')
    .required('Phone is required'),
  location: Yup.string().required('Location is required'),
  linkedin: Yup.string()
    .matches(/^(https?:\/\/)?(www\.)?linkedin\.com\/.*$/, 'Enter a valid LinkedIn URL')
    .optional(),
  careerObjective: Yup.string()
    .min(30, 'At least 30 characters')
    .max(600, 'Max 600 characters')
    .optional(),
  extraSkills: Yup.array(
    Yup.string().max(40, 'Skill too long'),
  ).optional(),
  workExperience: Yup.array(experienceShape).optional(),
});

export interface InputFormValues {
  jobTitle: string;
  phone: string;
  location: string;
  linkedin: string;
  careerObjective: string;
  extraSkills: string[];
  workExperience: WorkExperience[];
}

interface InputFormProps {
  initialValues: InputFormValues;
  onSubmit: (values: InputFormValues) => Promise<void>;
  loading: boolean;
  onClose: () => void;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className={errorCls}>{msg}</p>;
}

export function InputForm({ initialValues, onSubmit, loading, onClose }: InputFormProps) {
  const formik = useFormik<InputFormValues>({
    initialValues,
    validationSchema,
    validateOnBlur: true,
    validateOnChange: false,
    onSubmit,
  });

  const { values, errors, touched, handleChange, handleBlur } = formik;

  return (
    <FormikProvider value={formik}>
      <div className='fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4'>
        <div className='bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92dvh] flex flex-col'>
          {/* Header */}
          <div className='flex items-center justify-between p-4 sm:p-6 border-b border-slate-100'>
            <div>
              <h2 className='font-bold text-[#1e2653] text-base sm:text-lg'>Build Your Resume</h2>
              <p className='text-[11px] sm:text-xs text-slate-400 mt-0.5'>Profile & course data will be auto-fetched</p>
            </div>
            <button onClick={onClose} className='p-1 text-slate-400 hover:text-slate-600 rounded-lg'>
              <X size={20} />
            </button>
          </div>

          <form onSubmit={formik.handleSubmit} className='flex flex-col flex-1 overflow-hidden'>
            <div className='overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4 sm:space-y-5'>

              {/* Personal Details */}
              <section>
                <h3 className='text-sm font-semibold text-slate-700 mb-3'>Personal Details</h3>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                  {/* Job Title */}
                  <div>
                    <label className='text-xs text-slate-500 mb-1 block'>
                      Job Title / Role <span className='text-red-400'>*</span>
                    </label>
                    <input
                      name='jobTitle'
                      className={cn(inputCls, touched.jobTitle && errors.jobTitle && 'border-red-300 focus:ring-red-200')}
                      placeholder='e.g. Full Stack Developer'
                      value={values.jobTitle}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                    <FieldError msg={touched.jobTitle ? errors.jobTitle : undefined} />
                  </div>

                  {/* Phone */}
                  <div>
                    <label className='text-xs text-slate-500 mb-1 block'>
                      Phone <span className='text-red-400'>*</span>
                    </label>
                    <input
                      name='phone'
                      className={cn(inputCls, touched.phone && errors.phone && 'border-red-300 focus:ring-red-200')}
                      placeholder='+91 9876543210'
                      value={values.phone}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                    <FieldError msg={touched.phone ? errors.phone : undefined} />
                  </div>

                  {/* Location */}
                  <div>
                    <label className='text-xs text-slate-500 mb-1 block'>
                      Location <span className='text-red-400'>*</span>
                    </label>
                    <input
                      name='location'
                      className={cn(inputCls, touched.location && errors.location && 'border-red-300 focus:ring-red-200')}
                      placeholder='City, State'
                      value={values.location}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                    <FieldError msg={touched.location ? errors.location : undefined} />
                  </div>

                  {/* LinkedIn */}
                  <div>
                    <label className='text-xs text-slate-500 mb-1 block'>LinkedIn</label>
                    <input
                      name='linkedin'
                      className={cn(inputCls, touched.linkedin && errors.linkedin && 'border-red-300 focus:ring-red-200')}
                      placeholder='linkedin.com/in/yourprofile'
                      value={values.linkedin}
                      onChange={handleChange}
                      onBlur={handleBlur}
                    />
                    <FieldError msg={touched.linkedin ? errors.linkedin : undefined} />
                  </div>
                </div>
              </section>

              {/* Career Objective */}
              <section>
                <label className='text-sm font-semibold text-slate-700 mb-1 block'>Career Objective</label>
                <textarea
                  name='careerObjective'
                  className={cn(inputCls, 'min-h-[80px] resize-none', touched.careerObjective && errors.careerObjective && 'border-red-300 focus:ring-red-200')}
                  placeholder='e.g. Aspiring full-stack developer looking to apply my skills...'
                  value={values.careerObjective}
                  onChange={handleChange}
                  onBlur={handleBlur}
                />
                <div className='flex justify-between mt-0.5'>
                  <FieldError msg={touched.careerObjective ? errors.careerObjective : undefined} />
                  <span className={cn('text-xs ml-auto', values.careerObjective.length > 600 ? 'text-red-400' : 'text-slate-400')}>
                    {values.careerObjective.length}/600
                  </span>
                </div>
              </section>

              {/* Extra Skills */}
              <section>
                <label className='text-sm font-semibold text-slate-700 mb-1 block'>Additional Skills</label>
                <p className='text-xs text-slate-400 mb-2'>Skills from your courses are auto-detected. Add extras here.</p>
                <FieldArray name='extraSkills'>
                  {({ remove, push }) => (
                    <div className='flex flex-wrap gap-2'>
                      {values.extraSkills.map((skill, idx) => (
                        <div key={idx} className='flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-full px-3 py-1'>
                          <input
                            name={`extraSkills.${idx}`}
                            className='text-xs outline-none bg-transparent w-24'
                            placeholder='e.g. Docker'
                            value={skill}
                            onChange={handleChange}
                            onBlur={handleBlur}
                          />
                          <button type='button' onClick={() => remove(idx)} className='text-slate-300 hover:text-red-400'>
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                      <button
                        type='button'
                        onClick={() => push('')}
                        className='flex items-center gap-1 text-xs text-[#333d7c] border border-dashed border-[#333d7c]/40 rounded-full px-3 py-1 hover:bg-[#eef0fb]'
                      >
                        <Plus size={12} /> Add
                      </button>
                    </div>
                  )}
                </FieldArray>
              </section>

              {/* Work Experience */}
              <section>
                <label className='text-sm font-semibold text-slate-700 mb-1 block'>Work Experience</label>
                <p className='text-xs text-slate-400 mb-3'>Optional — leave blank if no experience yet.</p>
                <FieldArray name='workExperience'>
                  {({ remove, push }) => (
                    <div className='space-y-4'>
                      {values.workExperience.map((exp, idx) => {
                        const expErrors = (errors.workExperience as typeof values.workExperience | undefined)?.[idx] as Partial<WorkExperience> | undefined;
                        const expTouched = (touched.workExperience as typeof values.workExperience | undefined)?.[idx] as Partial<Record<keyof WorkExperience, boolean>> | undefined;

                        return (
                          <div key={idx} className='border border-slate-100 rounded-xl p-4 bg-slate-50 space-y-2'>
                            <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                              <div>
                                <input
                                  name={`workExperience.${idx}.title`}
                                  className={cn(inputCls, expTouched?.title && expErrors?.title && 'border-red-300')}
                                  placeholder='Job Title *'
                                  value={exp.title}
                                  onChange={handleChange}
                                  onBlur={handleBlur}
                                />
                                <FieldError msg={expTouched?.title ? (expErrors?.title as string) : undefined} />
                              </div>
                              <div>
                                <input
                                  name={`workExperience.${idx}.company`}
                                  className={cn(inputCls, expTouched?.company && expErrors?.company && 'border-red-300')}
                                  placeholder='Company *'
                                  value={exp.company}
                                  onChange={handleChange}
                                  onBlur={handleBlur}
                                />
                                <FieldError msg={expTouched?.company ? (expErrors?.company as string) : undefined} />
                              </div>
                            </div>
                            <div>
                              <input
                                name={`workExperience.${idx}.duration`}
                                className={cn(inputCls, expTouched?.duration && expErrors?.duration && 'border-red-300')}
                                placeholder='Duration (e.g. Jun 2024 – Aug 2024) *'
                                value={exp.duration}
                                onChange={handleChange}
                                onBlur={handleBlur}
                              />
                              <FieldError msg={expTouched?.duration ? (expErrors?.duration as string) : undefined} />
                            </div>

                            <FieldArray name={`workExperience.${idx}.points`}>
                              {({ remove: removePoint, push: pushPoint }) => (
                                <div className='space-y-1.5'>
                                  {exp.points.map((pt, pi) => (
                                    <div key={pi} className='flex gap-2'>
                                      <input
                                        name={`workExperience.${idx}.points.${pi}`}
                                        className={cn(inputCls, 'flex-1')}
                                        placeholder='Key responsibility'
                                        value={pt}
                                        onChange={handleChange}
                                        onBlur={handleBlur}
                                      />
                                      {exp.points.length > 1 && (
                                        <button type='button' onClick={() => removePoint(pi)} className='text-slate-300 hover:text-red-400'>
                                          <X size={14} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    type='button'
                                    onClick={() => pushPoint('')}
                                    className='text-xs text-[#333d7c] hover:underline flex items-center gap-1'
                                  >
                                    <Plus size={12} /> Add point
                                  </button>
                                </div>
                              )}
                            </FieldArray>

                            <button
                              type='button'
                              onClick={() => remove(idx)}
                              className='text-xs text-red-400 hover:text-red-600 flex items-center gap-1'
                            >
                              <X size={12} /> Remove
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type='button'
                        onClick={() => push({ title: '', company: '', duration: '', points: [''] } satisfies WorkExperience)}
                        className='text-xs text-[#333d7c] hover:underline flex items-center gap-1'
                      >
                        <Plus size={13} /> Add work experience
                      </button>
                    </div>
                  )}
                </FieldArray>
              </section>
            </div>

            {/* Footer */}
            <div className='px-6 py-4 border-t border-slate-100'>
              <button
                type='submit'
                disabled={loading}
                className='w-full bg-[#333d7c] hover:bg-[#1e2653] text-white h-11 rounded-md text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors'
              >
                {loading ? (
                  <><Loader2 size={16} className='animate-spin' /> Generating...</>
                ) : (
                  <><Wand2 size={16} /> Generate Resume with AI</>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </FormikProvider>
  );
}

// Re-export inputCls for use in other files if needed
export { inputCls };
