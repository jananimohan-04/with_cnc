const fs = require('fs');

let content = fs.readFileSync('src/pages/production/unified/SchedulingPage.tsx', 'utf8');

// Replace weekDates logic with dynamic dates based on view
const oldDatesLogic = `  // Derive week dates (Mon to Sat based on screenshot)
  const getWeekDates = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    const monday = new Date(d.setDate(diff));
    return Array.from({ length: 6 }).map((_, i) => { // Mon-Sat (6 days)
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  };

  const weekDates = getWeekDates(currentDate);`;

const newDatesLogic = `  const getActiveDates = () => {
    const d = new Date(currentDate);
    if (view === 'Day') {
      return [d];
    } else if (view === 'Week') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return Array.from({ length: 6 }).map((_, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        return date;
      });
    } else {
      // Month - return 30 days starting from 1st
      const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return Array.from({ length: daysInMonth }).map((_, i) => {
        const date = new Date(firstDay);
        date.setDate(firstDay.getDate() + i);
        return date;
      });
    }
  };

  const activeDates = getActiveDates();
  
  // Calculate slots per day depending on view
  const getSlots = () => {
    if (view === 'Day') return [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]; // hourly
    if (view === 'Week') return [8, 10, 12, 14, 16]; // 2-hourly
    return [0]; // daily
  };
  
  const activeSlots = getSlots();`;

content = content.replace(oldDatesLogic, newDatesLogic);

