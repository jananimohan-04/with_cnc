import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { KanbanCard } from './SalesPipelinePage';

interface PipelineCalendarViewProps {
  cards: KanbanCard[];
  onView: (card: KanbanCard) => void;
}

export function PipelineCalendarView({ cards, onView }: PipelineCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  // Extract upcoming events
  const allEvents = cards.map(c => ({
    card: c,
    date: new Date(c.raw?.next_action_date || c.date),
    title: c.raw?.next_action || c.status || c.stage,
  })).sort((a, b) => a.date.getTime() - b.date.getTime());

  const upcomingEvents = allEvents.filter(e => e.date >= new Date(new Date().setHours(0,0,0,0))).slice(0, 5);

  const getEventsForDay = (day: number) => {
    return allEvents.filter(e => 
      e.date.getDate() === day && 
      e.date.getMonth() === currentDate.getMonth() && 
      e.date.getFullYear() === currentDate.getFullYear()
    );
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'Enquiry': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Quotation': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Sales Order': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex h-full min-h-[600px]">
      
      {/* Calendar Grid Area */}
      <div className="flex-1 flex flex-col border-r border-slate-200">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">
              {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1">
              <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={goToday} className="px-3 py-1 text-sm font-medium hover:bg-slate-100 rounded-md transition-colors text-slate-700">Today</button>
              <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-md transition-colors text-slate-600"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex bg-white rounded-lg border border-slate-200 p-1">
            <button className="px-4 py-1.5 text-sm font-semibold rounded-md bg-brand-50 text-brand-700 shadow-sm transition-all">Month</button>
            <button className="px-4 py-1.5 text-sm font-medium rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all">Week</button>
            <button className="px-4 py-1.5 text-sm font-medium rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all">Day</button>
          </div>
        </div>
        
        <div className="flex-1 p-4 bg-slate-50/50">
          <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200 shadow-sm h-full min-h-[500px]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="bg-slate-100 p-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">{day}</div>
            ))}
            
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="bg-slate-50 p-2 min-h-[100px]"></div>
            ))}
            
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = day === new Date().getDate() && currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear();
              const dayEvents = getEventsForDay(day);
              
              return (
                <div key={day} className={`bg-white p-2 min-h-[100px] border-t border-slate-100 transition-colors hover:bg-slate-50 ${isToday ? 'bg-blue-50/30' : ''}`}>
                  <div className="flex justify-between items-start mb-2">
                    <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-700'}`}>
                      {day}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((evt, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => onView(evt.card)}
                        className={`text-[10px] p-1.5 rounded border cursor-pointer hover:shadow-sm transition-all truncate font-medium ${getStageColor(evt.card.stage)}`}
                        title={`${evt.card.refNo} - ${evt.title}`}
                      >
                        <span className="font-bold">{evt.card.refNo}</span> {evt.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sidebar Area */}
      <div className="w-80 bg-slate-50 p-5 flex flex-col hidden lg:flex">
        <div className="flex items-center gap-2 mb-6">
          <CalendarIcon className="w-5 h-5 text-brand-600" />
          <h3 className="font-bold text-slate-800 tracking-wide">TODAY / UPCOMING</h3>
        </div>
        
        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {upcomingEvents.length === 0 ? (
            <p className="text-sm text-slate-500 text-center italic mt-10">No upcoming actions scheduled.</p>
          ) : (
            upcomingEvents.map((evt, i) => (
              <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-brand-300 hover:shadow-md transition-all group" onClick={() => onView(evt.card)}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-bold text-brand-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {evt.date.toLocaleDateString() === new Date().toLocaleDateString() ? 'Today' : evt.date.toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${getStageColor(evt.card.stage)}`}>
                    {evt.card.stage}
                  </span>
                </div>
                <h4 className="font-semibold text-slate-800 text-sm mb-1 group-hover:text-brand-600 transition-colors">{evt.title}</h4>
                <p className="text-xs text-slate-500 font-medium">{evt.card.customer}</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1 pt-2 border-t border-slate-100">Ref: {evt.card.refNo}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
