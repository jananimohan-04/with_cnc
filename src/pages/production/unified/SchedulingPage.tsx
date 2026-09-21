import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Badge } from '@/components/ui/Card';
import { Calendar, ChevronLeft, ChevronRight, Search, Filter, Plus, User, Settings2, Clock, GripVertical, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Card';

export function SchedulingPage() {
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(false);
  const [machines, setMachines] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([{ id: 'OP-1', name: 'Ramesh', role: 'VMC Operator', status: 'Available' }, { id: 'OP-2', name: 'Kumar', role: 'VMC Operator', status: 'Available' }, { id: 'OP-3', name: 'Sathish', role: 'Lathe Operator', status: 'Available' }, { id: 'OP-4', name: 'Murugan', role: 'Lathe Operator', status: 'On Break' }, { id: 'OP-5', name: 'Ravi', role: 'Grinding Operator', status: 'Available' }]);
  const [jobs, setJobs] = useState<any[]>([]);
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'Day' | 'Week' | 'Month'>('Week');
  
  const [draggedJob, setDraggedJob] = useState<any>(null);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  // Derive week dates (Mon to Sat based on screenshot)
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

  const weekDates = getWeekDates(currentDate);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const [machinesRes, jobsRes] = await Promise.all([
        supabase.from('cnc_machines').select('*').order('code'),
        supabase.from('cnc_job_cards').select('*')
      ]);

      if (machinesRes.error) throw machinesRes.error;
      if (jobsRes.error) throw jobsRes.error;

      setMachines(machinesRes.data || []);
      setJobs(jobsRes.data || []);
      setDbError(false);
    } catch (err) {
      console.error(err);
      setDbError(true);
    } finally {
      setLoading(false);
    }
  }

  // Calculate duration in hours based on qty and cycle time
  const calculateDurationHours = (job: any) => {
    const qty = Number(job.qty_planned) || 0;
    const cycleMins = Number(job.cycle_time) || 0;
    const setupMins = Number(job.setup_time) || 0;
    const totalMins = setupMins + (qty * cycleMins);
    return Math.max(1, Math.round((totalMins / 60) * 10) / 10);
  };

  // Helper to format date strings
  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // Unscheduled vs Scheduled Jobs
  const isScheduled = (j: any) => j.machine && j.status !== 'Pending' && j.status !== 'New';
  const unscheduledJobs = jobs.filter(j => !isScheduled(j));
  const scheduledJobs = jobs.filter(isScheduled);

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, job: any) => {
    setDraggedJob(job);
    e.dataTransfer.setData('text/plain', job.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, machineCode: string, targetDate: Date, slotHour: number) => {
    e.preventDefault();
    if (!draggedJob) return;

    // Create a new start date/time
    const newStart = new Date(targetDate);
    newStart.setHours(slotHour, 0, 0, 0);

    // Optimistically update
    const updatedJobs = jobs.map(j => 
      j.id === draggedJob.id 
        ? { ...j, machine: machineCode, status: 'Planned', created_at: newStart.toISOString() } 
        : j
    );
    setJobs(updatedJobs);
    setDraggedJob(null);

    // Persist to Supabase
    try {
      const { error } = await supabase.from('cnc_job_cards').update({
        machine: machineCode,
        status: 'Planned',
        created_at: newStart.toISOString()
      }).eq('id', draggedJob.id);

      if (error) throw error;
      fetchData(); // re-sync
    } catch (err) {
      console.error('Failed to update job schedule', err);
      alert('Error updating schedule. Reverting changes.');
      fetchData();
    }
  };

  const statusColors: Record<string, string> = {
    'Planned': 'bg-blue-200 text-blue-800 border-blue-300',
    'In Progress': 'bg-brand-200 text-brand-800 border-brand-300',
    'Setup': 'bg-emerald-200 text-emerald-800 border-emerald-300',
    'Completed': 'bg-purple-200 text-purple-800 border-purple-300',
    'Waiting': 'bg-orange-200 text-orange-800 border-orange-300',
    'Delayed': 'bg-red-200 text-red-800 border-red-300',
    'Maintenance': 'bg-slate-200 text-slate-800 border-slate-300',
  };

  const getStatusColor = (status: string) => statusColors[status] || statusColors['Planned'];

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-[calc(100vh-4rem)]">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Production Scheduling</h1>
          <p className="text-slate-500 text-sm">Plan machines and manpower. Drag and drop jobs to reschedule.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-white rounded-lg border border-slate-200 p-1">
            {['Day', 'Week', 'Month'].map(v => (
              <button 
                key={v}
                onClick={() => setView(v as any)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${view === v ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white rounded-lg border border-slate-200">
            <button className="p-2 text-slate-600 hover:bg-slate-50 border-r border-slate-200" onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); }}><ChevronLeft size={18} /></button>
            <div className="px-4 py-1.5 text-sm font-medium text-slate-700 min-w-[200px] text-center flex items-center justify-center gap-2">
              <Calendar size={16} className="text-slate-400" />
              {weekDates[0].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - {weekDates[5].toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <button className="p-2 text-slate-600 hover:bg-slate-50 border-l border-slate-200" onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); }}><ChevronRight size={18} /></button>
          </div>

          <Button variant="secondary" className="bg-white" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="primary" className="bg-blue-600 hover:bg-blue-700 text-white"><Plus size={18} /> Add Job</Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* MAIN GRID */}
        <div className="flex-1 space-y-6 overflow-hidden">
          
          {/* MACHINES GRID */}
          <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm flex flex-col relative">
            <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
              <Settings2 size={18} className="text-blue-600" />
              <h2 className="font-bold text-slate-800 text-lg">Machines</h2>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[1200px]">
                {/* Header Row */}
                <div className="flex border-b border-slate-200 bg-white">
                  <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white sticky left-0 z-20"></div>
                  {weekDates.map(date => (
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
                  ))}
                </div>

                {/* Machine Rows */}
                {machines.map(machine => (
                  <div key={machine.id} className="flex border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors relative min-h-[70px]">
                    <div className="w-56 flex-shrink-0 p-3 border-r border-slate-200 bg-white sticky left-0 z-10 flex flex-col justify-center">
                      <div className="font-bold text-slate-800">{machine.code}</div>
                      <div className="text-xs text-slate-500">{machine.name} - {machine.type}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className={`w-2 h-2 rounded-full ${machine.status === 'Running' ? 'bg-emerald-500' : machine.status === 'Maintenance' ? 'bg-amber-500' : 'bg-slate-400'}`}></div>
                        <span className="text-[11px] font-medium text-slate-600">{machine.status}</span>
                      </div>
                    </div>
                    
                    {/* Time Slots for the Machine */}
                    {weekDates.map((date, dayIdx) => (
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
                                      className={`absolute top-1 bottom-1 z-10 ${getStatusColor(job.status)} border rounded p-1.5 text-[10px] sm:text-xs leading-tight overflow-hidden cursor-move shadow-sm hover:shadow-md transition-shadow`}
                                      style={{ left: `${slotIdx * 20}%`, width: `calc(${(pctWidth / 5)}% - 4px)`, minWidth: '80px' }}
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
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* OPERATORS GRID */}
          <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm flex flex-col relative">
            <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
              <User size={18} className="text-purple-600" />
              <h2 className="font-bold text-slate-800 text-lg">Manpower / Operators</h2>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[1200px]">
                {/* Header Row */}
                <div className="flex border-b border-slate-200 bg-white">
                  <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white sticky left-0 z-20"></div>
                  {weekDates.map(date => (
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
                  ))}
                </div>

                {/* Operator Rows */}
                {operators.map(op => (
                  <div key={op.id} className="flex border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors relative min-h-[70px]">
                    <div className="w-56 flex-shrink-0 p-3 border-r border-slate-200 bg-white sticky left-0 z-10 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold flex-shrink-0">
                        {op.name.charAt(0)}
                      </div>
                      <div className="flex flex-col justify-center">
                        <div className="font-bold text-slate-800">{op.name}</div>
                        <div className="text-xs text-slate-500">{op.role}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <div className={`w-2 h-2 rounded-full ${op.status === 'Available' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                          <span className="text-[11px] font-medium text-slate-600">{op.status}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Time Slots for Operator */}
                    {weekDates.map((date, dayIdx) => (
                      <div key={date.toISOString()} className="flex-1 flex min-w-[200px] border-r border-slate-100 last:border-r-0 relative">
                        {[8, 10, 12, 14, 16].map((hour, slotIdx) => (
                          <div key={hour} className="flex-1 border-r border-slate-50 border-dashed last:border-r-0 bg-slate-50/30">
                            {/* Render operator jobs here if mapped. Currently mock operator assignment based on machine logic could go here */}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-6">
          
          {/* Unscheduled Jobs */}
          <Card className="flex flex-col overflow-hidden max-h-[500px]">
            <div className="p-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-800 flex justify-between items-center">
              <span>Unscheduled Jobs</span>
              <span className="text-xs font-normal text-slate-500">(Drag to Schedule)</span>
            </div>
            <div className="p-3 overflow-y-auto space-y-3 bg-slate-50/50 flex-1">
              {unscheduledJobs.length === 0 ? (
                <div className="text-center p-4 text-slate-500 text-sm">All eligible jobs are scheduled.</div>
              ) : (
                unscheduledJobs.map(job => (
                  <div 
                    key={job.id} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, job)}
                    className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm cursor-move hover:border-blue-400 hover:shadow-md transition-all group"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-slate-800 text-sm">{job.work_order || job.job_no}</span>
                      <GripVertical size={14} className="text-slate-300 group-hover:text-slate-500" />
                    </div>
                    <div className="text-slate-600 text-sm mb-2 font-medium">{job.part_name}</div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="bg-slate-100 px-2 py-0.5 rounded font-medium text-slate-700">Qty: {job.qty_planned}</span>
                      <span className="flex items-center gap-1"><Clock size={12}/> ~{Math.round(calculateDurationHours(job))} hrs</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Job Details */}
          <Card className="flex flex-col overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-800">
              Job Details
            </div>
            <div className="p-4 bg-white min-h-[250px]">
              {selectedJob ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">{selectedJob.work_order || selectedJob.job_no}</h3>
                      <p className="text-slate-600 font-medium">{selectedJob.part_name}</p>
                    </div>
                    <Badge variant={selectedJob.status === 'In Progress' ? 'success' : 'neutral'}>{selectedJob.status}</Badge>
                  </div>
                  
                  <div className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
                    <span className="text-slate-500">Customer</span>
                    <span className="font-medium text-slate-800">: {selectedJob.customer || 'Unknown'}</span>
                    
                    <span className="text-slate-500">Quantity</span>
                    <span className="font-medium text-slate-800">: {selectedJob.qty_planned} Nos</span>
                    
                    <span className="text-slate-500">Start Time</span>
                    <span className="font-medium text-slate-800">: {formatTime(selectedJob.created_at)}</span>
                    
                    <span className="text-slate-500">Machine</span>
                    <span className="font-medium text-slate-800">: {selectedJob.machine || '-'}</span>
                    
                    <span className="text-slate-500">Operator</span>
                    <span className="font-medium text-slate-800">: {selectedJob.operator || '-'}</span>
                  </div>

                  <div className="pt-3 flex gap-2">
                    <Button variant="primary" className="flex-1 bg-blue-600 hover:bg-blue-700">Edit</Button>
                    <Button variant="secondary" className="flex-1">View</Button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                  <AlertTriangle size={32} className="opacity-50" />
                  <p className="text-sm text-center px-4">Select a scheduled job to view details</p>
                </div>
              )}
            </div>
          </Card>

          {/* Legend */}
          <Card className="flex flex-col overflow-hidden">
            <div className="p-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-800">
              Legend
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 bg-white">
              {Object.entries(statusColors).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded border ${color}`}></div>
                  <span className="text-xs font-medium text-slate-600">{status}</span>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}