// Replace weekDates[0]... with activeDates logic in header
content = content.replace(
  `{weekDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - {weekDates[5].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
  `{view === 'Day' ? activeDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : view === 'Month' ? activeDates[0].toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : \`\${activeDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - \${activeDates[activeDates.length - 1].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}\`}`
);

// Fix Previous / Next logic for Day / Month
const navLogicOld = `<button className="p-2 text-slate-600 hover:bg-slate-50 border-r border-slate-200" onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); }}><ChevronLeft size={18} /></button>
            <div className="px-4 py-1.5 text-sm font-medium text-slate-700 min-w-[200px] text-center flex items-center justify-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              {view === 'Day' ? activeDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : view === 'Month' ? activeDates[0].toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : \`\${activeDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - \${activeDates[activeDates.length - 1].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}\`}
            </div>
            <button className="p-2 text-slate-600 hover:bg-slate-50 border-l border-slate-200" onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); }}><ChevronRight size={18} /></button>`;

const navLogicNew = `<button className="p-2 text-slate-600 hover:bg-slate-50 border-r border-slate-200" onClick={() => { const d = new Date(currentDate); if (view === 'Day') d.setDate(d.getDate() - 1); else if (view === 'Week') d.setDate(d.getDate() - 7); else d.setMonth(d.getMonth() - 1); setCurrentDate(d); }}><ChevronLeft size={18} /></button>
            <div className="px-4 py-1.5 text-sm font-medium text-slate-700 min-w-[200px] text-center flex items-center justify-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              {view === 'Day' ? activeDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : view === 'Month' ? activeDates[0].toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : \`\${activeDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - \${activeDates[activeDates.length - 1].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}\`}
            </div>
            <button className="p-2 text-slate-600 hover:bg-slate-50 border-l border-slate-200" onClick={() => { const d = new Date(currentDate); if (view === 'Day') d.setDate(d.getDate() + 1); else if (view === 'Week') d.setDate(d.getDate() + 7); else d.setMonth(d.getMonth() + 1); setCurrentDate(d); }}><ChevronRight size={18} /></button>`;

content = content.replace(navLogicOld, navLogicNew);

// Now the Machines Grid Headers
const oldHeaders = `{weekDates.map(date => (
                    <div key={date.toISOString()} className="flex-1 flex flex-col min-w-[200px] border-r border-slate-100 last:border-r-0">
                      <div className="py-2 text-center border-b border-slate-100">
                        <div className="font-semibold text-slate-800">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div className="text-xs text-slate-500">{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                      </div>
                      <div className="flex text-[10px] text-slate-400 font-medium">
                        {['8 AM', '10 AM', '12 PM', '2 PM', '4 PM'].map(t => (
                          <div key={t} className="flex-1 text-center py-1 border-r border-slate-50 last:border-r-0">{t}</div>
                        ))}
                      </div>
                    </div>
                  ))}`;

const newHeaders = `{activeDates.map(date => (
                    <div key={date.toISOString()} className={\`flex-1 flex flex-col \${view === 'Month' ? 'min-w-[60px]' : view === 'Day' ? 'min-w-[1000px]' : 'min-w-[200px]'} border-r border-slate-100 last:border-r-0\`}>
                      <div className="py-2 text-center border-b border-slate-100 h-12 flex flex-col justify-center">
                        <div className={\`font-semibold text-slate-800 \${view === 'Month' ? 'text-xs' : ''}\`}>{date.toLocaleDateString('en-US', { weekday: view === 'Month' ? 'narrow' : 'short' })}</div>
                        {view !== 'Month' && <div className="text-xs text-slate-500">{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
                        {view === 'Month' && <div className="text-xs text-slate-500">{date.getDate()}</div>}
                      </div>
                      <div className="flex text-[10px] text-slate-400 font-medium">
                        {view === 'Month' ? (
                           <div className="flex-1 text-center py-1">All Day</div>
                        ) : activeSlots.map(t => (
                          <div key={t} className="flex-1 text-center py-1 border-r border-slate-50 last:border-r-0">{t > 12 ? t - 12 + ' PM' : t === 12 ? '12 PM' : t + ' AM'}</div>
                        ))}
                      </div>
                    </div>
                  ))}`;

content = content.replace(oldHeaders, newHeaders);

// Now the Machines Grid body 
const oldMachineSlots = `{weekDates.map((date, dayIdx) => (
                      <div key={date.toISOString()} className="flex-1 flex min-w-[200px] border-r border-slate-100 last:border-r-0 relative">
                        {/* 5 columns (8, 10, 12, 14, 16) */}
                        {[8, 10, 12, 14, 16].map((hour, slotIdx) => (
                          <div 
                            key={hour} 
                            className="flex-1 border-r border-slate-50 border-dashed last:border-r-0 transition-colors hover:bg-blue-50/50"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, machine.code, date, hour)}
                          >
                            {/* Render jobs here if they match */}
                            {scheduledJobs
                              .filter(j => j.machine === machine.code)
                              .map(job => {
                                const jobDate = new Date(job.created_at);
                                const jDateStr = jobDate.toDateString();
                                const dDateStr = date.toDateString();
                                const jobHour = jobDate.getHours();
                                // Match the closest slot. In reality, it should span across, but for this mock we place it in the matching hour slot
                                if (jDateStr === dDateStr && (jobHour >= hour && jobHour < hour + 2)) {
                                  const dur = calculateDurationHours(job);
                                  const spanCols = Math.ceil(dur / 2); // 2 hours per col
                                  const pctWidth = spanCols * 100;
                                  
                                  return (
                                    <div 
                                      key={job.id} 
                                      draggable
                                      onDragStart={(e) => handleDragStart(e, job)}
                                      onClick={() => setSelectedJob(job)}
                                      className={\`absolute top-1 bottom-1 z-10 \${getStatusColor(job.status)} border rounded p-1.5 text-[10px] sm:text-xs leading-tight overflow-hidden cursor-move shadow-sm hover:shadow-md transition-shadow\`}
                                      style={{ left: \`\${slotIdx * 20}%\`, width: \`calc(\${(pctWidth / 5)}% - 4px)\`, minWidth: '80px' }}
                                    >
                                      <div className="font-bold truncate">{job.work_order || job.job_no}</div>
                                      <div className="truncate opacity-90">{job.part_name}</div>
                                      <div className="truncate opacity-80 mt-0.5">{formatTime(job.created_at)} - {Math.round(dur)}h</div>
                                    </div>
                                  );
                                }
                                return null;
                              })
                            }
                          </div>
                        ))}
                      </div>
                    ))}`;

const newMachineSlots = `{activeDates.map((date, dayIdx) => (
                      <div key={date.toISOString()} className={\`flex-1 flex \${view === 'Month' ? 'min-w-[60px]' : view === 'Day' ? 'min-w-[1000px]' : 'min-w-[200px]'} border-r border-slate-100 last:border-r-0 relative\`}>
                        {activeSlots.map((hour, slotIdx) => (
                          <div 
                            key={hour} 
                            className={\`flex-1 border-r border-slate-50 border-dashed last:border-r-0 transition-colors hover:bg-blue-50/50 min-h-[50px] \${view==='Month' ? 'p-1' : ''}\`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, machine.code, date, hour)}
                          >
                            {scheduledJobs
                              .filter(j => j.machine === machine.code)
                              .map(job => {
                                const jobDate = new Date(job.created_at);
                                const jDateStr = jobDate.toDateString();
                                const dDateStr = date.toDateString();
                                const jobHour = jobDate.getHours();
                                
                                const hourSpan = view === 'Day' ? 1 : view === 'Week' ? 2 : 24;
                                const isMatch = view === 'Month' ? (jDateStr === dDateStr) : (jDateStr === dDateStr && (jobHour >= hour && jobHour < hour + hourSpan));
                                
                                if (isMatch) {
                                  const dur = calculateDurationHours(job);
                                  const spanCols = view === 'Month' ? 1 : Math.ceil(dur / hourSpan); 
                                  const pctWidth = spanCols * 100;
                                  const leftPct = slotIdx * (100 / activeSlots.length);
                                  
                                  return (
                                    <div 
                                      key={job.id} 
                                      draggable
                                      onDragStart={(e) => handleDragStart(e, job)}
                                      onClick={() => setSelectedJob(job)}
                                      className={\`absolute top-1 bottom-1 z-10 \${getStatusColor(job.status)} border rounded p-1.5 text-[10px] sm:text-xs leading-tight overflow-hidden cursor-move shadow-sm hover:shadow-md transition-shadow\`}
                                      style={{ left: \`\${leftPct}%\`, width: view === 'Month' ? 'calc(100% - 4px)' : \`calc(\${(pctWidth / activeSlots.length)}% - 4px)\`, minWidth: view === 'Month' ? 'auto' : '80px' }}
                                    >
                                      <div className="font-bold truncate text-[10px] sm:text-xs">{job.work_order || job.job_no}</div>
                                      {view !== 'Month' && <div className="truncate opacity-90">{job.part_name}</div>}
                                      {view !== 'Month' && <div className="truncate opacity-80 mt-0.5">{formatTime(job.created_at)} - {Math.round(dur)}h</div>}
                                    </div>
                                  );
                                }
                                return null;
                              })
                            }
                          </div>
                        ))}
                      </div>
                    ))}`;

content = content.replace(oldMachineSlots, newMachineSlots);


// Do the same for Operators grids
// Operator Headers
const oldOpHeaders = `{weekDates.map(date => (
                    <div key={date.toISOString()} className="flex-1 flex flex-col min-w-[200px] border-r border-slate-100 last:border-r-0">
                      <div className="py-2 text-center border-b border-slate-100">
                        <div className="font-semibold text-slate-800">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      </div>
                      <div className="flex text-[10px] text-slate-400 font-medium">
                        {['8 AM', '10 AM', '12 PM', '2 PM', '4 PM'].map(t => (
                          <div key={t} className="flex-1 text-center py-1 border-r border-slate-50 last:border-r-0">{t}</div>
                        ))}
                      </div>
                    </div>
                  ))}`;

const newOpHeaders = `{activeDates.map(date => (
                    <div key={date.toISOString()} className={\`flex-1 flex flex-col \${view === 'Month' ? 'min-w-[60px]' : view === 'Day' ? 'min-w-[1000px]' : 'min-w-[200px]'} border-r border-slate-100 last:border-r-0\`}>
                      <div className="py-2 text-center border-b border-slate-100 h-12 flex flex-col justify-center">
                        <div className={\`font-semibold text-slate-800 \${view === 'Month' ? 'text-xs' : ''}\`}>{date.toLocaleDateString('en-US', { weekday: view === 'Month' ? 'narrow' : 'short' })}</div>
                      </div>
                      <div className="flex text-[10px] text-slate-400 font-medium">
                        {view === 'Month' ? (
                           <div className="flex-1 text-center py-1">All Day</div>
                        ) : activeSlots.map(t => (
                          <div key={t} className="flex-1 text-center py-1 border-r border-slate-50 last:border-r-0">{t > 12 ? t - 12 + ' PM' : t === 12 ? '12 PM' : t + ' AM'}</div>
                        ))}
                      </div>
                    </div>
                  ))}`;

content = content.replace(oldOpHeaders, newOpHeaders);

// Operator body
const oldOpBody = `{weekDates.map((date, dayIdx) => (
                      <div key={date.toISOString()} className="flex-1 flex min-w-[200px] border-r border-slate-100 last:border-r-0 relative">
                        {[8, 10, 12, 14, 16].map((hour, slotIdx) => (
                          <div key={hour} className="flex-1 border-r border-slate-50 border-dashed last:border-r-0 bg-slate-50/30">
                            {/* Render operator jobs here if mapped. Currently mock operator assignment based on machine logic could go here */}
                          </div>
                        ))}
                      </div>
                    ))}`;

const newOpBody = `{activeDates.map((date, dayIdx) => (
                      <div key={date.toISOString()} className={\`flex-1 flex \${view === 'Month' ? 'min-w-[60px]' : view === 'Day' ? 'min-w-[1000px]' : 'min-w-[200px]'} border-r border-slate-100 last:border-r-0 relative\`}>
                        {activeSlots.map((hour, slotIdx) => (
                          <div key={hour} className="flex-1 border-r border-slate-50 border-dashed last:border-r-0 bg-slate-50/30 min-h-[50px]">
                          </div>
                        ))}
                      </div>
                    ))}`;

content = content.replace(oldOpBody, newOpBody);


fs.writeFileSync('src/pages/production/unified/SchedulingPage.tsx', content);
