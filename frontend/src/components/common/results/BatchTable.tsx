type Result = {
  expected_graduation_year?: string;
  college_name?: string;
  marks?: number;
};

const BatchTable = ({ results }: { results: Result[] }) => {
  // Group results by college_name
  const grouped = results.reduce((acc: any, r) => {
    const college = r.college_name || "Unknown";
    const year = r.expected_graduation_year;
    
    if (!acc[college]) {
      acc[college] = { college, count: 0, totalScore: 0, years: {} };
    }
    
    acc[college].count += 1;
    acc[college].totalScore += (r.marks || 0);
    
    if (year) {
      acc[college].years[year] = (acc[college].years[year] || 0) + 1;
    }
    
    return acc;
  }, {});

  const data = Object.values(grouped).map((g: any) => {
    // Find the most frequent graduation year for this college
    let mostFrequentYear = "Unknown";
    let maxCount = 0;
    
    for (const [year, count] of Object.entries(g.years)) {
      if ((count as number) > maxCount) {
        maxCount = count as number;
        mostFrequentYear = year;
      }
    }

    return {
      year: mostFrequentYear,
      college: g.college,
      submissions: g.count,
      avg: (g.totalScore / g.count).toFixed(1)
    };
  });

  return (
    <div className="mt-4 sm:mt-6 border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-xs min-w-0">
      <h2 className="p-3.5 sm:p-4 font-semibold text-xs sm:text-sm text-slate-800 border-b border-slate-100">Graduation Year Results</h2>

      {/* Mobile Card View (< sm) */}
      <div className="sm:hidden divide-y divide-slate-100">
        {data.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-xs">No data available</div>
        ) : (
          data.map((item: any, i: number) => (
            <div key={i} className="p-3 space-y-1.5 bg-white">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs text-slate-900 truncate">{item.college}</span>
                <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full shrink-0">
                  Batch {item.year}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>{item.submissions} submission{item.submissions !== 1 ? 's' : ''}</span>
                <span className="font-bold text-slate-900">Avg: {item.avg}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View (>= sm) */}
      <div className="hidden sm:block overflow-x-auto custom-scrollbar w-full min-w-0">
        <table className="w-full min-w-[550px] text-xs sm:text-sm border-separate border-spacing-0">
          <thead className="bg-slate-50/60 text-slate-500 text-[11px] sm:text-xs uppercase">
            <tr>
              <th className="p-3 text-left font-semibold">Graduation Year</th>
              <th className="p-3 text-left font-semibold">College</th>
              <th className="p-3 text-center font-semibold">Submissions</th>
              <th className="p-3 text-center font-semibold">Avg Score</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-slate-400 text-xs sm:text-sm">No data available</td>
              </tr>
            ) : (
              data.map((item: any, i: number) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/60 transition">
                  <td className="p-3 text-slate-700">{item.year}</td>
                  <td className="p-3 font-medium text-slate-800">{item.college}</td>
                  <td className="p-3 text-center text-slate-600">{item.submissions}</td>
                  <td className="p-3 text-center font-bold text-slate-900">{item.avg}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BatchTable;