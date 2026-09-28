import { BarChart, TrendingUp, TrendingDown, Activity } from "lucide-react";

type Result = {
  student_name: string;
  marks: number;
  feedback: string;
};

type Props = {
  results: Result[];
};

const StatsCard = ({ results }: Props) => {
  if (!results.length) 
    return (
    <div className="mt-6 text-sm text-gray-500">
      No results available
    </div>
  );


  const scores = results.map((r: Result) => r.marks);

  const avg = (
    scores.reduce((a: number, b: number) => a + b, 0) / scores.length
  ).toFixed(1);

  const top = Math.max(...scores);
  const low = Math.min(...scores);

  const data = [
    {
      label: "Average Score",
      value: avg,
      icon: BarChart,
      bg: "bg-blue-50",
      color: "text-blue-600",
    },
    {
      label: "Top Score",
      value: top,
      icon: TrendingUp,
      bg: "bg-green-50",
      color: "text-green-600",
    },
    {
      label: "Lowest Score",
      value: low,
      icon: TrendingDown,
      bg: "bg-red-50",
      color: "text-red-600",
    },
    {
      label: "Submission Count",
      value: results.length,
      icon: Activity,
      bg: "bg-purple-50",
      color: "text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mt-3 sm:mt-6">
      {data.map((item, i) => (
        <div
          key={i}
          className="bg-white border border-slate-200 rounded-xl sm:rounded-2xl p-3 sm:px-4 sm:py-3 flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-2 sm:gap-3 shadow-2xs hover:border-slate-300 transition-all min-w-0"
        >
          <div
            className={`w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl shrink-0 ${item.bg}`}
          >
            <item.icon className={item.color} size={16} />
          </div>

          <div className="min-w-0 flex-1 w-full">
            <p className="text-[10px] sm:text-xs text-slate-500 font-semibold truncate">{item.label}</p>
            <p className="text-base sm:text-xl font-bold text-slate-900 mt-0.5">
              {item.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCard;