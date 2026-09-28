import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ChevronLeft,
  Calendar,
  Download,
  FileText,
  Link2,
  Loader2,
  ArrowRight,
  Upload,
} from 'lucide-react';
import apiClient from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import type { CollegeAssignment } from '@/utils/types';

export default function CollegeAssignmentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [assignment, setAssignment] = useState<CollegeAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [solution, setSolution] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'link'>('upload');

  const fetchAssignment = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<{
        success: boolean;
        data: CollegeAssignment;
      }>(`/college-assignments/${id}`);
      const data = res.data.data;
      setAssignment(data);

      if (data.submission_link) {
        setSolution(data.submission_link);
        setActiveTab('link');
      } else if (data.submission_file_url) {
        setActiveTab('upload');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to load assignment details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignment();
  }, [id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (activeTab === 'link' && !solution.trim()) {
      toast.error('Please enter a submission link');
      return;
    }

    if (activeTab === 'upload' && !selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    try {
      setSubmitting(true);
      const formData = new FormData();

      if (activeTab === 'link') {
        formData.append('submission_link', solution.trim());
      } else if (selectedFile) {
        formData.append('submission_file', selectedFile);
      }

      await apiClient.post(`/college-assignments/${id}/submit`, formData);

      toast.success('Assignment submitted successfully!');
      setSelectedFile(null);
      fetchAssignment();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to submit assignment'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className='flex h-[60vh] items-center justify-center'>
        <Loader2 className='h-10 w-10 animate-spin text-[#333D7C]' />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className='p-10 text-center'>
        <p className='text-slate-500'>Assignment not found.</p>
        <Button variant='ghost' onClick={() => navigate(-1)} className='mt-4'>
          Go Back
        </Button>
      </div>
    );
  }

  const isSubmitted = Boolean(
    assignment.submission_link || assignment.submission_file_url,
  );

  return (
    <div className='min-h-screen bg-[#FDFDFD] p-4 sm:p-6 md:p-10'>
      <div className='max-w-6xl mx-auto'>
        {/* Navigation / Back Button */}
        <div className='flex items-center justify-between mb-6 sm:mb-8'>
          <button
            onClick={() => navigate(-1)}
            className='flex items-center gap-2 text-slate-400 hover:text-[#1e293b] font-semibold text-sm transition-all group py-2'
          >
            <div className='w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center group-hover:border-[#333D7C] group-hover:text-[#333D7C] transition-all shadow-xs'>
              <ChevronLeft className='w-4 h-4' />
            </div>
            <span>Back to Assignments</span>
          </button>
        </div>

        {/* Hero Card */}
        <Card className='border border-slate-100 mb-6 sm:mb-8 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative'>
          <div className='space-y-3 sm:space-y-4'>
            <div className='flex flex-wrap items-center gap-2 sm:gap-3'>
              <span className='px-3 py-0.5 bg-[#333D7C]/10 text-[#333D7C] text-[10px] font-bold uppercase rounded-full'>
                {assignment.course || 'General'}
              </span>
              <span
                className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isSubmitted
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-orange-50 text-orange-600'
                }`}
              >
                {isSubmitted ? 'Completed' : 'Pending'}
              </span>
            </div>
            <h1 className='text-2xl sm:text-3xl font-bold text-[#1e293b] tracking-tight capitalize'>
              {assignment.title}
            </h1>
            <div className='flex items-center gap-2 text-slate-400 font-medium text-xs sm:text-sm'>
              <Calendar className='w-4 h-4 text-[#333D7C]' />
              <span>
                Due:{' '}
                {assignment.due_date
                  ? new Date(assignment.due_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'No Deadline'}
              </span>
            </div>
          </div>
          {assignment.instruction_file_url && (
            <a
              href={assignment.instruction_file_url}
              target='_blank'
              rel='noopener noreferrer'
              className='p-3 sm:p-4 rounded-full bg-slate-50 text-slate-400 hover:text-slate-900 transition-all hover:bg-slate-100 self-start md:self-auto shrink-0'
              title='Download instruction document'
            >
              <Download className='w-5 h-5' />
            </a>
          )}
        </Card>

        {/* Two Column Section */}
        <div className='grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8'>
          {/* Left: Assignment Brief */}
          <div className='lg:col-span-7 space-y-6'>
            <Card className='border border-slate-100 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-sm h-full'>
              <div className='space-y-8 sm:space-y-10'>
                <div className='space-y-6 sm:space-y-8'>
                  <div className='space-y-3 sm:space-y-4'>
                    <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                      Assignment Brief
                    </h2>
                    {assignment.description ? (
                      <div
                        className='prose prose-sm max-w-full overflow-x-auto text-slate-500 leading-7'
                        dangerouslySetInnerHTML={{
                          __html: assignment.description,
                        }}
                      />
                    ) : (
                      <p className='text-slate-500 italic text-sm'>
                        No description provided.
                      </p>
                    )}
                  </div>

                  {assignment.assignment_description && (
                    <div className='space-y-3 sm:space-y-4 pt-6 border-t border-slate-100'>
                      <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                        Instructions
                      </h2>
                      <div
                        className='prose prose-sm max-w-full overflow-x-auto text-slate-500 leading-7'
                        dangerouslySetInnerHTML={{
                          __html: assignment.assignment_description,
                        }}
                      />
                    </div>
                  )}

                  {assignment.test_cases &&
                    assignment.test_cases.length > 0 && (
                      <div className='space-y-3 sm:space-y-4 pt-6 border-t border-slate-100'>
                        <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                          Test Cases
                        </h2>
                        <div className='rounded-xl border border-slate-200 overflow-x-auto max-w-full'>
                          <table className='w-full text-xs sm:text-sm text-left min-w-[340px]'>
                            <thead className='bg-slate-50 text-slate-600 font-semibold'>
                              <tr>
                                <th className='px-3 sm:px-4 py-3 border-b'>Input</th>
                                <th className='px-3 sm:px-4 py-3 border-b'>
                                  Expected Output
                                </th>
                                <th className='px-3 sm:px-4 py-3 border-b w-20 sm:w-24 text-center'>
                                  Points
                                </th>
                              </tr>
                            </thead>
                            <tbody className='divide-y divide-slate-100 bg-white'>
                              {assignment.test_cases.map((tc, idx) => (
                                <tr
                                  key={idx}
                                  className='hover:bg-slate-50 transition-colors'
                                >
                                  <td className='px-3 sm:px-4 py-3 font-mono text-slate-700'>
                                    {tc.input}
                                  </td>
                                  <td className='px-3 sm:px-4 py-3 font-mono text-slate-700'>
                                    {tc.output}
                                  </td>
                                  <td className='px-3 sm:px-4 py-3 text-center font-semibold text-[#333D7C]'>
                                    {tc.score}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  {assignment.rubric && assignment.rubric.length > 0 && (
                    <div className='space-y-3 sm:space-y-4 pt-6 border-t border-slate-100'>
                      <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                        Evaluation Rubric
                      </h2>
                      <div className='grid gap-2.5 sm:gap-3'>
                        {assignment.rubric.map((item, idx) => (
                          <div
                            key={idx}
                            className='flex items-start justify-between p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-[#333D7C]/30 transition-colors'
                          >
                            <div className='min-w-0 flex-1'>
                              <h3 className='font-semibold text-xs sm:text-sm text-slate-800 truncate'>
                                {item.name}
                              </h3>
                            </div>
                            <div className='shrink-0 ml-3 px-2.5 py-1 bg-[#333D7C]/10 text-[#333D7C] rounded-lg font-semibold text-xs sm:text-sm'>
                              {item.score} pts
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className='pt-6 sm:pt-8 border-t border-slate-50'>
                  {assignment.instruction_file_url ? (
                    <a
                      href={assignment.instruction_file_url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#333D7C] hover:underline'
                    >
                      <FileText className='w-4 h-4' />
                      <span>Download Full Instructions PDF</span>
                    </a>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>

          {/* Right: Submit Assignment */}
          <div className='lg:col-span-5 space-y-6'>
            <Card className='border border-slate-100 rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-10 shadow-sm space-y-6 sm:space-y-8'>
              <h2 className='text-lg sm:text-xl font-bold text-[#1e293b]'>
                Submit Assignment
              </h2>

              {/* Tabs Switcher */}
              <div className='bg-slate-100 p-1.5 rounded-xl sm:rounded-2xl flex'>
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition-all ${
                    activeTab === 'upload'
                      ? 'bg-[#333D7C] text-white shadow-sm'
                      : 'text-slate-500 hover:text-[#1e293b]'
                  }`}
                >
                  File Upload
                </button>
                <button
                  onClick={() => setActiveTab('link')}
                  className={`flex-1 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl transition-all ${
                    activeTab === 'link'
                      ? 'bg-[#333D7C] text-white shadow-sm'
                      : 'text-slate-500 hover:text-[#1e293b]'
                  }`}
                >
                  Link / URL
                </button>
              </div>

              {activeTab === 'upload' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  className={`border-2 border-dashed rounded-2xl sm:rounded-[2rem] p-6 sm:p-12 text-center space-y-3 sm:space-y-4 transition-all group cursor-pointer ${
                    selectedFile
                      ? 'border-emerald-400 bg-emerald-50/50'
                      : 'border-slate-200 hover:border-[#333D7C] hover:bg-slate-50/50'
                  }`}
                >
                  <input
                    type='file'
                    className='hidden'
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center mx-auto transition-transform group-hover:scale-110 ${
                      selectedFile ? 'bg-emerald-100' : 'bg-[#333D7C]/10'
                    }`}
                  >
                    <Upload
                      className={`w-5 h-5 sm:w-6 sm:h-6 ${selectedFile ? 'text-emerald-600' : 'text-[#333D7C]'}`}
                    />
                  </div>
                  <div className='space-y-1'>
                    <p className='text-xs sm:text-sm font-semibold text-[#1e293b] break-all'>
                      {selectedFile
                        ? selectedFile.name
                        : 'Click to upload or drag and drop'}
                    </p>
                    <p className='text-[11px] sm:text-xs text-slate-400'>
                      {selectedFile
                        ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                        : 'PDF, ZIP, or RAR (Max 10MB)'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className='space-y-3 sm:space-y-4'>
                  <div className='relative'>
                    <Link2 className='absolute left-4 top-4 w-4 h-4 sm:w-5 sm:h-5 text-[#333D7C]' />
                    <textarea
                      value={solution}
                      onChange={(e) => setSolution(e.target.value)}
                      placeholder='https://github.com/your-project'
                      className='w-full rounded-2xl border-2 border-slate-100 px-10 sm:px-12 py-3.5 sm:py-4 text-xs sm:text-sm focus:border-[#333D7C] outline-none transition-all placeholder:text-slate-300 min-h-28 sm:min-h-35 resize-none'
                    />
                  </div>
                  <p className='text-[11px] sm:text-xs text-slate-400 italic px-2'>
                    Provide your codebase or live demo link.
                  </p>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (activeTab === 'upload' && !selectedFile) ||
                  (activeTab === 'link' && !solution.trim())
                }
                className='w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 bg-[#333D7C] hover:bg-[#2a3268] text-white min-h-[44px]'
              >
                {submitting ? (
                  <Loader2 className='w-4 h-4 sm:w-5 sm:h-5 animate-spin' />
                ) : (
                  <>
                    Submit Assignment
                    <ArrowRight className='w-4 h-4' />
                  </>
                )}
              </Button>

              {isSubmitted && (
                <div className='flex items-center justify-center gap-2 text-emerald-600 font-bold text-[11px] sm:text-xs uppercase tracking-widest pt-2'>
                  <div className='w-1.5 h-1.5 bg-emerald-500 rounded-full' />
                  Submission Received
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
