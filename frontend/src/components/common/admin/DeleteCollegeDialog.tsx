import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import toast from 'react-hot-toast';
import { getErrorMessage } from '@/lib/utils';
import apiClient from '@/services/api';

export default function DeleteCollegeDialog({
  open,
  onClose,
  collegeId,
  collegeName,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  collegeId: string;
  collegeName?: string;
  onSuccess: () => void;
}) {
  const handleDelete = async () => {
    try {
      await apiClient.delete(`/colleges/${collegeId}`);
      toast.success('College moved to recycle bin');
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete college'));
    } finally {
      onClose();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="w-[94vw] sm:max-w-md rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base sm:text-lg font-bold text-slate-900">
            Move to Recycle Bin?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs sm:text-sm text-slate-500">
            This will move {collegeName ? <strong className="text-slate-800">{collegeName}</strong> : 'this college'} to the Recycle Bin for 30 days. Its assignments and facilitator mappings will be hidden from all dashboards and filters. You can restore it anytime within 30 days.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-4">
          <AlertDialogCancel className="w-full sm:w-auto rounded-xl mt-0">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white rounded-xl"
          >
            Move to Bin
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
