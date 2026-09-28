type Result = {
  student_name: string;
  marks: number;
  feedback: string;
};

type Props = {
  results: Result[];
};

const ScoreChart = ({ results } : Props) => {
  const buckets = {
  "0-20": 0,
  "20-40": 0,
  "40-60": 0,
  "60-80": 0,
  "80-100": 0,
};

results.forEach((r: Result) => {
  const m = r.marks;

  if (m <= 20) buckets["0-20"]++;
  else if (m <= 40) buckets["20-40"]++;
  else if (m <= 60) buckets["40-60"]++;
  else if (m <= 80) buckets["60-80"]++;
  else buckets["80-100"]++;
});

const data = Object.entries(buckets).map(([range, value]) => ({
  range,
  value,
}));

  // const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 mt-4 sm:mt-6 bg-white w-full min-w-0 shadow-xs">
      {/* Title */}
      <h2 className="text-xs sm:text-[13px] font-semibold text-slate-700 mb-4 sm:mb-6">
        Score Distribution
      </h2>

      {/* Chart Wrapper */}
      <div className="overflow-x-auto custom-scrollbar w-full min-w-0 pb-2">
        <div className="flex min-w-[320px]">
          {/* Y Axis */}
          <div className="flex flex-col justify-between text-[10px] text-slate-400 pr-2 h-[220px]">
            {[0, 5, 10, 15, 20].map((val) => (
              <span key={val}>{val}</span>
            ))}
          </div>

          {/* Chart */}
          <div className="flex-1 min-w-0">
            {/* Bars Area */}
            <div className="relative h-[200px] border-l border-b border-slate-300">
              {/* Grid */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2, 3, 4].map((_, i) => (
                  <div key={i} className="border-t border-slate-100" />
                ))}
              </div>

              {/* Bars */}
              <div className="absolute inset-0 flex items-end gap-2.5 sm:gap-6 px-3 sm:px-6">
                {data.map((item, i) => {
                  const maxValue = Math.max(...data.map(d => d.value), 1);
                  const height = (item.value / maxValue) * 180;

                  return (
                    <div key={i} className="flex-1 flex justify-center">
                      <div
                        className="w-full max-w-[50px] sm:max-w-[70px] bg-blue-600 hover:bg-blue-700 transition-colors rounded-t-sm z-10"
                        style={{ height: `${Math.max(height, item.value > 0 ? 4 : 0)}px` }}
                        title={`${item.range}: ${item.value} submissions`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* X Axis Labels */}
            <div className="flex justify-between px-3 sm:px-6 mt-2">
              {data.map((item, i) => (
                <p key={i} className="text-[10px] sm:text-[11px] text-slate-500 text-center flex-1">
                  {item.range}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreChart;