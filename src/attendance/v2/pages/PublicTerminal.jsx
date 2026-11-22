import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AttendanceTerminalModal } from '../components/AttendanceTerminalModal';

export const PublicTerminal = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    navigate('/attendance');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <AttendanceTerminalModal isOpen={isOpen} onClose={handleClose} />
    </div>
  );
};
