'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/app/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { useAuth } from '@/app/context/AuthContext';
import { FaPrint, FaTrash, FaCalendarAlt, FaSearch } from 'react-icons/fa';

export default function StudentAttendanceRecordsPage() {
  const { user } = useAuth();

  // Retrieve institution ID from Auth Context or stored session
  const [localUserData, setLocalUserData] = useState(null);

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem('schoolUser') ||
        localStorage.getItem('user') ||
        localStorage.getItem('authUser') ||
        localStorage.getItem('session');
      if (stored) setLocalUserData(JSON.parse(stored));
    } catch (e) {
      console.error('Error loading session:', e);
    }
  }, []);

  const schoolId =
    user?.institutionID ||
    user?.schoolId ||
    user?.data?.institutionID ||
    user?.data?.schoolId ||
    localUserData?.institutionID ||
    localUserData?.schoolId ||
    '';

  const schoolName =
    user?.institutionName ||
    user?.schoolName ||
    localUserData?.institutionName ||
    'LeoTech Academy';

  const [attendanceList, setAttendanceList] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toLocaleDateString('en-CA');
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgramme, setFilterProgramme] = useState('All');
  const [filterLevel, setFilterLevel] = useState('All');
  const [loading, setLoading] = useState(true);

  // ============================================================
  // 1. LOAD ALL REGISTERED STUDENTS
  // ============================================================
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    const studentsQuery = query(
      collection(db, 'students'),
      where('institutionID', '==', schoolId)
    );

    const unsubscribe = onSnapshot(
      studentsQuery,
      (snapshot) => {
        const students = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAllStudents(students);
      },
      (err) => {
        console.error('Error loading students:', err);
      }
    );

    return () => unsubscribe();
  }, [schoolId]);

  // ============================================================
  // 2. LOAD ATTENDANCE FOR SELECTED DATE
  // ============================================================
  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const attendanceQuery = query(
      collection(db, 'StudentAttendance'),
      where('institutionID', '==', schoolId),
      where('date', '==', selectedDate)
    );

    const unsubscribe = onSnapshot(
      attendanceQuery,
      (snapshot) => {
        const records = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAttendanceList(records);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading student attendance logs:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [schoolId, selectedDate]);

  // ============================================================
  // 3. DELETE ONE ATTENDANCE RECORD
  // ============================================================
  const handleDeleteRecord = async (id, studentName) => {
    if (
      !window.confirm(
        `Delete attendance record for ${studentName || 'this student'}?`
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'StudentAttendance', id));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete record.');
    }
  };

  // ============================================================
  // 4. DETERMINE ATTENDANCE STATUS
  // ============================================================
  const getAttendanceStatus = (record) => {
    if (record.status) {
      const normalized = record.status.trim().toLowerCase();
      if (normalized === 'leave' || normalized === 'on leave') return 'Leave';
      if (normalized === 'excused' || normalized === 'excuse') return 'Excused';
      if (normalized === 'present') return 'Present';
      if (normalized === 'absent') return 'Absent';
      if (normalized === 'late') return 'Late';
      if (normalized === 'clocked out' || normalized === 'checked out')
        return 'Checked Out';
      return record.status;
    }

    if (record.clockInTime && record.clockOutTime) return 'Checked Out';
    if (record.clockInTime && !record.clockOutTime) return 'Present';
    return 'Absent';
  };

  // ============================================================
  // 5. FILTER OPTIONS (Dynamic from Students)
  // ============================================================
  const programmeOptions = [
    'All',
    ...new Set(allStudents.map((s) => s.programmeName).filter(Boolean)),
  ];

  const levelOptions = [
    'All',
    ...new Set(allStudents.map((s) => s.studyLevel).filter(Boolean)),
  ];

  // ============================================================
  // 6. BUILD DISPLAY LIST (Combines Active Students & Attendance)
  // ============================================================
  const getDisplayAttendance = () => {
    if (attendanceList.length === 0) {
      return [];
    }

    const attendanceMap = new Map();
    attendanceList.forEach((record) => {
      if (record.studentId) {
        attendanceMap.set(String(record.studentId), record);
      }
    });

    // Include active students (plus any student who has an existing record on that day)
    const eligibleStudents = allStudents.filter(
      (s) =>
        !s.status ||
        s.status === 'Active' ||
        attendanceMap.has(String(s.studentId || s.id || ''))
    );

    const displayRecords = eligibleStudents.map((student) => {
      const studentIdKey = String(student.studentId || student.id || '');
      const existingRecord = attendanceMap.get(studentIdKey);
      const fullName = `${student.title || ''} ${
        student.fullName || 'Student'
      }`.trim();

      if (existingRecord) {
        return {
          ...existingRecord,
          studentName: existingRecord.studentName || fullName,
          programmeName:
            existingRecord.programmeName || student.programmeName || 'General',
          studyLevel:
            existingRecord.studyLevel || student.studyLevel || 'Year 1',
          isAutomaticallyAbsent: false,
        };
      }

      return {
        id: `absent-${student.id}`,
        studentId: student.studentId || '---',
        studentName: fullName,
        programmeName: student.programmeName || 'General',
        studyLevel: student.studyLevel || 'Year 1',
        date: selectedDate,
        clockInTime: null,
        clockOutTime: null,
        status: 'Absent',
        isAutomaticallyAbsent: true,
        isManual: false,
      };
    });

    return displayRecords.filter((item) => {
      const matchesSearch =
        !searchTerm.trim() ||
        item.studentName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.studentId?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesProgramme =
        filterProgramme === 'All' || item.programmeName === filterProgramme;

      const matchesLevel =
        filterLevel === 'All' || item.studyLevel === filterLevel;

      return matchesSearch && matchesProgramme && matchesLevel;
    });
  };

  const displayAttendance = getDisplayAttendance();

  // Summary Counts
  const summaryStats = displayAttendance.reduce(
    (acc, rec) => {
      const st = getAttendanceStatus(rec);
      if (st === 'Present' || st === 'Checked Out') acc.present += 1;
      else if (st === 'Late') acc.late += 1;
      else if (st === 'Absent') acc.absent += 1;
      else if (st === 'Excused' || st === 'Leave') acc.excused += 1;
      return acc;
    },
    { present: 0, late: 0, absent: 0, excused: 0 }
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 min-h-screen bg-slate-100 flex flex-col items-center font-sans">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .printable-report,
          .printable-report * {
            visibility: visible !important;
          }
          .printable-report {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-hidden {
            display: none !important;
          }
          @page {
            size: A4 landscape;
            margin: 0.5in;
          }
        }
      `}</style>

      {/* Main Container */}
      <div className="printable-report bg-white shadow-xs rounded-3xl p-8 w-full max-w-6xl border border-slate-200">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-slate-100 pb-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">
              {schoolName}
            </span>
            <h1 className="text-2xl font-black text-slate-900 mt-0.5">
              Student Daily Attendance Report 📊
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Institution ID:{' '}
              <span className="font-mono font-bold text-slate-700">{schoolId}</span>{' '}
              • Date: <span className="font-bold text-slate-700">{selectedDate}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 print-hidden">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-2xl border border-slate-200">
              <FaCalendarAlt className="text-slate-400 text-xs" />
              <label className="text-xs font-bold text-slate-600">Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={handlePrint}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
            >
              <FaPrint /> Print Report
            </button>
          </div>
        </div>

        {/* Summary KPI Pills */}
        {displayAttendance.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
              <span className="text-[10px] font-black uppercase text-slate-400 block">
                Total Listed
              </span>
              <span className="text-lg font-black text-slate-900">
                {displayAttendance.length}
              </span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
              <span className="text-[10px] font-black uppercase text-emerald-600 block">
                Present / Out
              </span>
              <span className="text-lg font-black text-emerald-800">
                {summaryStats.present}
              </span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
              <span className="text-[10px] font-black uppercase text-amber-600 block">
                Late
              </span>
              <span className="text-lg font-black text-amber-800">
                {summaryStats.late}
              </span>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3">
              <span className="text-[10px] font-black uppercase text-indigo-600 block">
                Excused / Leave
              </span>
              <span className="text-lg font-black text-indigo-800">
                {summaryStats.excused}
              </span>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3">
              <span className="text-[10px] font-black uppercase text-rose-600 block">
                Absent
              </span>
              <span className="text-lg font-black text-rose-800">
                {summaryStats.absent}
              </span>
            </div>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 mb-6 print-hidden">
          <div className="relative w-full md:w-72">
            <FaSearch className="absolute left-3.5 top-3.5 text-slate-400 text-xs" />
            <input
              type="text"
              placeholder="Search student name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:bg-white transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={filterProgramme}
              onChange={(e) => setFilterProgramme(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none"
            >
              {programmeOptions.map((prog) => (
                <option key={prog} value={prog}>
                  {prog === 'All' ? 'All Programmes' : prog}
                </option>
              ))}
            </select>

            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 outline-none"
            >
              {levelOptions.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl === 'All' ? 'All Levels' : lvl}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Info Banner if No Records */}
        {!loading && attendanceList.length === 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 rounded-2xl text-xs font-medium">
            ℹ️ No student attendance logs recorded for{' '}
            <strong className="font-bold">{selectedDate}</strong>. Students will
            appear as automatically absent once check-in begins for this date.
          </div>
        )}

        {/* Attendance Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-wider">
              <tr>
                <th className="px-4 py-3.5 text-left">Student ID</th>
                <th className="px-4 py-3.5 text-left">Student Details</th>
                <th className="px-4 py-3.5 text-left">Programme / Level</th>
                <th className="px-4 py-3.5 text-left text-emerald-700">Check-In</th>
                <th className="px-4 py-3.5 text-left text-red-700">Check-Out</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-center print-hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-6 py-16 text-center text-slate-500 font-bold"
                  >
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Loading student attendance report...
                    </div>
                  </td>
                </tr>
              ) : displayAttendance.length > 0 ? (
                displayAttendance.map((record) => {
                  const status = getAttendanceStatus(record);
                  const isManual =
                    record.isManual ||
                    record.entryType === 'manual' ||
                    record.finalizedBy === 'manual';
                  const noteText =
                    record.note || record.excuseNote || record.reason;

                  return (
                    <tr
                      key={record.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        record.isAutomaticallyAbsent ? 'bg-rose-50/20' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-700">
                        {record.studentId || '---'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-extrabold text-slate-900">
                          {record.studentName || 'Unnamed Student'}
                        </div>
                        {record.isAutomaticallyAbsent && (
                          <span className="inline-block mt-0.5 text-[9px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            Auto Absent
                          </span>
                        )}
                        {isManual && !record.isAutomaticallyAbsent && (
                          <span className="inline-block mt-0.5 text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                            ✏️ Manual Entry
                          </span>
                        )}
                        {noteText && (
                          <div className="mt-1 text-[10px] text-amber-800 bg-amber-50 p-1 rounded border border-amber-200 italic max-w-xs">
                            <span className="font-bold not-italic">Note:</span>{' '}
                            {noteText}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">
                          {record.programmeName || 'General'}
                        </div>
                        <div className="text-[10px] font-mono text-indigo-600 font-bold">
                          {record.studyLevel || 'Year 1'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                        {record.clockInTime ? (
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-200">
                            {record.clockInTime}
                          </span>
                        ) : (
                          <span className="text-slate-300">---</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-red-600">
                        {record.clockOutTime ? (
                          <span className="bg-red-50 text-red-700 px-2 py-1 rounded-md border border-red-200">
                            {record.clockOutTime}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] italic">
                            Not Checked Out
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {status === 'Present' && (
                          <span className="bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ● Present
                          </span>
                        )}
                        {status === 'Late' && (
                          <span className="bg-amber-100 text-amber-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ⚠️ Late
                          </span>
                        )}
                        {status === 'Checked Out' && (
                          <span className="bg-blue-100 text-blue-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ✓ Checked Out
                          </span>
                        )}
                        {status === 'Absent' && (
                          <span className="bg-rose-100 text-rose-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            ✕ Absent
                          </span>
                        )}
                        {status === 'Leave' && (
                          <span className="bg-purple-100 text-purple-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            🌴 On Leave
                          </span>
                        )}
                        {status === 'Excused' && (
                          <span className="bg-indigo-100 text-indigo-800 font-extrabold px-2.5 py-1 rounded-full text-[10px]">
                            📝 Excused
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center print-hidden">
                        {!record.isAutomaticallyAbsent && (
                          <button
                            onClick={() =>
                              handleDeleteRecord(record.id, record.studentName)
                            }
                            className="text-red-600 hover:text-white hover:bg-red-600 bg-red-50 border border-red-200 p-2 rounded-xl transition-all cursor-pointer"
                            title="Delete Record"
                          >
                            <FaTrash size={10} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan="7"
                    className="px-6 py-16 text-center text-slate-400 font-bold"
                  >
                    No student attendance records found for{' '}
                    <span className="text-slate-700">{selectedDate}</span>.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}