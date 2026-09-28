import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, MapPin, Building2, Users, GraduationCap, ShieldCheck } from 'lucide-react';
import apiClient from '@/services/api';
import { getErrorMessage } from '@/lib/utils';
import toast from 'react-hot-toast';

interface PersonRow {
  id: string;
  full_name: string;
  email: string;
  is_verified: boolean;
  created_at: string;
  degree?: string;
  current_academic_year?: string;
}

interface CollegeDetail {
  id: string;
  name: string;
  short_code: string;
  city: string;
  state: string;
  is_verified: boolean;
  created_at: string;
  students: PersonRow[];
  facilitators: PersonRow[];
}

interface Props {
  collegeId: string | null;
  onClose: () => void;
}

export default function CollegeDetailSheet({ collegeId, onClose }: Props) {
  const [data, setData] = useState<CollegeDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collegeId) { setData(null); return; }
    setLoading(true);
    apiClient
      .get<{ data: CollegeDetail }>(`/admin/colleges/${collegeId}`)
      .then((res) => setData(res.data.data))
      .catch((err) => toast.error(getErrorMessage(err, 'Failed to load college details')))
      .finally(() => setLoading(false));
  }, [collegeId]);

  return (
    <Dialog open={!!collegeId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col'>
        {loading || !data ? (
          <div className='flex flex-1 items-center justify-center py-16'>
            <Loader2 className='w-6 h-6 animate-spin text-blue-600' />
          </div>
        ) : (
          <>
            <DialogHeader className='pb-4 border-b shrink-0'>
              <div className='flex items-start gap-4'>
                <div className='w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0'>
                  {data.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className='space-y-1'>
                  <DialogTitle className='text-lg font-bold leading-tight'>{data.name}</DialogTitle>
                  <div className='flex items-center gap-2 flex-wrap'>
                    <span className='flex items-center gap-1 text-xs text-slate-500'>
                      <MapPin className='w-3 h-3' />
                      {[data.city, data.state].filter(Boolean).join(', ') || 'N/A'}
                    </span>
                    <Badge className={data.is_verified ? 'bg-emerald-50 text-emerald-600 border-none text-xs' : 'bg-orange-50 text-orange-600 border-none text-xs'}>
                      {data.is_verified ? 'Verified' : 'Pending'}
                    </Badge>
                  </div>
                  <p className='text-xs text-slate-400'>
                    Added {new Date(data.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className='overflow-y-auto flex-1 mt-4 space-y-4 pr-1'>
              {/* Stats row */}
              <div className='grid grid-cols-3 gap-3'>
                {[
                  { icon: Users, label: 'Students', value: data.students.length },
                  { icon: GraduationCap, label: 'Facilitators', value: data.facilitators.length },
                  { icon: ShieldCheck, label: 'Verified Students', value: data.students.filter((s) => s.is_verified).length },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className='rounded-xl bg-slate-50 p-3 text-center'>
                    <Icon className='w-4 h-4 text-slate-400 mx-auto mb-1' />
                    <p className='text-lg font-bold text-slate-800'>{value}</p>
                    <p className='text-[10px] text-slate-400 font-medium uppercase tracking-wide'>{label}</p>
                  </div>
                ))}
              </div>

              <Tabs defaultValue='students'>
                <TabsList className='w-full bg-slate-100'>
                  <TabsTrigger value='students' className='flex-1 gap-1.5'>
                    <Users className='w-3.5 h-3.5' />
                    Students
                    <span className='ml-1 text-xs bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 leading-none'>
                      {data.students.length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value='facilitators' className='flex-1 gap-1.5'>
                    <Building2 className='w-3.5 h-3.5' />
                    Facilitators
                    <span className='ml-1 text-xs bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 leading-none'>
                      {data.facilitators.length}
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value='students' className='mt-3 space-y-2'>
                  {data.students.length === 0 ? (
                    <p className='text-xs text-slate-400 italic py-4 text-center'>No students enrolled yet.</p>
                  ) : (
                    data.students.map((s) => (
                      <div key={s.id} className='flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100'>
                        <div className='min-w-0 mr-3'>
                          <p className='text-sm font-semibold text-slate-800 truncate'>{s.full_name}</p>
                          <p className='text-xs text-slate-400 truncate'>{s.email}</p>
                          {(s.degree || s.current_academic_year) && (
                            <p className='text-[10px] text-slate-400 mt-0.5'>
                              {[s.degree, s.current_academic_year].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <Badge className={s.is_verified ? 'bg-emerald-50 text-emerald-600 border-none text-xs shrink-0' : 'bg-yellow-50 text-yellow-600 border-none text-xs shrink-0'}>
                          {s.is_verified ? 'Verified' : 'Pending'}
                        </Badge>
                      </div>
                    ))
                  )}
                </TabsContent>

                <TabsContent value='facilitators' className='mt-3 space-y-2'>
                  {data.facilitators.length === 0 ? (
                    <p className='text-xs text-slate-400 italic py-4 text-center'>No facilitators assigned yet.</p>
                  ) : (
                    data.facilitators.map((f) => (
                      <div key={f.id} className='flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100'>
                        <div>
                          <p className='text-sm font-semibold text-slate-800'>{f.full_name}</p>
                          <p className='text-xs text-slate-400'>{f.email}</p>
                        </div>
                        <Badge className={f.is_verified ? 'bg-emerald-50 text-emerald-600 border-none text-xs' : 'bg-yellow-50 text-yellow-600 border-none text-xs'}>
                          {f.is_verified ? 'Active' : 'Pending'}
                        </Badge>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
