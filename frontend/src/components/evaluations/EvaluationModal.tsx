import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import apiClient from "@/services/api";

type Props = {
  open: boolean;
  onClose: () => void;
  assignmentName: string;
  assignmentId: string;
  onComplete: () => void;
};

const EvaluationModal = ({ open, onClose, assignmentName, assignmentId, onComplete }: Props) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"idle" | "running" | "completed">("idle");
  const [evaluatorType, setEvaluatorType] = useState<string>("");
  const [evaluationScope, setEvaluationScope] = useState<"pending" | "all">("pending");
  const [evaluationId, setEvaluationId] = useState("");
  const navigate = useNavigate();

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStatus("idle");
      setProgress(0);
      setEvaluatorType("");
      setEvaluationScope("pending");
      setEvaluationId("");
    }
  }, [open]);

  const runEvaluation = async () => {
    try {
      setStatus("running");
      setProgress(20);

      const res = await apiClient.post("/evaluations/run", {
        assignmentId,
        evaluatorType: evaluatorType || undefined,
        scope: evaluationScope
      });

      const data = res.data;

      if (!data.success) {
        throw new Error(data.message);
      }

      // ✅ store evaluationId
      if (data.evaluationId) {
        setEvaluationId(data.evaluationId);
      }
      
      if (data.message && data.message.includes("already evaluated")) {
        // No new submissions to evaluate
        alert("No pending submissions found. To re-evaluate already graded submissions, select 'Re-evaluate All Submissions'.");
        setStatus("idle");
        setProgress(0);
        return;
      }

      // 🔄 Start polling Central Evaluators
      const checkStatus = async () => {
        try {
          const syncRes = await apiClient.get(`/evaluations/sync/${data.evaluationId}`);
          const syncData = syncRes.data;
          
          if (syncData.success && syncData.progress) {
             const p = syncData.progress;
             const percent = Math.floor((p.completed / Math.max(1, p.total)) * 80) + 20; // scale 20-100%
             setProgress(percent);
             
             if (p.isFinished) {
               setProgress(100);
               setStatus("completed");
               onComplete();
             } else {
               setTimeout(checkStatus, 3000); // Check again in 3s
             }
          } else {
             setTimeout(checkStatus, 3000);
          }
        } catch (err) {
          console.error("Polling failed", err);
          setTimeout(checkStatus, 5000); // Retry on error
        }
      };

      checkStatus();
    } catch (err: any) {
      console.error("Evaluation failed", err);
      const msg = err.response?.data?.message || err.message || "Failed to start evaluation";
      alert("Evaluation failed: " + msg);
      setStatus("idle"); // reset so they can try again
    }
  };

    
    // await axios.post("/run-evaluation", { assignmentName })

  //   const interval = setInterval(() => {
  //     setProgress((prev) => {
  //       if (prev >= 100) {
  //         clearInterval(interval);
  //         setStatus("completed"); // ✅ switch to success screen
  //         return 100;
  //       }
  //       return prev + 10;
  //     });
  //   }, 400);

  //   return () => clearInterval(interval);
  // }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-[8px] p-6 w-[429px] text-center shadow-lg">

        {/* ================= IDLE STATE ================= */}
        {status === "idle" && (
          <>
            <h2 className="text-lg font-semibold mb-2">Configure Evaluation</h2>
            <p className="text-sm text-gray-500 mb-6">{assignmentName}</p>

            <div className="text-left mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Evaluator Type</label>
              <select 
                className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={evaluatorType}
                onChange={(e) => setEvaluatorType(e.target.value)}
              >
                <option value="">Auto-Detect (Use Database Default)</option>
                <option value="VISUAL">Visual / DOM Evaluator</option>
                <option value="JS">JavaScript Evaluator</option>
                <option value="REACT">React Evaluator</option>
                <option value="AI">AI / Backend Evaluator</option>
                <option value="FULLSTACK">Fullstack Evaluator</option>
                <option value="PYTHON">Python Evaluator</option>
                <option value="EXCEL">Excel Spreadsheet Evaluator</option>
              </select>
            </div>

            <div className="text-left mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Evaluation Scope</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="evaluationScope"
                    value="pending"
                    checked={evaluationScope === "pending"}
                    onChange={() => setEvaluationScope("pending")}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Evaluate Pending Submissions Only
                    <span className="block text-xs text-gray-500 font-normal mt-0.5">Skips students who were already evaluated successfully.</span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer mt-3">
                  <input
                    type="radio"
                    name="evaluationScope"
                    value="all"
                    checked={evaluationScope === "all"}
                    onChange={() => setEvaluationScope("all")}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Re-evaluate All Submissions
                    <span className="block text-xs text-gray-500 font-normal mt-0.5">Overwrites all previous scores for every student.</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={runEvaluation}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Start Evaluation
              </button>
            </div>
          </>
        )}

        {/* ================= RUNNING STATE ================= */}
        {status === "running" && (
          <>
            {/* Loader */}
            <div className="w-10 h-10 border-4 border-[#1E3A8A] border-t-transparent rounded-full animate-spin mx-auto mb-4" />

            <h2 className="text-lg font-semibold">
              Running AI Evaluation
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              {assignmentName}
            </p>

            <p className="text-sm text-gray-400 mt-2">
              Analyzing submissions...
            </p>

            {/* Progress */}
            <div className="mt-4">
              <div className="w-full bg-blue-900 h-2 rounded-full">
                <div
                  className="bg-[#5C4BDB] h-2 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {progress}% complete
              </p>
            </div>
          </>
        )}

        {/* ================= COMPLETED STATE ================= */}
        {status === "completed" && (
          <>
            <h2 className="text-[18px] font-semibold text-green-600">
              Evaluation Completed Successfully
            </h2>

            <p className="text-[15.88px] text-gray-500 mt-2">
              All batches for "{assignmentName}" have been evaluated.
            </p>

            <div className="flex justify-center gap-3 mt-5">
              
              {/* View Results */}
              <button
                onClick={() => {
                  navigate(`/dashboard/facilitator/results/${evaluationId}`);
                }}
                className="w-[167px] h-[40px] rounded-[4px] text-sm rounded bg-gray-200 hover:bg-gray-300"
              >
                View Batch Results
              </button>

              {/* Return */}
              <button
                onClick={() => {
                  onClose(); // close modal
                }}
                className="w-[224px] h-[40px] rounded-[4px] text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Return to Evaluation Center
              </button>

            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default EvaluationModal;